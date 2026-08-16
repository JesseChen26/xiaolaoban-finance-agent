import argparse
import json
import os
import subprocess
import sys
import time
from datetime import date, datetime
from pathlib import Path

from record_signal import formal_start_gate, load_state, preview_signal, record_signal, save_state


ROOT = Path(__file__).resolve().parents[1]
STATE_PATH = Path(os.environ.get("STATE_PATH_OVERRIDE") or ROOT / "data" / "state.json")


def script_path(name):
    return ROOT / "scripts" / name


def run_script(name, script_name, *args, timeout=180):
    started = time.perf_counter()
    command = [sys.executable, str(script_path(script_name)), *map(str, args)]
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}

    try:
        completed = subprocess.run(
            command,
            cwd=str(ROOT),
            env=env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        return {
            "name": name,
            "ok": False,
            "status": "timeout",
            "durationMs": round((time.perf_counter() - started) * 1000),
            "error": f"{script_name} 超时：{exc}",
        }

    stdout = (completed.stdout or "").strip()
    stderr = (completed.stderr or "").strip()
    payload = None
    if stdout:
        try:
            payload = json.loads(stdout)
        except json.JSONDecodeError:
            payload = {"output": stdout[:1200]}

    return {
        "name": name,
        "ok": completed.returncode == 0 and (not isinstance(payload, dict) or payload.get("ok", True)),
        "status": "done" if completed.returncode == 0 else "error",
        "durationMs": round((time.perf_counter() - started) * 1000),
        "summary": summarize_payload(payload),
        "error": friendly_error(stderr or (stdout if completed.returncode != 0 else "")),
    }


def friendly_error(value):
    raw = str(value or "").strip()
    lower = raw.lower()
    if "winerror 10013" in lower or "访问权限不允许" in lower or "forbidden by its access permissions" in lower:
        return "外部数据连接被当前进程或 Windows 防火墙拦截；最近一次成功数据已保留。"
    if any(key in lower for key in ("failed to establish", "无法连接到远程服务器", "connectionerror", "connection refused", "getaddrinfo")):
        return "暂时无法连接外部数据源；最近一次成功数据已保留。"
    if any(key in lower for key in ("timed out", "timeout", "超时")):
        return "外部数据源响应超时；最近一次成功数据已保留。"
    lines = [line.strip() for line in raw.splitlines() if line.strip()]
    candidates = [line for line in lines if any(key in line.lower() for key in ("error", "exception", "失败", "错误"))]
    return (candidates[-1] if candidates else (lines[-1] if lines else ""))[:260]


def summarize_payload(payload):
    if not isinstance(payload, dict):
        return {}
    summary = {}
    for key in (
        "count",
        "source",
        "verifiedCount",
        "mismatchCount",
        "totalSignals",
        "doneCheckpoints",
        "pendingCheckpoints",
        "subject",
        "shouldSend",
        "sendReason",
        "verdict",
        "phase",
        "level",
        "signalCount",
        "sameDaySignalCount",
        "recordedWeeks",
        "tradeCount",
        "totalPnl",
        "primaryAction",
        "blockerCount",
        "actionCount",
        "executionPending",
        "canClaimCredible",
        "rowCount",
        "dueCount",
        "waitingCount",
        "soonCount",
        "doneCount",
        "exportedRowCount",
        "knownSignalCount",
        "warningCount",
        "dangerCount",
        "missingKnownSignalCount",
        "backupCount",
        "fileName",
        "sha256",
        "bytes",
        "overallWinRatePct",
        "wilsonLowerPct",
        "avgExcessPct",
        "worstMaxDrawdownPct",
        "canClaimPositiveEdge",
    ):
        if key in payload:
            summary[key] = payload.get(key)
    if "errors" in payload:
        summary["errorCount"] = len(payload.get("errors") or [])
    return summary


def should_build_weekly(mode):
    if mode == "always":
        return True
    if mode == "never":
        return False
    return date.today().weekday() == 4


def formal_recording_requested(state, args):
    if args.record_signal:
        return True
    if args.dry_run_signal:
        return False
    return bool((state.get("settings") or {}).get("formalSignalRecording"))


def persist_run(result):
    state = load_state()
    state["dailyExperimentRun"] = result
    state.setdefault("dailyExperimentRuns", []).insert(0, result)
    state["dailyExperimentRuns"] = state["dailyExperimentRuns"][:50]
    save_state(state)


def run_pipeline(args):
    started = datetime.now().isoformat(timespec="seconds")
    steps = []

    if not args.skip_sync:
        steps.extend([
            run_script("同步信息源白名单", "sync_source_whitelist.py", timeout=60),
            run_script("同步易方达 ETF 产品库", "sync_efunds_etfs.py", timeout=180),
            run_script("同步场外基金净值", "sync_fund_nav.py", timeout=180),
            run_script("同步基金持仓穿透", "sync_fund_exposure.py", timeout=180),
            run_script("易方达官网净值核对", "crosscheck_efunds_nav.py", timeout=180),
            run_script("同步场内 ETF 行情", "update_market_data.py", "12", timeout=240),
            run_script("同步新闻事件", "sync_efunds_news.py", "12", timeout=240),
            run_script("同步财报事件", "sync_financial_events.py", timeout=180),
        ])
    else:
        steps.append({"name": "同步数据", "ok": True, "status": "skipped", "summary": {"reason": "skip_sync"}})

    state = load_state()
    requested_recording = formal_recording_requested(state, args)
    start_gate = formal_start_gate(state)
    gate_allows_recording = requested_recording and (start_gate["ready"] or args.bypass_start_gate)
    steps.append({
        "name": "正式实验开始检查",
        "ok": start_gate["ready"] or not requested_recording,
        "status": "ready" if start_gate["ready"] else "preview" if not requested_recording else "blocked",
        "summary": {
            "ready": start_gate["ready"],
            "okCount": start_gate["okCount"],
            "total": start_gate["total"],
            "requestedFormalSignalRecording": requested_recording,
            "blockers": [item.get("title") for item in start_gate["blockers"]],
        },
    })

    if gate_allows_recording:
        signal_result = record_signal(
            state,
            reason=args.reason,
            force=args.force_signal,
            allow_stale=args.allow_stale,
            enforce_start_gate=not args.bypass_start_gate,
        )
        if signal_result.get("status") == "recorded":
            save_state(state)
    else:
        signal_result = preview_signal(
            state,
            reason=args.reason,
            allow_stale=args.allow_stale,
        )
        if requested_recording and not start_gate["ready"]:
            signal_result["status"] = "gate_blocked"
            signal_result["message"] = "正式样本记录已开启，但开始前检查未通过，本次只预检今日建议，不写入 signalHistory。"
        elif signal_result.get("status") == "preview":
            signal_result["message"] = "正式样本记录未开启，本次只预检今日建议，不写入 signalHistory。"
    signal_result["formalSignalRecording"] = gate_allows_recording
    signal_result["requestedFormalSignalRecording"] = requested_recording
    signal_result["startGate"] = start_gate
    signal_step_name = "保存今日建议信号" if gate_allows_recording else "预检今日建议信号"
    steps.append({
        "name": signal_step_name,
        "ok": bool(signal_result.get("ok")),
        "status": signal_result.get("status"),
        "summary": {
            "mode": "record" if gate_allows_recording else "preview",
            "formalSignalRecording": gate_allows_recording,
            "requestedFormalSignalRecording": requested_recording,
            "startGateReady": start_gate["ready"],
            "signalId": signal_result.get("signalId"),
            "date": signal_result.get("date"),
            "reason": signal_result.get("reason"),
            "executionPending": signal_result.get("executionPending"),
            "message": signal_result.get("message"),
            "blockers": (signal_result.get("dataQuality") or {}).get("blockers"),
            "warnings": (signal_result.get("dataQuality") or {}).get("warnings"),
        },
    })

    steps.append(run_script("回看历史信号", "validate_signals.py", timeout=240))
    steps.append(run_script("样本采集守护", "sample_guard.py", timeout=60))
    steps.append(run_script("生成回看到期表", "build_maturity_schedule.py", timeout=60))
    steps.append(run_script("生成回看待办", "build_review_todo.py", timeout=60))
    steps.append(run_script("导出信号历史", "export_signal_history.py", timeout=60))
    steps.append(run_script("审计信号完整性", "audit_signal_integrity.py", timeout=60))
    steps.append(run_script("生成执行表现报告", "build_performance_report.py", timeout=60))
    steps.append(run_script("生成可信度判定", "build_credibility_report.py", timeout=60))
    steps.append(run_script("运行目标审计", "audit_experiment_goal.py", timeout=60))
    steps.append(run_script("更新第9/10步执行跟踪", "build_step9_10_tracker.py", timeout=60))
    steps.append(run_script("生成下一步行动报告", "build_next_action_report.py", timeout=60))
    steps.append(run_script("生成每日提醒邮件", "build_email_reminder.py", timeout=120))
    steps.append(run_script("备份实验状态", "backup_experiment_state.py", "--reason", "daily-run", timeout=60))

    if should_build_weekly(args.weekly):
        steps.append(run_script("生成执行偏差周报", "build_weekly_review.py", timeout=120))
    else:
        steps.append({"name": "生成执行偏差周报", "ok": True, "status": "skipped", "summary": {"reason": "not_weekly_day"}})

    finished = datetime.now().isoformat(timespec="seconds")
    critical_step_names = ("保存今日建议信号", "预检今日建议信号", "回看历史信号", "样本采集守护", "生成回看到期表", "生成回看待办", "导出信号历史", "审计信号完整性", "生成执行表现报告", "生成可信度判定", "生成下一步行动报告", "生成每日提醒邮件", "备份实验状态")
    critical_failures = [
        item
        for item in steps
        if not item.get("ok") and item.get("name") in critical_step_names
    ]
    sync_failures = [item for item in steps if not item.get("ok") and item.get("name").startswith(("同步", "易方达"))]
    result = {
        "ok": not critical_failures and not sync_failures,
        "time": finished,
        "startedAt": started,
        "reason": args.reason,
        "signal": signal_result,
        "steps": steps,
        "summary": {
            "recordStatus": signal_result.get("status"),
            "signalMode": "record" if gate_allows_recording else "preview",
            "formalSignalRecording": gate_allows_recording,
            "requestedFormalSignalRecording": requested_recording,
            "startGateReady": start_gate["ready"],
            "startGateOkCount": start_gate["okCount"],
            "startGateTotal": start_gate["total"],
            "criticalFailureCount": len(critical_failures),
            "syncFailureCount": len(sync_failures),
            "stepCount": len(steps),
        },
    }
    persist_run(result)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reason", default="daily-run")
    parser.add_argument("--force-signal", action="store_true")
    parser.add_argument("--record-signal", action="store_true")
    parser.add_argument("--dry-run-signal", action="store_true")
    parser.add_argument("--bypass-start-gate", action="store_true")
    parser.add_argument("--allow-stale", action="store_true")
    parser.add_argument("--skip-sync", action="store_true")
    parser.add_argument("--weekly", choices=("auto", "always", "never"), default="auto")
    args = parser.parse_args()

    result = run_pipeline(args)
    print(json.dumps({"ok": result["ok"], **result}, ensure_ascii=False))


if __name__ == "__main__":
    main()
