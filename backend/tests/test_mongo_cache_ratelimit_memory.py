"""Comprehensive tests for MongoDB unstructured storage, Redis cache-aside & null-sentinel,
API anti-scraping rate limiter, 3-tier multi-turn conversation memory, legacy Redis->MongoDB
migration & index backfill, admin auth on storage endpoints, and survey nested state merging.
"""
import json
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.api.deps import get_current_admin, get_current_token_payload
from app.api.v1.storage import (
    get_system_storage_status,
    router as storage_router,
    trigger_redis_to_mongo_migration,
)
from app.models.schemas import UserInDB

from app.core.index_store import (
    get_all_question_ids,
    get_all_user_ids,
    get_user_session_ids,
    index_add_user_session,
    index_user_registration,
    lookup_user_id_by_email,
)
from app.core.migration import migrate_redis_to_mongo
from app.core.mongo_client import (
    MongoDocumentStore,
    key_to_collection_and_id,
    mongo_store,
    redact_mongodb_uri,
)
from app.core.rate_limiter import ApiRateLimiter, classify_path_tier
from app.core.redis_client import (
    NULL_SENTINEL,
    QUESTIONS_LIST_CACHE_KEY,
    get_cache_telemetry,
    get_json,
    invalidate_cache_key,
    reset_cache_telemetry,
    set_json,
)
from app.research.events import append_research_event
from app.research.keys import survey_queue_key, survey_state_key
from app.research.survey_engine import (
    _get_state,
    _set_state_field,
    enqueue_trigger,
    record_survey_response,
)
from app.services.copilot_triage import run_copilot_triage
from app.services.conversation_memory_service import (
    append_conversation_turn,
    build_multi_turn_context_prompt,
    clear_conversation_memory,
    get_conversation_memory,
)
from app.services.dashboard_service import get_recent_sessions


class FakeRedis:
    """In-memory async Redis double with TTL, sets, hashes, sorted sets, lists, and streams."""

    def __init__(self) -> None:
        self.data: dict[str, str] = {}
        self.ttls: dict[str, int | None] = {}
        self.sets: dict[str, set[str]] = {}
        self.hashes: dict[str, dict[str, str]] = {}
        self.zsets: dict[str, dict[str, float]] = {}
        self.lists: dict[str, list[str]] = {}
        self.streams: dict[str, list[tuple[str, dict[str, str]]]] = {}

    async def get(self, key: str):
        return self.data.get(key)

    async def set(self, key: str, value: str, ex: int | None = None):
        self.data[key] = value
        self.ttls[key] = -1 if ex is None else ex
        return True

    async def ttl(self, key: str) -> int:
        if key not in self.data:
            return -2
        val = self.ttls.get(key)
        return -1 if val is None else int(val)

    async def exists(self, key: str) -> int:
        return int(key in self.data or key in self.hashes or key in self.sets or key in self.zsets)

    async def delete(self, *keys: str):
        removed = 0
        for k in keys:
            for container in (self.data, self.ttls, self.sets, self.hashes, self.zsets, self.lists):
                if k in container:
                    del container[k]
                    removed += 1
        return removed

    async def sadd(self, key: str, *values: str):
        s = self.sets.setdefault(key, set())
        before = len(s)
        for v in values:
            s.add(str(v))
        return len(s) - before

    async def srem(self, key: str, *values: str):
        s = self.sets.get(key) or set()
        removed = 0
        for v in values:
            if v in s:
                s.remove(v)
                removed += 1
        return removed

    async def smembers(self, key: str):
        return set(self.sets.get(key) or set())

    async def sismember(self, key: str, value: str):
        return value in (self.sets.get(key) or set())

    async def scard(self, key: str):
        return len(self.sets.get(key) or set())

    async def hgetall(self, key: str):
        return dict(self.hashes.get(key) or {})

    async def hget(self, key: str, field: str):
        return (self.hashes.get(key) or {}).get(field)

    async def hset(self, key: str, field: str, value: str):
        self.hashes.setdefault(key, {})[field] = value
        return 1

    async def zadd(self, key: str, mapping: dict[str, float], *, lt: bool = False, ch: bool = False):
        items = self.zsets.setdefault(key, {})
        count = 0
        for member, score in mapping.items():
            member = str(member)
            score = float(score)
            previous = items.get(member)
            if previous is not None and lt and score >= previous:
                continue
            items[member] = score
            if previous is None or (ch and score != previous):
                count += 1
        return count

    async def zcard(self, key: str):
        return len(self.zsets.get(key) or {})

    async def zrange(self, key: str, start: int, stop: int, *, withscores: bool = False):
        items = sorted((self.zsets.get(key) or {}).items(), key=lambda x: x[1])
        sliced = items[start:] if stop == -1 else items[start : stop + 1]
        if withscores:
            return sliced
        return [k for k, _ in sliced]

    async def zrevrange(self, key: str, start: int, stop: int, *, withscores: bool = False):
        items = sorted((self.zsets.get(key) or {}).items(), key=lambda x: x[1], reverse=True)
        sliced = items[start:] if stop == -1 else items[start : stop + 1]
        if withscores:
            return sliced
        return [k for k, _ in sliced]

    async def zrem(self, key: str, member: str):
        z = self.zsets.get(key) or {}
        if member in z:
            del z[member]
            return 1
        return 0

    async def zremrangebyscore(self, key: str, min_score: float, max_score: float):
        z = self.zsets.get(key) or {}
        to_del = [k for k, v in z.items() if min_score <= v <= max_score]
        for k in to_del:
            del z[k]
        return len(to_del)

    async def rpush(self, key: str, value: str):
        self.lists.setdefault(key, []).append(value)
        return len(self.lists[key])

    async def ltrim(self, key: str, start: int, end: int):
        return True

    async def xadd(self, key: str, fields: dict[str, str]):
        seq = len(self.streams.get(key) or []) + 1
        entry_id = f"1700000000000-{seq}"
        self.streams.setdefault(key, []).append((entry_id, dict(fields)))
        return entry_id


class TestMongoCacheRateLimitMemory(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        reset_cache_telemetry()
        self.redis = FakeRedis()

    async def test_key_to_collection_mapping_covers_all_domains(self):
        self.assertEqual(key_to_collection_and_id("user:u_001"), ("users", "user:u_001"))
        self.assertEqual(key_to_collection_and_id("user:email:a@b.com"), ("system_indexes", "index:user:email:a@b.com"))
        self.assertEqual(key_to_collection_and_id("users:all"), ("system_indexes", "users:all"))
        self.assertEqual(key_to_collection_and_id("user:u_001:sessions"), ("system_indexes", "index:user:u_001:sessions"))
        self.assertEqual(key_to_collection_and_id("question:q_101"), ("questions", "q_101"))
        self.assertEqual(
            key_to_collection_and_id("survey:state:u_001"),
            ("surveys", "survey:state:u_001"),
        )
        self.assertEqual(
            key_to_collection_and_id("session:s_1"),
            ("sessions", "session:s_1"),
        )
        self.assertEqual(key_to_collection_and_id("lgd_room:r_9"), ("lgd_rooms", "lgd_room:r_9"))
        self.assertEqual(key_to_collection_and_id("resume:res_1"), ("resumes_jobs", "resume:res_1"))
        self.assertEqual(
            key_to_collection_and_id("memory:conv:u_001:copilot"),
            ("conversation_memories", "memory:conv:u_001:copilot"),
        )

    async def test_mongodb_unstructured_collections_and_surveys(self):
        store = MongoDocumentStore()
        await store.init_connection()

        # Verify fallback alerts when mongod is offline & URI redaction
        self.assertTrue(store.degraded)
        self.assertEqual(store.fallback_reason, "mongodb_unreachable")
        self.assertIn("redacted", redact_mongodb_uri("mongodb://user:secret_pass@10.0.0.5:27017/edgewise"))
        self.assertNotIn("secret_pass", redact_mongodb_uri("mongodb://user:secret_pass@10.0.0.5:27017/edgewise"))

        await store.upsert_by_cache_key(
            "user:test_u1",
            {
                "id": "test_u1",
                "email": "u1@example.com",
                "target_position": "AI产品经理",
                "research_consent": {"accepted": True},
            },
        )
        user_doc = await store.find_by_cache_key("user:test_u1")
        self.assertIsNotNone(user_doc)
        self.assertEqual(user_doc["target_position"], "AI产品经理")

        await set_json(
            self.redis,
            "user:test_u1",
            {
                "id": "test_u1",
                "email": "u1@example.com",
                "research_consent": {"accepted": True},
            },
        )
        survey_rec = await record_survey_response(
            self.redis,
            "test_u1",
            "S1",
            value=5,
        )
        self.assertEqual(survey_rec["status"], "answered")

        persisted_survey = await mongo_store.find_by_cache_key("survey:answer:test_u1:S1")
        self.assertIsNotNone(persisted_survey)
        self.assertEqual(persisted_survey["value"], 5)

        entry_id = await append_research_event(
            self.redis,
            "test_u1",
            "copilot.triage",
            props={"need": "ownership"},
            skip_consent_check=True,
        )
        self.assertIsNotNone(entry_id)

        stats = await mongo_store.get_storage_stats()
        self.assertIn("collections", stats)
        self.assertNotIn("mongodb_uri", stats)
        self.assertIn("uri_redacted", stats)
        self.assertGreaterEqual(stats["collections"]["surveys"], 1)
        self.assertGreaterEqual(stats["collections"]["research_events"], 1)

        await mongo_store.delete_by_cache_key("user:test_u1")
        await mongo_store.delete_by_cache_key("survey:answer:test_u1:S1")

    async def test_survey_state_fields_merge_without_overwriting_and_queue_persists(self):
        uid = "test_survey_merge_u1"
        await mongo_store.delete_by_cache_key(f"survey:state:{uid}")
        await mongo_store.delete_by_cache_key(f"survey:queue:{uid}")

        await set_json(
            self.redis,
            f"user:{uid}",
            {"id": uid, "email": "smerge@example.com", "research_consent": {"accepted": True}},
        )

        # Write multiple distinct survey state fields sequentially
        await _set_state_field(self.redis, uid, "feedback_view_count", 2)
        await _set_state_field(self.redis, uid, "report_view_count", 3)
        await _set_state_field(self.redis, uid, "agent_used", True)
        await _set_state_field(self.redis, uid, "declined_items", ["A1", "B2"])

        # Clear Redis hash completely and verify MongoDB retained ALL 4 fields without overwriting!
        await self.redis.delete(survey_state_key(uid))
        restored_state = await _get_state(self.redis, uid)
        self.assertEqual(restored_state.get("feedback_view_count"), 2)
        self.assertEqual(restored_state.get("report_view_count"), 3)
        self.assertIs(restored_state.get("agent_used"), True)
        self.assertEqual(restored_state.get("declined_items"), ["A1", "B2"])

        # Enqueue survey trigger and verify queue survives Redis flush
        added = await enqueue_trigger(self.redis, uid, "feedback_view_first")
        self.assertGreater(added, 0)
        await self.redis.delete(survey_queue_key(uid))
        queue_doc = await mongo_store.find_by_cache_key(f"survey:queue:{uid}")
        self.assertIsNotNone(queue_doc)
        self.assertTrue(len(queue_doc.get("items") or {}) > 0)

        await mongo_store.delete_by_cache_key(f"user:{uid}")
        await mongo_store.delete_by_cache_key(f"survey:state:{uid}")
        await mongo_store.delete_by_cache_key(f"survey:queue:{uid}")

    async def test_legacy_redis_migration_lazy_repair_and_index_recovery(self):
        # Populate Redis directly (simulating legacy permanent keys with ttl == -1 and NO Mongo records)
        legacy_uid = "legacy_u_777"
        legacy_email = "legacy777@example.com"
        legacy_sess_id = "legacy_sess_777"

        await mongo_store.delete_by_cache_key(f"user:{legacy_uid}")
        await mongo_store.delete_by_cache_key(f"user:email:{legacy_email}")
        await mongo_store.delete_by_cache_key(f"user:{legacy_uid}:sessions")
        await mongo_store.delete_by_cache_key(f"session:{legacy_sess_id}")

        await self.redis.set(
            f"user:{legacy_uid}",
            json.dumps(
                {
                    "id": legacy_uid,
                    "email": legacy_email,
                    "name": "老用户",
                    "initials": "老用",
                    "tier": "Free",
                    "tier_label": "青铜免费版",
                    "credits": 500,
                    "join_date": "2025-11-01",
                    "is_admin": False,
                    "created_at": "2025-11-01T10:00:00+00:00",
                    "updated_at": "2025-11-01T10:00:00+00:00",
                    "password_hash": "hash",
                }
            ),
        )
        await self.redis.set(f"user:email:{legacy_email}", legacy_uid)
        await self.redis.sadd("users:all", legacy_uid)
        await self.redis.set(
            f"session:{legacy_sess_id}",
            json.dumps(
                {
                    "id": legacy_sess_id,
                    "user_id": legacy_uid,
                    "type": "interview",
                    "topic": "老会话不丢失",
                    "status": "completed",
                    "score": 91.5,
                    "duration_minutes": 25,
                    "date": "2025-11-01",
                    "time": "10:00",
                    "created_at": "2025-11-01T10:00:00+00:00",
                    "updated_at": "2025-11-01T10:25:00+00:00",
                    "completed_at": "2025-11-01T10:25:00+00:00",
                }
            ),
        )
        await self.redis.zadd(f"user:{legacy_uid}:sessions", {legacy_sess_id: 1761991200.0})
        await self.redis.hset(survey_state_key(legacy_uid), "feedback_view_count", "4")
        await self.redis.hset(survey_state_key(legacy_uid), "agent_used", "true")

        # 1. Run idempotent migration (simulates startup boot before TTL or restart)
        report = await migrate_redis_to_mongo(self.redis, mongo_store)
        self.assertGreaterEqual(report["migrated_docs"], 2)
        self.assertGreaterEqual(report["migrated_indexes"], 3)
        self.assertGreaterEqual(report["migrated_surveys"], 1)

        # 2. Wipe Redis completely (simulating Redis restart or all-key TTL expiry)
        self.redis = FakeRedis()
        reset_cache_telemetry()

        # 3. Verify email lookup, users list, sessions list, and dashboard recent sessions recover from MongoDB!
        recovered_uid = await lookup_user_id_by_email(self.redis, legacy_email)
        self.assertEqual(recovered_uid, legacy_uid)

        recovered_sids = await get_user_session_ids(self.redis, legacy_uid)
        self.assertIn(legacy_sess_id, recovered_sids)

        recent = await get_recent_sessions(self.redis, legacy_uid, limit=5)
        self.assertEqual(len(recent), 1)
        self.assertEqual(recent[0].id, legacy_sess_id)
        self.assertEqual(recent[0].topic, "老会话不丢失")

        # 4. Also test lazy read-repair on permanent Redis key (ttl == -1)
        lazy_qid = "lazy_repair_q_1"
        await mongo_store.delete_by_cache_key(f"question:{lazy_qid}")
        await self.redis.set(f"question:{lazy_qid}", json.dumps({"id": lazy_qid, "title": "旧题库懒修复"}))
        doc = await get_json(self.redis, f"question:{lazy_qid}")
        self.assertEqual(doc["title"], "旧题库懒修复")
        self.assertIsNotNone(await mongo_store.find_by_cache_key(f"question:{lazy_qid}"))

        await mongo_store.delete_by_cache_key(f"question:{lazy_qid}")
        await mongo_store.delete_by_cache_key(f"user:{legacy_uid}")
        await mongo_store.delete_by_cache_key(f"user:email:{legacy_email}")
        await mongo_store.delete_by_cache_key(f"user:{legacy_uid}:sessions")
        await mongo_store.delete_by_cache_key(f"session:{legacy_sess_id}")
        await mongo_store.delete_by_cache_key(f"survey:state:{legacy_uid}")

    async def test_storage_status_requires_admin_auth_and_strict_live_guard(self):
        from app.config import Settings

        # 1. Verify FastAPI route dependency wiring enforces `get_current_admin` on BOTH endpoints
        route_deps = {
            r.path: [dep.call for dep in r.dependant.dependencies]
            for r in storage_router.routes
        }
        self.assertIn(get_current_admin, route_deps["/system/storage-status"])
        self.assertIn(get_current_admin, route_deps["/system/migrate-redis-to-mongo"])

        # 2. Unauthenticated bearer request fails with 401; non-admin user fails with 403
        with self.assertRaises(HTTPException) as ctx_401:
            await get_current_token_payload(credentials=None, redis=self.redis)
        self.assertEqual(ctx_401.exception.status_code, 401)

        non_admin = UserInDB(
            id="u_regular",
            email="reg@example.com",
            name="Regular",
            initials="RE",
            tier="Free",
            tier_label="青铜免费版",
            credits=500,
            join_date="2026-01-01",
            is_admin=False,
            created_at="2026-01-01T00:00:00+00:00",
            updated_at="2026-01-01T00:00:00+00:00",
            password_hash="x",
        )
        with self.assertRaises(HTTPException) as ctx_403:
            await get_current_admin(current_user=non_admin)
        self.assertEqual(ctx_403.exception.status_code, 403)

        admin_user = non_admin.model_copy(update={"id": "u_admin", "is_admin": True})
        status_payload = await get_system_storage_status(_admin=admin_user)
        self.assertNotIn("mongodb_uri", status_payload["mongodb"])
        self.assertIn("uri_redacted", status_payload["mongodb"])
        mig_payload = await trigger_redis_to_mongo_migration(_admin=admin_user, redis=self.redis)
        self.assertIn(mig_payload["status"], ("completed", "degraded", "completed_with_conflicts"))

        # 3. Strict live mode rejects unreachable MongoDB instead of falling back silently
        strict_store = MongoDocumentStore()
        strict_store.uri = "mongodb://127.0.0.1:29999"
        with patch("app.core.mongo_client.settings", Settings(MONGODB_STRICT_LIVE=True)):
            with self.assertRaises(RuntimeError):
                await strict_store.init_connection()

    async def test_fallback_reconciliation_merges_offline_docs_into_live_db(self):
        from pathlib import Path
        import tempfile
        from app.core.mongo_client import LocalMongoCollection

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            offline_doc = {
                "_id": "user:fb_u1",
                "id": "fb_u1",
                "email": "fb@example.com",
                "_updated_at": "2026-11-16T10:00:00+00:00",
            }
            (tmp_path / "users.json").write_text(
                json.dumps({"user:fb_u1": offline_doc}, ensure_ascii=False),
                encoding="utf-8",
            )

            live_targets = {}

            class FakeMotorCol:
                def __init__(self, col_name):
                    self.col_name = col_name

                async def find_one(self, filter_dict):
                    return live_targets.get((self.col_name, filter_dict.get("_id")))

                async def update_one(self, filter_dict, update_doc, upsert=True):
                    doc_id = filter_dict["_id"]
                    live_targets[(self.col_name, doc_id)] = {
                        "_id": doc_id,
                        **update_doc.get("$set", update_doc.get("$setOnInsert", {})),
                    }
                    class Res:
                        matched_count = 0
                        modified_count = 0
                        upserted_id = doc_id
                    return Res()

            class FakeLiveDb:
                def __getitem__(self, name):
                    return FakeMotorCol(name)

            store = MongoDocumentStore()
            store.mode = "mongodb_motor_live"
            with patch("app.core.mongo_client.FALLBACK_DIR", tmp_path):
                merged = await store.reconcile_fallback_to_live(FakeLiveDb())

            self.assertEqual(merged, 1)
            self.assertIn(("users", "user:fb_u1"), live_targets)
            self.assertEqual(live_targets[("users", "user:fb_u1")]["email"], "fb@example.com")
            # Fallback file is cleared once merged so stale data won't overwrite future live edits
            self.assertEqual(json.loads((tmp_path / "users.json").read_text(encoding="utf-8")), {})

    async def test_redis_cache_aside_backfill_and_null_sentinel(self):
        reset_cache_telemetry()

        await set_json(
            self.redis,
            "question:test_q999",
            {"id": "test_q999", "title": "如何设计多Agent记忆系统？", "category": "AI产品"},
        )
        self.assertIn("question:test_q999", self.redis.data)
        self.assertIsNotNone(self.redis.ttls.get("question:test_q999"))

        cached = await get_json(self.redis, "question:test_q999")
        self.assertEqual(cached["title"], "如何设计多Agent记忆系统？")
        telemetry_after_hit = get_cache_telemetry()
        self.assertGreaterEqual(telemetry_after_hit["hits"], 1)

        await self.redis.delete("question:test_q999")
        self.assertNotIn("question:test_q999", self.redis.data)

        backfilled = await get_json(self.redis, "question:test_q999")
        self.assertIsNotNone(backfilled)
        self.assertEqual(backfilled["id"], "test_q999")
        self.assertIn("question:test_q999", self.redis.data)
        telemetry_after_backfill = get_cache_telemetry()
        self.assertGreaterEqual(telemetry_after_backfill["mongo_backfills"], 1)

        missing_first = await get_json(self.redis, "question:nonexistent_doc_xyz")
        self.assertIsNone(missing_first)
        self.assertEqual(self.redis.data.get("question:nonexistent_doc_xyz"), NULL_SENTINEL)

        missing_second = await get_json(self.redis, "question:nonexistent_doc_xyz")
        self.assertIsNone(missing_second)
        telemetry_after_null = get_cache_telemetry()
        self.assertGreaterEqual(telemetry_after_null["null_hits"], 1)

        await invalidate_cache_key(self.redis, "question:test_q999")
        await mongo_store.delete_by_cache_key("question:test_q999")
        self.assertNotIn(QUESTIONS_LIST_CACHE_KEY, self.redis.data)

    async def test_api_rate_limiter_tiers_and_429_blocking(self):
        self.assertEqual(classify_path_tier("/api/v1/auth/login", "POST"), "auth")
        self.assertEqual(classify_path_tier("/api/v1/lgd/rooms/r1/agent-turn", "POST"), "heavy_ai")
        self.assertEqual(classify_path_tier("/api/v1/research/events", "POST"), "telemetry")
        self.assertEqual(classify_path_tier("/api/v1/questions", "GET"), "default")

        limiter = ApiRateLimiter()
        r1 = await limiter.check_rate_limit("test_client_ip", "heavy_ai", custom_limit=3, window_seconds=60)
        r2 = await limiter.check_rate_limit("test_client_ip", "heavy_ai", custom_limit=3, window_seconds=60)
        r3 = await limiter.check_rate_limit("test_client_ip", "heavy_ai", custom_limit=3, window_seconds=60)
        r4 = await limiter.check_rate_limit("test_client_ip", "heavy_ai", custom_limit=3, window_seconds=60)

        self.assertTrue(r1["allowed"])
        self.assertTrue(r2["allowed"])
        self.assertTrue(r3["allowed"])
        self.assertEqual(r3["remaining"], 0)
        self.assertFalse(r4["allowed"])
        self.assertGreaterEqual(r4["reset_seconds"], 1)

    async def test_three_tier_multi_turn_conversation_memory_and_compression(self):
        user_id = "test_mem_user"
        await clear_conversation_memory(self.redis, user_id, scope="copilot")

        for idx in range(1, 11):
            await append_conversation_turn(
                self.redis,
                user_id,
                scope="copilot",
                role="user" if idx % 2 == 1 else "assistant",
                content=f"第{idx}轮：我想面字节跳动的AI产品经理，做过智能客服Agent项目，转化率提升 32%",
                intent="ownership",
            )

        mem = await get_conversation_memory(self.redis, user_id, scope="copilot")
        self.assertEqual(mem["turn_count"], 10)
        self.assertEqual(len(mem["recent_turns"]), 8)
        self.assertEqual(mem["episodic_summary"]["compressed_turns"], 2)
        self.assertIn("早期已完成 2 轮对话", mem["episodic_summary"]["summary_text"])
        self.assertEqual(mem["user_facts"].get("target_position"), "AI产品经理")
        self.assertEqual(mem["user_facts"].get("target_company"), "字节跳动")
        self.assertTrue(any("32%" in m for m in mem["user_facts"].get("claimed_metrics", [])))

        prompt_block = build_multi_turn_context_prompt(mem)
        self.assertIn("AI产品经理", prompt_block)
        self.assertIn("字节跳动", prompt_block)

        triage_resp = await run_copilot_triage(
            self.redis,
            user_id,
            message="项目经历里说不清自己做了什么，总说我们团队",
        )
        self.assertEqual(triage_resp["need"], "ownership")
        self.assertIn("memory_context", triage_resp)
        self.assertGreaterEqual(triage_resp["memory_context"]["turn_count"], 12)

        await clear_conversation_memory(self.redis, user_id, scope="copilot")


if __name__ == "__main__":
    unittest.main()
