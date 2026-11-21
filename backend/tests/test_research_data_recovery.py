import json
import asyncio
import csv
import io
import importlib.util
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException
from app.core.mongo_client import LocalMongoCollection, MongoDocumentStore, mongo_store
from app.config import Settings
from app.api.v1.storage import trigger_redis_to_mongo_migration
from app.api.v1.research import read_posttest_status, read_blind_review_pending
from app.core.migration import migrate_redis_to_mongo
from app.core.redis_client import set_json
from app.core.index_store import get_all_user_ids, get_user_session_ids, index_add_user_session, index_user_registration
from app.models.schemas import ResearchEventsBatch
from app.research.derive import derive_daily_aggregates, derive_on_event, get_auto_fields, get_auto_metadata, set_auto_field
from app.research.admin_stats.loader import aggregate_trigger_rows, load_cohort, load_user_timeline, summarize_event_identifiers
from app.research.admin_stats.metrics import compute_overview, compute_passive
from app.research.admin_stats.experiment import four_cell_means, manipulation_checks
from app.research.blind_review import enqueue_posttest_for_blind_review, list_blind_review_batch, submit_blind_scores
from app.research.keys import auto_hash_key, auto_meta_key, blind_pool_key, survey_hash_key, survey_queue_key, survey_shown_key, survey_state_key
from app.research.pipeline import emit_server_event
from app.research.events import ingest_client_events, read_event_stream
from app.research.survey_engine import _is_answered_or_declined, enqueue_trigger, get_pending_survey_items, get_survey_answers, handle_survey_trigger_event, record_survey_response
from app.services.research_survey_service import export_research_panel, export_research_panel_csv, pending_survey, submit_survey_answers, ingest_events
from app.services.research_service import _pick_balanced_arm, get_posttest_status, submit_posttest_answer, _iter_consented_sessions, export_research_jsonl, export_research_csv
from app.services.referral_service import get_referral_invitee_ids
from app.services.series_service import list_series, upsert_series
from test_mongo_cache_ratelimit_memory import FakeRedis


class StreamRedis(FakeRedis):
    async def eval(self, script, key_count, stream, receipt, event, ts, props, cycle, deadline):
        assert key_count == 2 and "XADD" in script
        saved = await self.get(receipt)
        if saved is not None:
            return saved
        if datetime.now(timezone.utc).timestamp() * 1000 >= deadline:
            return None
        event_id = await self.xadd(stream, {"event": event, "ts": ts, "props": props})
        saved = json.dumps([event_id, ts, cycle])
        await self.set(receipt, saved)
        return saved

    async def zrangebyscore(self, key, min, max, *, start, num):
        items = sorted((self.zsets.get(key) or {}).items(), key=lambda item: (item[1], item[0]))
        return [item_id for item_id, score in items if score <= float(max)][start:start + num]

    async def xrevrange(self, key, count=500):
        return list(reversed(self.streams.get(key, [])))[:count]

    async def xrange(self, key, min="-", max="+", count=1000):
        entries = self.streams.get(key, [])
        if min != "-":
            previous = int(min.removeprefix("(").split("-")[-1])
            entries = [entry for entry in entries if int(entry[0].split("-")[-1]) > previous]
        return entries[:count]


class ResearchDataRecoveryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.collections_patch = patch.object(
            mongo_store, "_collections", {name: LocalMongoCollection(name) for name in mongo_store._collections}
        )
        self.collections_patch.start()
        self.addCleanup(self.collections_patch.stop)
        self.redis = StreamRedis()
        await set_json(self.redis, "user:u1", {"id": "u1", "research_consent": {"accepted": True}})

    async def test_stats_recalculation_after_generation_changes_mid_request(self):
        from app.research.admin_stats.cache import invalidate_stats_cache
        from app.research.admin_stats.filters import StatsFilters
        from app.research.admin_stats.router import _cached_response

        await invalidate_stats_cache(self.redis)
        started, finish_first = asyncio.Event(), asyncio.Event()
        calls = 0

        async def load(redis, filters):
            nonlocal calls
            calls += 1
            if calls == 1:
                started.set()
                await finish_first.wait()
                return [], {"filtered_n": 1}
            return [], {"filtered_n": 0}

        with patch("app.research.admin_stats.router.load_cohort", side_effect=load):
            request = asyncio.create_task(_cached_response(self.redis, "overview", StatsFilters(), lambda rows, meta: {}))
            await asyncio.wait_for(started.wait(), 2)
            await invalidate_stats_cache(self.redis)
            finish_first.set()
            self.assertEqual((await request)["filtered_n"], 0)
            cached = await _cached_response(self.redis, "overview", StatsFilters(), lambda rows, meta: {})
        self.assertTrue(cached["cache_hit"])
        self.assertEqual(cached["filtered_n"], 0)
        self.assertEqual(calls, 2)

    def test_funnel_does_not_invent_trigger_or_display_counts(self):
        rows = [{"survey": {"A1": {"status": "answered", "value": "首次求职"}}}, {"survey": {}}]
        meta = {"trigger_item_map": {"consent_granted": ["A1"]}}
        trigger = aggregate_trigger_rows(rows, meta)[0]
        self.assertEqual(trigger["answered"], 1)
        self.assertIsNone(trigger["eligible"])
        self.assertIsNone(trigger["triggered"])
        self.assertIsNone(trigger["shown"])
        self.assertIsNone(compute_overview(rows, meta)["kpis"]["micro_survey_response"]["rate"])

    def test_event_identifier_summary_separates_repeats_conflicts_and_missing(self):
        def event(client_id, value):
            return {"source": "event", "name": "report.view", "ts": "2026-01-01", "props": {"_client_event_id": client_id, "value": value}}
        timeline = [event("same", 1), event("same", 1), event("conflict", 1), event("conflict", 2), event(None, 1), {"source": "survey"}]
        summary = summarize_event_identifiers(timeline)
        self.assertEqual(summary, {"events_checked": 5, "events_without_client_id": 1, "repeated_id_groups": 2, "conflicting_id_groups": 1, "event_limit": 500})

    async def test_timeline_uses_current_cycle_and_recovers_answers_from_mongo(self):
        old_cycle = "2026-01-01T00:00:00Z"
        cycle = "2026-01-02T00:00:00Z"
        user = {"id": "u1", "research_consent": {"accepted": True, "accepted_at": old_cycle}}
        await set_json(self.redis, "user:u1", user)
        await record_survey_response(self.redis, "u1", "A1", value="旧答案")
        user["research_consent"] = {"accepted": True, "accepted_at": cycle, "had_declined": True}
        await set_json(self.redis, "user:u1", user)
        await record_survey_response(self.redis, "u1", "A2", value="当前答案")
        await self.redis.delete(survey_hash_key("u1"))

        id_prefix = int(datetime.fromisoformat("2026-01-03T00:00:00Z").timestamp() * 1000)
        for index, tagged_cycle in enumerate((old_cycle, cycle), start=1):
            event_id = f"{id_prefix}-{index}"
            await mongo_store.insert_document("research_events", {
                "_id": f"u1:{event_id}", "user_id": "u1", "stream_entry_id": event_id,
                "event": "report.view", "ts": "2026-01-03T00:00:00Z",
                "consent_cycle": tagged_cycle, "props": {"number": index},
            })
        self.redis.streams["research:event:u1"] = [
            (f"{id_prefix}-1", {"event": "report.view", "ts": "2026-01-03T00:00:00Z", "props": "{}"}),
        ]
        timeline = await load_user_timeline(self.redis, "u1")
        events = [row["id"] for row in timeline if row["source"] == "event"]
        answers = [row["props"]["value"] for row in timeline if row["source"] == "survey"]
        self.assertEqual(events, [f"{id_prefix}-2"])
        self.assertEqual(answers, ["当前答案"])
        user["research_consent"]["withdrawn_at"] = cycle
        await set_json(self.redis, "user:u1", user)
        self.assertEqual(await load_user_timeline(self.redis, "u1"), [])

    def test_unassigned_users_are_not_counted_as_control_group(self):
        rows = [{"arm": None, "auto": {"qualified_activation": 1, "zc_realized": 1}},
                {"arm": "00", "auto": {"qualified_activation": 0}}]
        cells = four_cell_means(rows, "qualified_activation")
        self.assertEqual(cells["cells"]["00"]["mean"], 0.0)
        self.assertEqual(manipulation_checks(rows)["zc_realized_n"], 0)
        kpi = compute_overview(rows, {})["kpis"]["qualified_activation_itt"]
        self.assertEqual(kpi["denominator"], 1)
        self.assertEqual(kpi["numerator"], 0)

    async def test_unconfirmed_activation_cannot_be_exported_as_failure_or_estimated(self):
        from app.research.admin_stats.filters import StatsFilters
        from app.research.admin_stats.router import admin_experiment

        await set_auto_field(self.redis, "u1", "qualified_activation", 0)
        with patch("app.services.research_survey_service.get_all_user_ids", AsyncMock(return_value=["u1"])):
            export = json.loads(await export_research_panel(self.redis, anonymize=True))
        self.assertIsNone(export["auto"]["qualified_activation"])
        self.assertEqual(export["auto"]["qualified_activation_observation"], "unconfirmed")
        self.assertNotIn("qualified_activation", export["auto_meta"])

        rows = [{"arm": "00", "auto": {"qualified_activation": 0}},
                {"arm": "00", "auto": {"qualified_activation": 1}}]
        with patch("app.research.admin_stats.router.load_cohort", AsyncMock(return_value=(rows, {}))):
            result = await admin_experiment(
                outcome="qualified_activation", boot=100, seed=1, _admin=SimpleNamespace(),
                redis=self.redis, filters=StatsFilters(),
            )
        self.assertIsNone(result["effects"])
        self.assertIsNone(result["bootstrap"])
        self.assertEqual(result["activation_counts"]["00"], {"confirmed": "<5", "unconfirmed": "<5"})
        kpi = compute_overview(rows, {})["kpis"]["qualified_activation_itt"]
        self.assertIsNone(kpi["rate"])
        self.assertEqual(kpi["unconfirmed"], 1)

    async def test_posttest_event_enqueues_items(self):
        await emit_server_event(self.redis, "u1", "posttest.open", {})
        self.assertIn("J2", (await mongo_store.find_by_cache_key("survey:queue:u1"))["items"])
        self.assertEqual(self.redis.streams["research:event:u1"][0][1]["event"], "posttest.open")

    async def test_panel_only_reports_verified_practice_and_elapsed_return_window(self):
        now = datetime.now(timezone.utc)
        await set_json(self.redis, "user:u1", {"id": "u1", "research_consent": {
            "accepted": True, "accepted_at": (now - timedelta(days=20)).isoformat(),
        }})
        await set_auto_field(self.redis, "u1", "completed_practice_count", 9, source_event_id="legacy")
        await set_auto_field(self.redis, "u1", "return_sessions_7d", 8, source_event_id="legacy")

        async def save_completion(session_id, elapsed_days):
            completed = now - timedelta(days=elapsed_days)
            await set_json(self.redis, f"session:{session_id}", {
                "id": session_id, "user_id": "u1", "status": "completed",
                "created_at": (completed - timedelta(minutes=1)).isoformat(), "completed_at": completed.isoformat(),
                "metadata": {"research_eligible": True},
            })

        with patch("app.services.research_survey_service.get_all_user_ids", AsyncMock(return_value=["u1"])):
            legacy = json.loads(await export_research_panel(self.redis, anonymize=True))
            self.assertIsNone(legacy["auto"]["completed_practice_count"])
            self.assertIsNone(legacy["auto"]["return_sessions_7d"])
            self.assertEqual(legacy["auto"]["return_sessions_7d_observation"], "unverified")
            self.assertNotIn("completed_practice_count", legacy["auto_meta"])

            await save_completion("recent", 2)
            recent = json.loads(await export_research_panel(self.redis, anonymize=True))
            self.assertEqual(recent["auto"]["completed_practice_count"], 1)
            self.assertEqual(recent["auto"]["return_sessions_7d_observation"], "window_open")
            self.assertEqual(recent["auto"]["return_sessions_7d_window_end"], (now + timedelta(days=5)).isoformat())
            self.assertIsNone(recent["auto"]["H1"])

            await save_completion("first", 10)
            await save_completion("returned", 5)
            elapsed = json.loads(await export_research_panel(self.redis, anonymize=True))
            self.assertEqual(elapsed["auto"]["return_sessions_7d_observation"], "window_elapsed")
            self.assertEqual(elapsed["auto"]["return_sessions_7d"], 1)
            self.assertEqual(elapsed["auto_meta"]["return_sessions_7d"]["source"], "session_records")
            csv_row = next(csv.DictReader(io.StringIO(await export_research_panel_csv(self.redis, anonymize=True))))
            self.assertEqual(json.loads(csv_row["auto_json"]), elapsed["auto"])
        aggregate = compute_passive([{"auto": row["auto"]} for row in (legacy, recent, elapsed)])["fields"]
        self.assertEqual(aggregate["return_sessions_7d"]["type"], "numeric")
        self.assertAlmostEqual(aggregate["return_sessions_7d"]["missing_rate"], 2 / 3)
        self.assertNotIn("return_sessions_7d_window_end", aggregate)

    async def test_pending_survey_honors_due_time_and_priority(self):
        await enqueue_trigger(self.redis, "u1", "consent_granted", due_at=datetime.now(timezone.utc) + timedelta(days=1))
        pending = await get_pending_survey_items(self.redis, "u1")
        self.assertEqual(pending["items"], [])
        await enqueue_trigger(self.redis, "u1", "consent_granted", due_at=datetime.now(timezone.utc) - timedelta(seconds=1))
        pending = await get_pending_survey_items(self.redis, "u1")
        self.assertEqual([item["id"] for item in pending["items"]], ["A1", "A2", "A3"])
        events = self.redis.streams["research:event:u1"]
        offered = [fields for _, fields in events if fields["event"] == "survey.offered"]
        self.assertEqual(json.loads(offered[-1]["props"])["item_ids"], ["A1", "A2", "A3"])
        await ingest_client_events(self.redis, "u1", [{"event": "survey.shown", "props": {"item_ids": ["A1", "A2", "A3"]}}])
        meta = {"trigger_item_map": {"consent_granted": ["A1", "A2", "A3"]}}
        state = await mongo_store.find_by_cache_key("survey:state:u1")
        self.assertIsNone(aggregate_trigger_rows([{"state": state["fields"]}], meta)[0]["shown"])
        display_props = {
            "offer_event_id": pending["offer_event_id"],
            "survey_version": pending["survey_version"],
            "item_ids": ["A1", "A2", "A3"],
        }
        _, _, outcomes = await ingest_events(self.redis, SimpleNamespace(id="u1"), [
            {"event": "survey.shown", "props": {**display_props, "item_ids": ["J2"]}},
            {"event": "survey.shown", "props": display_props},
        ])
        self.assertEqual([row["status"] for row in outcomes], ["rejected", "accepted"])
        self.assertEqual(outcomes[0]["reason"], "survey_offer_mismatch")
        await set_json(self.redis, "user:u2", {"id": "u2", "research_consent": {"accepted": True}})
        _, _, foreign = await ingest_events(self.redis, SimpleNamespace(id="u2"), [
            {"event": "survey.shown", "props": display_props},
        ])
        self.assertEqual(foreign[0]["reason"], "survey_offer_mismatch")
        state = await mongo_store.find_by_cache_key("survey:state:u1")
        rows = [{"state": state["fields"], "survey": {}}]
        table = aggregate_trigger_rows(rows, meta)
        self.assertEqual(table[0]["triggered"], 1)
        self.assertEqual(table[0]["shown"], 1)
        self.assertNotIn("survey_shown_verified:J2", state["fields"])
        self.assertIsNone(table[0]["display_response_rate"])

    async def test_retry_preserves_earlier_survey_schedule_after_trigger_state_failure(self):
        due = datetime.now(timezone.utc) - timedelta(minutes=5)
        with patch("app.research.survey_engine._set_state_field", side_effect=OSError("State write unavailable")):
            with self.assertRaises(OSError):
                await enqueue_trigger(self.redis, "u1", "consent_granted", due_at=due)
        scheduled = (await mongo_store.find_by_cache_key("survey:queue:u1"))["items"]
        self.assertTrue({"A1", "A2", "A3"}.issubset(scheduled))

        self.assertEqual(await enqueue_trigger(self.redis, "u1", "consent_granted"), 0)
        doc = await mongo_store.find_by_cache_key("survey:queue:u1")
        self.assertEqual(doc["items"], scheduled)
        pending = await get_pending_survey_items(self.redis, "u1")
        self.assertEqual([item["id"] for item in pending["items"]], ["A1", "A2", "A3"])

    async def test_interrupted_display_replays_all_flags_with_one_original_event(self):
        user = SimpleNamespace(id="u1")
        await enqueue_trigger(self.redis, user.id, "consent_granted")
        offer = await get_pending_survey_items(self.redis, user.id)
        item_ids = [item["id"] for item in offer["items"]]
        event = {"event": "survey.shown", "props": {
            "_client_event_id": "display interrupted",
            "offer_event_id": offer["offer_event_id"],
            "survey_version": offer["survey_version"],
            "item_ids": item_ids,
        }}
        with patch.object(mongo_store, "update_nested_fields", side_effect=OSError("display state unavailable")):
            _, _, interrupted = await ingest_events(self.redis, user, [event])
        self.assertEqual(interrupted[0]["status"], "retry")
        _, _, retry = await ingest_events(self.redis, user, [event])
        self.assertEqual(retry[0]["status"], "accepted")
        _, _, duplicate = await ingest_events(self.redis, user, [event])
        self.assertEqual(duplicate[0]["status"], "duplicate")
        self.assertEqual(duplicate[0]["event_id"], retry[0]["event_id"])

        await self.redis.delete(survey_state_key(user.id))
        await self.redis.hset(survey_state_key(user.id), "survey_shown_verified:A1", "false")
        await migrate_redis_to_mongo(self.redis, mongo_store)
        from app.research.admin_stats.filters import StatsFilters

        with patch("app.research.admin_stats.loader.get_all_user_ids", AsyncMock(return_value=[user.id])):
            rows, meta = await load_cohort(self.redis, StatsFilters())
        self.assertTrue(all(rows[0]["state"][f"survey_shown_verified:{item_id}"] is True for item_id in item_ids))
        self.assertEqual(aggregate_trigger_rows(rows, meta)[0]["shown"], 1)
        self.assertEqual(sum(fields["event"] == "survey.shown" for _, fields in self.redis.streams["research:event:u1"]), 1)

    async def test_legacy_queue_migration_cannot_restore_removed_items(self):
        key = survey_queue_key("u1")
        await self.redis.zadd(key, {"A1": datetime.now(timezone.utc).timestamp() - 60})
        await record_survey_response(self.redis, "u1", "A1", skipped=True)
        await enqueue_trigger(self.redis, "u1", "feedback_view_first")
        await migrate_redis_to_mongo(self.redis, mongo_store)
        doc = await mongo_store.find_by_cache_key("survey:queue:u1")
        self.assertEqual(set(doc["items"]), {"F2b", "F3a"})

    async def test_offer_quota_preserves_legacy_usage_and_survives_redis_loss(self):
        now = datetime.now(timezone.utc)
        recent = (now - timedelta(hours=1)).timestamp()
        expired = (now - timedelta(hours=25)).timestamp()
        key = survey_shown_key("u1")
        await self.redis.zadd(key, {"same-offer": recent, "expired": expired})
        await mongo_store.upsert_by_cache_key("survey:shown:u1", {"items": {"same-offer": recent}})
        await enqueue_trigger(self.redis, "u1", "consent_granted")

        first = await get_pending_survey_items(self.redis, "u1")
        self.assertTrue(first["offer_event_id"])
        await self.redis.delete(key)
        blocked = await get_pending_survey_items(self.redis, "u1")
        self.assertEqual(blocked["blocked_reason"], "rate_limit")
        stored = await mongo_store.find_by_cache_key("survey:shown:u1")
        self.assertEqual(len(stored["offer_times"]), 2)
        self.assertEqual(stored["offer_times"][0], recent)

    async def test_concurrent_report_views_reach_both_survey_thresholds(self):
        collection = mongo_store.collection("surveys")
        state_id = "survey:state:u1"
        await collection.insert_if_absent(state_id, {"fields": {"report_view_count": 0}})
        original = collection.find_one
        both_read = asyncio.Event()
        reads = 0

        async def synchronize_first_reads(query):
            nonlocal reads
            doc = await original(query)
            if query == {"_id": state_id} and reads < 2:
                reads += 1
                if reads == 2:
                    both_read.set()
                await both_read.wait()
            return doc

        await self.redis.hset(survey_state_key("u1"), "report_view_count", "0")
        with patch.object(collection, "find_one", side_effect=synchronize_first_reads):
            await asyncio.wait_for(asyncio.gather(
                handle_survey_trigger_event(self.redis, "u1", "report.view"),
                handle_survey_trigger_event(self.redis, "u1", "report.view"),
            ), 2)
        state = await original({"_id": state_id})
        self.assertEqual(state["trigger_counts"]["report_view_count"], 2)
        self.assertIs(state["fields"]["survey_enqueued:report_view_first"], True)
        self.assertIs(state["fields"]["survey_enqueued:report_dwell_or_reopen"], True)
        queue = await mongo_store.find_by_cache_key("survey:queue:u1")
        self.assertTrue({"C1", "F4a"}.issubset(queue["items"]))

    async def test_trigger_counter_preserves_redis_only_legacy_count(self):
        await self.redis.hset(survey_state_key("u1"), "report_view_count", "1")
        await handle_survey_trigger_event(self.redis, "u1", "report.view")
        state = await mongo_store.find_by_cache_key("survey:state:u1")
        self.assertEqual(state["trigger_counts"]["report_view_count"], 2)
        self.assertNotIn("survey_enqueued:report_view_first", state["fields"])
        self.assertIs(state["fields"]["survey_enqueued:report_dwell_or_reopen"], True)

    async def test_pending_survey_recovers_first_feedback_trigger_after_count_commits(self):
        with patch("app.research.survey_engine.enqueue_trigger", side_effect=OSError("queue unavailable")):
            with self.assertRaises(OSError):
                await handle_survey_trigger_event(self.redis, "u1", "feedback.view")
        before = await mongo_store.find_by_cache_key("survey:state:u1")
        planned = datetime.fromisoformat(before["pending_triggers"]["feedback_view_first"])
        self.assertEqual(before["trigger_counts"]["feedback_view_count"], 1)

        pending = await get_pending_survey_items(self.redis, "u1")
        self.assertEqual([item["id"] for item in pending["items"]], ["F2b", "F3a"])
        queue = await mongo_store.find_by_cache_key("survey:queue:u1")
        self.assertAlmostEqual(queue["items"]["F2b"], planned.timestamp() - 0.080)
        await handle_survey_trigger_event(self.redis, "u1", "feedback.view")
        after = await mongo_store.find_by_cache_key("survey:state:u1")
        self.assertEqual(after["trigger_counts"]["feedback_view_count"], 2)
        self.assertIsNone(after["pending_triggers"]["feedback_view_first"])
        events = self.redis.streams["research:event:u1"]
        self.assertEqual(sum(row["event"] == "survey.enqueued" for _, row in events), 1)

    async def test_first_report_dwell_trigger_recovers_without_another_view(self):
        with patch("app.research.survey_engine.enqueue_trigger", side_effect=OSError("queue unavailable")):
            with self.assertRaises(OSError):
                await handle_survey_trigger_event(self.redis, "u1", "report.view", {"dwell_sec": 20})
        state = await mongo_store.find_by_cache_key("survey:state:u1")
        self.assertEqual(state["trigger_counts"]["report_view_count"], 1)
        self.assertEqual(set(state["pending_triggers"]), {"report_view_first", "report_dwell_or_reopen"})

        await get_pending_survey_items(self.redis, "u1")
        queue = await mongo_store.find_by_cache_key("survey:queue:u1")
        self.assertTrue({"F4a", "F4b", "F5a"}.issubset(queue["items"]))

    async def test_second_session_trigger_recovers_without_another_completion(self):
        await set_json(self.redis, "user:u1", {"id": "u1", "research_consent": {
            "accepted": True, "accepted_at": "2026-01-02T00:00:00Z",
        }})
        session = {
            "user_id": "u1", "status": "completed", "created_at": "2026-01-03T00:00:00Z",
            "completed_at": "2026-01-03T00:04:00Z", "metadata": {"research_eligible": True},
        }
        await set_json(self.redis, "session:s1", {**session, "id": "s1"})
        await set_json(self.redis, "session:old", {**session, "id": "old", "created_at": "2026-01-01T00:00:00Z"})
        await set_json(self.redis, "session:other", {**session, "id": "other", "user_id": "u2"})
        await set_json(self.redis, "session:posttest", {**session, "id": "posttest", "type": "research_posttest"})
        props = {"session_id": "s1"}
        await asyncio.gather(
            emit_server_event(self.redis, "u1", "interview.complete", props),
            ingest_client_events(self.redis, "u1", [{"event": "interview.complete", "props": props}]),
        )
        await handle_survey_trigger_event(self.redis, "u1", "interview.complete", {"session_id": "other"})
        self.assertIsNone(await mongo_store.find_by_cache_key("survey:queue:u1"))

        await set_json(self.redis, "session:s2", {**session, "id": "s2"})
        with patch("app.research.survey_engine.enqueue_trigger", side_effect=OSError("queue unavailable")):
            with self.assertRaises(OSError):
                await handle_survey_trigger_event(self.redis, "u1", "interview.complete", {"session_id": "s2"})
        state = await mongo_store.find_by_cache_key("survey:state:u1")
        self.assertCountEqual(state["second_session_ids"], ["s1", "s2"])
        self.assertIsNotNone(state["pending_triggers"]["second_session_complete"])

        pending = await get_pending_survey_items(self.redis, "u1")
        self.assertEqual([item["id"] for item in pending["items"]], ["F3b", "F3c", "F5b"])
        await handle_survey_trigger_event(self.redis, "u1", "interview.complete", {"session_id": "s2"})
        events = self.redis.streams["research:event:u1"]
        self.assertEqual(sum(row["event"] == "survey.enqueued" for _, row in events), 1)

    async def test_client_event_contract_preserves_properties_in_event_stream(self):
        batch = ResearchEventsBatch.model_validate({"events": [{
            "event": "report.view", "ts": "2026-01-01T00:00:00Z", "props": {"session_id": "s1"},
        }]})
        accepted = await ingest_client_events(self.redis, "u1", batch.events)
        self.assertEqual(len(accepted), 1)
        event = self.redis.streams["research:event:u1"][0][1]
        self.assertEqual(json.loads(event["props"])["session_id"], "s1")
        self.assertEqual(event["ts"], "2026-01-01T00:00:00Z")

    async def test_batch_reports_outcome_for_each_input(self):
        count, ids, outcomes = await ingest_events(self.redis, SimpleNamespace(id="u1"), [
            {"event": "report.view"}, {"event": "not.allowed"}, {"event": "x"}, None, {"event": "feedback.view"},
        ])
        self.assertEqual(count, 2)
        self.assertEqual([row["status"] for row in outcomes], ["accepted", "rejected", "rejected", "rejected", "accepted"])
        self.assertEqual(outcomes[1]["reason"], "event_not_allowed")
        self.assertEqual([outcomes[2]["reason"], outcomes[3]["reason"]], ["invalid_event", "invalid_event"])
        self.assertEqual([outcomes[0]["event_id"], outcomes[4]["event_id"]], ids)
        await set_json(self.redis, "user:u1", {"id": "u1", "research_consent": {"accepted": False}})
        count, ids, outcomes = await ingest_events(self.redis, SimpleNamespace(id="u1"), [{"event": "report.view"}])
        self.assertEqual((count, ids), (0, []))
        self.assertEqual(outcomes, [{"status": "rejected", "reason": "consent_required"}])

    async def test_event_reattempt_reuses_receipt_without_repeating_derivation(self):
        item = {"event": "nav.change", "props": {"reselect": True, "_client_event_id": "same-event"}}
        first, second = await asyncio.gather(
            ingest_events(self.redis, SimpleNamespace(id="u1"), [item]),
            ingest_events(self.redis, SimpleNamespace(id="u1"), [item]),
        )
        self.assertEqual(sum(result[2][0]["status"] == "accepted" for result in (first, second)), 1)
        count, ids, outcomes = await ingest_events(self.redis, SimpleNamespace(id="u1"), [item])
        self.assertEqual(count, 1)
        self.assertEqual(outcomes, [{"status": "duplicate", "event_id": ids[0]}])
        self.assertEqual((await get_auto_fields(self.redis, "u1"))["entry_reselect_count"], 1)

    async def test_storage_status_reports_only_stalled_event_receipts(self):
        from app.api.v1.storage import get_system_storage_status

        receipts = mongo_store.collection("system_indexes")
        for i, (phase, status, started_at) in enumerate((
            ("event_stored", "processing", "2000-01-01T00:00:00+00:00"),
            ("awaiting_stream", "processing", "2000-01-01T00:00:00+00:00"),
            ("stream_appended", "processing", "2000-01-01T00:00:00+00:00"),
            ("dispatching", "processing", "2000-01-01T00:00:00+00:00"),
            ("derived", "processing", "2000-01-01T00:00:00+00:00"),
            ("triggering_survey", "processing", "2000-01-01T00:00:00+00:00"),
            (None, "processing", "2000-01-01T00:00:00+00:00"),
            ("storing_event", "processing", "2999-01-01T00:00:00+00:00"),
            ("dispatching", "accepted", "2000-01-01T00:00:00+00:00"),
        )):
            await receipts.insert_one({"_id": str(i), "doc_type": "research_event_receipt",
                                       "phase": phase, "status": status, "started_at": started_at})
        with patch.object(mongo_store, "get_storage_stats", AsyncMock(return_value={})):
            result = await get_system_storage_status(_admin=SimpleNamespace())
        self.assertEqual(result["research_event_receipts"], {
            "stalled_total": 7, "awaiting_stream": 1, "awaiting_event_storage": 1,
            "awaiting_dispatch": 1, "dispatch_unconfirmed": 1,
            "awaiting_survey": 1, "survey_unconfirmed": 1,
            "event_storage_unconfirmed": 0, "legacy_unknown": 1,
        })

    async def test_storage_status_distinguishes_resumable_posttests(self):
        from app.api.v1.storage import get_system_storage_status

        started_at = "2026-01-03T00:00:00+00:00"
        cycle = "2026-01-02T00:00:00+00:00"
        cases = (
            ("saved", {}),
            ("missing", {}),
            ("withdrawn", {"research_consent": {"accepted": False}}),
            ("confirmed", {"posttest_session_id": "confirmed-session"}),
            ("recent", {}),
        )
        receipts = mongo_store.collection("system_indexes")
        for user_id, overrides in cases:
            await set_json(self.redis, f"user:{user_id}", {
                "id": user_id, "research_consent": {"accepted": True, "accepted_at": cycle},
                **overrides,
            })
            await receipts.insert_if_absent(f"research:posttest-submission:{user_id}", {
                "doc_type": "posttest_submission_receipt",
                "status": "processing",
                "user_id": user_id,
                "session_id": f"{user_id}-session",
                "consent_accepted_at": cycle,
                "started_at": "2999-01-01T00:00:00+00:00" if user_id == "recent" else started_at,
            })
        await set_json(self.redis, "session:saved-session", {
            "id": "saved-session", "user_id": "saved", "type": "research_posttest",
            "status": "completed", "completed_at": started_at,
        })
        with patch.object(mongo_store, "get_storage_stats", AsyncMock(return_value={})):
            result = await get_system_storage_status(_admin=SimpleNamespace())
        self.assertEqual(result["posttest_submission_receipts"], {
            "stalled_total": 3, "session_unconfirmed": 1, "resumable": 1, "consent_unavailable": 1,
        })

    async def test_retry_resumes_after_event_storage_before_dispatch(self):
        user = SimpleNamespace(id="u1")
        item = {"event": "nav.change", "props": {"reselect": True, "_client_event_id": "before-dispatch"}}
        receipts = mongo_store.collection("system_indexes")
        original = receipts.update_one

        async def fail_before_claim(query, update, **kwargs):
            if query.get("phase") == "event_stored":
                raise OSError("injected failure before dispatch")
            return await original(query, update, **kwargs)

        with patch.object(receipts, "update_one", side_effect=fail_before_claim):
            _, _, outcomes = await ingest_events(self.redis, user, [item])
        self.assertEqual(outcomes[0]["status"], "retry")
        self.assertNotIn("entry_reselect_count", await get_auto_fields(self.redis, "u1"))
        _, _, outcomes = await ingest_events(self.redis, user, [item])
        self.assertEqual(outcomes[0]["status"], "accepted")
        self.assertEqual((await get_auto_fields(self.redis, "u1"))["entry_reselect_count"], 1)
        self.assertEqual(sum(row["event"] == "nav.change" for _, row in self.redis.streams["research:event:u1"]), 1)

    async def test_event_retry_repairs_mongo_after_redis_entry_has_been_lost(self):
        cycle = "2026-01-02T00:00:00+00:00"
        await set_json(self.redis, "user:u1", {"id": "u1", "research_consent": {
            "accepted": True, "accepted_at": cycle,
        }})
        user = SimpleNamespace(id="u1")
        item = {"event": "nav.change", "props": {"reselect": True, "_client_event_id": "storage-failure"}}
        with patch.object(mongo_store, "insert_document", side_effect=OSError("event collection unavailable")):
            _, _, outcomes = await ingest_events(self.redis, user, [item])
        self.assertEqual(outcomes[0]["status"], "retry")
        saved = self.redis.streams.pop("research:event:u1")
        self.assertEqual(len(saved), 1)
        event_id, payload = saved[0]

        results = await asyncio.gather(
            ingest_events(self.redis, user, [item]),
            ingest_events(self.redis, user, [item]),
        )
        self.assertEqual(sum(result[2][0]["status"] == "accepted" for result in results), 1)
        _, ids, outcomes = await ingest_events(self.redis, user, [item])
        self.assertEqual(outcomes, [{"status": "duplicate", "event_id": event_id}])
        self.assertEqual(ids, [event_id])
        self.assertNotIn("research:event:u1", self.redis.streams)
        events = await read_event_stream(self.redis, "u1")
        self.assertEqual([(row["id"], row["ts"]) for row in events], [(event_id, payload["ts"])])
        durable = await mongo_store.collection("research_events").find_one({"_id": f"u1:{event_id}"})
        self.assertEqual(durable["consent_cycle"], cycle)
        self.assertEqual((await get_auto_fields(self.redis, "u1"))["entry_reselect_count"], 1)

    async def test_expired_stream_receipt_cannot_append_a_second_event(self):
        user = SimpleNamespace(id="u1")
        item = {"event": "nav.change", "props": {"_client_event_id": "expired"}}
        receipts = mongo_store.collection("system_indexes")
        with patch.object(receipts, "update_one", side_effect=OSError("checkpoint unavailable")):
            _, _, first = await ingest_events(self.redis, user, [item])
        self.assertEqual(first[0]["status"], "retry")
        receipt = await receipts.find_one({"doc_type": "research_event_receipt"})
        await receipts.update_one(
            {"_id": receipt["_id"]},
            {"$set": {"started_at": (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()}},
        )
        await self.redis.delete(f"{receipt['_id']}:stream")
        _, _, repeated = await ingest_events(self.redis, user, [item])
        self.assertEqual(repeated[0]["status"], "retry")
        self.assertEqual(len(self.redis.streams["research:event:u1"]), 1)

    async def test_concurrent_retries_resume_survey_without_reapplying_derivation(self):
        user = SimpleNamespace(id="u1")
        item = {"event": "nav.change", "props": {"reselect": True, "_client_event_id": "before-survey"}}
        receipts = mongo_store.collection("system_indexes")
        original = receipts.update_one

        async def fail_before_claim(query, update, **kwargs):
            if query.get("phase") == "derived":
                raise OSError("injected failure before survey trigger")
            return await original(query, update, **kwargs)

        with patch("app.research.pipeline.handle_survey_trigger_event", new_callable=AsyncMock) as trigger:
            with patch.object(receipts, "update_one", side_effect=fail_before_claim):
                _, _, outcomes = await ingest_events(self.redis, user, [item])
            self.assertEqual(outcomes[0]["status"], "retry")
            self.assertEqual((await get_auto_fields(self.redis, "u1"))["entry_reselect_count"], 1)
            trigger.assert_not_awaited()

            results = await asyncio.gather(
                ingest_events(self.redis, user, [item]),
                ingest_events(self.redis, user, [item]),
            )
            self.assertEqual(sum(result[2][0]["status"] == "accepted" for result in results), 1)
            _, _, outcomes = await ingest_events(self.redis, user, [item])
            self.assertEqual(outcomes[0]["status"], "duplicate")
            trigger.assert_awaited_once()
        self.assertEqual((await get_auto_fields(self.redis, "u1"))["entry_reselect_count"], 1)
        self.assertEqual(sum(row["event"] == "nav.change" for _, row in self.redis.streams["research:event:u1"]), 1)

    async def test_retry_recognizes_saved_counter_before_derivation_checkpoint(self):
        user = SimpleNamespace(id="u1")
        item = {"event": "nav.change", "props": {"reselect": True, "_client_event_id": "counter-checkpoint"}}
        receipts = mongo_store.collection("system_indexes")
        original = receipts.update_one

        async def fail_before_checkpoint(query, update, **kwargs):
            if query.get("phase") == "dispatching" and update["$set"].get("phase") == "derived":
                raise OSError("injected failure after committing counter")
            return await original(query, update, **kwargs)

        with patch("app.research.pipeline.handle_survey_trigger_event", new_callable=AsyncMock) as trigger:
            with patch.object(receipts, "update_one", side_effect=fail_before_checkpoint):
                _, _, outcomes = await ingest_events(self.redis, user, [item])
            self.assertEqual(outcomes[0]["status"], "retry")
            trigger.assert_not_awaited()
            results = await asyncio.gather(
                ingest_events(self.redis, user, [item]),
                ingest_events(self.redis, user, [item]),
            )
            self.assertEqual(sum(result[2][0]["status"] == "accepted" for result in results), 1)
            trigger.assert_awaited_once()
        auto = await get_auto_fields(self.redis, "u1")
        self.assertEqual(auto["entry_reselect_count"], 1)
        self.assertEqual(auto["C3-auto"], 1)

    async def test_interrupted_event_stays_unconfirmed_and_batch_continues(self):
        item = {"event": "nav.change", "props": {"reselect": True, "_client_event_id": "interrupted"}}
        user = SimpleNamespace(id="u1")
        with patch("app.research.pipeline.on_research_event", AsyncMock(side_effect=OSError("injected failure"))):
            _, _, outcomes = await ingest_events(self.redis, user, [item])
        self.assertEqual(outcomes[0]["status"], "retry")
        _, _, outcomes = await ingest_events(self.redis, user, [item, {"event": "feedback.view"}])
        self.assertEqual([row["status"] for row in outcomes], ["retry", "accepted"])
        self.assertEqual(sum(row["event"] == "nav.change" for _, row in self.redis.streams["research:event:u1"]), 1)

    async def test_session_events_do_not_cross_consent_cycles(self):
        cycle = "2026-01-02T00:00:00+00:00"
        await set_json(self.redis, "user:u1", {"id": "u1", "research_consent": {
            "accepted": True, "accepted_at": cycle, "had_declined": True,
        }})
        for session_id, created, owner in (
            ("old", "2026-01-01T00:00:00Z", "u1"),
            ("current", "2026-01-03T00:00:00Z", "u1"),
            ("other", "2026-01-03T00:00:00Z", "u2"),
        ):
            await set_json(self.redis, f"session:{session_id}", {
                "id": session_id, "user_id": owner, "created_at": created, "metadata": {"research_eligible": True},
                "status": "completed", "completed_at": created,
            })
        await emit_server_event(self.redis, "u1", "interview.complete", {"session_id": "old"})
        self.assertNotIn("completed_practice_count", await get_auto_fields(self.redis, "u1"))
        count, _, outcomes = await ingest_events(self.redis, SimpleNamespace(id="u1"), [
            {"event": "feedback.view", "props": {"session_id": sid, "_consent_accepted_at": cycle}}
            for sid in ("old", "missing", "other")
        ])
        self.assertEqual(count, 0)
        self.assertEqual([row["reason"] for row in outcomes], ["session_outside_consent_cycle"] * 3)
        self.assertNotIn("feedback_viewed", await get_auto_fields(self.redis, "u1"))
        await emit_server_event(self.redis, "u1", "interview.complete", {"session_id": "current"})
        self.assertEqual((await get_auto_fields(self.redis, "u1"))["completed_practice_count"], 1)
        count, _, _ = await ingest_events(self.redis, SimpleNamespace(id="u1"), [{
            "event": "feedback.view", "props": {"session_id": "current", "_consent_accepted_at": cycle},
        }])
        self.assertEqual(count, 1)
        self.assertEqual((await get_auto_fields(self.redis, "u1"))["feedback_viewed"], 1)

    async def test_practice_metrics_count_canonical_sessions_across_duplicate_events(self):
        await set_json(self.redis, "user:u1", {"id": "u1", "research_consent": {
            "accepted": True, "accepted_at": "2026-01-02T00:00:00Z",
        }})
        for session_id, day, kind in (
            ("first", "03", "interview"), ("return", "10", "interview"),
            ("posttest", "04", "research_posttest"), ("late", "11", "interview"),
        ):
            await set_json(self.redis, f"session:{session_id}", {
                "id": session_id, "user_id": "u1", "type": kind, "status": "completed",
                "created_at": f"2026-01-{day}T00:00:00Z",
                "completed_at": f"2026-01-{day}T00:10:00Z", "metadata": {"research_eligible": True},
            })
        for session_id in ("return", "first", "return", "missing"):
            await emit_server_event(self.redis, "u1", "interview.complete", {"session_id": session_id})
        live = await get_auto_fields(self.redis, "u1")
        self.assertEqual(live["completed_practice_count"], 3)
        self.assertEqual(live["first_practice_completed_at"], "2026-01-03T00:10:00+00:00")
        self.assertEqual(live["return_sessions_7d"], 1)

        await set_auto_field(self.redis, "u1", "completed_practice_count", 8)
        await set_auto_field(self.redis, "u1", "H1", 8)
        await derive_daily_aggregates(self.redis, "u1")
        rebuilt = await get_auto_fields(self.redis, "u1")
        self.assertEqual(rebuilt["completed_practice_count"], 3)
        self.assertEqual(rebuilt["H1"], 1)

    async def test_client_events_cannot_cross_a_recorded_consent_cycle(self):
        await set_json(self.redis, "user:u1", {"id": "u1", "research_consent": {"accepted": True, "accepted_at": "new-cycle", "had_declined": True}})
        count, _, outcomes = await ingest_events(self.redis, SimpleNamespace(id="u1"), [
            {"event": "report.view", "props": {"_consent_accepted_at": "old-cycle"}},
            {"event": "report.view"},
            {"event": "report.view", "props": {"_consent_accepted_at": "new-cycle"}},
        ])
        self.assertEqual(count, 1)
        self.assertEqual([outcome.get("reason") for outcome in outcomes], ["consent_cycle_mismatch", "consent_cycle_mismatch", None])
        self.assertEqual(sum(fields["event"] == "report.view" for _, fields in self.redis.streams["research:event:u1"]), 1)

    async def test_event_reads_merge_redis_and_durable_copy_in_stream_order(self):
        for index in range(1, 13):
            await mongo_store.insert_document("research_events", {
                "_id": f"u1:1000-{index}", "user_id": "u1", "stream_entry_id": f"1000-{index}",
                "event": "report.view", "props": {"n": index},
            })
        self.redis.streams["research:event:u1"] = [
            ("1000-13", {"event": "feedback.view", "props": "{}", "ts": "now"})
        ]
        events = await read_event_stream(self.redis, "u1", count=4)
        self.assertEqual([event["id"] for event in events], ["1000-10", "1000-11", "1000-12", "1000-13"])

    async def test_auto_and_answers_recover_from_durable_store(self):
        await set_auto_field(self.redis, "u1", "F2a", 1, source_event_id="123-1")
        await record_survey_response(self.redis, "u1", "A1", value="首次求职")
        await self.redis.delete(auto_hash_key("u1"), auto_meta_key("u1"), survey_hash_key("u1"))
        self.assertEqual((await get_auto_fields(self.redis, "u1"))["F2a"], 1)
        self.assertEqual((await get_auto_metadata(self.redis, "u1"))["F2a"]["source_event_id"], "123-1")
        self.assertEqual((await get_survey_answers(self.redis, "u1"))["A1"]["value"], "首次求职")

    async def test_first_auto_write_after_cache_loss_preserves_existing_fields(self):
        await set_auto_field(self.redis, "u1", "first", 1)
        await self.redis.delete(auto_hash_key("u1"), auto_meta_key("u1"))
        await set_auto_field(self.redis, "u1", "second", 2)
        self.assertEqual(await get_auto_fields(self.redis, "u1"), {"first": 1, "second": 2})
        self.assertEqual(set(await get_auto_metadata(self.redis, "u1")), {"first", "second"})

    async def test_partial_auto_cache_cannot_replace_persisted_value_or_source(self):
        await set_auto_field(self.redis, "u1", "G7", 4, source_event_id="canonical")
        await set_auto_field(self.redis, "u1", "missing_endpoint", None, source_event_id="null-evidence")
        value_key, meta_key = auto_hash_key("u1"), auto_meta_key("u1")
        await self.redis.delete(value_key, meta_key)
        await self.redis.hset(value_key, "G7", "70")
        await self.redis.hset(value_key, "missing_endpoint", "99")
        await self.redis.hset(value_key, "old_field", "2")
        await self.redis.hset(meta_key, "G7", json.dumps({"source_event_id": "old-cache"}))
        await migrate_redis_to_mongo(self.redis, mongo_store)

        with patch("app.services.research_survey_service.get_all_user_ids", AsyncMock(return_value=["u1"])):
            row = json.loads(await export_research_panel(self.redis, anonymize=True))
        self.assertEqual(row["auto"]["G7"], 4)
        self.assertEqual(row["auto_meta"]["G7"]["source_event_id"], "canonical")
        self.assertIsNone(row["auto"]["missing_endpoint"])
        self.assertEqual(row["auto_meta"]["missing_endpoint"]["source_event_id"], "null-evidence")
        self.assertEqual(row["auto"]["old_field"], 2)

        await derive_on_event(self.redis, "u1", "referral.link.send", {}, event_id="new-event")
        self.assertEqual((await get_auto_fields(self.redis, "u1"))["G7"], 5)
        self.assertEqual((await get_auto_metadata(self.redis, "u1"))["G7"]["source_event_id"], "new-event")

    async def test_derived_counters_resume_after_cache_loss(self):
        await set_auto_field(self.redis, "u1", "G7", 4)
        await self.redis.delete(auto_hash_key("u1"))
        await derive_on_event(self.redis, "u1", "referral.link.send", {})
        self.assertEqual((await get_auto_fields(self.redis, "u1"))["G7"], 5)

    async def test_daily_derivation_handles_stored_iso_timestamp(self):
        await set_auto_field(self.redis, "u1", "first_practice_completed_at", "2026-01-01T00:00:00+00:00")
        await derive_daily_aggregates(self.redis, "u1")

    async def test_fallback_reconciliation_preserves_conflicting_records(self):
        live = mongo_store.collection("users")
        await live.insert_one({"_id": "user:u1", "name": "live"})
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "users.json"
            path.write_text(json.dumps({"user:u1": {"_id": "user:u1", "name": "offline"}}))
            with patch("app.core.mongo_client.FALLBACK_DIR", Path(directory)), patch.object(mongo_store, "mode", "mongodb_motor_live"):
                merged = await mongo_store.reconcile_fallback_to_live()
                self.assertEqual((await mongo_store.get_storage_stats())["pending_fallback_collections"], 1)
            self.assertEqual(merged, 0)
            self.assertEqual((await live.find_one({"_id": "user:u1"}))["name"], "live")
            self.assertEqual(json.loads(path.read_text())["user:u1"]["name"], "offline")

    async def test_fallback_write_failure_is_reported_and_existing_file_survives(self):
        with tempfile.TemporaryDirectory() as directory:
            collection = LocalMongoCollection("users", persist_dir=Path(directory))
            await collection.insert_one({"_id": "first", "name": "saved"})
            with patch("app.core.mongo_client.os.replace", side_effect=OSError("disk error")):
                with self.assertRaises(OSError):
                    await collection.insert_one({"_id": "second", "name": "not saved"})
            self.assertEqual(set(json.loads((Path(directory) / "users.json").read_text())), {"first"})
            self.assertIsNone(await collection.find_one({"_id": "second"}))

    async def test_production_refuses_fallback_without_mongodb(self):
        store = MongoDocumentStore()
        client = MagicMock()
        client.admin.command = AsyncMock(side_effect=OSError("offline"))
        config = Settings(APP_ENV="production", MONGODB_STRICT_LIVE=False)
        with patch("app.core.mongo_client.settings", config), patch("motor.motor_asyncio.AsyncIOMotorClient", return_value=client):
            with self.assertRaises(RuntimeError):
                await store.init_connection()

    async def test_assignment_initialization_reads_durable_group_counts(self):
        await mongo_store.collection("users").insert_one({"_id": "assigned", "experiment_assignment": {"arm": "10"}})
        redis = MagicMock()
        redis.exists = AsyncMock(return_value=0)
        redis.eval = AsyncMock(return_value=["01", "consent_accept"])
        self.assertEqual(await _pick_balanced_arm(redis, "new", override_arm=None, source="consent_accept"), ("01", "consent_accept"))
        self.assertEqual(redis.eval.await_args.args[-4:], (0, 0, 1, 0))

    async def test_first_survey_write_after_cache_loss_preserves_existing_answers(self):
        await record_survey_response(self.redis, "u1", "A1", value="first")
        await self.redis.delete(survey_hash_key("u1"))
        await record_survey_response(self.redis, "u1", "A2", value="second")
        self.assertEqual(set(await get_survey_answers(self.redis, "u1")), {"A1", "A2"})

    async def test_partial_cache_and_migration_cannot_hide_or_overwrite_durable_answers(self):
        accepted_at = "2026-01-01T00:00:00Z"
        await set_json(self.redis, "user:u1", {"id": "u1", "research_consent": {
            "accepted": True, "accepted_at": accepted_at,
        }})
        key = survey_hash_key("u1")
        await record_survey_response(self.redis, "u1", "A1", value="已保存的一")
        await record_survey_response(self.redis, "u1", "A2", value="已保存的二")
        await self.redis.delete(key)
        for item_id, value in (("A1", "旧缓存"), ("A3", "尚未迁移")):
            await self.redis.hset(key, item_id, json.dumps({
                "status": "answered", "value": value, "consent_accepted_at": accepted_at,
            }))
        with patch("app.services.research_survey_service.get_all_user_ids", AsyncMock(return_value=["u1"])):
            row = json.loads(await export_research_panel(self.redis, anonymize=True))
        expected = {"A1": "已保存的一", "A2": "已保存的二", "A3": "尚未迁移"}
        self.assertEqual({item: answer["value"] for item, answer in row["survey"].items()}, expected)

        report = await migrate_redis_to_mongo(self.redis, mongo_store)
        self.assertEqual(report["errors"], 0)
        await self.redis.delete(key)
        restored = await get_survey_answers(self.redis, "u1")
        self.assertEqual({item: answer["value"] for item, answer in restored.items()}, expected)

    async def test_reconsent_isolates_auto_counters_and_daily_event_history(self):
        await derive_on_event(self.redis, "u1", "nav.change", {"reselect": True})
        self.assertEqual((await get_auto_fields(self.redis, "u1"))["entry_reselect_count"], 1)
        await set_json(self.redis, "user:u1", {"id": "u1", "research_consent": {
            "accepted": True, "accepted_at": "2026-01-02T00:00:00+00:00", "had_declined": True,
        }})
        self.assertEqual(await get_auto_fields(self.redis, "u1"), {})
        await derive_on_event(self.redis, "u1", "nav.change", {"reselect": True})
        self.redis.streams["research:event:u1"] = [
            ("1767225600000-0", {"event": "page.visibility", "ts": "2026-01-01T00:00:00Z", "props": '{"visible":true,"duration_sec":600}'}),
            ("1767398400000-0", {"event": "page.visibility", "ts": "2026-01-03T00:00:00Z", "props": '{"visible":true,"duration_sec":120}'}),
            ("1767398400001-0", {"event": "page.visibility", "ts": "2026-01-03T00:00:00Z",
                                 "props": '{"visible":true,"duration_sec":600,"_consent_accepted_at":"2026-01-01T00:00:00+00:00"}'}),
        ]
        await derive_daily_aggregates(self.redis, "u1")
        scoped = next(key for key in self.redis.hashes if key.startswith("research:auto:u1:cycle:") and not key.endswith(":meta"))
        await self.redis.delete(scoped, scoped + ":meta")
        current = await get_auto_fields(self.redis, "u1")
        self.assertEqual(current["entry_reselect_count"], 1)
        self.assertEqual(current["daily_minutes_actual"], 2.0)
        self.assertEqual(await self.redis.hget(auto_hash_key("u1"), "entry_reselect_count"), "1")

    async def test_reconsent_allows_new_answer_and_archives_old_answer(self):
        first = {"accepted": True, "accepted_at": "first"}
        second = {"accepted": True, "accepted_at": "second", "had_declined": True}
        await set_json(self.redis, "user:u1", {"id": "u1", "research_consent": first})
        await record_survey_response(self.redis, "u1", "A1", value="old")
        await set_json(self.redis, "user:u1", {"id": "u1", "research_consent": second})
        await self.redis.delete(survey_hash_key("u1"))
        self.assertFalse(await _is_answered_or_declined(self.redis, "u1", "A1"))
        with patch("app.services.research_survey_service.get_all_user_ids", AsyncMock(return_value=["u1"])):
            before = json.loads(await export_research_panel(self.redis, anonymize=True))
            self.assertEqual(before["survey"], {})
            await record_survey_response(self.redis, "u1", "A1", value="new")
            after = json.loads(await export_research_panel(self.redis, anonymize=True))
            self.assertEqual(after["survey"]["A1"]["value"], "new")
            self.assertEqual(after["survey"]["A1"]["consent_accepted_at"], "second")
        docs = await mongo_store.list_collection_docs("surveys", {"doc_type": "survey_answer_archive"})
        self.assertEqual([doc["answer"]["value"] for doc in docs], ["old"])

    async def test_answer_lookup_restores_all_answers_after_cache_loss(self):
        await record_survey_response(self.redis, "u1", "A1", value="one")
        await record_survey_response(self.redis, "u1", "A2", value="two")
        await self.redis.delete(survey_hash_key("u1"))
        self.assertTrue(await _is_answered_or_declined(self.redis, "u1", "A1"))
        self.assertEqual(set(await get_survey_answers(self.redis, "u1")), {"A1", "A2"})

    async def test_legacy_individual_answers_rebuild_missing_answer_map(self):
        for item_id in ("A1", "A2"):
            await mongo_store.upsert_by_cache_key(f"survey:answer:u1:{item_id}", {
                "user_id": "u1", "item_id": item_id, "status": "answered", "value": item_id,
            })
        self.assertTrue(await _is_answered_or_declined(self.redis, "u1", "A1"))
        self.assertEqual(set(await get_survey_answers(self.redis, "u1")), {"A1", "A2"})

    async def test_blind_pool_recovers_pending_items_without_resurrecting_completed_review(self):
        await enqueue_posttest_for_blind_review(self.redis, "u1", "回答")
        await self.redis.delete(blind_pool_key())
        pending = await list_blind_review_batch(self.redis)
        self.assertEqual(len(pending), 1)
        token = pending[0]["review_token"]
        self.assertNotIn("u1", token)
        raw = next(iter(await self.redis.smembers(blind_pool_key())))
        with self.assertRaises(ValueError):
            await submit_blind_scores(self.redis, raw, {"blind_score_material": 4}, reviewer_id="r1")
        await submit_blind_scores(self.redis, token, {"blind_score_material": 4}, reviewer_id="r1")
        with self.assertRaises(ValueError):
            await submit_blind_scores(self.redis, token, {"blind_score_material": 4}, reviewer_id="r1")
        await self.redis.delete(blind_pool_key())
        self.assertEqual(await list_blind_review_batch(self.redis), [])
        await self.redis.sadd(blind_pool_key(), raw)
        await migrate_redis_to_mongo(self.redis, mongo_store)
        self.assertEqual(await list_blind_review_batch(self.redis), [])

    async def test_withdrawn_blind_review_is_paused_across_consent_cycles(self):
        await set_json(self.redis, "user:u1", {"id": "u1", "research_consent": {"accepted": True, "accepted_at": "old"}})
        await enqueue_posttest_for_blind_review(self.redis, "u1", "旧回答")
        token = (await list_blind_review_batch(self.redis))[0]["review_token"]
        await set_json(self.redis, "user:u1", {"id": "u1", "research_consent": {"accepted": False, "withdrawn_at": "later", "had_declined": True}})
        self.assertEqual(await list_blind_review_batch(self.redis), [])
        with self.assertRaises(ValueError):
            await submit_blind_scores(self.redis, token, {"blind_score_material": 4}, reviewer_id="r1")
        await set_json(self.redis, "user:u1", {"id": "u1", "research_consent": {"accepted": True, "accepted_at": "new", "had_declined": True}})
        self.assertEqual(await list_blind_review_batch(self.redis), [])
        await enqueue_posttest_for_blind_review(self.redis, "u1", "新回答")
        pending = await list_blind_review_batch(self.redis, limit=1)
        self.assertEqual([entry["answer"] for entry in pending], ["新回答"])
        await submit_blind_scores(self.redis, pending[0]["review_token"], {"blind_score_material": 4}, reviewer_id="r1")

    async def test_new_posttest_requires_distinct_independent_reviews(self):
        from app.research.blind_review import BLIND_RUBRIC, get_posttest_review_export

        await enqueue_posttest_for_blind_review(self.redis, "u1", "双评答案", posttest_session_id="posttest-1")
        self.assertEqual(await list_blind_review_batch(self.redis, reviewer_id="u1"), [])
        item = (await list_blind_review_batch(self.redis, reviewer_id="r1"))[0]
        token = item["review_token"]
        first = dict.fromkeys(BLIND_RUBRIC, 3)
        second = dict.fromkeys(BLIND_RUBRIC, 4)
        with self.assertRaises(ValueError):
            await submit_blind_scores(self.redis, token, first, reviewer_id="u1")
        with self.assertRaises(ValueError):
            await submit_blind_scores(self.redis, token, {BLIND_RUBRIC[0]: 3}, reviewer_id="r1")
        await submit_blind_scores(self.redis, token, first, reviewer_id="r1")
        await submit_blind_scores(self.redis, token, first, reviewer_id="r1")
        with self.assertRaises(ValueError):
            await submit_blind_scores(self.redis, token, second, reviewer_id="r1")
        self.assertEqual(await list_blind_review_batch(self.redis, reviewer_id="r1"), [])
        self.assertEqual(await list_blind_review_batch(self.redis, reviewer_id="r2"), [item])
        await asyncio.gather(*(
            submit_blind_scores(self.redis, token, second, reviewer_id="r2") for _ in range(2)
        ))
        self.assertEqual(await list_blind_review_batch(self.redis, reviewer_id="r3"), [])
        with self.assertRaises(ValueError):
            await submit_blind_scores(self.redis, token, first, reviewer_id="r3")
        exported = await get_posttest_review_export("posttest-1")
        self.assertEqual([entry["scores"] for entry in exported["reviews"]], [first, second])
        self.assertTrue(all("reviewer_id" not in entry for entry in exported["reviews"]))
        self.assertNotIn(BLIND_RUBRIC[0], await get_auto_fields(self.redis, "u1"))

    async def test_competing_blind_submissions_allow_only_one_claim(self):
        await enqueue_posttest_for_blind_review(self.redis, "u1", "同一份答案")
        token = (await list_blind_review_batch(self.redis))[0]["review_token"]
        collection = mongo_store.collection("surveys")
        original = collection.update_one
        gate = asyncio.Event()
        arrivals = 0

        async def concurrent_update(query, update, **kwargs):
            nonlocal arrivals
            if query.get("status") == "pending":
                arrivals += 1
                if arrivals == 2:
                    gate.set()
                await asyncio.wait_for(gate.wait(), 2)
            return await original(query, update, **kwargs)

        with patch.object(collection, "update_one", side_effect=concurrent_update):
            results = await asyncio.gather(
                submit_blind_scores(self.redis, token, {"blind_score_material": 2}, reviewer_id="r2"),
                submit_blind_scores(self.redis, token, {"blind_score_material": 5}, reviewer_id="r5"),
                return_exceptions=True,
            )
        self.assertEqual(sum(result is None for result in results), 1)
        self.assertEqual(sum(isinstance(result, ValueError) for result in results), 1)
        record = await mongo_store.find_by_cache_key(f"research:blind:pool:{token}")
        self.assertEqual(record["status"], "completed")
        self.assertIn(record["submitted_scores"]["blind_score_material"], (2, 5))
        self.assertEqual(int(await self.redis.hget(auto_hash_key("u1"), "blind_score_material")), record["submitted_scores"]["blind_score_material"])

    async def test_failed_blind_projection_preserves_claimed_scores(self):
        await enqueue_posttest_for_blind_review(self.redis, "u1", "故障测试")
        token = (await list_blind_review_batch(self.redis))[0]["review_token"]
        scores = {"blind_score_material": 4, "blind_score_structure": 3}

        async def fail_after_first_field(redis, uid, field, value):
            if field == "blind_score_structure":
                raise OSError("injected failure")
            await set_auto_field(redis, uid, field, value)

        with patch("app.research.blind_review.set_auto_field", side_effect=fail_after_first_field):
            with self.assertRaises(OSError):
                await submit_blind_scores(self.redis, token, scores, reviewer_id="r1")
        record = await mongo_store.find_by_cache_key(f"research:blind:pool:{token}")
        self.assertEqual(record["status"], "retryable")
        self.assertEqual(record["submitted_scores"], scores)
        self.assertEqual(record["reviewer_id"], "r1")
        await enqueue_posttest_for_blind_review(self.redis, "u1", "故障测试")
        self.assertEqual(await list_blind_review_batch(self.redis), [])
        await self.redis.delete(blind_pool_key())
        original = await read_blind_review_pending(limit=10, admin=SimpleNamespace(id="r1"), redis=self.redis)
        self.assertEqual([item.model_dump() for item in original], [{
            "review_token": token, "answer": "故障测试", "retry_scores": scores,
        }])
        self.assertEqual(await read_blind_review_pending(limit=10, admin=SimpleNamespace(id="r2"), redis=self.redis), [])
        with self.assertRaises(ValueError):
            await submit_blind_scores(self.redis, token, scores, reviewer_id="r2")
        with self.assertRaises(ValueError):
            await submit_blind_scores(self.redis, token, {"blind_score_material": 5}, reviewer_id="r1")

        await submit_blind_scores(self.redis, token, scores, reviewer_id="r1")
        record = await mongo_store.find_by_cache_key(f"research:blind:pool:{token}")
        self.assertEqual(record["status"], "completed")
        fields = await get_auto_fields(self.redis, "u1")
        self.assertEqual({key: value for key, value in fields.items() if key.startswith("blind_score_")}, scores)

    async def test_research_referrals_exclude_withdrawals_and_old_bindings(self):
        inviter = {"id": "u1", "research_consent": {"accepted": True},
                   "experiment_assignment": {"arm": "00"}}
        from app.services.referral_reward_service import ensure_experiment_referral_incentive
        await ensure_experiment_referral_incentive(self.redis, inviter)
        invitee = {"id": "u2", "referred_by": "u1", "research_consent": {"accepted": True}}
        await set_json(self.redis, "user:u2", invitee)
        await set_json(self.redis, "research:invite_event:u1:u2", {"created_at": "2026-01-01T00:00:00Z"})
        await set_auto_field(self.redis, "u2", "qualified_activation", 1, source_event_id="123-1")
        await set_auto_field(self.redis, "u1", "referral_qualified_invitees", 9)

        async def reported():
            with patch("app.services.research_survey_service.get_all_user_ids", AsyncMock(return_value=["u1"])):
                return json.loads(await export_research_panel(self.redis, anonymize=True))

        initial = await reported()
        self.assertEqual(initial["auto"]["referral_qualified_invitees"], 1)
        evidence = initial["referral_evidence"]
        self.assertEqual(evidence["incentive_assignment"]["source"], "user_hash_bucket")
        self.assertTrue(evidence["incentive_assignment"]["assigned_at"])
        edge = evidence["bindings"][0]
        self.assertTrue(edge["invitee_id"].startswith("anon_"))
        self.assertEqual(edge["bound_at"], "2026-01-01T00:00:00+00:00")
        self.assertEqual(edge["qualification_source_event_id"], "123-1")
        invitee["research_consent"]["withdrawn_at"] = "2026-01-03T00:00:00Z"
        await set_json(self.redis, "user:u2", invitee)
        after_withdraw = await reported()
        self.assertEqual(after_withdraw["auto"]["referral_qualified_invitees"], 0)
        self.assertEqual(after_withdraw["referral_evidence"]["bindings"], [])
        self.assertNotIn("referral_qualified_invitees", (await reported())["auto_meta"])
        await emit_server_event(self.redis, "u1", "referral.qualified_activation", {"invitee_id": "u2"})
        self.assertFalse(self.redis.streams.get("research:event:u1"))

        invitee["research_consent"].pop("withdrawn_at")
        await set_json(self.redis, "user:u2", invitee)
        inviter["research_consent"].update({"accepted_at": "2026-01-02T00:00:00Z", "had_declined": True})
        await set_json(self.redis, "user:u1", inviter)
        await set_json(self.redis, "research:invite_event:u1:u2", {"created_at": "2026-01-01T00:00:00Z"})
        self.assertEqual((await reported())["auto"]["invitees_registered"], 0)

    async def test_referral_index_recovers_from_user_documents(self):
        await set_json(self.redis, "user:invitee", {"id": "invitee", "referred_by": "u1"})
        self.assertEqual(await get_referral_invitee_ids(self.redis, "u1"), {"invitee"})
        self.assertEqual(await self.redis.smembers("research:inviter:u1:invitees"), {"invitee"})

    async def test_partial_user_and_session_indexes_are_merged_with_durable_index(self):
        await index_user_registration(self.redis, user_id="u1", email="u1@example.test")
        await index_user_registration(self.redis, user_id="u2", email="u2@example.test")
        await index_add_user_session(self.redis, "u1", "s1", 1.0)
        await index_add_user_session(self.redis, "u1", "s2", 2.0)
        await self.redis.srem("users:all", "u2")
        await self.redis.zrem("user:u1:sessions", "s2")
        self.assertEqual(await get_all_user_ids(self.redis), ["u1", "u2"])
        self.assertEqual(await get_user_session_ids(self.redis, "u1"), ["s2", "s1"])

    async def test_series_index_migrates_and_recovers_after_cache_loss(self):
        await upsert_series(self.redis, "series-one", {"topic": "test"})
        result = await migrate_redis_to_mongo(self.redis, mongo_store)
        self.assertEqual(result["errors"], 0)
        await self.redis.delete("series:all", "series:series-one")
        self.assertEqual([item["id"] for item in await list_series(self.redis)], ["series-one"])

    async def test_survey_batch_rejects_invalid_answers_before_saving(self):
        user = SimpleNamespace(id="u1")
        with self.assertRaises(HTTPException) as raised:
            await submit_survey_answers(self.redis, user, [
                {"item_id": "A1", "value": "首次求职"}, {"item_id": "A7a", "value": 9},
            ])
        self.assertEqual(raised.exception.status_code, 422)
        self.assertEqual(await get_survey_answers(self.redis, "u1"), {})

    async def test_survey_requires_active_consent(self):
        await set_json(self.redis, "user:u1", {"id": "u1", "research_consent": {"accepted": False}})
        with self.assertRaises(HTTPException) as raised:
            await submit_survey_answers(self.redis, SimpleNamespace(id="u1"), [{"item_id": "A1", "value": "首次求职"}])
        self.assertEqual(raised.exception.status_code, 403)

    async def test_posttest_survey_requires_current_cycle_completion_for_display_and_submission(self):
        user = SimpleNamespace(id="u1")
        record = {
            "id": user.id, "research_consent": {"accepted": True, "accepted_at": "2026-01-02T00:00:00Z"},
            "posttest_completed_at": "2026-01-01T00:00:00Z",
        }
        await set_json(self.redis, "user:u1", record)
        await set_auto_field(self.redis, "u1", "J1", "legacy")
        await enqueue_trigger(self.redis, "u1", "posttest_day7")
        self.assertEqual((await pending_survey(self.redis, user, context=None))["items"], [])
        with self.assertRaises(HTTPException) as early:
            await submit_survey_answers(self.redis, user, [
                {"item_id": "A1", "value": "首次求职"}, {"item_id": "J2", "value": 5},
            ])
        self.assertEqual(early.exception.status_code, 409)
        self.assertEqual(await get_survey_answers(self.redis, "u1"), {})

        await set_json(self.redis, "user:u1", {**record, "posttest_completed_at": "2026-01-03T00:00:00Z"})
        items = (await pending_survey(self.redis, user, context=None))["items"]
        self.assertIn("J2", [item["id"] for item in items])
        saved = await submit_survey_answers(self.redis, user, [{"item_id": "J2", "value": 5}])
        self.assertEqual(saved[0]["status"], "answered")

    async def test_posttest_reporting_only_counts_current_cycle_completion(self):
        from app.research.admin_stats.filters import StatsFilters

        cycle = "2026-01-02T00:00:00Z"
        cases = {
            "old-cycle": ("2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"),
            "cache-only": ("2026-01-03T00:00:00Z", None),
            "complete": ("2026-01-03T00:00:00Z", "2026-01-04T00:00:00Z"),
        }
        for user_id, (due, completed) in cases.items():
            await set_json(self.redis, f"user:{user_id}", {
                "id": user_id, "research_consent": {"accepted": True, "accepted_at": cycle},
                "experiment_assignment": {"arm": "00"},
                "posttest_due_at": due, "posttest_completed_at": completed,
            })
            await set_auto_field(self.redis, user_id, "posttest_status", "done")
            await set_auto_field(self.redis, user_id, "J1", "假设答卷")
        with patch("app.research.admin_stats.loader.get_all_user_ids", AsyncMock(return_value=list(cases))):
            rows, meta = await load_cohort(self.redis, StatsFilters())
        report = compute_overview(rows, meta)
        self.assertEqual(report["kpis"]["posttest_7d_rate"]["denominator"], 2)
        self.assertEqual(report["kpis"]["posttest_7d_rate"]["numerator"], 1)
        self.assertEqual(report["posttest_grid"]["00"]["done_n"], 1)
        by_id = {row["user_id"]: row for row in rows}
        self.assertNotIn("J1", by_id["old-cycle"]["auto"])
        self.assertNotIn("posttest_status", by_id["cache-only"]["auto"])
        self.assertEqual(by_id["complete"]["auto"]["J1"], "假设答卷")

    async def test_survey_retry_does_not_count_the_same_skip_twice(self):
        user = SimpleNamespace(id="u1")
        answers = [{"item_id": "A7a", "skipped": True}]
        first = await submit_survey_answers(self.redis, user, answers, submission_id="first")
        repeated = await submit_survey_answers(self.redis, user, answers, submission_id="first")
        self.assertEqual(first, repeated)
        self.assertEqual(first[0]["status"], "no_response")
        with self.assertRaises(HTTPException) as conflict:
            await submit_survey_answers(self.redis, user, [{"item_id": "A7a", "value": 4}], submission_id="first")
        self.assertEqual(conflict.exception.status_code, 409)
        second = await submit_survey_answers(self.redis, user, answers, submission_id="second")
        self.assertEqual(second[0]["status"], "declined")
        events = self.redis.streams["research:event:u1"]
        self.assertEqual(sum(row["event"] == "survey.skip" for _, row in events), 2)

    async def test_survey_batch_retry_preserves_confirmed_item_after_later_failure(self):
        user = SimpleNamespace(id="u1")
        answers = [{"item_id": "A1", "value": "首次求职"}, {"item_id": "A7a", "skipped": True}]
        receipts = mongo_store.collection("surveys")
        original = receipts.update_one

        async def fail_before_second_item(query, update, **kwargs):
            if "responses.A7a" in query:
                raise OSError("injected failure before claiming second response")
            return await original(query, update, **kwargs)

        with patch.object(receipts, "update_one", side_effect=fail_before_second_item):
            with self.assertRaises(OSError):
                await submit_survey_answers(self.redis, user, answers, submission_id="partial")
        results = await submit_survey_answers(self.redis, user, answers, submission_id="partial")
        self.assertEqual(results[0]["value"], "首次求职")
        self.assertEqual(results[1]["status"], "no_response")
        events = self.redis.streams["research:event:u1"]
        self.assertEqual([row["event"] for _, row in events], ["survey.answer", "survey.skip"])

    async def test_survey_retry_confirms_already_saved_skip_without_reapplying_it(self):
        user = SimpleNamespace(id="u1")
        item_id = "A7a"
        answers = [{"item_id": item_id, "skipped": True}]
        receipts = mongo_store.collection("surveys")
        original = receipts.update_one

        async def fail_after_answer_is_saved(query, update, **kwargs):
            if query.get(f"responses.{item_id}") == "processing":
                raise OSError("injected failure during receipt confirmation")
            return await original(query, update, **kwargs)

        with patch.object(receipts, "update_one", side_effect=fail_after_answer_is_saved):
            with self.assertRaises(OSError):
                await submit_survey_answers(self.redis, user, answers, submission_id="saved")
        durable = await mongo_store.find_by_cache_key("survey:answers:u1")
        self.assertNotIn("_submission_receipts", durable)
        retries = await asyncio.gather(
            submit_survey_answers(self.redis, user, answers, submission_id="saved"),
            submit_survey_answers(self.redis, user, answers, submission_id="saved"),
        )
        expected = [{"item_id": item_id, **durable["answers"][item_id]}]
        self.assertEqual(retries, [expected, expected])
        self.assertEqual(expected[0]["status"], "no_response")
        events = self.redis.streams["research:event:u1"]
        self.assertEqual(sum(row["event"] == "survey.skip" for _, row in events), 1)

    async def test_posttest_acceleration_requires_admin(self):
        with self.assertRaises(HTTPException) as raised:
            await read_posttest_status(research_accelerate=True, current_user=SimpleNamespace(is_admin=False), redis=self.redis)
        self.assertEqual(raised.exception.status_code, 403)

    async def test_concurrent_posttest_submissions_share_one_session_and_review(self):
        user = SimpleNamespace(id="u1", is_admin=False)
        await set_json(self.redis, "user:u1", {
            "id": user.id, "research_consent": {"accepted": True, "accepted_at": "2026-01-01T00:00:00Z"},
            "posttest_due_at": "2026-01-08T00:00:00Z",
        })
        started = asyncio.Event()
        finish = asyncio.Event()

        async def pause_first_submission(*args, **kwargs):
            started.set()
            await finish.wait()
            await emit_server_event(*args, **kwargs)

        with patch("app.services.research_service.emit_server_event", side_effect=pause_first_submission):
            first_task = asyncio.create_task(submit_posttest_answer(self.redis, user, "第一份答卷"))
            try:
                await asyncio.wait_for(started.wait(), 2)
                with self.assertRaises(HTTPException) as pending:
                    await submit_posttest_answer(self.redis, user, "第一份答卷")
                self.assertEqual(pending.exception.status_code, 503)
                with self.assertRaises(HTTPException) as conflict:
                    await submit_posttest_answer(self.redis, user, "第二份答卷")
                self.assertEqual(conflict.exception.status_code, 409)
            finally:
                finish.set()
                first = await first_task
        repeated = await submit_posttest_answer(self.redis, user, " 第一份答卷 ")
        self.assertEqual(first["id"], repeated["id"])
        self.assertEqual(await get_user_session_ids(self.redis, user.id), [first["id"]])
        reviews = await mongo_store.list_collection_docs("surveys", {"doc_type": "blind_review_pool"})
        self.assertEqual([review["posttest_session_id"] for review in reviews], [first["id"]])

    async def test_posttest_retry_finishes_original_session_after_review_queue_failure(self):
        user = SimpleNamespace(id="u1", is_admin=False)
        await set_json(self.redis, "user:u1", {
            "id": user.id, "research_consent": {"accepted": True, "accepted_at": "2026-01-01T00:00:00Z"},
            "posttest_due_at": "2026-01-08T00:00:00Z",
        })
        with patch("app.services.research_service.enqueue_posttest_for_blind_review", side_effect=OSError("queue unavailable")):
            with self.assertRaises(OSError):
                await submit_posttest_answer(self.redis, user, "答卷")
        self.assertFalse((await get_posttest_status(self.redis, user)).completed)
        original_ids = await get_user_session_ids(self.redis, user.id)
        self.assertEqual(len(original_ids), 1)
        resumed = await asyncio.gather(
            submit_posttest_answer(self.redis, user, "答卷"),
            submit_posttest_answer(self.redis, user, "答卷"),
        )
        self.assertEqual([row["id"] for row in resumed], original_ids * 2)
        self.assertEqual(await get_user_session_ids(self.redis, user.id), original_ids)
        self.assertTrue((await get_posttest_status(self.redis, user)).completed)
        reviews = await mongo_store.list_collection_docs("surveys", {"doc_type": "blind_review_pool"})
        self.assertEqual([review["posttest_session_id"] for review in reviews], original_ids)
        events = self.redis.streams["research:event:u1"]
        self.assertEqual(sum(row["event"] == "posttest.open" for _, row in events), 1)

    async def test_posttest_is_unavailable_without_active_consent(self):
        for consent in ({}, {"accepted": False}, {"accepted": True, "withdrawn_at": "2026-01-01"}):
            await set_json(self.redis, "user:u1", {"id": "u1", "posttest_due_at": "2020-01-01T00:00:00+00:00", "research_consent": consent})
            user = SimpleNamespace(id="u1", is_admin=True)
            self.assertFalse((await get_posttest_status(self.redis, user, accelerate=True)).due)
            with self.assertRaises(HTTPException) as raised:
                await submit_posttest_answer(self.redis, user, "回答")
            self.assertEqual(raised.exception.status_code, 403)
            self.assertFalse(self.redis.streams.get("research:event:u1"))

    async def test_session_export_excludes_preconsent_and_unproven_sessions(self):
        await set_json(self.redis, "user:u1", {"id": "u1", "research_consent": {"accepted": True, "accepted_at": "2026-01-02T00:00:00+00:00"}})
        await index_user_registration(self.redis, user_id="u1", email="u1@example.test")
        sessions = [
            ("pre", "2026-01-01T00:00:00+00:00", True),
            ("post", "2026-01-03T00:00:00+00:00", True),
            ("unmarked", "2026-01-03T00:00:00+00:00", False),
            ("invalid", "invalid", True),
        ]
        for index, (sid, created, eligible) in enumerate(sessions):
            await set_json(self.redis, f"session:{sid}", {"id": sid, "status": "completed", "created_at": created, "metadata": {"research_eligible": eligible}})
            await index_add_user_session(self.redis, "u1", sid, index)
        self.assertEqual([row["session"]["id"] for row in await _iter_consented_sessions(self.redis)], ["post"])
        self.assertIsNotNone(await self.redis.get("session:pre"))

    async def test_pseudonymous_session_exports_do_not_return_known_direct_identifiers(self):
        row = {"user": {"id": "private-user-123", "referred_by": "private-referrer-456", "invite_code": "private-invite-789", "research_consent": {}},
               "session": {"id": "session-1", "user_id": "private-user-123", "topic": "private-topic", "metadata": {
                   "transcript": [{"text": "private-transcript"}], "touchpoint": {"utm_campaign": "private-name"},
                   "dimensions": {"custom": "private-dimension"}, "research_path": {"declined_revision_reason": "private-reason"},
               }}}
        with patch("app.services.research_service._iter_consented_sessions", AsyncMock(return_value=[row])):
            safe = json.loads(await export_research_jsonl(self.redis, anonymize=True))
            self.assertNotIn("private-user-123", json.dumps(safe))
            self.assertNotIn("private-referrer-456", json.dumps(safe))
            self.assertNotIn("private-invite-789", json.dumps(safe))
            self.assertNotIn("private-transcript", json.dumps(safe))
            self.assertNotIn("private-name", json.dumps(safe))
            self.assertTrue(safe["session"]["user_id"].startswith("anon_"))
            csv_row = next(csv.DictReader(io.StringIO(await export_research_csv(self.redis, anonymize=True))))
            self.assertTrue(csv_row["referred_by"].startswith("anon_"))
            self.assertEqual(csv_row["user_id"], safe["session"]["user_id"])
            self.assertEqual(csv_row["invite_code"], "")
            for field in ("topic", "dimensions_json", "utm_campaign", "declined_revision_reason"):
                self.assertEqual(csv_row[field], "")
            raw = json.loads(await export_research_jsonl(self.redis, anonymize=False))
            self.assertEqual(raw["session"]["user_id"], "private-user-123")
            self.assertEqual(raw["research_export"]["invite_code"], "private-invite-789")

    async def test_panel_pseudonymous_exports_keep_status_without_open_text(self):
        await index_user_registration(self.redis, user_id="u1", email="u1@example.test")
        await record_survey_response(self.redis, "u1", "D2", value="private-content@example.test")
        await record_survey_response(self.redis, "u1", "A1", value="首次求职")
        fields = {"J1": "private-posttest", "posttest_answer": "private-posttest", "posttest_status": "completed"}
        with patch("app.services.research_survey_service.get_report_auto_fields", new_callable=AsyncMock) as report:
            report.side_effect = lambda *args: (fields.copy(), {"J1": {"source": "test"}}, [])
            safe = json.loads(await export_research_panel(self.redis, anonymize=True))
            csv_row = next(csv.DictReader(io.StringIO(await export_research_panel_csv(self.redis, anonymize=True))))
            raw = json.loads(await export_research_panel(self.redis, anonymize=False))

        self.assertEqual(safe["survey"]["D2"]["status"], "answered")
        self.assertNotIn("value", safe["survey"]["D2"])
        self.assertEqual(safe["survey"]["A1"]["value"], "首次求职")
        self.assertEqual(safe["auto"], {"posttest_status": "completed"})
        self.assertNotIn("J1", safe["auto_meta"])
        self.assertEqual(csv_row["D2"], "")
        self.assertEqual(json.loads(csv_row["survey_json"]), safe["survey"])
        self.assertEqual(json.loads(csv_row["auto_json"]), safe["auto"])
        self.assertEqual(raw["survey"]["D2"]["value"], "private-content@example.test")
        self.assertEqual(raw["auto"]["J1"], "private-posttest")

    async def test_migration_status_reports_errors(self):
        with patch("app.api.v1.storage.migrate_redis_to_mongo", AsyncMock(return_value={"errors": 1})), patch.object(mongo_store, "reconcile_fallback_to_live", AsyncMock(return_value=0)), patch.object(mongo_store, "get_storage_stats", AsyncMock(return_value={})), patch.object(mongo_store, "degraded", False):
            report = await trigger_redis_to_mongo_migration(_admin=SimpleNamespace(), redis=self.redis)
        self.assertEqual(report["status"], "completed_with_errors")

    async def test_migration_status_reports_degradation_and_conflicts(self):
        with patch("app.api.v1.storage.migrate_redis_to_mongo", AsyncMock(return_value={"errors": 0})), patch.object(mongo_store, "reconcile_fallback_to_live", AsyncMock(return_value=0)), patch.object(mongo_store, "get_storage_stats", AsyncMock(return_value={"pending_fallback_collections": 1})):
            with patch.object(mongo_store, "degraded", False):
                report = await trigger_redis_to_mongo_migration(_admin=SimpleNamespace(), redis=self.redis)
                self.assertEqual(report["status"], "completed_with_conflicts")
            with patch.object(mongo_store, "degraded", True):
                report = await trigger_redis_to_mongo_migration(_admin=SimpleNamespace(), redis=self.redis)
                self.assertEqual(report["status"], "degraded")

    async def test_simulation_refuses_nonempty_redis_without_deleting_data(self):
        script = Path(__file__).resolve().parents[1] / "scripts" / "simulate_empirical_data.py"
        spec = importlib.util.spec_from_file_location("edgewise_simulation", script)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        redis = MagicMock()
        redis.dbsize = AsyncMock(return_value=1)
        redis.aclose = AsyncMock()
        redis.delete = AsyncMock()
        with patch.object(module.Redis, "from_url", return_value=redis):
            with self.assertRaises(RuntimeError):
                await module.persist_cohort_to_redis([], redis_url="redis://127.0.0.1:1/0")
        redis.delete.assert_not_awaited()
        redis.aclose.assert_awaited_once()

    async def test_monitor_reports_missing_data_instead_of_fixture_values(self):
        script = Path(__file__).resolve().parents[2] / "scripts" / "autoloop" / "empirical-monitor.py"
        spec = importlib.util.spec_from_file_location("edgewise_empirical_monitor", script)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with patch("redis.from_url", side_effect=OSError("offline")):
            report = module.build_report()
        self.assertEqual(report["data_source"], "unavailable")
        self.assertIsNone(report["arms"]["00"]["count"])
        self.assertEqual(report["diagnostics"]["status"], "UNAVAILABLE")
        self.assertIsNone(report["extended_diagnostics"]["scale_reliability"]["min_alpha"])
        client = MagicMock()
        client.get.return_value = None
        with patch("redis.from_url", return_value=client):
            self.assertEqual(module.fetch_arm_counts_from_redis()[1], "counts_missing")

    async def test_paper_check_reports_simulation_structure_only(self):
        script = Path(__file__).resolve().parents[2] / "scripts" / "autoloop" / "paper-sync-verifier.py"
        spec = importlib.util.spec_from_file_location("edgewise_paper_check", script)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        report = module.verify_paper_sync()
        self.assertEqual(report["status"], "SIMULATION_STRUCTURE_ONLY")
        self.assertIsNone(report["sample_size_verified"])

    async def test_panel_export_retains_per_field_provenance_and_excludes_withdrawals(self):
        await set_json(self.redis, "user:u1", {"id": "u1", "research_consent": {"accepted": True, "accepted_at": "2026-01-02T00:00:00+00:00", "had_declined": True}})
        await set_auto_field(self.redis, "u1", "metric", 1, source_event_id="123-1")
        await record_survey_response(self.redis, "u1", "A1", value="首次求职")
        with patch("app.services.research_survey_service.get_all_user_ids", AsyncMock(return_value=["u1"])):
            row = json.loads(await export_research_panel(self.redis, anonymize=False))
            self.assertEqual(row["auto_meta"]["metric"]["source_event_id"], "123-1")
            self.assertIn("survey_version", row["survey"]["A1"])
            self.assertTrue(row["consent_had_declined"])
            self.assertEqual(row["data_scope"], "consent_cycle_not_verified")
            csv_row = next(csv.DictReader(io.StringIO(await export_research_panel_csv(self.redis, anonymize=False))))
            self.assertEqual(json.loads(csv_row["auto_meta_json"])["metric"]["source_event_id"], "123-1")
            self.assertEqual(csv_row["consent_accepted_at"], "2026-01-02T00:00:00+00:00")
            self.assertEqual(csv_row["consent_had_declined"], "True")
            self.assertEqual(csv_row["data_scope"], "consent_cycle_not_verified")
            await set_json(self.redis, "user:u1", {"id": "u1", "research_consent": {"accepted": True, "withdrawn_at": "2026-01-01"}})
            self.assertEqual(await export_research_panel(self.redis, anonymize=False), "")

    async def test_migration_pages_complete_stream_and_metadata(self):
        self.redis.streams["research:event:u1"] = [
            (f"1700000000000-{i}", {"event": "report.view", "ts": "2026-01-01", "props": "{}"})
            for i in range(1, 1251)
        ]
        await self.redis.hset(auto_meta_key("u1"), "F2a", json.dumps({"rule_version": "v1"}))
        result = await migrate_redis_to_mongo(self.redis, mongo_store)
        self.assertEqual(result["errors"], 0)
        self.assertEqual(result["migrated_events"], 1250)
        self.assertEqual((await mongo_store.find_by_cache_key("research:auto:u1:meta"))["fields"]["F2a"]["rule_version"], "v1")
        second = await migrate_redis_to_mongo(self.redis, mongo_store)
        self.assertEqual(second["migrated_events"], 0)


if __name__ == "__main__":
    unittest.main()
