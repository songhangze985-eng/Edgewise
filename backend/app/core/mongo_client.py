"""MongoDB Unstructured Document Database Layer (`mongo_client.py`).

Provides primary persistence for all unstructured business & research documents:
  1. `users`: User profiles, credentials, experiment arms, consent records
  2. `questions`: Question bank (general, professional, coding, structured, PDF/Dataset ETL, resume-specific)
  3. `surveys`: Survey item bank, user micro-survey responses (`survey_answers`), trigger states (`survey_states`), queues, 7-day posttests
  4. `sessions`: 1v1 Single Interview sessions, multi-round scores, LGD sessions, `lgd_report.json` Context Handoff
  5. `lgd_rooms`: LGD group discussion rooms and `lgd_memory` snapshots
  6. `resumes_jobs`: Parsed resumes (`resume.json`), JD jobs, STAR story cards, UGC interview experiences
  7. `research_events`: Empirical 2x2 factorial experiment event stream documents
  8. `conversation_memories`: Multi-turn conversation memory documents (`copilot`, `interview_1v1`, `lgd`)
  9. `system_indexes`: Persistent secondary indexes (`users:all`, `user:email:*`, `user:invite_code:*`,
     `user:*:sessions`, `questions:all`, `lgd_rooms:all`, etc.) so Redis restarts never lose lookup indexes.

Dual-Engine Architecture with Strict Observability & Automatic Reconciliation:
  - Live MongoDB: Uses `motor.motor_asyncio.AsyncIOMotorClient` connected to `settings.MONGODB_URI`.
    On connection, copies missing fallback documents and retains conflicting documents for review.
  - Fallback Warning: If driver is missing or MongoDB is unreachable, logs a `CRITICAL`/`ERROR` alert,
    marks `degraded=True` in storage status, and refuses to start if `settings.MONGODB_STRICT_LIVE=True`.
"""

from __future__ import annotations

import copy
import json
import logging
import os
import tempfile
import threading
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from app.config import settings

logger = logging.getLogger("edgewise.mongo")

COLLECTIONS = (
    "users",
    "questions",
    "surveys",
    "sessions",
    "lgd_rooms",
    "resumes_jobs",
    "research_events",
    "conversation_memories",
    "system_indexes",
)

FALLBACK_DIR = Path(__file__).resolve().parents[2] / ".data" / "mongodb_fallback"


def _atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    fd, tmp_path = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_path, path)
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def redact_mongodb_uri(uri: str) -> str:
    """Redact credentials, host, and port before exposing URI metadata via any endpoint or log."""
    raw = (uri or "").strip()
    if not raw:
        return "unconfigured"
    try:
        parsed = urlparse(raw)
        scheme = parsed.scheme or "mongodb"
        db_hint = parsed.path.lstrip("/") or settings.MONGODB_DB_NAME
        return f"{scheme}://***redacted***/{db_hint}"
    except Exception:
        return "mongodb://***redacted***"


def _set_nested_path(target: dict[str, Any], dotted_key: str, value: Any) -> None:
    parts = dotted_key.split(".")
    cur = target
    for part in parts[:-1]:
        existing = cur.get(part)
        if not isinstance(existing, dict):
            existing = {}
            cur[part] = existing
        cur = existing
    cur[parts[-1]] = copy.deepcopy(value)


def _matches_filter(doc: dict[str, Any], filter_dict: dict[str, Any] | None) -> bool:
    if not filter_dict:
        return True
    for k, v in filter_dict.items():
        current: Any = doc
        exists = True
        for part in k.split("."):
            if not isinstance(current, dict) or part not in current:
                current = None
                exists = False
                break
            current = current[part]
        if isinstance(v, dict):
            doc_val = current
            if "$exists" in v and exists != v["$exists"]:
                return False
            if "$in" in v and doc_val not in v["$in"]:
                return False
            if "$ne" in v and doc_val == v["$ne"]:
                return False
            if "$gte" in v and (doc_val is None or doc_val < v["$gte"]):
                return False
            if "$lte" in v and (doc_val is None or doc_val > v["$lte"]):
                return False
        else:
            if current != v:
                return False
    return True


class LocalMongoCollection:
    """MongoDB Collection-compatible document store backed by memory + JSON persistence."""

    def __init__(self, name: str, persist_dir: Path | None = None) -> None:
        self.name = name
        self._lock = threading.RLock()
        self._docs: dict[str, dict[str, Any]] = {}
        self._file_path: Path | None = None
        if persist_dir is not None:
            try:
                persist_dir.mkdir(parents=True, exist_ok=True)
                self._file_path = persist_dir / f"{name}.json"
                if self._file_path.is_file():
                    raw = json.loads(self._file_path.read_text(encoding="utf-8"))
                    if isinstance(raw, dict):
                        self._docs = raw
            except Exception as exc:
                logger.error("Failed to initialize local fallback file for collection %s: %s", name, exc)
                raise

    def _flush(self) -> None:
        if self._file_path is None:
            return
        try:
            _atomic_write_json(self._file_path, self._docs)
        except Exception as exc:
            logger.error("Failed to flush local fallback collection %s: %s", self.name, exc)
            try:
                saved = json.loads(self._file_path.read_text(encoding="utf-8")) if self._file_path.is_file() else {}
                if isinstance(saved, dict):
                    self._docs = saved
            except Exception as read_exc:
                logger.error("Failed to reload local fallback collection %s: %s", self.name, read_exc)
            raise

    async def find_one(self, filter_dict: dict[str, Any]) -> dict[str, Any] | None:
        with self._lock:
            doc_id = filter_dict.get("_id")
            if isinstance(doc_id, str) and len(filter_dict) == 1:
                found = self._docs.get(doc_id)
                return copy.deepcopy(found) if found is not None else None
            for doc in self._docs.values():
                if _matches_filter(doc, filter_dict):
                    return copy.deepcopy(doc)
            return None

    async def find_many(
        self,
        filter_dict: dict[str, Any] | None = None,
        *,
        limit: int = 1000,
    ) -> list[dict[str, Any]]:
        with self._lock:
            results: list[dict[str, Any]] = []
            for doc in self._docs.values():
                if _matches_filter(doc, filter_dict):
                    results.append(copy.deepcopy(doc))
                    if len(results) >= limit:
                        break
            return results

    async def iter_documents(self, filters: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
        with self._lock:
            matching = [copy.deepcopy(doc) for doc in self._docs.values() if _matches_filter(doc, filters)]
        for doc in matching:
            yield doc

    async def find_recent_events(self, user_id: str, limit: int) -> list[dict[str, Any]]:
        def stream_order(doc: dict[str, Any]) -> tuple[int, int]:
            try:
                ms, sequence = str(doc.get("stream_entry_id", "0-0")).split("-", 1)
                return int(ms), int(sequence)
            except (TypeError, ValueError):
                return (0, 0)

        with self._lock:
            docs = [copy.deepcopy(doc) for doc in self._docs.values() if doc.get("user_id") == user_id]
        return sorted(docs, key=stream_order, reverse=True)[:limit]

    async def update_one(
        self,
        filter_dict: dict[str, Any],
        update_doc: dict[str, Any],
        *,
        upsert: bool = True,
    ) -> dict[str, Any]:
        with self._lock:
            set_payload = update_doc.get("$set", update_doc)
            doc_id = (
                filter_dict.get("_id")
                or set_payload.get("_id")
                or set_payload.get("id")
                or f"doc_{len(self._docs) + 1}"
            )
            doc_id = str(doc_id)
            existing = self._docs.get(doc_id)
            if existing is not None and not _matches_filter(existing, filter_dict):
                if upsert:
                    raise ValueError(f"Document already exists but does not match update filter: {doc_id}")
                return {"matched_count": 0, "modified_count": 0, "upserted_id": None}
            if existing is None and not upsert:
                return {"matched_count": 0, "modified_count": 0, "upserted_id": None}
            merged = copy.deepcopy(existing) if existing is not None else {}
            for k, v in set_payload.items():
                if "." in k:
                    _set_nested_path(merged, k, v)
                else:
                    merged[k] = copy.deepcopy(v)
            merged["_id"] = doc_id
            merged["_updated_at"] = datetime.now(timezone.utc).isoformat()
            self._docs[doc_id] = merged
            self._flush()
            return {
                "matched_count": 1 if existing else 0,
                "modified_count": 1 if existing else 0,
                "upserted_id": None if existing else doc_id,
            }

    async def insert_one(self, doc: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            doc_copy = copy.deepcopy(doc)
            doc_id = str(doc_copy.get("_id") or doc_copy.get("id") or f"doc_{len(self._docs) + 1}")
            doc_copy["_id"] = doc_id
            doc_copy.setdefault("_created_at", datetime.now(timezone.utc).isoformat())
            doc_copy.setdefault("_updated_at", doc_copy["_created_at"])
            self._docs[doc_id] = doc_copy
            self._flush()
            return {"inserted_id": doc_id}

    async def insert_if_absent(self, doc_id: str, payload: dict[str, Any]) -> bool:
        with self._lock:
            if doc_id in self._docs:
                return False
            self._docs[doc_id] = {**copy.deepcopy(payload), "_id": doc_id}
            self._flush()
            return True

    async def delete_one(self, filter_dict: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            doc_id = filter_dict.get("_id")
            if isinstance(doc_id, str) and doc_id in self._docs:
                del self._docs[doc_id]
                self._flush()
                return {"deleted_count": 1}
            for k, doc in list(self._docs.items()):
                if _matches_filter(doc, filter_dict):
                    del self._docs[k]
                    self._flush()
                    return {"deleted_count": 1}
            return {"deleted_count": 0}

    async def count_documents(self, filter_dict: dict[str, Any] | None = None) -> int:
        with self._lock:
            if not filter_dict:
                return len(self._docs)
            return sum(1 for doc in self._docs.values() if _matches_filter(doc, filter_dict))


class MotorCollectionAdapter:
    """Wraps a real `motor.motor_asyncio.AsyncIOMotorCollection` with identical helper methods."""

    def __init__(self, motor_col: Any) -> None:
        self._col = motor_col

    async def find_one(self, filter_dict: dict[str, Any]) -> dict[str, Any] | None:
        return await self._col.find_one(filter_dict)

    async def find_many(
        self,
        filter_dict: dict[str, Any] | None = None,
        *,
        limit: int = 1000,
    ) -> list[dict[str, Any]]:
        cursor = self._col.find(filter_dict or {}).limit(limit)
        return await cursor.to_list(length=limit)

    async def iter_documents(self, filters: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
        async for doc in self._col.find(filters).batch_size(250):
            yield doc

    async def find_recent_events(self, user_id: str, limit: int) -> list[dict[str, Any]]:
        parts = {"$split": [{"$ifNull": ["$stream_entry_id", "0-0"]}, "-"]}
        pipeline = [
            {"$match": {"user_id": user_id}},
            {"$addFields": {"_stream_parts": parts}},
            {"$addFields": {
                "_stream_ms": {"$convert": {"input": {"$arrayElemAt": ["$_stream_parts", 0]}, "to": "long", "onError": 0, "onNull": 0}},
                "_stream_seq": {"$convert": {"input": {"$arrayElemAt": ["$_stream_parts", 1]}, "to": "long", "onError": 0, "onNull": 0}},
            }},
            {"$sort": {"_stream_ms": -1, "_stream_seq": -1}},
            {"$limit": limit},
            {"$project": {"_stream_parts": 0, "_stream_ms": 0, "_stream_seq": 0}},
        ]
        return await self._col.aggregate(pipeline).to_list(length=limit)

    async def update_one(
        self,
        filter_dict: dict[str, Any],
        update_doc: dict[str, Any],
        *,
        upsert: bool = True,
    ) -> dict[str, Any]:
        set_payload = dict(update_doc.get("$set", update_doc))
        set_payload.pop("_id", None)
        set_payload["_updated_at"] = datetime.now(timezone.utc).isoformat()
        res = await self._col.update_one(filter_dict, {"$set": set_payload}, upsert=upsert)
        return {
            "matched_count": res.matched_count,
            "modified_count": res.modified_count,
            "upserted_id": str(res.upserted_id) if res.upserted_id else None,
        }

    async def insert_one(self, doc: dict[str, Any]) -> dict[str, Any]:
        doc_copy = dict(doc)
        doc_copy.setdefault("_created_at", datetime.now(timezone.utc).isoformat())
        doc_copy.setdefault("_updated_at", doc_copy["_created_at"])
        doc_id = doc_copy.get("_id")
        if doc_id:
            await self._col.update_one({"_id": doc_id}, {"$set": doc_copy}, upsert=True)
            return {"inserted_id": str(doc_id)}
        res = await self._col.insert_one(doc_copy)
        return {"inserted_id": str(res.inserted_id)}

    async def insert_if_absent(self, doc_id: str, payload: dict[str, Any]) -> bool:
        result = await self._col.update_one(
            {"_id": doc_id}, {"$setOnInsert": payload}, upsert=True,
        )
        return result.upserted_id is not None

    async def delete_one(self, filter_dict: dict[str, Any]) -> dict[str, Any]:
        res = await self._col.delete_one(filter_dict)
        return {"deleted_count": res.deleted_count}

    async def count_documents(self, filter_dict: dict[str, Any] | None = None) -> int:
        return await self._col.count_documents(filter_dict or {})


def key_to_collection_and_id(key: str) -> tuple[str, str]:
    """Route a logical key (e.g. `question:Q001`, `user:u1`, `survey:state:u1`) to its MongoDB collection and `_id`."""
    k = (key or "").strip()
    if k.startswith("index:") or k in ("users:all", "questions:all", "lgd_rooms:all", "orgs:all", "series:all"):
        return "system_indexes", k
    if k.startswith(("user:email:", "user:invite_code:", "org:invite_code:")):
        return "system_indexes", f"index:{k}"
    if k.startswith("user:") and any(
        suffix in k
        for suffix in (
            ":sessions",
            ":resumes",
            ":jobs",
            ":stories",
            ":shares",
            ":schedules",
            ":question_uploads",
            ":resume_questions",
            ":org_mentor_sessions",
        )
    ):
        return "system_indexes", f"index:{k}"
    if k.startswith("user:"):
        return "users", k
    if k.startswith("question:"):
        return "questions", k.split(":", 1)[1]
    if k.startswith(
        (
            "survey:",
            "posttest:",
            "research:survey:",
            "research:posttest:",
            "research:blind",
            "research:auto:",
        )
    ):
        return "surveys", k
    if k.startswith(("session:", "lgd_report:")):
        return "sessions", k
    if k.startswith(("lgd_room:", "lgd_memory:")):
        return "lgd_rooms", k
    if k.startswith("memory:conv:"):
        return "conversation_memories", k
    if k.startswith("research:event"):
        return "research_events", k
    return "resumes_jobs", k


class MongoDocumentStore:
    """Unified asynchronous MongoDB document store with observable fallback and automatic reconciliation."""

    def __init__(self) -> None:
        self.mode: str = "local_document_fallback"
        self.degraded: bool = False
        self.fallback_reason: str | None = None
        self.last_error: str | None = None
        self.last_connected_at: str | None = None
        self.reconciled_docs_count: int = 0
        self.uri: str = settings.MONGODB_URI
        self.db_name: str = settings.MONGODB_DB_NAME
        self._motor_client: Any = None
        self._collections: dict[str, Any] = {
            name: LocalMongoCollection(name, persist_dir=FALLBACK_DIR)
            for name in COLLECTIONS
        }
        self.ops_telemetry: dict[str, int] = {
            "find_one": 0,
            "find_many": 0,
            "upsert": 0,
            "insert": 0,
            "delete": 0,
        }

    async def reconcile_fallback_to_live(self, live_db: Any | None = None) -> int:
        """Merge any local fallback JSON documents back into live MongoDB so offline writes are never orphaned."""
        if self.mode != "mongodb_motor_live" and live_db is None:
            return 0

        merged_count = 0
        for name in COLLECTIONS:
            fb_file = FALLBACK_DIR / f"{name}.json"
            if not fb_file.is_file():
                continue
            try:
                raw = json.loads(fb_file.read_text(encoding="utf-8"))
            except Exception as exc:
                logger.error("Failed reading fallback file %s during merge: %s", fb_file, exc)
                continue
            if not isinstance(raw, dict) or not raw:
                continue

            target_col = MotorCollectionAdapter(live_db[name]) if live_db is not None else self.collection(name)
            remaining: dict[str, Any] = {}
            for doc_id, doc in raw.items():
                if not isinstance(doc, dict):
                    remaining[doc_id] = doc
                    continue
                try:
                    existing = await target_col.find_one({"_id": doc_id})
                    if existing is None:
                        payload = {k: v for k, v in doc.items() if k != "_id"}
                        if await target_col.insert_if_absent(doc_id, payload):
                            merged_count += 1
                        else:
                            remaining[doc_id] = doc
                    else:
                        fallback_data = {k: v for k, v in doc.items() if not k.startswith("_")}
                        live_data = {k: v for k, v in existing.items() if not k.startswith("_")}
                        if fallback_data != live_data:
                            remaining[doc_id] = doc
                            logger.error("Fallback conflict retained for manual review: %s/%s", name, doc_id)
                except Exception as exc:
                    logger.error("Failed reconciling fallback doc %s/%s into live MongoDB: %s", name, doc_id, exc)
                    remaining[doc_id] = doc

            try:
                _atomic_write_json(fb_file, remaining)
            except Exception as exc:
                logger.error("Failed writing fallback reconciliation file %s: %s", fb_file, exc)

        if merged_count > 0:
            self.reconciled_docs_count += merged_count
            logger.warning(
                "Reconciled %d offline fallback documents from %s into live MongoDB.",
                merged_count,
                FALLBACK_DIR,
            )
        return merged_count

    async def init_connection(self) -> None:
        """Connect to live MongoDB daemon; loudly warn/alert (or abort in strict mode) if falling back."""
        try:
            from motor.motor_asyncio import AsyncIOMotorClient  # type: ignore
        except ImportError as exc:
            self.mode = "local_document_fallback"
            self.degraded = True
            self.fallback_reason = "driver_not_installed"
            self.last_error = str(exc)
            self._motor_client = None
            logger.error(
                "CRITICAL STORAGE DEGRADED: `motor`/`pymongo` driver is not installed (%s). "
                "Using local JSON fallback at %s — NOT live MongoDB!",
                exc,
                FALLBACK_DIR,
            )
            if settings.MONGODB_STRICT_LIVE or settings.is_production:
                raise RuntimeError("Live MongoDB is required but the motor driver is not installed.") from exc
            return

        client = None
        try:
            client = AsyncIOMotorClient(
                self.uri,
                serverSelectionTimeoutMS=1200,
                connectTimeoutMS=1200,
            )
            await client.admin.command("ping")
            db = client[self.db_name]
            await db.research_events.create_index([("user_id", 1), ("event", 1)], name="research_user_event")
            await db.system_indexes.create_index(
                [("doc_type", 1), ("status", 1), ("started_at", 1)], name="research_receipt_progress",
            )
            self._motor_client = client
            self._collections = {
                name: MotorCollectionAdapter(db[name])
                for name in COLLECTIONS
            }
            self.mode = "mongodb_motor_live"
            self.degraded = False
            self.fallback_reason = None
            self.last_error = None
            self.last_connected_at = datetime.now(timezone.utc).isoformat()
            logger.info(
                "Connected to live MongoDB at %s (db=%s)",
                redact_mongodb_uri(self.uri),
                self.db_name,
            )
            await self.reconcile_fallback_to_live(db)
        except Exception as exc:
            if client is not None:
                try:
                    client.close()
                except Exception:
                    pass
            self.mode = "local_document_fallback"
            self.degraded = True
            self.fallback_reason = "mongodb_unreachable"
            self.last_error = str(exc)
            self._motor_client = None
            self._collections = {
                name: LocalMongoCollection(name, persist_dir=FALLBACK_DIR)
                for name in COLLECTIONS
            }
            logger.error(
                "CRITICAL STORAGE DEGRADED: Unable to reach live MongoDB (%s). "
                "Falling back to local JSON files at %s! Documents written now must be reconciled on recovery.",
                exc,
                FALLBACK_DIR,
            )
            if settings.MONGODB_STRICT_LIVE or settings.is_production:
                raise RuntimeError(
                    f"Live MongoDB is required but the connection failed: {exc}"
                ) from exc

    async def close(self) -> None:
        if self._motor_client is not None:
            self._motor_client.close()
            self._motor_client = None

    def collection(self, name: str) -> Any:
        if name not in self._collections:
            self._collections[name] = LocalMongoCollection(name, persist_dir=FALLBACK_DIR)
        return self._collections[name]

    async def find_by_cache_key(self, key: str) -> dict[str, Any] | None:
        col_name, doc_id = key_to_collection_and_id(key)
        self.ops_telemetry["find_one"] += 1
        doc = await self.collection(col_name).find_one({"_id": doc_id})
        if doc is None:
            return None
        return {k: v for k, v in doc.items() if not k.startswith("_")}

    async def upsert_by_cache_key(self, key: str, data: dict[str, Any]) -> dict[str, Any]:
        col_name, doc_id = key_to_collection_and_id(key)
        self.ops_telemetry["upsert"] += 1
        payload = {
            **data,
            "_id": doc_id,
            "_cache_key": key,
            "_collection": col_name,
        }
        return await self.collection(col_name).update_one(
            {"_id": doc_id},
            {"$set": payload},
            upsert=True,
        )

    async def update_nested_fields(
        self,
        key: str,
        *,
        nested_attr: str,
        updates: dict[str, Any],
        base_fields: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Atomically merge keys inside a nested sub-document without overwriting sibling keys."""
        col_name, doc_id = key_to_collection_and_id(key)
        self.ops_telemetry["upsert"] += 1
        set_doc: dict[str, Any] = {
            "_cache_key": key,
            "_collection": col_name,
        }
        if base_fields:
            set_doc.update(base_fields)
        for field_k, field_v in updates.items():
            set_doc[f"{nested_attr}.{field_k}"] = field_v
        return await self.collection(col_name).update_one(
            {"_id": doc_id},
            {"$set": set_doc},
            upsert=True,
        )

    async def delete_by_cache_key(self, key: str) -> dict[str, Any]:
        col_name, doc_id = key_to_collection_and_id(key)
        self.ops_telemetry["delete"] += 1
        return await self.collection(col_name).delete_one({"_id": doc_id})

    async def insert_document(self, collection_name: str, doc: dict[str, Any]) -> dict[str, Any]:
        self.ops_telemetry["insert"] += 1
        return await self.collection(collection_name).insert_one(doc)

    async def list_collection_docs(
        self,
        collection_name: str,
        filter_dict: dict[str, Any] | None = None,
        *,
        limit: int = 1000,
    ) -> list[dict[str, Any]]:
        self.ops_telemetry["find_many"] += 1
        docs = await self.collection(collection_name).find_many(filter_dict, limit=limit)
        return [{k: v for k, v in d.items() if not k.startswith("_")} for d in docs]

    async def find_user_by_email(self, normalized_email: str) -> dict[str, Any] | None:
        self.ops_telemetry["find_one"] += 1
        doc = await self.collection("users").find_one({"email": normalized_email})
        if doc is None:
            return None
        return {k: v for k, v in doc.items() if not k.startswith("_")}

    async def find_user_by_invite_code(self, normalized_code: str) -> dict[str, Any] | None:
        self.ops_telemetry["find_one"] += 1
        doc = await self.collection("users").find_one({"invite_code": normalized_code})
        if doc is None:
            return None
        return {k: v for k, v in doc.items() if not k.startswith("_")}

    async def get_storage_stats(self) -> dict[str, Any]:
        counts: dict[str, int] = {}
        for name in COLLECTIONS:
            counts[name] = await self.collection(name).count_documents()
        pending_fallback_files = 0
        if FALLBACK_DIR.is_dir():
            for fp in FALLBACK_DIR.glob("*.json"):
                try:
                    data = json.loads(fp.read_text(encoding="utf-8"))
                    if isinstance(data, dict) and len(data) > 0:
                        pending_fallback_files += 1
                except Exception:
                    pass
        return {
            "engine_mode": self.mode,
            "degraded": self.degraded,
            "fallback_reason": self.fallback_reason,
            "warning": (
                "MongoDB 未连接，当前运行在本地 JSON 兜底模式，请勿多实例写入并在恢复后确认合并。"
                if self.degraded
                else "本地兜底文件仍有待核对的数据。" if pending_fallback_files else None
            ),
            "uri_redacted": redact_mongodb_uri(self.uri),
            "database": self.db_name,
            "last_connected_at": self.last_connected_at,
            "reconciled_docs_count": self.reconciled_docs_count,
            "pending_fallback_collections": pending_fallback_files,
            "collections": counts,
            "total_documents": sum(counts.values()),
            "operations": dict(self.ops_telemetry),
        }


mongo_store = MongoDocumentStore()


async def init_mongo() -> MongoDocumentStore:
    await mongo_store.init_connection()
    return mongo_store


async def close_mongo() -> None:
    await mongo_store.close()
