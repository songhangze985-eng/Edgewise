import json
import csv
import io
from datetime import datetime, timezone
import asyncio
import os
import shutil
import socket
import subprocess
import tempfile
import time
import sys
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

source = Path(__file__).resolve().parents[1] / "backend" / "app"
python = sys.executable
mongo_uri = os.environ.get("EDGEWISE_TEST_MONGO_URI")
mongo_db_name = f"edgewise_smoke_{uuid4().hex}"


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def request(port, path, body=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    payload = json.dumps(body).encode() if body is not None else None
    with urlopen(Request(f"http://127.0.0.1:{port}{path}", payload, headers), timeout=5) as response:
        return json.load(response)


def download_event_rows(port, token):
    req = Request(f"http://127.0.0.1:{port}/api/v1/research/export/events",
                  headers={"Authorization": f"Bearer {token}"})
    with urlopen(req, timeout=10) as response:
        assert response.headers["Cache-Control"] == "no-store"
        return [json.loads(line) for line in response if line.strip()]


def wait_for_api(process, port):
    for _ in range(80):
        try:
            request(port, "/")
            return
        except OSError:
            if process.poll() is not None:
                raise RuntimeError("Isolated API exited during startup")
            time.sleep(0.1)
    raise RuntimeError("Isolated API did not start")


def check_snapshot_restore(root, env, api_port, admin_token, admin_id, browser_id):
    from bson import BSON, decode_all
    from pymongo import MongoClient
    from redis import Redis

    def research_outputs(port):
        panel_url = f"http://127.0.0.1:{port}/api/v1/research/export/panel?anonymize=false"
        req = Request(panel_url, headers={"Authorization": f"Bearer {admin_token}"})
        with urlopen(req, timeout=10) as response:
            panel = {row["user_id"]: row for row in map(json.loads, response)}
        admin = panel[admin_id]
        browser = panel[browser_id]
        events = sorted(download_event_rows(port, admin_token), key=lambda row: (row["user_id"], row["event_id"]))
        return (
            events, browser["auto"]["task_steps_to_start"],
            browser["auto_meta"]["task_steps_to_start"], browser["survey"]["A1"],
            admin["auto"]["day14_followup_completed_at"],
        )

    expected = research_outputs(api_port)
    events, metric, provenance, answer, followup = expected
    assert metric and followup and answer["status"] == "answered", expected
    assert any(row["event_id"] == provenance["source_event_id"] for row in events), provenance
    restored_name = f"{mongo_db_name}_restored"
    backup_dir = root / "snapshot"
    backup_dir.mkdir()
    restored_dir = root / "redis-restored"
    restored_dir.mkdir()
    restored_redis_port, restored_api_port = free_port(), free_port()
    restored_url = f"redis://127.0.0.1:{restored_redis_port}/0"
    restored_env = {**env, "REDIS_URL": restored_url, "MONGODB_DB_NAME": restored_name}
    stream_key = f"research:event:{browser_id}"
    answer_key = f"research:survey:{browser_id}"
    with Redis.from_url(env["REDIS_URL"]) as source_redis:
        stream, answers = source_redis.xrange(stream_key), source_redis.hgetall(answer_key)
        assert stream and answers
        source_redis.save()
    shutil.copyfile(root / "dump.rdb", restored_dir / "dump.rdb")

    with MongoClient(mongo_uri, serverSelectionTimeoutMS=5000) as client:
        source_db, restored_db = client[mongo_db_name], client[restored_name]
        processes = []
        try:
            collections = source_db.list_collection_names()
            for name in collections:
                path = backup_dir / f"{name}.bson"
                path.write_bytes(b"".join(BSON.encode(doc) for doc in source_db[name].find()))
                indexes = list(source_db[name].list_indexes())
                (backup_dir / f"{name}.indexes.bson").write_bytes(b"".join(BSON.encode(index) for index in indexes))
            for name in collections:
                docs = decode_all((backup_dir / f"{name}.bson").read_bytes())
                restored_db.create_collection(name)
                if docs:
                    restored_db[name].insert_many(docs)
                assert list(restored_db[name].find().sort("_id", 1)) == list(source_db[name].find().sort("_id", 1)), name
                for index in decode_all((backup_dir / f"{name}.indexes.bson").read_bytes()):
                    index_name = index.pop("name")
                    keys = list(index.pop("key").items())
                    if index_name != "_id_":
                        index.pop("v", None)
                        restored_db[name].create_index(keys, name=index_name, **index)
                assert restored_db[name].index_information() == source_db[name].index_information(), name
            assert restored_db.research_events.find_one(
                {"user_id": browser_id, "event": "task.steps_to_start"}, hint="research_user_event",
            ) is not None
            assert restored_db.system_indexes.count_documents(
                {"doc_type": "research_event_receipt", "status": "processing"}, hint="research_receipt_progress",
            ) == 0
            processes.append(subprocess.Popen([
                "redis-server", "--port", str(restored_redis_port), "--bind", "127.0.0.1",
                "--dir", str(restored_dir), "--save", "", "--appendonly", "no",
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
            processes.append(subprocess.Popen([
                python, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(restored_api_port),
            ], cwd=root / "backend", env=restored_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
            wait_for_api(processes[-1], restored_api_port)
            with Redis.from_url(restored_url) as restored_redis:
                assert restored_redis.xrange(stream_key) == stream
                assert restored_redis.hgetall(answer_key) == answers
            assert research_outputs(restored_api_port) == expected
        finally:
            for process in reversed(processes):
                process.terminate()
                process.wait(timeout=5)
            client.drop_database(restored_name)


with tempfile.TemporaryDirectory(prefix="edgewise-smoke-") as tmp:
    root = Path(tmp)
    shutil.copytree(source, root / "backend" / "app", ignore=shutil.ignore_patterns("__pycache__"))
    redis_port, api_port = free_port(), free_port()
    redis = subprocess.Popen(["redis-server", "--port", str(redis_port), "--bind", "127.0.0.1", "--dir", str(root), "--save", "", "--appendonly", "no"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    env = {**os.environ, "REDIS_URL": f"redis://127.0.0.1:{redis_port}/0", "PYTHONDONTWRITEBYTECODE": "1"}
    if mongo_uri:
        env.update({"MONGODB_URI": mongo_uri, "MONGODB_DB_NAME": mongo_db_name, "MONGODB_STRICT_LIVE": "true"})
        os.environ.update({"MONGODB_URI": mongo_uri, "MONGODB_DB_NAME": mongo_db_name, "MONGODB_STRICT_LIVE": "true"})
    api = subprocess.Popen([python, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(api_port)], cwd=root / "backend", env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        wait_for_api(api, api_port)
        sys.path.insert(0, str(root / "backend"))
        from redis.asyncio import from_url
        from app.services.research_service import _pick_balanced_arm
        from app.core.mongo_client import mongo_store

        async def check_concurrent_assignment():
            client = from_url(f"redis://127.0.0.1:{redis_port}/1", decode_responses=True)
            try:
                base = sum([await mongo_store.collection("users").count_documents({"experiment_assignment.arm": arm}) for arm in ("00", "01", "10", "11")])
                assigned = await asyncio.gather(*[
                    _pick_balanced_arm(client, f"user-{i}", override_arm=None, source="consent_accept")
                    for i in range(100)
                ])
                counts_after = [int(await client.get(f"research:arm_count:{arm}") or 0) for arm in ("00", "01", "10", "11")]
                assert max(counts_after) - min(counts_after) <= 1, counts_after
                repeated = await asyncio.gather(*[
                    _pick_balanced_arm(client, "same-user", override_arm=None, source="consent_accept")
                    for _ in range(20)
                ])
                assert len(set(repeated)) == 1
                counts = [int(await client.get(f"research:arm_count:{arm}") or 0) for arm in ("00", "01", "10", "11")]
                assert sum(counts) == base + 101, counts
            finally:
                await client.aclose()

        asyncio.run(check_concurrent_assignment())

        async def check_assignment_recovery():
            base = await mongo_store.collection("users").count_documents({"experiment_assignment.arm": "00"})
            await mongo_store.collection("users").insert_one({"_id": "restore-1", "experiment_assignment": {"arm": "00"}})
            await mongo_store.collection("users").insert_one({"_id": "restore-2", "experiment_assignment": {"arm": "00"}})
            client = from_url(f"redis://127.0.0.1:{redis_port}/2", decode_responses=True)
            try:
                chosen, _ = await _pick_balanced_arm(client, "new-user", override_arm=None, source="consent_accept")
                assert chosen != "00", chosen
                assert int(await client.get("research:arm_count:00")) == base + 2
                await client.delete("research:arm_count:11")
                try:
                    await _pick_balanced_arm(client, "another-user", override_arm=None, source="consent_accept")
                    raise AssertionError("Incomplete arm counters were accepted")
                except Exception as exc:
                    assert getattr(exc, "status_code", None) == 503, exc
            finally:
                await client.aclose()

        asyncio.run(check_assignment_recovery())
        base = "/api/v1"
        request(api_port, base + "/auth/register", {"email": "research-smoke@example.test", "password": "Testing123!", "name": "Smoke"})
        login = request(api_port, base + "/auth/login", {"email": "research-smoke@example.test", "password": "Testing123!"})
        token = login["access_token"]
        result = request(api_port, base + "/research/events", {"events": [{"event": "feedback.view"}]}, token)
        assert result["accepted"] == 0 and result["outcomes"][0]["reason"] == "consent_required", result
        try:
            request(api_port, base + "/research/posttest/submit", {"answer": "不应被采集"}, token)
            raise AssertionError("Posttest accepted without consent")
        except HTTPError as exc:
            assert exc.code == 403, exc.code
        consent = request(api_port, base + "/research/consent", {"accepted": True}, token)
        day14_request = {"type": "interview", "metadata": {"source": "day14_voluntary"}}
        try:
            request(api_port, base + "/interview/sessions", day14_request, token)
            raise AssertionError("A day-fourteen follow-up was created before opening")
        except HTTPError as exc:
            assert exc.code == 409, exc.code
        posttest_survey = {"answers": [{"item_id": "J2", "value": 5, "skipped": False}]}
        try:
            request(api_port, base + "/research/survey/answer", posttest_survey, token)
            raise AssertionError("A day-seven survey answer was accepted before the posttest")
        except HTTPError as exc:
            assert exc.code == 409, exc.code
        consent_repeat = request(api_port, base + "/research/consent", {"accepted": True}, token)
        assert consent["accepted_at"] == consent_repeat["accepted_at"], (consent, consent_repeat)
        result = request(api_port, base + "/research/events", {"events": [
            {"event": "feedback.view", "ts": "2026-11-18T00:00:00Z", "props": {"session_id": "smoke"}},
            {"event": "not.allowed"},
            {"event": "x"},
            None,
        ]}, token)
        assert result["accepted"] == 1, result
        assert [item["status"] for item in result["outcomes"]] == ["accepted", "rejected", "rejected", "rejected"], result
        assert result["outcomes"][0]["event_id"] == result["event_ids"][0], result
        assert result["outcomes"][1]["reason"] == "event_not_allowed", result
        assert [item["reason"] for item in result["outcomes"][2:]] == ["invalid_event", "invalid_event"], result
        pending = request(api_port, base + "/research/survey/pending", token=token)
        assert [item["id"] for item in pending["items"]] == ["A1", "A2", "A3"], pending
        try:
            request(api_port, base + "/research/survey/answer", {"answers": [{"item_id": "A7a", "value": 9, "skipped": False}]}, token)
            raise AssertionError("Invalid survey answer was accepted")
        except HTTPError as exc:
            assert exc.code == 422, exc.code
        survey_submission = {
            "submission_id": "smoke-survey-response",
            "answer_context": pending["answer_context"],
            "offer_event_id": pending["offer_event_id"],
            "answers": [{"item_id": "A1", "value": "首次求职", "skipped": False}],
        }
        try:
            request(api_port, base + "/research/survey/answer", {
                **survey_submission, "answers": [{"item_id": "A7a", "value": 5}],
            }, token)
            raise AssertionError("An item outside the offered survey was accepted")
        except HTTPError as exc:
            assert exc.code == 422, exc.code
        result = request(api_port, base + "/research/survey/answer", survey_submission, token)
        assert result["saved"] == 1, result
        assert result["records"][0]["offer_event_id"] == pending["offer_event_id"]
        assert request(api_port, base + "/research/survey/answer", {
            **survey_submission, "submission_id": "changed-request-id",
        }, token) == result
        session = request(api_port, base + "/interview/sessions", {
            "position": "产品经理", "metadata": {"participation_mode": "active"},
        }, token)
        session_id = session["id"]
        assert session.get("rounds") and session["rounds"][0].get("questions"), session
        request(api_port, base + f"/interview/sessions/{session_id}/score-answer", {
            "round_index": 0, "question_index": 0,
            "answer_text": "短",
            "stt_failed": True,
        }, token)
        before_first_valid = datetime.now(timezone.utc)
        request(api_port, base + f"/interview/sessions/{session_id}/score-answer", {
            "round_index": 0, "question_index": 0,
            "answer_text": "在项目中我先分析用户问题，再组织团队制定方案，最终通过测试改进了流程。",
        }, token)
        after_first_valid = datetime.now(timezone.utc)
        request(api_port, base + f"/interview/sessions/{session_id}/score-answer", {
            "round_index": 0, "question_index": 0,
            "answer_text": "第二次作答用于验证不会替换第一次有效作答的服务器接收时间。",
        }, token)
        completed = request(api_port, base + f"/interview/sessions/{session_id}/complete", {"duration_minutes": 5}, token)
        assert completed["status"] == "completed" and completed["completed_at"], completed
        repeated_completion = request(api_port, base + f"/interview/sessions/{session_id}/complete", {"duration_minutes": 5}, token)
        assert repeated_completion["completed_at"] == completed["completed_at"]
        try:
            request(api_port, base + "/research/posttest/status?research_accelerate=true", token=token)
            raise AssertionError("Non-admin user could accelerate the posttest")
        except HTTPError as exc:
            assert exc.code == 403, exc.code

        async def set_test_due_date():
            client = from_url(f"redis://127.0.0.1:{redis_port}/0", decode_responses=True)
            try:
                key = f"user:{login['user']['id']}"
                record = json.loads(await client.get(key))
                record["posttest_due_at"] = consent["accepted_at"]
                await client.set(key, json.dumps(record, ensure_ascii=False), keepttl=True)
            finally:
                await client.aclose()

        asyncio.run(set_test_due_date())
        status = request(api_port, base + "/research/posttest/status", token=token)
        assert status["due"] is True, status
        posttest_payload = {"answer": "我会先完成影响最大的任务，再验证效果。"}
        posttest = request(api_port, base + "/research/posttest/submit", posttest_payload, token)
        assert posttest["status"] == "completed", posttest
        assert request(api_port, base + "/research/posttest/submit", posttest_payload, token) == posttest
        assert request(api_port, base + "/research/survey/answer", posttest_survey, token)["saved"] == 1
        admin = request(api_port, base + "/auth/login", {"email": "demo@edgewise.ai", "password": "Demo1234!"})
        admin_token = admin["access_token"]
        admin_id = admin["user"]["id"]
        request(api_port, base + "/research/consent", {"accepted": True}, admin_token)
        try:
            request(api_port, base + "/research/survey/answer", survey_submission, admin_token)
            raise AssertionError("An account submitted a different account's survey context")
        except HTTPError as exc:
            assert exc.code == 409, exc.code
        from app.research.admin_stats.privacy import user_hash
        hashed_user = user_hash(login["user"]["id"])
        timeline_path = base + f"/research/admin/users/{hashed_user}/timeline"
        duplicate_completion = request(api_port, base + "/research/events", {"events": [{
            "event": "interview.complete", "props": {"session_id": session_id},
        }]}, token)
        assert duplicate_completion["accepted"] == 1, duplicate_completion

        async def check_practice_count(expected_count, expected_returns):
            client = from_url(f"redis://127.0.0.1:{redis_port}/0", decode_responses=True)
            try:
                auto = await client.hgetall(f"research:auto:{login['user']['id']}")
                assert int(auto["completed_practice_count"]) == expected_count
                assert int(auto["return_sessions_7d"]) == expected_returns
            finally:
                await client.aclose()

        asyncio.run(check_practice_count(1, 0))
        before_second = request(api_port, timeline_path, token=admin_token)
        assert not any(
            event["name"] == "survey.enqueued" and event["props"].get("trigger") == "second_session_complete"
            for event in before_second["timeline"]
        ), before_second
        repeated = {"event": "report.view", "ts": "2026-11-18T00:00:00Z", "props": {"_client_event_id": "smoke-retry", "value": 1}}
        conflicting = {**repeated, "props": {"_client_event_id": "smoke-retry", "value": 2}}
        retry = request(api_port, base + "/research/events", {"events": [repeated, repeated, conflicting]}, token)
        assert [entry["status"] for entry in retry["outcomes"]] == ["accepted", "duplicate", "rejected"], retry
        assert retry["outcomes"][0]["event_id"] == retry["outcomes"][1]["event_id"], retry
        assert retry["outcomes"][2]["reason"] == "client_event_id_conflict", retry
        triage = request(api_port, base + "/copilot/triage", {
            "message": "项目经历里说不清自己做了什么，总说我们团队",
        }, token)
        spoof = request(api_port, base + "/research/events", {"events": [
            {"event": "copilot.triage", "props": {"triage_id": triage["triage_id"]}},
        ]}, token)
        assert spoof["outcomes"][0]["reason"] == "event_not_allowed", spoof
        click_id = str(uuid4())
        cycle = consent["accepted_at"]
        cta = request(api_port, base + "/research/events", {"events": [{
            "event": "task_page.cta_clicked", "ts": datetime.now(timezone.utc).isoformat(),
            "props": {"task_id": "ownership-contribution", "task_entry_click_id": click_id,
                      "_consent_accepted_at": cycle, "message": "synthetic-free-text-must-not-export"},
        }]}, token)
        assert cta["accepted"] == 1, cta
        for task_id, expect_link in (("another-task", False), ("ownership-contribution", True)):
            linked = request(api_port, base + "/interview/sessions", {
                "position": "产品经理", "metadata": {
                    "copilot_triage_id": triage["triage_id"], "task_id": task_id, "task_entry_click_id": click_id,
                    "participation_mode": "active",
                },
            }, token)
            attribution = linked["metadata"].get("copilot_attribution")
            assert bool(attribution) is expect_link, linked
            if expect_link:
                linked_id = linked["id"]
                request(api_port, base + f"/interview/sessions/{linked_id}/score-answer", {
                    "round_index": 0, "question_index": 0,
                    "answer_text": "我负责梳理用户反馈，提出改进方案并与团队通过测试验证结果。",
                }, token)
                request(api_port, base + "/research/events", {"events": [{
                    "event": "task.steps_to_start", "props": {
                        "task_id": task_id, "session_id": linked_id, "task_entry_click_id": click_id,
                        "_consent_accepted_at": cycle, "steps": 3, "elapsed_ms": 1500,
                    },
                }]}, token)
                evidence = request(api_port, base + "/research/events", {"events": [
                    {"event": "interview.answer.submit", "props": {
                        "session_id": linked_id, "text_length": 25, "voice_duration_sec": 15.25,
                    }},
                    {"event": "feedback.view", "props": {"session_id": linked_id, "assigned": False}},
                    {"event": "feedback.reject", "props": {
                        "session_id": linked_id, "reason": "synthetic-revision-reason-must-not-export",
                    }},
                ]}, token)
                assert evidence["accepted"] == 3, evidence
                finished = request(api_port, base + f"/interview/sessions/{linked_id}/complete", {
                    "duration_minutes": 1, "metadata": {"copilot_attribution": {"triage_id": "forged"}},
                }, token)
                assert finished["metadata"]["copilot_attribution"] == attribution, finished
        timeline = request(api_port, timeline_path, token=admin_token)
        asyncio.run(check_practice_count(2, 1))
        assert timeline["user_hash"] == hashed_user, timeline
        assert sum(
            event["name"] == "survey.enqueued" and event["props"].get("trigger") == "second_session_complete"
            for event in timeline["timeline"]
        ) == 1, timeline
        assert any(event["name"] == "feedback.view" for event in timeline["timeline"]), timeline
        triage_event = next(event["props"] for event in timeline["timeline"]
                            if event["name"] == "copilot.triage" and event["props"]["triage_id"] == triage["triage_id"])
        assert triage_event["provider"] == "rules" and triage_event["provider_elapsed_ms"] >= 0, triage_event
        assert timeline["event_quality"]["repeated_id_groups"] == 0, timeline["event_quality"]
        assert timeline["event_quality"]["conflicting_id_groups"] == 0, timeline["event_quality"]
        try:
            request(api_port, base + f"/research/admin/users/{hashed_user}/timeline", token=token)
            raise AssertionError("Non-admin accessed a research timeline")
        except HTTPError as exc:
            assert exc.code == 403, exc.code
        export_request = Request(f"http://127.0.0.1:{api_port}{base}/research/export?anonymize=false", headers={"Authorization": f"Bearer {admin_token}"})
        with urlopen(export_request, timeout=10) as response:
            assert response.headers["Cache-Control"] == "no-store"
            exported = [json.loads(line) for line in response.read().decode().splitlines() if line]
        pseudonymous_exports = {}
        for suffix in ("export", "export?format=csv", "export/panel", "export/panel?format=csv&anonymize=false"):
            download = Request(
                f"http://127.0.0.1:{api_port}{base}/research/{suffix}",
                headers={"Authorization": f"Bearer {admin_token}"},
            )
            with urlopen(download, timeout=10) as response:
                assert response.headers["Cache-Control"] == "no-store", suffix
                if "anonymize=false" not in suffix:
                    pseudonymous_exports[suffix] = response.read().decode()
        for suffix in ("export", "export/panel", "export/events"):
            try:
                request(api_port, f"{base}/research/{suffix}", token=token)
                raise AssertionError(f"Non-admin downloaded {suffix}")
            except HTTPError as exc:
                assert exc.code == 403, exc.code
        session_export = next(row for row in exported if (row.get("session") or {}).get("id") == session_id)
        linked_export = next(row for row in exported if row["session"].get("id") == linked_id)
        assert linked_export["research_export"]["copilot_attribution"]["triage_id"] == triage["triage_id"]
        task_entry = linked_export["research_export"]["task_entry"]
        assert task_entry["cta_event_id"] == cta["event_ids"][0], task_entry
        assert task_entry["steps_to_session_start"] == 3, task_entry
        linked_answer = linked_export["research_export"]["first_valid_answer"]
        assert (datetime.fromisoformat(task_entry["cta_client_timestamp"])
                <= datetime.fromisoformat(linked_answer["session_created_at"])
                <= datetime.fromisoformat(linked_answer["answer_received_at"])), linked_export
        first_valid = session_export["research_export"]["first_valid_answer"]
        assert first_valid["source"] == "score_answer_validity_check", first_valid
        assert before_first_valid <= datetime.fromisoformat(first_valid["answer_received_at"]) <= after_first_valid, first_valid
        posttest_export = next(row for row in exported if (row.get("session") or {}).get("id") == posttest["session_id"])
        assert posttest_export["research_export"]["posttest_blind_reviews"] == {"required_reviews": 2, "reviews": []}, posttest_export
        progress_path = base + "/research/admin/blind-review/progress"
        progress = request(api_port, progress_path, token=admin_token)
        assert progress["awaiting_first_review"] == 1 and progress["single_review"] == 0, progress
        pending_path = base + "/research/blind-review/pending"
        pending_reviews = request(api_port, pending_path, token=admin_token)
        review = next(row for row in pending_reviews if row["answer"] == "我会先完成影响最大的任务，再验证效果。")
        request(api_port, base + "/research/blind-review/score", {
            "review_token": review["review_token"],
            "scores": dict.fromkeys(("blind_score_material", "blind_score_structure",
                                     "blind_score_evidence", "blind_score_followup"), 4),
        }, admin_token)
        progress = request(api_port, progress_path, token=admin_token)
        assert progress["awaiting_first_review"] == 0 and progress["single_review"] == 1, progress
        assert all(row["review_token"] != review["review_token"]
                   for row in request(api_port, pending_path, token=admin_token))
        from app.research.admin_stats.optional_deps import admin_stats_deps_available
        stats_path = base + "/research/admin/overview"
        before = None
        if admin_stats_deps_available():
            aggregate_export = Request(
                f"http://127.0.0.1:{api_port}{base}/research/admin/export",
                data=json.dumps({"format": "wide_csv"}).encode(),
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {admin_token}"},
            )
            with urlopen(aggregate_export, timeout=10) as response:
                assert response.headers["Cache-Control"] == "no-store"
            first = request(api_port, stats_path, token=admin_token)
            before = request(api_port, stats_path, token=admin_token)
            assert before["cache_hit"] is True and first["filtered_n"] == before["filtered_n"], before
            activation = before["kpis"]["qualified_activation_itt"]
            assert activation["rate"] is None and activation["unconfirmed"] >= 1, activation
            experiment = request(api_port, base + "/research/admin/experiment?outcome=qualified_activation", token=admin_token)
            assert experiment["effects"] is None and experiment["bootstrap"] is None, experiment
            assert set(experiment["activation_counts"]) == {"00", "01", "10", "11"}, experiment
        try:
            download_event_rows(api_port, token)
            raise AssertionError("Non-admin downloaded research events")
        except HTTPError as exc:
            assert exc.code == 403, exc.code
        rows = download_event_rows(api_port, admin_token)

        async def check_export_audit():
            from app.research.admin_stats.audit import AUDIT_KEY

            client = from_url(f"redis://127.0.0.1:{redis_port}/0", decode_responses=True)
            try:
                audit = [json.loads(row) for row in await client.lrange(AUDIT_KEY, 0, -1)]
                expected = (
                    ("export_sessions", "jsonl", False), ("export_sessions", "csv", True),
                    ("export_panel", "jsonl", True), ("export_panel", "csv", False),
                    ("export_events", "jsonl", True),
                )
                for action, file_format, anonymize in expected:
                    assert any(
                        row["admin_id"] == admin_id and row["action"] == action
                        and row["params"] == {"format": file_format, "anonymize": anonymize}
                        for row in audit
                    ), action
            finally:
                await client.aclose()

        asyncio.run(check_export_audit())
        exported_cta = next(row for row in rows if row["event_id"] == cta["event_ids"][0])
        assert exported_cta["props"]["task_entry_click_id"] == click_id, exported_cta
        assert exported_cta["user_id"].startswith("anon_"), exported_cta
        pseudo = exported_cta["user_id"]
        safe_session = next(row for row in map(json.loads, pseudonymous_exports["export"].splitlines())
                            if row["session"]["id"] == linked_id)
        safe_csv_session = next(row for row in csv.DictReader(io.StringIO(pseudonymous_exports["export?format=csv"]))
                                if row["session_id"] == linked_id)
        safe_panel = next(row for row in map(json.loads, pseudonymous_exports["export/panel"].splitlines())
                          if row["user_id"] == pseudo)
        assert safe_session["session"]["user_id"] == safe_session["research_export"]["user_id"] == safe_csv_session["user_id"] == pseudo
        assert safe_panel["survey"]["A1"]["status"] == "answered", safe_panel
        assert "synthetic-free-text-must-not-export" not in json.dumps(rows), rows
        by_id = {row["event_id"]: row for row in rows}
        answer, feedback, revision = [by_id[event_id] for event_id in evidence["event_ids"]]
        assert [row["event"] for row in (answer, feedback, revision)] == [
            "interview.answer.submit", "feedback.view", "feedback.reject",
        ]
        assert all(row["props"]["session_id"] == linked_id for row in (answer, feedback, revision))
        assert answer["props"]["voice_duration_sec"] == 15.25
        assert revision["props"]["has_reason"] is True and "reason" not in revision["props"]
        request(api_port, base + "/research/consent", {"accepted": False}, token)
        try:
            request(api_port, timeline_path, token=admin_token)
            raise AssertionError("Withdrawn account remained available in the research timeline")
        except HTTPError as exc:
            assert exc.code == 404, exc.code
        progress = request(api_port, progress_path, token=admin_token)
        assert progress["single_review"] == 0 and progress["pending"] == 0, progress
        assert all(row["user_id"] != exported_cta["user_id"] for row in download_event_rows(api_port, admin_token))
        if before is not None:
            after = request(api_port, stats_path, token=admin_token)
            assert after["filtered_n"] == before["filtered_n"] - 1, (before, after)
        assert request(api_port, base + "/research/posttest/status", token=token)["due"] is False
        try:
            request(api_port, base + "/research/posttest/submit", {"answer": "撤回后不应被采集"}, token)
            raise AssertionError("Posttest accepted after withdrawal")
        except HTTPError as exc:
            assert exc.code == 403, exc.code
        new_consent = request(api_port, base + "/research/consent", {"accepted": True}, token)
        try:
            request(api_port, base + "/research/survey/answer", posttest_survey, token)
            raise AssertionError("A previous cycle's posttest unlocked the current survey")
        except HTTPError as exc:
            assert exc.code == 409, exc.code
        try:
            request(api_port, base + "/research/survey/answer", survey_submission, token)
            raise AssertionError("A survey from a previous consent cycle was accepted")
        except HTTPError as exc:
            assert exc.code == 409, exc.code
        cycle_check = request(api_port, base + "/research/events", {"events": [
            {"event": "report.view", "props": {"_consent_accepted_at": consent["accepted_at"]}},
            {"event": "report.view", "props": {"_consent_accepted_at": new_consent["accepted_at"]}},
        ]}, token)
        assert [entry["status"] for entry in cycle_check["outcomes"]] == ["rejected", "accepted"], cycle_check
        assert cycle_check["outcomes"][0]["reason"] == "consent_cycle_mismatch", cycle_check
        reconsented = request(api_port, timeline_path, token=admin_token)
        assert any(row["id"] == cycle_check["event_ids"][0] for row in reconsented["timeline"])
        assert not any(row["id"] == cta["event_ids"][0] or row["source"] == "survey" for row in reconsented["timeline"])
        if before is not None:
            assert before["kpis"]["posttest_7d_rate"]["numerator"] >= 1
            current = request(api_port, stats_path, token=admin_token)
            assert current["kpis"]["posttest_7d_rate"]["numerator"] == before["kpis"]["posttest_7d_rate"]["numerator"] - 1
        request(api_port, base + "/research/posttest/accelerate", {}, admin_token)
        request(api_port, base + "/research/posttest/submit", {"answer": "我会优先完成最重要的任务。"}, admin_token)
        followup = request(api_port, base + "/interview/sessions", day14_request, admin_token)
        followup_proof = followup["metadata"]["day14_followup"]
        followup_done = request(api_port, base + f"/interview/sessions/{followup['id']}/complete", {
            "duration_minutes": 1, "metadata": {"day14_followup": {"due_at": "forged"}},
        }, admin_token)
        assert followup_done["metadata"]["day14_followup"] == followup_proof
        panel_request = Request(
            f"http://127.0.0.1:{api_port}{base}/research/export/panel?anonymize=false",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        with urlopen(panel_request, timeout=10) as response:
            panel = [json.loads(line) for line in response.read().decode().splitlines() if line]
        followup_row = next(row for row in panel if row["user_id"] == admin_id)
        assert followup_row["auto"]["day14_followup_completed_at"] == followup_done["completed_at"]
        assert "voluntary_activation_14d" not in followup_row["auto"]

        async def check_posttest_event():
            client = from_url(f"redis://127.0.0.1:{redis_port}/0", decode_responses=True)
            try:
                stream = await client.xrange(f"research:event:{admin_id}")
                enqueued = [json.loads(fields["props"]) for _, fields in stream if fields["event"] == "survey.enqueued"]
                assert any(entry["trigger"] == "posttest_day7" for entry in enqueued), enqueued
            finally:
                await client.aclose()

        asyncio.run(check_posttest_event())
        request(api_port, base + "/auth/register", {"email": "browser-smoke@example.test", "password": "Testing123!", "name": "Browser"})
        browser_login = request(api_port, base + "/auth/login", {"email": "browser-smoke@example.test", "password": "Testing123!"})
        browser_token = browser_login["access_token"]
        browser_user = browser_login["user"]
        browser_consent = request(api_port, base + "/research/consent", {"accepted": True}, browser_token)
        browser_user = {**browser_user, "isAdmin": False, "researchConsent": {"accepted": True, "acceptedAt": browser_consent["accepted_at"]}}
        subprocess.run(
            [python, str(Path(__file__).with_name("browser_smoke.py"))],
            input=json.dumps({"api_port": api_port, "token": browser_token, "user": browser_user}, ensure_ascii=False),
            text=True, check=True,
        )

        async def check_browser_data():
            client = from_url(f"redis://127.0.0.1:{redis_port}/0", decode_responses=True)
            try:
                user_id = browser_user["id"]
                answer = json.loads(await client.hget(f"research:survey:{user_id}", "A1"))
                assert answer["status"] == "answered", answer
                events = await client.xrange(f"research:event:{user_id}")
                shown = [fields for _, fields in events if fields["event"] == "survey.shown"]
                assert shown and json.loads(shown[0]["props"]).get("_client_event_id"), shown
                assert json.loads(shown[0]["props"]).get("_consent_accepted_at") == browser_consent["accepted_at"], shown
                shown_props = json.loads(shown[0]["props"])
                assert answer["offer_event_id"] == shown_props["offer_event_id"]
                offered = next(fields for entry_id, fields in events if entry_id == shown_props["offer_event_id"])
                assert offered["event"] == "survey.offered"
                assert json.loads(offered["props"])["item_ids"] == shown_props["item_ids"]
                triage = next(json.loads(fields["props"]) for _, fields in events if fields["event"] == "copilot.triage")
                timing = next(json.loads(fields["props"]) for _, fields in events if fields["event"] == "copilot.triage_response")
                assert timing["triage_id"] == triage["triage_id"], (triage, timing)
                assert timing["request_elapsed_ms"] >= 0 and timing["outcome"] == "recommendation", timing
                exposures = [json.loads(fields["props"]) for _, fields in events if fields["event"] == "series.episode_viewed"]
                assert exposures, events
                exposure = exposures[0]
                served = request(api_port, base + f"/series/{exposure['series_id']}", token=browser_token)
                assert exposure["content_version"] == served["content_version"], exposure
                assert exposure["variant"] == served["variant"], exposure
                assert exposure["exposure_basis"] == "viewport_half_visible" and exposure["planned_variant"], exposure
                exported_events = download_event_rows(api_port, admin_token)
                click = next(row for row in exported_events if row["event"] == "series.task_started")
                cta = next(row for row in exported_events if row["event"] == "task_page.cta_clicked"
                           and row["props"].get("series_task_click_id") == click["props"]["series_task_click_id"])
                viewed = next(row for row in exported_events if row["event"] == "series.episode_viewed"
                              and row["props"]["series_page_view_id"] == click["props"]["series_page_view_id"]
                              and row["props"]["episode_id"] == click["props"]["episode_id"])
                assert viewed["props"]["content_version"] == click["props"]["content_version"]
                assert viewed["user_id"] == click["user_id"] == cta["user_id"]
                assert click["props"]["task_slug"] == cta["props"]["task_id"] and cta["props"]["task_entry_click_id"]
            finally:
                await client.aclose()

        asyncio.run(check_browser_data())
        print("PASS: browser display event and survey answer reached the isolated backend")
        if mongo_uri:
            request(api_port, base + "/research/events", {"events": [{
                "event": "task.steps_to_start", "props": {
                    "steps": 3, "_consent_accepted_at": browser_consent["accepted_at"],
                },
            }]}, browser_token)
            check_snapshot_restore(root, env, api_port, admin_token, admin_id, browser_user["id"])
            print("PASS: Redis RDB and MongoDB BSON restore preserved research events, metric provenance and survey answers")
            from app.core.redis_client import set_json
            from app.research.derive import get_auto_fields, get_auto_metadata, set_auto_field
            from app.research.events import append_research_event, ingest_client_events, read_event_stream
            from app.research.keys import auto_hash_key, auto_meta_key, event_stream_key, survey_hash_key
            from app.research.survey_engine import enqueue_trigger, get_pending_survey_items, get_survey_answers, record_survey_response
            from app.core.migration import migrate_redis_to_mongo
            from app.core.index_store import get_all_user_ids, index_user_registration
            from app.research.blind_review import BLIND_RUBRIC, enqueue_posttest_for_blind_review, get_posttest_review_export, list_blind_review_batch, submit_blind_scores
            from app.services.research_survey_service import export_research_panel, submit_survey_answers

            async def check_real_mongodb():
                client = from_url(f"redis://127.0.0.1:{redis_port}/1", decode_responses=True)
                await mongo_store.init_connection()
                assert mongo_store.mode == "mongodb_motor_live"
                try:
                    uid = "recovery-user"
                    await set_json(client, f"user:{uid}", {"id": uid, "research_consent": {"accepted": True}})
                    quota_user = "quota-smoke"
                    await set_json(client, f"user:{quota_user}", {"id": quota_user, "research_consent": {"accepted": True}})
                    await enqueue_trigger(client, quota_user, "consent_granted")
                    offers = await asyncio.gather(*[get_pending_survey_items(client, quota_user) for _ in range(6)])
                    assert sum(bool(offer.get("offer_event_id")) for offer in offers) == 2, offers
                    assert sum(offer["blocked_reason"] == "rate_limit" for offer in offers) == 4, offers
                    queue_user = "queue-smoke"
                    await set_json(client, f"user:{queue_user}", {"id": queue_user, "research_consent": {"accepted": True}})
                    queue_key = f"survey:queue:{queue_user}"
                    await mongo_store.upsert_by_cache_key(queue_key, {"items": {}})
                    queue_collection = mongo_store.collection("surveys")
                    queue_update = queue_collection.update_one
                    both_queued = asyncio.Event()
                    claims = 0

                    async def overlap_queue_writes(query, update, **kwargs):
                        nonlocal claims
                        if query.get("_id") == queue_key and "queue_version" in query and claims < 2:
                            claims += 1
                            if claims == 2:
                                both_queued.set()
                            await both_queued.wait()
                        return await queue_update(query, update, **kwargs)

                    with patch.object(queue_collection, "update_one", side_effect=overlap_queue_writes):
                        await asyncio.wait_for(asyncio.gather(
                            enqueue_trigger(client, queue_user, "feedback_view_first"),
                            enqueue_trigger(client, queue_user, "report_view_first"),
                        ), timeout=5)
                    await index_user_registration(client, user_id=uid, email="recovery@example.test")
                    await set_auto_field(client, uid, "test_metric", 7, source_event_id="123-1")
                    await client.hset(auto_hash_key(uid), "test_metric", "99")
                    await client.hset(auto_meta_key(uid), "test_metric", '{"source_event_id":"stale"}')
                    await migrate_redis_to_mongo(client, mongo_store)
                    event_id = await append_research_event(client, uid, "report.view", props={"session_id": "s1"})
                    item = {"event": "nav.change", "props": {"reselect": True, "_client_event_id": "before-checkpoint"}}
                    receipts = mongo_store.collection("system_indexes")
                    update_receipt = receipts.update_one

                    async def interrupt_stream_checkpoint(query, update, **kwargs):
                        if (update.get("$set") or {}).get("phase") == "stream_appended":
                            raise OSError("injected interruption before Mongo checkpoint")
                        return await update_receipt(query, update, **kwargs)

                    outcomes = []
                    with patch.object(receipts, "update_one", side_effect=interrupt_stream_checkpoint):
                        await ingest_client_events(client, uid, [item], outcomes=outcomes)
                    assert outcomes[0]["status"] == "retry", outcomes
                    original = (await client.xrevrange(event_stream_key(uid), count=1))[0]
                    retry_ids = await asyncio.gather(*[ingest_client_events(client, uid, [item]) for _ in range(2)])
                    assert any(ids == [original[0]] for ids in retry_ids), retry_ids
                    matching = [entry for entry in await client.xrange(event_stream_key(uid)) if entry[1]["event"] == "nav.change"]
                    assert matching == [original], matching
                    durable = await mongo_store.collection("research_events").find_one({"_id": f"{uid}:{original[0]}"})
                    assert durable["ts"] == original[1]["ts"]
                    auto_collection = mongo_store.collection("surveys")
                    auto_update = auto_collection.update_one
                    both_counted = asyncio.Event()
                    counter_claims = 0

                    async def overlap_counter_writes(query, update, **kwargs):
                        nonlocal counter_claims
                        if "fields.entry_reselect_count" in query and counter_claims < 2:
                            counter_claims += 1
                            if counter_claims == 2:
                                both_counted.set()
                            await both_counted.wait()
                        return await auto_update(query, update, **kwargs)

                    with patch.object(auto_collection, "update_one", side_effect=overlap_counter_writes):
                        concurrent_ids = await asyncio.wait_for(asyncio.gather(*[
                            ingest_client_events(client, uid, [{
                                "event": "nav.change",
                                "props": {"reselect": True, "_client_event_id": f"concurrent-counter-{index}"},
                            }])
                            for index in range(2)
                        ]), timeout=5)
                    counters = await get_auto_fields(client, uid)
                    sources = await get_auto_metadata(client, uid)
                    assert counters["entry_reselect_count"] == counters["C3-auto"] == 3
                    assert sources["entry_reselect_count"] == sources["C3-auto"]
                    assert sources["entry_reselect_count"]["source_event_id"] in [ids[0] for ids in concurrent_ids]
                    after_counter = {
                        "event": "nav.change", "props": {"reselect": True, "_client_event_id": "counter-checkpoint"},
                    }

                    async def interrupt_counter_checkpoint(query, update, **kwargs):
                        if query.get("phase") == "dispatching" and update["$set"].get("phase") == "derived":
                            raise OSError("injected interruption after saving the counter")
                        return await update_receipt(query, update, **kwargs)

                    outcomes = []
                    with patch.object(receipts, "update_one", side_effect=interrupt_counter_checkpoint):
                        await ingest_client_events(client, uid, [after_counter], outcomes=outcomes)
                    assert outcomes[0]["status"] == "retry", outcomes
                    counter_event = (await client.xrevrange(event_stream_key(uid), count=1))[0][0]
                    later = await ingest_client_events(client, uid, [{
                        **after_counter, "props": {**after_counter["props"], "_client_event_id": "later-counter"},
                    }])
                    assert len(later) == 1
                    assert (await get_auto_metadata(client, uid))["entry_reselect_count"]["source_event_id"] == later[0]
                    assert await ingest_client_events(client, uid, [after_counter]) == [counter_event]
                    assert (await get_auto_fields(client, uid))["entry_reselect_count"] == 5
                    assert (await get_auto_metadata(client, uid))["entry_reselect_count"]["source_event_id"] == later[0]
                    await record_survey_response(client, uid, "A1", value="首次求职")
                    await client.delete(survey_hash_key(uid))
                    await client.hset(survey_hash_key(uid), "A1", json.dumps({"status": "answered", "value": "旧缓存"}))
                    survey_receipts = mongo_store.collection("surveys")
                    update_survey = survey_receipts.update_one

                    async def interrupt_survey_confirmation(query, update, **kwargs):
                        if query.get("responses.A7a") == "processing":
                            raise OSError("injected interruption before survey confirmation")
                        return await update_survey(query, update, **kwargs)

                    skip = [{"item_id": "A7a", "skipped": True}]
                    user = SimpleNamespace(id=uid)
                    with patch.object(survey_receipts, "update_one", side_effect=interrupt_survey_confirmation):
                        try:
                            await submit_survey_answers(client, user, skip, submission_id="confirmation-failure")
                        except OSError:
                            pass
                        else:
                            raise AssertionError("Expected survey confirmation failure")
                    retried = await submit_survey_answers(client, user, skip, submission_id="confirmation-failure")
                    assert retried[0]["status"] == "no_response", retried
                    answers = await get_survey_answers(client, uid)
                    assert answers["A1"]["value"] == "首次求职" and answers["A7a"]["status"] == "no_response"
                    stream = await client.xrange(event_stream_key(uid))
                    assert sum(fields["event"] == "survey.skip" for _, fields in stream) == 1
                    await enqueue_posttest_for_blind_review(client, uid, "验证后测回答")
                    await client.flushdb()
                    assert (await get_pending_survey_items(client, quota_user))["blocked_reason"] == "rate_limit"
                    queue = await mongo_store.find_by_cache_key(queue_key)
                    assert set(queue["items"]) == {"F2b", "F3a", "C1", "C4", "F1"}, queue
                    assert (await get_pending_survey_items(client, queue_user))["items"]
                    assert (await get_auto_fields(client, uid))["test_metric"] == 7
                    assert (await get_auto_metadata(client, uid))["test_metric"]["source_event_id"] == "123-1"
                    assert event_id in [event["id"] for event in await read_event_stream(client, uid)]
                    assert (await get_survey_answers(client, uid))["A1"]["value"] == "首次求职"
                    assert uid in await get_all_user_ids(client)
                    panel = [json.loads(line) for line in (await export_research_panel(client, anonymize=False)).splitlines()]
                    row = next(entry for entry in panel if entry["user_id"] == uid)
                    assert row["auto_meta"]["test_metric"]["source_event_id"] == "123-1"
                    assert row["survey"]["A1"]["value"] == "首次求职"
                    for sequence in range(1, 13):
                        await mongo_store.insert_document("research_events", {
                            "_id": f"ordering:1000-{sequence}", "user_id": "ordering",
                            "stream_entry_id": f"1000-{sequence}", "event": "report.view", "props": {},
                        })
                    ordered = await read_event_stream(client, "ordering", count=3)
                    assert [entry["id"] for entry in ordered] == ["1000-10", "1000-11", "1000-12"]
                    pending = await list_blind_review_batch(client)
                    token = next(item["review_token"] for item in pending if item["answer"] == "验证后测回答")
                    collection = mongo_store.collection("surveys")
                    original_update = collection.update_one
                    gate, arrived = asyncio.Event(), [0]
                    async def simultaneous_claim(query, update, **kwargs):
                        if query.get("status") == "pending":
                            arrived[0] += 1
                            if arrived[0] == 2:
                                gate.set()
                            await asyncio.wait_for(gate.wait(), 5)
                        return await original_update(query, update, **kwargs)
                    with patch.object(collection, "update_one", side_effect=simultaneous_claim):
                        results = await asyncio.gather(
                            submit_blind_scores(client, token, {"blind_score_material": 4}, reviewer_id="reviewer-1"),
                            submit_blind_scores(client, token, {"blind_score_material": 5}, reviewer_id="reviewer-2"),
                            return_exceptions=True,
                        )
                    assert sum(result is None for result in results) == 1, results
                    assert sum(isinstance(result, ValueError) for result in results) == 1, results
                    await client.flushdb()
                    assert all(item["answer"] != "验证后测回答" for item in await list_blind_review_batch(client))
                    await enqueue_posttest_for_blind_review(client, uid, "独立双评", posttest_session_id="dual-smoke")
                    item = next(row for row in await list_blind_review_batch(client, reviewer_id="reviewer-a")
                                if row["answer"] == "独立双评")
                    gate.clear()
                    arrived[0] = 0
                    with patch.object(collection, "update_one", side_effect=simultaneous_claim):
                        await asyncio.gather(
                            submit_blind_scores(client, item["review_token"], dict.fromkeys(BLIND_RUBRIC, 3), reviewer_id="reviewer-a"),
                            submit_blind_scores(client, item["review_token"], dict.fromkeys(BLIND_RUBRIC, 4), reviewer_id="reviewer-b"),
                        )
                    dual = await get_posttest_review_export("dual-smoke")
                    assert sorted(entry["scores"][BLIND_RUBRIC[0]] for entry in dual["reviews"]) == [3, 4], dual
                    assert all("reviewer_id" not in entry for entry in dual["reviews"]), dual
                    arm_counts = [await mongo_store.collection("users").count_documents({"experiment_assignment.arm": arm}) for arm in ("00", "01", "10", "11")]
                    await _pick_balanced_arm(client, "cold-new-user", override_arm=None, source="consent_accept")
                    recovered_counts = [int(await client.get(f"research:arm_count:{arm}")) for arm in ("00", "01", "10", "11")]
                    assert sum(recovered_counts) == sum(arm_counts) + 1, (arm_counts, recovered_counts)
                    pipe = client.pipeline(transaction=False)
                    for index in range(1005):
                        pipe.xadd("research:event:legacy-user", {"event": "report.view", "ts": "2026-01-01", "props": "{}"})
                    await pipe.execute()
                    result = await migrate_redis_to_mongo(client, mongo_store)
                    assert result["errors"] == 0, result
                    assert result["migrated_events"] == 1005, result
                    with tempfile.TemporaryDirectory() as fallback:
                        target = mongo_store.collection("users")
                        await target.insert_one({"_id": "user:conflict", "name": "live"})
                        file = Path(fallback) / "users.json"
                        file.write_text(json.dumps({"user:conflict": {"_id": "user:conflict", "name": "offline"}, "user:new": {"_id": "user:new", "name": "new"}}))
                        with patch("app.core.mongo_client.FALLBACK_DIR", Path(fallback)):
                            assert await mongo_store.reconcile_fallback_to_live() == 1
                            assert "user:conflict" in json.loads(file.read_text())
                        assert (await target.find_one({"_id": "user:conflict"}))["name"] == "live"
                        assert (await target.find_one({"_id": "user:new"}))["name"] == "new"
                finally:
                    await client.aclose()
                    await mongo_store._motor_client.drop_database(mongo_db_name)
                    await mongo_store.close()

            asyncio.run(check_real_mongodb())
            print("PASS: real MongoDB event and metric recovery, missing-document import and conflict preservation")
        print("PASS: concurrent balanced assignment and isolated HTTP consent, events, survey validation and seven-day posttest trigger")
    finally:
        api.terminate()
        redis.terminate()
        api.wait(timeout=5)
        redis.wait(timeout=5)
        if mongo_uri:
            # Also clean up if HTTP or browser checks fail before check_real_mongodb.
            from pymongo import MongoClient
            client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
            try:
                client.drop_database(mongo_db_name)
            finally:
                client.close()
