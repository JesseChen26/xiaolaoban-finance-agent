import json
import sys
from copy import deepcopy
from datetime import date, timedelta
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
ROOT = SCRIPT_DIR.parent

from audit_experiment_goal import build_audit  # noqa: E402
from build_next_action_report import build_report as build_next_action_report  # noqa: E402
from build_maturity_schedule import build_report as build_maturity_schedule  # noqa: E402
from build_review_todo import build_report as build_review_todo  # noqa: E402
from build_credibility_report import build_report as build_credibility_report  # noqa: E402
from export_signal_history import build_report as export_signal_history_report  # noqa: E402
from audit_signal_integrity import build_audit as build_signal_integrity_audit  # noqa: E402
from build_email_reminder import build_five_answers, build_reminder  # noqa: E402
from build_performance_report import benchmark_summary  # noqa: E402
from build_weekly_review import classify_review  # noqa: E402
from execution_status import signal_execution_recorded  # noqa: E402
from record_signal import action_from_plan_item, build_operation_plan, record_signal  # noqa: E402


def make_signals(recorded=True):
    start = date(2026, 1, 5)
    signals = []
    for index in range(30):
        signal_date = start + timedelta(days=index * 2)
        status = "已执行" if recorded or index else "未记录"
        signals.append(
            {
                "id": f"signal-{index + 1:02d}",
                "date": signal_date.isoformat(),
                "status": "观察",
                "recommendation": "继续观察。",
                "execution": {
                    "status": status,
                    "action": "观察",
                    "notes": "验收样例",
                },
            }
        )
    return signals


def make_validation(day5=30, day20=30, day60=30):
    done = {"day5": day5, "day20": day20, "day60": day60}
    return {
        "doneCheckpoints": sum(done.values()),
        "pendingCheckpoints": 0,
        "avgExcessPct": 1.2,
        "worstMaxDrawdownPct": -3.4,
        "byWindow": {
            key: {
                "done": value,
                "total": 30,
                "winRatePct": 56.0,
                "avgExcessPct": 1.2,
                "worstMaxDrawdownPct": -3.4,
            }
            for key, value in done.items()
        },
    }


def base_state():
    return {
        "settings": {
            "formalSignalRecording": True,
            "email": "demo@example.com",
            "totalCapital": 1000,
            "trialCapital": 200,
        },
        "portfolio": [],
        "watchlist": [],
        "signalHistory": make_signals(recorded=True),
        "signalValidation": make_validation(),
        "trades": [],
        "executionLog": [],
    }


def weekly_payload(state):
    signals = state["signalHistory"]
    recorded = sum(1 for item in signals if signal_execution_recorded(item))
    pending = max(0, len(signals) - recorded)
    validation = state["signalValidation"]
    return {
        "signals": {"total": len(signals), "weekly": 0},
        "execution": {"recorded": recorded, "pending": pending},
        "validation": {
            "doneCheckpoints": validation.get("doneCheckpoints", 0),
            "avgExcessPct": validation.get("avgExcessPct"),
            "byWindow": validation.get("byWindow") or {},
        },
    }


def email_can_evaluate(state):
    summary = {
        "marketValue": 0,
        "pnl": 0,
        "status": "空仓",
        "recommendation": "保持观察。",
    }
    answers = build_five_answers(state, summary)
    accuracy = next(item for item in answers if item["title"] == "过去这些建议准不准，是否赚钱？")
    return accuracy["status"] == "可评估"


def assert_case(name, state, expected_can_claim, expected_weekly):
    audit = build_audit(deepcopy(state))
    benchmark = benchmark_summary(deepcopy(state))
    weekly = classify_review(weekly_payload(state))
    email_ready = email_can_evaluate(deepcopy(state))

    checks = {
        "audit": audit["overall"]["canClaimCredible"],
        "benchmark": benchmark["canJudgeSignalEdge"],
        "email": email_ready,
        "weekly": weekly,
    }
    expected = {
        "audit": expected_can_claim,
        "benchmark": expected_can_claim,
        "email": expected_can_claim,
        "weekly": expected_weekly,
    }
    if checks != expected:
        raise AssertionError(f"{name} failed: got {checks}, expected {expected}")
    return checks


def assert_frontend_gate_source():
    source = (ROOT / "public" / "app.js").read_text(encoding="utf-8")
    server_source = (ROOT / "server.js").read_text(encoding="utf-8")
    start_source = (ROOT / "start-console.ps1").read_text(encoding="utf-8")
    email_source = (ROOT / "scripts" / "build_email_reminder.py").read_text(encoding="utf-8")
    required = [
        "function credibilityGate(",
        "execution.pending === 0",
        "const validationReady = Boolean(validation) && gate.canEvaluate;",
        "const canClaimCredible = gate.canEvaluate;",
        "level: gate.canEvaluate ? \"ok\" : \"warn\"",
        "status: gate.canEvaluate ? \"可评估\"",
        "\"/api/build-next-action-report\"",
        "\"/api/build-step9-10-tracker\"",
        "\"/api/build-maturity-schedule\"",
        "\"/api/build-review-todo\"",
        "\"/api/build-credibility-report\"",
        "\"/api/export-signal-history\"",
        "`还差 ${unfinished} 项`",
        "当前缺口：",
        "确认已观察",
        "这只是记录，不会交易",
        "5/20/60 三类回看各满 30 个结果",
        "estimateCredibilityMilestones",
        "最早可信度初评参考日",
        "第30条信号60日回看预计",
        "function renderMaturitySchedule",
        "function renderReviewTodoPanel",
        "function renderCredibilityReportPanel",
        "function renderSignalExportPanel",
        "function renderSignalIntegrityPanel",
        "maturity-schedule-button",
        "review-todo-button",
        "credibility-report-button",
        "export-signals-button",
        "signal-integrity-button",
        "state-backup-button",
        "executionLocked",
        "信号回看到期表",
        "回看待办",
        "可信度判定",
        "信号历史导出",
        "信号样本完整性",
        "实验状态备份",
        "signalMaturitySchedule",
        "reviewTodoReport",
        "credibilityReport",
        "signalHistoryExport",
        "signalIntegrityAudit",
        "stateBackup",
        "先补执行记录",
        "execution_pending_blocked",
        "duplicateTradingDayCount",
        "重复交易日",
        "\"/api/audit-signal-integrity\"",
        "\"/api/backup-state\"",
    ]
    missing = [item for item in required if item not in source]
    server_required = [
        'req.url === "/api/build-next-action-report"',
        'req.url === "/api/build-step9-10-tracker"',
        'req.url === "/api/build-maturity-schedule"',
        'req.url === "/api/build-review-todo"',
        'req.url === "/api/build-credibility-report"',
        'req.url === "/api/export-signal-history"',
        'req.url === "/api/audit-signal-integrity"',
        'req.url === "/api/backup-state"',
        'apiUrl.pathname === "/api/download-signal-history"',
        "latestNextActionReport",
        "signalMaturitySchedule",
        "reviewTodoReport",
        "credibilityReport",
        "signalHistoryExport",
        "signalIntegrityAudit",
        "stateBackup",
        "capabilities",
        "nextActionReport: true",
        "maturitySchedule: true",
        "reviewTodo: true",
        "credibilityReport: true",
        "signalHistoryExport: true",
        "signalIntegrityAudit: true",
        "stateBackup: true",
    ]
    server_missing = [item for item in server_required if item not in server_source]
    start_required = [
        "Test-FreshConsole",
        "Stop-StaleInvestmentConsole",
        "Select-ConsolePort",
        "$fallbackPorts = @(4174, 4175, 4176, 4177, 4178)",
        "$env:PORT = [string]$selectedPort",
        "$health.capabilities.nextActionReport -eq $true",
        "$health.capabilities.reviewTodo -eq $true",
        "$health.capabilities.credibilityReport -eq $true",
        "$health.capabilities.signalHistoryExport -eq $true",
        "$health.capabilities.signalIntegrityAudit -eq $true",
        "$health.capabilities.stateBackup -eq $true",
        "$null -ne $health.executionPendingSignals",
        "4173 is still busy",
    ]
    start_missing = [item for item in start_required if item not in start_source]
    email_required = [
        "credibilityReport",
        "## 可信度判定",
        "可信度判定：",
        "胜率下界",
        "阻塞：",
        "补齐前暂停新开仓",
    ]
    email_missing = [item for item in email_required if item not in email_source]
    forbidden = [
        "Boolean(overall.canClaimCredible) ||",
        "signals.length >= 30 && weeks >= 8 ? \"可评估\"",
    ]
    present = [item for item in forbidden if item in source]
    if missing or server_missing or start_missing or email_missing or present:
        raise AssertionError(
            "frontend gate source check failed: "
            + json.dumps(
                {
                    "missing": missing,
                    "serverMissing": server_missing,
                    "startMissing": start_missing,
                    "emailMissing": email_missing,
                    "forbiddenPresent": present,
                },
                ensure_ascii=False,
            )
        )
    return {
        "requiredFound": len(required),
        "serverRequiredFound": len(server_required),
        "startRequiredFound": len(start_required),
        "emailRequiredFound": len(email_required),
        "forbiddenAbsent": len(forbidden),
    }


def one_signal_state(recorded=False):
    status = "已执行" if recorded else "未记录"
    return {
        "settings": {
            "formalSignalRecording": True,
            "email": "demo@example.com",
            "totalCapital": 1000,
            "trialCapital": 200,
        },
        "portfolio": [],
        "watchlist": [],
        "signalHistory": [
            {
                "id": "signal-transition-check",
                "date": "2026-08-07",
                "status": "持仓盈利",
                "recommendation": "继续持有，按卖出规则观察趋势。",
                "execution": {
                    "status": status,
                    "action": "观察",
                    "notes": "验收样例",
                },
            }
        ],
        "signalValidation": make_validation(day5=0, day20=0, day60=0),
        "sampleGuard": {
            "nextCheckpoints": [
                {
                    "signalId": "signal-transition-check",
                    "date": "2026-08-07",
                    "window": "day5",
                    "targetTradingDays": 5,
                    "remainingTradingDays": 5,
                    "estimatedReviewDate": "2026-08-14",
                }
            ],
            "dueCheckpoints": [],
        },
        "trades": [],
        "executionLog": [],
    }


def assert_next_action_transition():
    unrecorded = build_next_action_report(one_signal_state(recorded=False))
    observed = build_next_action_report(one_signal_state(recorded=True))
    complete = build_next_action_report(base_state())

    checks = {
        "unrecordedPrimary": unrecorded["primaryAction"]["kind"],
        "unrecordedPending": unrecorded["current"]["executionPending"],
        "observedPrimary": observed["primaryAction"]["kind"],
        "observedPending": observed["current"]["executionPending"],
        "completePrimary": complete["primaryAction"]["kind"],
        "completeCanClaim": complete["canClaimCredible"],
    }
    expected = {
        "unrecordedPrimary": "record_execution",
        "unrecordedPending": 1,
        "observedPrimary": "collect_signals",
        "observedPending": 0,
        "completePrimary": "write_review",
        "completeCanClaim": True,
    }
    if checks != expected:
        raise AssertionError(f"next action transition failed: got {checks}, expected {expected}")
    return checks


def assert_runtime_verifier_source():
    source = (ROOT / "scripts" / "verify_runtime_console.py").read_text(encoding="utf-8")
    required = [
        "STATE_PATH_OVERRIDE",
        "TemporaryDirectory",
        '"/api/health"',
        '"/api/record-signal"',
        '"/api/signal-execution"',
        '"/api/build-next-action-report"',
        '"/api/build-step9-10-tracker"',
        '"/api/build-maturity-schedule"',
        '"/api/build-review-todo"',
        '"/api/build-credibility-report"',
        '"/api/build-email-reminder"',
        '"/api/export-signal-history"',
        '"/api/audit-signal-integrity"',
        '"/api/backup-state"',
        '"/api/download-signal-history?format=csv"',
        '"maturitySchedule"',
        '"reviewTodo"',
        '"credibilityReport"',
        '"signalHistoryExport"',
        '"signalIntegrityAudit"',
        '"stateBackup"',
        '"status": "已执行"',
        "executionPendingSignals",
        "afterExecutionPending",
        "blockedRecordStatus",
        "earliestCredibleEvaluationDate",
        "maturityScheduleRows",
        "reviewTodoDueCount",
        "credibilityVerdict",
        "## 可信度判定",
        "emailCredibilityStatus",
        "emailNewOrderAction",
        "operation plan should expose execution lock",
        "email execution todo should not repeat stale buy prompts",
        "pending_execution_records",
        "signalHistoryExportRows",
        "signalIntegrityDangerCount",
        "signalIntegrityDuplicateTradingDayCount",
        "stateBackupCount",
        "creationflags=runtime_flags()",
    ]
    missing = [item for item in required if item not in source]
    if missing:
        raise AssertionError(
            "runtime verifier source check failed: "
            + json.dumps({"missing": missing}, ensure_ascii=False)
        )
    return {"requiredFound": len(required)}


def assert_maturity_schedule_logic():
    state = one_signal_state(recorded=False)
    report = build_maturity_schedule(deepcopy(state))
    summary = report["summary"]
    checks = {
        "signalCount": summary["signalCount"],
        "rowCount": summary["rowCount"],
        "executionPending": summary["executionPending"],
        "windows": sorted({row["window"] for row in report["rows"]}),
        "hasNextDue": bool(summary.get("nextDue")),
    }
    expected = {
        "signalCount": 1,
        "rowCount": 3,
        "executionPending": 1,
        "windows": ["day20", "day5", "day60"],
        "hasNextDue": True,
    }
    if checks != expected:
        raise AssertionError(f"maturity schedule failed: got {checks}, expected {expected}")
    return checks


def assert_review_todo_logic():
    state = one_signal_state(recorded=False)
    state["signalHistory"][0]["checkpoints"] = {
        "day5": {
            "status": "pending",
            "targetTradingDays": 5,
            "latestTradingDays": 5,
            "remainingTradingDays": 0,
            "estimatedReviewDate": "2026-08-14",
            "reason": "验收：已到 5 个交易日",
        },
        "day20": {
            "status": "pending",
            "targetTradingDays": 20,
            "latestTradingDays": 18,
            "remainingTradingDays": 2,
            "estimatedReviewDate": "2026-09-04",
            "reason": "验收：快到期",
        },
        "day60": {
            "status": "pending",
            "targetTradingDays": 60,
            "latestTradingDays": 0,
            "remainingTradingDays": 60,
            "estimatedReviewDate": "2026-10-30",
            "reason": "验收：等待",
        },
    }
    report = build_review_todo(deepcopy(state))
    summary = report["summary"]
    checks = {
        "phase": report["phase"],
        "dueCount": summary["dueCount"],
        "soonCount": summary["soonCount"],
        "waitingCount": summary["waitingCount"],
        "nextPriority": (summary.get("nextItem") or {}).get("todoPriority"),
        "nextAction": summary["primaryAction"],
    }
    expected = {
        "phase": "需要回看",
        "dueCount": 1,
        "soonCount": 1,
        "waitingCount": 1,
        "nextPriority": "due_now",
        "nextAction": "运行到期回看",
    }
    if checks != expected:
        raise AssertionError(f"review todo failed: got {checks}, expected {expected}")
    return checks


def assert_credibility_report_logic():
    insufficient = build_credibility_report(one_signal_state(recorded=False))
    complete = build_credibility_report(base_state())

    checks = {
        "insufficientVerdict": insufficient["verdict"],
        "insufficientCanClaim": insufficient["canClaimCredible"],
        "insufficientBlockers": insufficient["blockerCount"] > 0,
        "completeVerdict": complete["verdict"],
        "completeCanClaim": complete["canClaimCredible"],
        "completeSignalCount": complete["metrics"]["signalCount"],
        "completeWindowComplete": complete["metrics"]["reviewWindows"]["complete"],
    }
    expected = {
        "insufficientVerdict": "不可评估",
        "insufficientCanClaim": False,
        "insufficientBlockers": True,
        "completeVerdict": "可初步评估",
        "completeCanClaim": True,
        "completeSignalCount": 30,
        "completeWindowComplete": True,
    }
    if checks != expected:
        raise AssertionError(f"credibility report failed: got {checks}, expected {expected}")
    return checks


def assert_email_credibility_section():
    state = one_signal_state(recorded=False)
    state["credibilityReport"] = build_credibility_report(deepcopy(state))
    reminder = build_reminder(deepcopy(state))
    fifth = reminder["fiveAnswers"][4]
    body = reminder["body"]
    checks = {
        "fifthStatus": fifth["status"],
        "hasSection": "## 可信度判定" in body,
        "hasVerdict": "判定：不可评估" in body,
        "hasBlocker": "阻塞：" in body,
        "hasCredibilityPayload": bool(reminder.get("credibilityReport")),
    }
    expected = {
        "fifthStatus": "不可评估",
        "hasSection": True,
        "hasVerdict": True,
        "hasBlocker": True,
        "hasCredibilityPayload": True,
    }
    if checks != expected:
        raise AssertionError(f"email credibility section failed: got {checks}, expected {expected}")
    return checks


def assert_email_execution_todo_is_record_only():
    state = one_signal_state(recorded=False)
    state["signalHistory"][0]["manualOrderChecklist"] = {
        "items": [
            {"title": "新开仓清单", "action": "可手动买入 100 份", "status": "可复核买入"},
            {"title": "执行纪律", "action": "记录结果", "status": "手动执行"},
        ]
    }
    state["credibilityReport"] = build_credibility_report(deepcopy(state))
    reminder = build_reminder(deepcopy(state))
    todo = (reminder.get("executionTodo") or [{}])[0]
    action_text = "；".join(todo.get("actionItems") or [])
    checks = {
        "hasTodo": bool(todo),
        "hasRecordPrompt": "先补执行记录" in action_text,
        "mentionsPause": "暂停新开仓" in action_text,
        "hasBuyPrompt": "买入" in action_text,
    }
    expected = {
        "hasTodo": True,
        "hasRecordPrompt": True,
        "mentionsPause": True,
        "hasBuyPrompt": False,
    }
    if checks != expected:
        raise AssertionError(f"email execution todo failed: got {checks}, expected {expected}")
    return checks


def assert_execution_discipline_action_is_observe():
    action = action_from_plan_item(
        {
            "title": "执行纪律",
            "status": "手动执行",
            "side": "记录",
            "meta": "系统不自动交易；任何实际买入、卖出、赎回或不执行，都要在信号页补执行记录。",
        }
    )
    if action != "观察":
        raise AssertionError(f"execution discipline action failed: got {action}, expected 观察")
    return {"action": action}


def assert_pending_execution_locks_new_orders():
    state = one_signal_state(recorded=False)
    state["watchlist"] = [
        {
            "code": "513050",
            "name": "易方达中证海外中国互联网50（QDII-ETF）",
            "price": 1.16,
            "totalScore": 90,
            "grade": "A",
            "status": "重点观察",
            "scoreReasons": ["验收：趋势未破"],
            "riskFlags": ["验收：样本不足"],
        }
    ]
    plan = build_operation_plan(
        deepcopy(state),
        summary={
            "status": "持仓盈利",
            "level": "ok",
            "recommendation": "继续观察。",
            "marketValue": 100,
            "pnl": 1,
        },
    )
    checklist = plan["manualOrderChecklist"]
    new_order = next(item for item in checklist["items"] if item["title"] == "新开仓清单")
    checks = {
        "executionLocked": plan["executionLocked"],
        "executionPending": plan["executionPending"],
        "planLabel": plan["label"],
        "checklistLabel": checklist["label"],
        "newOrderStatus": new_order["status"],
        "newOrderAction": new_order["action"],
        "newOrderQuantity": new_order["quantity"],
    }
    expected = {
        "executionLocked": True,
        "executionPending": 1,
        "planLabel": "先补执行记录",
        "checklistLabel": "先补执行记录",
        "newOrderStatus": "暂停",
        "newOrderAction": "先补执行记录",
        "newOrderQuantity": 0,
    }
    if checks != expected:
        raise AssertionError(f"pending execution lock failed: got {checks}, expected {expected}")
    return checks


def assert_same_day_signal_dedup():
    state = one_signal_state(recorded=False)
    state["sourceWhitelist"] = [{"name": "验收来源"}]
    state["watchlist"] = [
        {
            "code": "513050",
            "name": "易方达中证海外中国互联网50（QDII-ETF）",
            "price": 1.16,
            "totalScore": 90,
            "grade": "A",
            "status": "重点观察",
            "lastMarketDate": "2026-08-07",
            "scoreReasons": ["验收：趋势未破"],
            "riskFlags": ["验收：样本不足"],
        }
    ]
    state["signalHistory"][0]["actionHash"] = "old-hash-before-rule-change"
    result = record_signal(deepcopy(state), reason="daily-run", allow_stale=True)
    checks = {
        "status": result["status"],
        "reason": result["reason"],
        "signalId": result["signalId"],
        "date": result["date"],
    }
    expected = {
        "status": "duplicate",
        "reason": "same_trading_day_already_recorded",
        "signalId": "signal-transition-check",
        "date": "2026-08-07",
    }
    if checks != expected:
        raise AssertionError(f"same-day dedup failed: got {checks}, expected {expected}")
    return checks


def assert_pending_execution_blocks_new_signal():
    state = one_signal_state(recorded=False)
    state["sourceWhitelist"] = [{"name": "验收来源"}]
    state["watchlist"] = [
        {
            "code": "513050",
            "name": "易方达中证海外中国互联网50（QDII-ETF）",
            "price": 1.16,
            "totalScore": 90,
            "grade": "A",
            "status": "重点观察",
            "lastMarketDate": "2026-08-10",
            "scoreReasons": ["验收：趋势未破"],
            "riskFlags": ["验收：样本不足"],
        }
    ]
    result = record_signal(state, reason="daily-run", allow_stale=True)
    checks = {
        "status": result["status"],
        "reason": result["reason"],
        "date": result["date"],
        "executionPending": result["executionPending"],
        "signalCountAfter": len(state["signalHistory"]),
    }
    expected = {
        "status": "execution_pending_blocked",
        "reason": "pending_execution_records",
        "date": "2026-08-10",
        "executionPending": 1,
        "signalCountAfter": 1,
    }
    if checks != expected:
        raise AssertionError(f"pending execution signal block failed: got {checks}, expected {expected}")
    return checks


def assert_signal_history_export_logic():
    state = one_signal_state(recorded=False)
    report = export_signal_history_report(deepcopy(state))
    summary = report["summary"]
    first_row = report["rows"][0] if report["rows"] else {}
    checks = {
        "exportedRowCount": summary["exportedRowCount"],
        "executionPending": summary["executionPending"],
        "hasDay5Column": "day5Status" in report["columns"],
        "hasCandidateColumn": "topCandidateCode" in report["columns"],
        "firstExecutionStatus": first_row.get("executionStatus"),
        "firstDay5Status": first_row.get("day5Status"),
    }
    expected = {
        "exportedRowCount": 1,
        "executionPending": 1,
        "hasDay5Column": True,
        "hasCandidateColumn": True,
        "firstExecutionStatus": "未记录",
        "firstDay5Status": "",
    }
    if checks != expected:
        raise AssertionError(f"signal history export failed: got {checks}, expected {expected}")
    return checks


def assert_signal_integrity_logic():
    first_state = one_signal_state(recorded=False)
    first_audit, known = build_signal_integrity_audit(deepcopy(first_state))

    missing_state = deepcopy(first_state)
    missing_state["signalIntegrityKnownSignals"] = known
    missing_state["signalHistory"] = []
    second_audit, _ = build_signal_integrity_audit(missing_state)

    checks = {
        "firstKnownSignalCount": first_audit["knownSignalCount"],
        "firstDangerCount": first_audit["dangerCount"],
        "firstHasWarning": first_audit["warningCount"] >= 1,
        "secondMissingKnownSignalCount": second_audit["missingKnownSignalCount"],
        "secondDangerCount": second_audit["dangerCount"],
        "secondOk": second_audit["ok"],
    }
    expected = {
        "firstKnownSignalCount": 1,
        "firstDangerCount": 0,
        "firstHasWarning": True,
        "secondMissingKnownSignalCount": 1,
        "secondDangerCount": 1,
        "secondOk": False,
    }
    if checks != expected:
        raise AssertionError(f"signal integrity audit failed: got {checks}, expected {expected}")
    return checks


def assert_duplicate_trading_day_audit():
    state = one_signal_state(recorded=True)
    second = deepcopy(state["signalHistory"][0])
    second["id"] = "signal-transition-check-second"
    second["actionHash"] = "different-action-hash"
    state["signalHistory"].append(second)
    audit, _ = build_signal_integrity_audit(deepcopy(state))
    duplicate_issues = [item for item in audit["issues"] if item["kind"] == "duplicate_trading_day"]
    checks = {
        "ok": audit["ok"],
        "level": audit["level"],
        "duplicateTradingDayCount": audit["duplicateTradingDayCount"],
        "dangerCount": audit["dangerCount"],
        "issueCount": len(duplicate_issues),
    }
    expected = {
        "ok": False,
        "level": "danger",
        "duplicateTradingDayCount": 1,
        "dangerCount": 1,
        "issueCount": 1,
    }
    if checks != expected:
        raise AssertionError(f"duplicate trading day audit failed: got {checks}, expected {expected}")
    return checks


def assert_unknown_execution_status_is_pending():
    state = one_signal_state(recorded=True)
    state["signalHistory"][0]["execution"] = {
        "status": "unexpected-status",
        "action": "观察",
        "notes": "未知状态必须按待补处理",
    }
    next_action = build_next_action_report(deepcopy(state))
    maturity = build_maturity_schedule(deepcopy(state))
    weekly = weekly_payload(state)
    checks = {
        "nextActionPending": next_action["current"]["executionPending"],
        "nextActionPrimary": next_action["primaryAction"]["kind"],
        "maturityPending": maturity["summary"]["executionPending"],
        "weeklyPending": weekly["execution"]["pending"],
    }
    expected = {
        "nextActionPending": 1,
        "nextActionPrimary": "record_execution",
        "maturityPending": 1,
        "weeklyPending": 1,
    }
    if checks != expected:
        raise AssertionError(f"unknown execution status failed: got {checks}, expected {expected}")
    return checks


def main():
    cases = []

    missing_windows = base_state()
    missing_windows["signalValidation"] = make_validation(day5=30, day20=0, day60=0)
    cases.append(("missing_windows", missing_windows, False, "回看窗口不足"))

    partial_windows = base_state()
    partial_windows["signalValidation"] = make_validation(day5=30, day20=1, day60=1)
    cases.append(("partial_windows", partial_windows, False, "回看窗口不足"))

    missing_execution = base_state()
    missing_execution["signalHistory"] = make_signals(recorded=False)
    cases.append(("missing_execution", missing_execution, False, "执行记录不完整"))

    complete = base_state()
    cases.append(("complete", complete, True, "初步优于基准"))

    results = {
        name: assert_case(name, state, expected_can_claim, expected_weekly)
        for name, state, expected_can_claim, expected_weekly in cases
    }
    print(json.dumps({
        "ok": True,
        "cases": results,
        "frontend": assert_frontend_gate_source(),
        "nextActionTransition": assert_next_action_transition(),
        "maturitySchedule": assert_maturity_schedule_logic(),
        "reviewTodo": assert_review_todo_logic(),
        "credibilityReport": assert_credibility_report_logic(),
        "emailCredibility": assert_email_credibility_section(),
        "emailExecutionTodo": assert_email_execution_todo_is_record_only(),
        "executionDisciplineAction": assert_execution_discipline_action_is_observe(),
        "pendingExecutionLock": assert_pending_execution_locks_new_orders(),
        "sameDaySignalDedup": assert_same_day_signal_dedup(),
        "pendingExecutionSignalBlock": assert_pending_execution_blocks_new_signal(),
        "signalHistoryExport": assert_signal_history_export_logic(),
        "signalIntegrityAudit": assert_signal_integrity_logic(),
        "duplicateTradingDayAudit": assert_duplicate_trading_day_audit(),
        "unknownExecutionStatus": assert_unknown_execution_status_is_pending(),
        "runtimeVerifier": assert_runtime_verifier_source(),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
