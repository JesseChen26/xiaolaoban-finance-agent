import argparse
import json
import os
from datetime import datetime, timedelta
from pathlib import Path

from execution_status import normalize_execution_status, signal_execution_recorded
from record_signal import parse_date, safe_float
from state_store import save_json_atomic


ROOT = Path(__file__).resolve().parents[1]
STATE_PATH_OVERRIDE = os.environ.get("STATE_PATH_OVERRIDE")
STATE_PATH = Path(STATE_PATH_OVERRIDE or ROOT / "data" / "state.json")
OUTPUT_DIR = STATE_PATH.parent if STATE_PATH_OVERRIDE else ROOT / "data"
JSON_PATH = OUTPUT_DIR / "signal_maturity_schedule.json"
MD_PATH = OUTPUT_DIR / "signal_maturity_schedule.md"

WINDOWS = {
    "day5": {"label": "5日", "targetTradingDays": 5},
    "day20": {"label": "20日", "targetTradingDays": 20},
    "day60": {"label": "60日", "targetTradingDays": 60},
}


def now_text():
    return datetime.now().replace(microsecond=0).isoformat()


def load_state():
    with STATE_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def save_state(state):
    save_json_atomic(STATE_PATH, state)


def add_weekdays(start_date, days):
    current = start_date
    remaining = int(max(0, days))
    while remaining > 0:
        current += timedelta(days=1)
        if current.weekday() < 5:
            remaining -= 1
    return current


def estimated_review_date(signal_date, target_days):
    parsed = parse_date(signal_date)
    if not parsed:
        return ""
    return add_weekdays(parsed, target_days).isoformat()


def execution_status(signal):
    execution = signal.get("execution") or {}
    return normalize_execution_status(execution.get("status"))


def primary_candidate(signal):
    for item in signal.get("candidates") or []:
        code = str(item.get("code") or "").strip()
        if code:
            return {
                "code": code,
                "name": item.get("name") or "",
                "grade": item.get("grade") or "",
                "score": item.get("totalScore"),
            }
    return {"code": "", "name": "", "grade": "", "score": None}


def checkpoint_latest_days(checkpoint):
    direct = checkpoint.get("latestTradingDays")
    if direct is not None:
        return safe_float(direct)
    nested = checkpoint.get("pending") or []
    if nested:
        return max((safe_float(item.get("latestTradingDays")) for item in nested), default=0)
    return 0


def checkpoint_result_fields(checkpoint):
    return {
        "returnPct": checkpoint.get("avgReturnPct")
        if checkpoint.get("avgReturnPct") is not None
        else checkpoint.get("returnPct"),
        "excessPct": checkpoint.get("excessPct"),
        "maxDrawdownPct": checkpoint.get("worstMaxDrawdownPct")
        if checkpoint.get("worstMaxDrawdownPct") is not None
        else checkpoint.get("maxDrawdownPct"),
        "verdict": checkpoint.get("verdict") or "",
    }


def row_priority(status, latest_days, target_days):
    if status == "done":
        return "done"
    if status == "not_applicable":
        return "not_applicable"
    if status == "error":
        return "error"
    if status == "pending" and latest_days >= target_days:
        return "due_now"
    return "waiting"


def build_rows(state):
    rows = []
    for signal in state.get("signalHistory") or []:
        candidate = primary_candidate(signal)
        signal_date = signal.get("date") or str(signal.get("time") or "")[:10]
        checkpoints = signal.get("checkpoints") or {}
        for window_key, window in WINDOWS.items():
            checkpoint = checkpoints.get(window_key) or {}
            target_days = int(checkpoint.get("targetTradingDays") or window["targetTradingDays"])
            status = checkpoint.get("status") or "pending"
            latest_days = checkpoint_latest_days(checkpoint)
            remaining_days = checkpoint.get("remainingTradingDays")
            if remaining_days is None and status == "pending":
                remaining_days = max(0, target_days - latest_days)
            estimate = checkpoint.get("estimatedReviewDate") or estimated_review_date(signal_date, target_days)
            priority = row_priority(status, latest_days, target_days)
            result = checkpoint_result_fields(checkpoint)
            rows.append(
                {
                    "signalId": signal.get("id") or "",
                    "signalDate": signal_date or "",
                    "signalStatus": signal.get("status") or "",
                    "recommendation": signal.get("recommendation") or "",
                    "executionStatus": execution_status(signal),
                    "candidate": candidate,
                    "window": window_key,
                    "windowLabel": window["label"],
                    "targetTradingDays": target_days,
                    "status": status,
                    "priority": priority,
                    "latestTradingDays": latest_days,
                    "remainingTradingDays": remaining_days,
                    "estimatedReviewDate": estimate,
                    "estimatedReviewRule": "weekday_only",
                    "reason": checkpoint.get("reason") or "",
                    **result,
                }
            )
    return rows


def summarize_rows(state, rows):
    done_by_window = {}
    pending_by_window = {}
    due_rows = [row for row in rows if row["priority"] == "due_now"]
    waiting_rows = [row for row in rows if row["priority"] == "waiting"]

    for key in WINDOWS:
        window_rows = [row for row in rows if row["window"] == key]
        done_by_window[key] = sum(1 for row in window_rows if row["status"] == "done")
        pending_by_window[key] = sum(1 for row in window_rows if row["status"] == "pending")

    execution_pending = sum(1 for signal in state.get("signalHistory") or [] if not signal_execution_recorded(signal))
    ordered = sorted(
        rows,
        key=lambda row: (
            {"due_now": 0, "waiting": 1, "error": 2, "not_applicable": 3, "done": 4}.get(row["priority"], 9),
            row.get("estimatedReviewDate") or "9999-12-31",
            row.get("signalDate") or "9999-12-31",
        ),
    )
    next_row = due_rows[0] if due_rows else waiting_rows[0] if waiting_rows else None

    return {
        "signalCount": len(state.get("signalHistory") or []),
        "rowCount": len(rows),
        "requiredSignals": 30,
        "requiredWindows": list(WINDOWS.keys()),
        "doneByWindow": done_by_window,
        "pendingByWindow": pending_by_window,
        "dueCount": len(due_rows),
        "waitingCount": len(waiting_rows),
        "executionPending": execution_pending,
        "nextDue": next_row,
        "topRows": ordered[:10],
    }


def pct(value):
    if value is None:
        return "-"
    try:
        return f"{float(value):.2f}%"
    except (TypeError, ValueError):
        return "-"


def clean_cell(value):
    return str(value if value is not None else "-").replace("\n", " ").replace("|", "/")


def priority_text(value):
    return {
        "due_now": "已到期",
        "waiting": "等待到期",
        "done": "已回看",
        "error": "数据异常",
        "not_applicable": "不适用",
    }.get(value, value or "-")


def build_markdown(report):
    summary = report["summary"]
    next_due = summary.get("nextDue") or {}
    window = lambda key: summary["doneByWindow"].get(key, 0)
    lines = [
        "# 信号回看到期表",
        "",
        f"更新时间：{report['time']}",
        "",
        "## 当前结论",
        "",
        (
            f"当前共有 {summary['signalCount']} 条正式信号、{summary['rowCount']} 个回看窗口；"
            f"已到期未处理 {summary['dueCount']} 个，待执行记录 {summary['executionPending']} 条。"
        ),
        "",
        (
            f"5日 {window('day5')}/30，20日 {window('day20')}/30，60日 {window('day60')}/30。"
            "三类回看各满 30 个结果前，不能说策略预测可信。"
        ),
        "",
        "## 下一次需要关注",
        "",
        (
            f"- {clean_cell(next_due.get('signalDate'))} 的 {clean_cell(next_due.get('windowLabel'))}回看："
            f"{priority_text(next_due.get('priority'))}，预计日期 {clean_cell(next_due.get('estimatedReviewDate'))}，"
            f"剩余交易日 {clean_cell(next_due.get('remainingTradingDays'))}。"
            if next_due
            else "- 暂无正式信号回看排期。"
        ),
        "",
        "## 排期明细",
        "",
        "| 优先级 | 信号日期 | 窗口 | 预计回看日 | 剩余交易日 | 状态 | 执行 | 主要候选 | 收益 | 超额 | 回撤 |",
        "|---|---|---|---|---:|---|---|---|---:|---:|---:|",
    ]

    top_rows = summary.get("topRows") or []
    if not top_rows:
        lines.append("| - | - | - | - | - | 暂无正式信号 | - | - | - | - | - |")
    for row in top_rows:
        candidate = row.get("candidate") or {}
        candidate_text = " ".join(
            str(part)
            for part in (candidate.get("code"), candidate.get("name"), candidate.get("grade"))
            if part
        )
        lines.append(
            "| "
            + " | ".join(
                [
                    priority_text(row.get("priority")),
                    clean_cell(row.get("signalDate")),
                    clean_cell(row.get("windowLabel")),
                    clean_cell(row.get("estimatedReviewDate")),
                    clean_cell(row.get("remainingTradingDays")),
                    clean_cell(row.get("status")),
                    clean_cell(row.get("executionStatus")),
                    clean_cell(candidate_text or "-"),
                    pct(row.get("returnPct")),
                    pct(row.get("excessPct")),
                    pct(row.get("maxDrawdownPct")),
                ]
            )
            + " |"
        )

    lines.extend(
        [
            "",
            "## 使用规则",
            "",
            "1. 已到期窗口先点击“回看信号结果”。",
            "2. 等待到期窗口不要提前判断策略准不准。",
            "3. 执行状态是“未记录”的信号，要先补执行结果；观察也要确认已观察。",
            "4. 这张表只用于实验复盘，不会自动交易。",
        ]
    )
    return "\n".join(lines) + "\n"


def build_report(state):
    rows = build_rows(state)
    summary = summarize_rows(state, rows)
    return {
        "ok": True,
        "time": now_text(),
        "summary": summary,
        "rows": rows,
        "boundary": "未达到 30 条信号、8 周、执行完整和 5/20/60 三类回看各满 30 个结果前，不能说策略可信。",
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    state = load_state()
    report = build_report(state)
    body = build_markdown(report)

    if not args.dry_run:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        JSON_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        MD_PATH.write_text(body, encoding="utf-8")
        state["signalMaturitySchedule"] = report
        runs = state.get("signalMaturityScheduleRuns") or []
        runs.insert(
            0,
            {
                "time": report["time"],
                "signalCount": report["summary"]["signalCount"],
                "rowCount": report["summary"]["rowCount"],
                "dueCount": report["summary"]["dueCount"],
                "waitingCount": report["summary"]["waitingCount"],
                "executionPending": report["summary"]["executionPending"],
                "nextDue": report["summary"].get("nextDue"),
            },
        )
        state["signalMaturityScheduleRuns"] = runs[:50]
        save_state(state)

    print(
        json.dumps(
            {
                "ok": True,
                "written": [] if args.dry_run else [str(JSON_PATH), str(MD_PATH)],
                **report["summary"],
                "report": report,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
