import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STATE_PATH = ROOT / "data" / "state.json"


def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def request_json(port, method, path, payload=None, timeout=8):
    url = f"http://127.0.0.1:{port}{path}"
    data = None
    if method != "GET":
        data = json.dumps(payload or {}).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def request_bytes(port, path, timeout=8):
    url = f"http://127.0.0.1:{port}{path}"
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return response.read(), dict(response.headers)


def wait_for_health(port, deadline_seconds=15):
    deadline = time.time() + deadline_seconds
    last_error = None
    while time.time() < deadline:
        try:
            return request_json(port, "GET", "/api/health", timeout=2)
        except (OSError, urllib.error.URLError, json.JSONDecodeError) as error:
            last_error = error
            time.sleep(0.4)
    raise RuntimeError(f"console did not become healthy: {last_error}")


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def runtime_flags():
    if os.name == "nt":
        return getattr(subprocess, "CREATE_NO_WINDOW", 0)
    return 0


def prepare_runtime_state(tmp_state):
    state = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    settings = state.setdefault("settings", {})
    settings["formalSignalRecording"] = True
    state["financialEvents"] = [
        {
            "id": "runtime-financial-event",
            "date": "2026-08-10",
            "title": "Runtime financial filing fixture",
            "sourceGrade": "A",
            "matchedCodes": ["510300"],
            "url": "https://data.sec.gov/",
        }
    ]
    state["financialEventSync"] = {
        "time": "2026-08-10T00:00:00",
        "count": 1,
        "source": "runtime fixture",
        "sourceGrade": "A",
        "errors": [],
    }
    for item in state.setdefault("watchlist", []):
        if item.get("code"):
            item["lastMarketDate"] = "2026-08-10"

    signals = state.setdefault("signalHistory", [])
    if not signals:
        signals.append(
            {
                "id": "runtime-execution-check",
                "date": "2026-08-07",
                "status": "观察",
                "recommendation": "运行态验收信号。",
                "execution": {},
            }
        )

    for index, signal in enumerate(signals):
        execution = signal.setdefault("execution", {})
        execution["status"] = "已执行"
        execution["action"] = execution.get("action") or "观察"
        execution["notes"] = execution.get("notes") or "运行态验收准备记录。"
        execution["savedAt"] = execution.get("savedAt") or "2026-08-10T00:00:00"
        if not signal.get("id"):
            signal["id"] = f"runtime-signal-{index + 1}"
        if not signal.get("date"):
            signal["date"] = "2026-08-07"

    test_signal = signals[0]
    test_signal["execution"] = {
        "status": "未记录",
        "action": "观察",
        "notes": "",
    }
    tmp_state.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    return test_signal["id"]


def main():
    node = shutil.which("node") or shutil.which("node.exe")
    require(node, "node executable was not found")
    require(STATE_PATH.exists(), f"state file not found: {STATE_PATH}")

    with tempfile.TemporaryDirectory(prefix="investment-console-runtime-") as tmp_dir:
        tmp_path = Path(tmp_dir)
        tmp_state = tmp_path / "state.json"
        test_signal_id = prepare_runtime_state(tmp_state)

        port = find_free_port()
        env = os.environ.copy()
        env["PORT"] = str(port)
        env["STATE_PATH_OVERRIDE"] = str(tmp_state)
        env["PYTHONIOENCODING"] = "utf-8"

        process = subprocess.Popen(
            [node, "server.js"],
            cwd=ROOT,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            creationflags=runtime_flags(),
        )

        try:
            health = wait_for_health(port)
            capabilities = health.get("capabilities") or {}
            require(health.get("ok") is True, "health ok was not true")
            require(health.get("service") == "investment-console", "wrong service name")
            for key in ("signalExecution", "stepTracker", "nextActionReport", "maturitySchedule", "reviewTodo", "signalHistoryExport", "signalIntegrityAudit", "stateBackup", "credibilityReport", "credibilityGate"):
                require(capabilities.get(key) is True, f"missing capability: {key}")
            require(health.get("executionPendingSignals") == 1, "health should expose one pending execution in fixture")

            next_action = request_json(port, "POST", "/api/build-next-action-report")
            require(next_action.get("ok") is True, "next action endpoint failed")
            require(next_action.get("primaryAction"), "next action endpoint did not return a primary action")
            require("executionPending" in next_action, "next action response missing executionPending")
            milestones = next_action.get("milestones") or {}
            require(milestones.get("earliestCredibleEvaluationDate"), "next action response missing earliest credibility date")
            require(next_action.get("executionPending") == 1, "runtime fixture should start with one pending execution")
            require(next_action.get("primaryAction") == "先补执行记录", "pending execution should be the primary action")
            if next_action.get("canClaimCredible") is False:
                require(next_action.get("blockerCount", 0) > 0, "uncredible state should list blockers")

            blocked_record = request_json(
                port,
                "POST",
                "/api/record-signal",
                payload={
                    "reason": "runtime-pending-execution-lock",
                    "dryRun": False,
                    "allowStale": True,
                },
            )
            require(blocked_record.get("ok") is True, "pending execution lock record call failed")
            require(blocked_record.get("status") == "execution_pending_blocked", "pending execution should block new formal signals")
            require(blocked_record.get("reason") == "pending_execution_records", "pending execution block reason mismatch")
            require(blocked_record.get("executionPending") == 1, "pending execution block should report pending count")

            schedule = request_json(port, "POST", "/api/build-maturity-schedule")
            require(schedule.get("ok") is True, "maturity schedule endpoint failed")
            require(schedule.get("signalCount", 0) >= 1, "maturity schedule should include the fixture signal")
            require(schedule.get("rowCount", 0) >= 3, "maturity schedule should include 5/20/60 rows")
            require("dueCount" in schedule, "maturity schedule response missing dueCount")

            review_todo = request_json(port, "POST", "/api/build-review-todo")
            require(review_todo.get("ok") is True, "review todo endpoint failed")
            require(review_todo.get("rowCount", 0) >= 3, "review todo should include 5/20/60 rows")
            require("dueCount" in review_todo, "review todo response missing dueCount")
            require(review_todo.get("primaryAction"), "review todo should return a primary action")

            credibility = request_json(port, "POST", "/api/build-credibility-report")
            require(credibility.get("ok") is True, "credibility report endpoint failed")
            require(credibility.get("verdict") == "不可评估", "runtime fixture should not be credible yet")
            require(credibility.get("canClaimCredible") is False, "runtime fixture should not pass credibility gate")
            require(credibility.get("blockerCount", 0) > 0, "credibility report should list blockers")

            email = request_json(port, "POST", "/api/build-email-reminder")
            require(email.get("ok") is True, "email reminder endpoint failed")
            require("## 可信度判定" in (email.get("body") or ""), "email reminder missing credibility section")
            email_answers = email.get("fiveAnswers") or []
            require(len(email_answers) >= 5, "email reminder missing five answers")
            require(email_answers[4].get("status") == "不可评估", "email fifth answer should use credibility verdict")
            email_checklist = (email.get("manualOrderChecklist") or {}).get("items") or []
            email_new_order = next((item for item in email_checklist if item.get("title") == "新开仓清单"), {})
            require(email_new_order.get("status") == "暂停", "email should pause new orders while execution is pending")
            require(email_new_order.get("action") == "先补执行记录", "email should prioritize execution recording")
            require((email.get("operationPlan") or {}).get("executionLocked") is True, "operation plan should expose execution lock")
            email_todo_text = json.dumps(email.get("executionTodo") or [], ensure_ascii=False)
            require("先补执行记录" in email_todo_text, "email execution todo should prompt record completion")
            require("可手动买入" not in email_todo_text, "email execution todo should not repeat stale buy prompts")

            export = request_json(port, "POST", "/api/export-signal-history")
            require(export.get("ok") is True, "signal history export endpoint failed")
            require(export.get("exportedRowCount", 0) >= 1, "signal history export should include the fixture signal")
            require(export.get("executionPending") == 1, "signal history export should preserve pending execution")
            csv_body, csv_headers = request_bytes(port, "/api/download-signal-history?format=csv")
            require(b"signalId" in csv_body and b"day5Status" in csv_body, "downloaded CSV missing required columns")
            require("text/csv" in (csv_headers.get("Content-Type") or ""), "CSV download returned wrong content type")

            integrity = request_json(port, "POST", "/api/audit-signal-integrity")
            require(integrity.get("ok") is True, "signal integrity audit endpoint failed")
            require(integrity.get("signalCount", 0) >= 1, "signal integrity audit should include the fixture signal")
            require(integrity.get("knownSignalCount", 0) >= 1, "signal integrity audit should seed known signals")
            require(integrity.get("dangerCount") == 0, "runtime fixture should not have dangerous integrity issues")
            require("duplicateTradingDayCount" in integrity, "signal integrity audit should expose duplicate trading day count")

            backup = request_json(port, "POST", "/api/backup-state")
            require(backup.get("ok") is True, "state backup endpoint failed")
            require(backup.get("signalCount", 0) >= 1, "state backup should include the fixture signal")
            require(backup.get("backupCount", 0) >= 1, "state backup manifest should include at least one backup")
            require(str(backup.get("fileName") or "").endswith(".json"), "state backup should return a json backup file")
            require(len(str(backup.get("sha256") or "")) == 64, "state backup should return a sha256 digest")

            execution_save = request_json(
                port,
                "POST",
                "/api/signal-execution",
                payload={
                    "signalId": test_signal_id,
                    "execution": {
                        "status": "已执行",
                        "action": "观察",
                        "date": "2026-08-10",
                        "notes": "运行态验收：模拟用户把观察信号标记为已观察。",
                    },
                },
            )
            require(execution_save.get("ok") is True, "signal execution endpoint failed")
            saved_execution = execution_save.get("execution") or {}
            require(saved_execution.get("status") == "已执行", "execution status was not saved")
            require(saved_execution.get("action") == "观察", "execution action was not saved")

            after_execution = request_json(port, "POST", "/api/build-next-action-report")
            require(after_execution.get("ok") is True, "next action endpoint failed after execution save")
            require(after_execution.get("executionPending") == 0, "execution save did not clear pending count")
            require(after_execution.get("primaryAction") != "先补执行记录", "primary action did not move past execution recording")

            tracker = request_json(port, "POST", "/api/build-step9-10-tracker")
            require(tracker.get("ok") is True, "step tracker endpoint failed")
            require("executionPending" in tracker, "tracker response missing executionPending")
            require(tracker.get("executionPending") == 0, "tracker did not observe cleared execution pending count")

            refreshed = request_json(port, "GET", "/api/health")
            require(refreshed.get("executionPendingSignals") == 0, "health should expose cleared pending execution count")
            latest = refreshed.get("latestNextActionReport") or {}
            require(latest.get("primaryAction"), "health did not expose latest next action")
            latest_schedule = refreshed.get("signalMaturitySchedule") or {}
            require(latest_schedule.get("rowCount", 0) >= 3, "health did not expose maturity schedule")
            latest_review_todo = refreshed.get("reviewTodoReport") or {}
            require("dueCount" in latest_review_todo, "health did not expose review todo")
            latest_credibility = refreshed.get("credibilityReport") or {}
            require(latest_credibility.get("verdict"), "health did not expose credibility report")
            latest_export = refreshed.get("signalHistoryExport") or {}
            require((latest_export.get("summary") or {}).get("exportedRowCount", 0) >= 1, "health did not expose signal history export")
            latest_integrity = refreshed.get("signalIntegrityAudit") or {}
            require(latest_integrity.get("knownSignalCount", 0) >= 1, "health did not expose signal integrity audit")
            latest_backup = refreshed.get("stateBackup") or {}
            require(latest_backup.get("signalCount", 0) >= 1, "health did not expose state backup")

            print(
                json.dumps(
                    {
                        "ok": True,
                        "port": port,
                        "capabilities": capabilities,
                        "signalCount": refreshed.get("signalCount"),
                        "executionRecordedSignals": refreshed.get("executionRecordedSignals"),
                        "executionPendingSignals": refreshed.get("executionPendingSignals"),
                        "initialNextAction": next_action.get("primaryAction"),
                        "blockedRecordStatus": blocked_record.get("status"),
                        "earliestCredibleEvaluationDate": milestones.get("earliestCredibleEvaluationDate"),
                        "maturityScheduleRows": schedule.get("rowCount"),
                        "maturityDueCount": schedule.get("dueCount"),
                        "reviewTodoDueCount": review_todo.get("dueCount"),
                        "reviewTodoPrimaryAction": review_todo.get("primaryAction"),
                        "credibilityVerdict": credibility.get("verdict"),
                        "credibilityCanClaim": credibility.get("canClaimCredible"),
                        "emailCredibilityStatus": email_answers[4].get("status"),
                        "emailNewOrderAction": email_new_order.get("action"),
                        "signalHistoryExportRows": export.get("exportedRowCount"),
                        "signalIntegrityKnownCount": integrity.get("knownSignalCount"),
                        "signalIntegrityDangerCount": integrity.get("dangerCount"),
                        "signalIntegrityDuplicateTradingDayCount": integrity.get("duplicateTradingDayCount"),
                        "stateBackupCount": backup.get("backupCount"),
                        "stateBackupFileName": backup.get("fileName"),
                        "afterExecutionNextAction": after_execution.get("primaryAction"),
                        "canClaimCredible": after_execution.get("canClaimCredible"),
                        "executionSaveOk": execution_save.get("ok"),
                        "afterExecutionPending": after_execution.get("executionPending"),
                        "trackerExecutionPending": tracker.get("executionPending"),
                        "usedTemporaryState": str(tmp_state),
                    },
                    ensure_ascii=False,
                    indent=2,
                )
            )
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False, indent=2))
        sys.exit(1)
