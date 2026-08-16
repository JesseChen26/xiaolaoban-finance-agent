import json
import os
from datetime import datetime, timedelta
from pathlib import Path

from record_signal import parse_date
from execution_status import normalize_execution_action, signal_execution_recorded
from state_store import save_json_atomic


REQUIRED_REVIEW_WINDOWS = ("day5", "day20", "day60")

ROOT = Path(__file__).resolve().parents[1]
STATE_PATH = Path(os.environ.get("STATE_PATH_OVERRIDE") or ROOT / "data" / "state.json")
DATA_DIR = STATE_PATH.parent
LATEST_JSON_PATH = DATA_DIR / "latest_next_action.json"
LATEST_MD_PATH = DATA_DIR / "latest_next_action.md"


def load_state():
    with STATE_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def save_state(state):
    save_json_atomic(STATE_PATH, state)


def recorded_week_count(signals):
    weeks = set()
    for signal in signals or []:
        parsed = parse_date(signal.get("date") or signal.get("time"))
        if parsed:
            year, week, _ = parsed.isocalendar()
            weeks.add(f"{year}-W{week:02d}")
    return len(weeks)


def is_recorded_execution(signal):
    return signal_execution_recorded(signal)


def execution_summary(signals):
    pending_signals = []
    for signal in signals or []:
        if is_recorded_execution(signal):
            continue
        pending_signals.append(
            {
                "id": signal.get("id"),
                "date": signal.get("date"),
                "status": signal.get("status"),
                "recommendation": signal.get("recommendation"),
                "suggestedAction": normalize_execution_action((signal.get("execution") or {}).get("action")),
            }
        )
    total = len(signals or [])
    recorded = total - len(pending_signals)
    return {
        "totalSignals": total,
        "recorded": recorded,
        "pending": len(pending_signals),
        "coveragePct": round(recorded / total * 100, 2) if total else None,
        "pendingSignals": pending_signals[:10],
    }


def validation_window_status(validation, required_signals=30):
    by_window = validation.get("byWindow") or {}
    done = {}
    pending = {}
    required = int(required_signals or 30)
    for key in REQUIRED_REVIEW_WINDOWS:
        item = by_window.get(key) or {}
        done[key] = int(float(item.get("done") or 0))
        pending[key] = int(float(item.get("pending") or 0))
    missing = [key for key in REQUIRED_REVIEW_WINDOWS if done.get(key, 0) < required]
    return {
        "done": done,
        "pending": pending,
        "required": required,
        "complete": not missing,
        "missing": missing,
    }


def add_weekdays(start_date, days):
    current = start_date
    remaining = int(max(0, days))
    while remaining > 0:
        current += timedelta(days=1)
        if current.weekday() < 5:
            remaining -= 1
    return current


def signal_dates(signals):
    dates = []
    for signal in signals or []:
        parsed = parse_date(signal.get("date") or signal.get("time"))
        if parsed:
            dates.append(parsed)
    return sorted(dates)


def estimate_milestones(signals, required_signals=30, required_weeks=8):
    dates = signal_dates(signals)
    today = datetime.now().date()
    anchor = dates[-1] if dates else today
    first_signal = dates[0] if dates else None
    missing_signals = max(0, required_signals - len(signals or []))
    estimated_30th_signal = add_weekdays(anchor, missing_signals) if missing_signals else anchor

    if first_signal:
        first_week_monday = first_signal - timedelta(days=first_signal.weekday())
        estimated_8th_week = first_week_monday + timedelta(weeks=max(0, required_weeks - 1))
    else:
        estimated_8th_week = today + timedelta(weeks=required_weeks)

    conservative_day60 = add_weekdays(estimated_30th_signal, 60)
    earliest_credible = max(estimated_30th_signal, estimated_8th_week, conservative_day60)
    return {
        "rule": "weekday_only_conservative",
        "missingSignals": missing_signals,
        "estimated30thSignalDate": estimated_30th_signal.isoformat(),
        "estimated8thWeekDate": estimated_8th_week.isoformat(),
        "estimated30thSignalDay60Date": conservative_day60.isoformat(),
        "earliestCredibleEvaluationDate": earliest_credible.isoformat(),
        "note": "按每个交易日最多新增 1 条正式信号估算；节假日未扣除，因此只是保守排期参考，不是交易承诺。",
    }


def checkpoint_title(item):
    target = item.get("targetTradingDays") or "-"
    return f"{item.get('date') or '-'} 的 {target} 日回看"


def checkpoint_detail(item):
    remaining = item.get("remainingTradingDays")
    estimate = item.get("estimatedReviewDate")
    parts = []
    if remaining is not None:
        parts.append(f"还差约 {remaining} 个交易日")
    if estimate:
        parts.append(f"预计 {estimate}")
    reason = item.get("reason")
    if reason:
        parts.append(reason)
    return "；".join(parts) or "等待真实交易日到期"


def add_action(actions, priority, kind, title, detail, page="dashboard", due=""):
    actions.append(
        {
            "priority": priority,
            "kind": kind,
            "title": title,
            "detail": detail,
            "page": page,
            "due": due,
        }
    )


def build_report(state):
    signals = state.get("signalHistory") or []
    settings = state.get("settings") or {}
    validation = state.get("signalValidation") or {}
    guard = state.get("sampleGuard") or {}
    audit = (state.get("goalAudit") or {}).get("overall") or {}
    formal_recording = bool(settings.get("formalSignalRecording"))
    weeks = recorded_week_count(signals)
    execution = execution_summary(signals)
    window_status = validation_window_status(validation, 30)
    milestones = estimate_milestones(signals, 30, 8)
    due_checkpoints = guard.get("dueCheckpoints") or []
    next_checkpoints = guard.get("nextCheckpoints") or []
    can_claim = (
        len(signals) >= 30
        and weeks >= 8
        and execution["pending"] == 0
        and window_status["complete"]
    )

    blockers = []
    if not formal_recording:
        blockers.append("正式样本记录未开启")
    if len(signals) < 30:
        blockers.append(f"正式信号不足，还差 {30 - len(signals)} 条")
    if weeks < 8:
        blockers.append(f"记录周期不足，还差 {8 - weeks} 周")
    if execution["pending"] > 0:
        blockers.append(f"执行记录待补 {execution['pending']} 条")
    if not window_status["complete"]:
        missing = "、".join({"day5": "5日", "day20": "20日", "day60": "60日"}[key] for key in window_status["missing"])
        blockers.append(f"{missing}回看还没有各满 {window_status['required']} 个结果")

    actions = []
    if execution["pending"] > 0:
        first = execution["pendingSignals"][0]
        add_action(
            actions,
            "high",
            "record_execution",
            "先补执行记录",
            f"{first.get('date') or '-'} 的信号还没记录你是否执行；没下单就标记为已观察。",
            page="signals",
            due="现在",
        )
    if due_checkpoints:
        item = due_checkpoints[0]
        add_action(
            actions,
            "high",
            "run_validation",
            "运行到期回看",
            f"{checkpoint_title(item)} 已到期，先点击“回看信号结果”。",
            page="signals",
            due="现在",
        )
    if not formal_recording:
        add_action(
            actions,
            "high",
            "start_formal_recording",
            "开启正式样本记录",
            "开始记录前检查通过后，才能把每日建议计入 30 条正式样本。",
            page="dashboard",
            due="准备好后",
        )
    if len(signals) < 30:
        add_action(
            actions,
            "medium",
            "collect_signals",
            "继续每日收盘运行",
            f"当前 {len(signals)}/30 条正式信号，失败或空仓样本也要保留。",
            page="dashboard",
            due="每个交易日收盘后",
        )
    if weeks < 8:
        add_action(
            actions,
            "medium",
            "collect_weeks",
            "继续积累记录周期",
            f"当前 {weeks}/8 周，规则不要临时改口径。",
            page="dashboard",
            due="每周复盘",
        )
    if next_checkpoints:
        item = next_checkpoints[0]
        add_action(
            actions,
            "medium",
            "wait_checkpoint",
            "等待下一次回看",
            f"{checkpoint_title(item)}：{checkpoint_detail(item)}。",
            page="signals",
            due=item.get("estimatedReviewDate") or "",
        )
    if can_claim:
        add_action(
            actions,
            "high",
            "write_review",
            "可以写阶段复盘",
            "样本、周期、执行和 5/20/60 回看都达到最低门槛，可以进入初步评估。",
            page="review",
            due="现在",
        )

    primary_action = actions[0] if actions else {
        "priority": "medium",
        "kind": "wait",
        "title": "等待下一批真实样本",
        "detail": "没有新的执行待办或到期回看，继续按每日流程积累。",
        "page": "dashboard",
        "due": "",
    }

    report = {
        "id": f"next-action-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "time": datetime.now().isoformat(timespec="seconds"),
        "phase": "可以初步评估" if can_claim else "正式样本积累中",
        "level": "ok" if can_claim else "warn",
        "canClaimCredible": can_claim,
        "current": {
            "formalSignalRecording": formal_recording,
            "goal": f"{audit.get('okCount', 0)}/{audit.get('total', 10)}",
            "signalCount": len(signals),
            "requiredSignals": 30,
            "recordedWeeks": weeks,
            "requiredWeeks": 8,
            "executionRecorded": execution["recorded"],
            "executionPending": execution["pending"],
            "doneCheckpoints": validation.get("doneCheckpoints") or 0,
            "pendingCheckpoints": validation.get("pendingCheckpoints") or 0,
            "reviewWindows": window_status,
        },
        "milestones": milestones,
        "primaryAction": primary_action,
        "actions": actions,
        "blockers": blockers,
        "pendingSignals": execution["pendingSignals"],
        "dueCheckpoints": due_checkpoints,
        "nextCheckpoints": next_checkpoints[:3],
        "boundary": "未达到 30 条信号、8 周、执行完整和 5/20/60 三类回看各满 30 个结果前，不能说策略可信，也不能扩大资金。",
    }
    report["body"] = build_markdown(report)
    return report


def build_markdown(report):
    current = report["current"]
    primary = report["primaryAction"]
    milestones = report.get("milestones") or {}
    lines = [
        f"# 下一步行动｜{primary['title']}",
        "",
        f"生成时间：{report['time']}",
        "",
        f"当前阶段：{report['phase']}。",
        "",
        f"最优先动作：{primary['title']}。",
        "",
        f"原因：{primary['detail']}",
        "",
        "## 当前门槛",
        "",
        f"- 正式信号：{current['signalCount']}/{current['requiredSignals']}。",
        f"- 记录周期：{current['recordedWeeks']}/{current['requiredWeeks']} 周。",
        f"- 执行记录：已补 {current['executionRecorded']} 条，待补 {current['executionPending']} 条。",
        f"- 回看窗口：5日 {current['reviewWindows']['done']['day5']}/{current['reviewWindows']['required']}，20日 {current['reviewWindows']['done']['day20']}/{current['reviewWindows']['required']}，60日 {current['reviewWindows']['done']['day60']}/{current['reviewWindows']['required']}。",
        "",
        "## 待处理",
    ]
    lines.extend(f"- {item}" for item in report["blockers"] or ["暂无阻塞项，继续等待真实样本。"])
    lines.extend([
        "",
        "## 保守时间预估",
        f"- 凑够第 30 条正式信号：{milestones.get('estimated30thSignalDate') or '-'}。",
        f"- 满足第 8 个记录周：{milestones.get('estimated8thWeekDate') or '-'}。",
        f"- 第 30 条信号完成 60 日回看：{milestones.get('estimated30thSignalDay60Date') or '-'}。",
        f"- 最早可信度初评参考日：{milestones.get('earliestCredibleEvaluationDate') or '-'}。",
        f"- 估算说明：{milestones.get('note') or '-'}",
    ])
    lines.extend(["", "## 行动清单"])
    lines.extend(
        f"- [{item['priority']}] {item['title']}：{item['detail']}"
        for item in report["actions"]
    )
    lines.extend(["", "## 边界", "", report["boundary"]])
    return "\n".join(lines) + "\n"


def write_report(state, report):
    state["latestNextActionReport"] = {key: value for key, value in report.items() if key != "body"}
    state["latestNextActionReport"]["body"] = report["body"]
    state.setdefault("nextActionRuns", []).insert(0, state["latestNextActionReport"])
    state["nextActionRuns"] = state["nextActionRuns"][:50]
    save_state(state)
    save_json_atomic(LATEST_JSON_PATH, report)
    LATEST_MD_PATH.write_text(report["body"], encoding="utf-8")


def main():
    state = load_state()
    report = build_report(state)
    write_report(state, report)
    print(
        json.dumps(
            {
                "ok": True,
                "phase": report["phase"],
                "level": report["level"],
                "canClaimCredible": report["canClaimCredible"],
                "primaryAction": report["primaryAction"]["title"],
                "blockerCount": len(report["blockers"]),
                "actionCount": len(report["actions"]),
                "executionPending": report["current"]["executionPending"],
                "signalCount": report["current"]["signalCount"],
                "doneCheckpoints": report["current"]["doneCheckpoints"],
                "earliestCredibleEvaluationDate": report["milestones"]["earliestCredibleEvaluationDate"],
                "milestones": report["milestones"],
                "written": [str(LATEST_JSON_PATH), str(LATEST_MD_PATH)],
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
