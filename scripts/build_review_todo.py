import argparse
import json
import os
from datetime import datetime
from pathlib import Path

from build_maturity_schedule import build_report as build_maturity_report
from state_store import save_json_atomic


ROOT = Path(__file__).resolve().parents[1]
STATE_PATH_OVERRIDE = os.environ.get("STATE_PATH_OVERRIDE")
STATE_PATH = Path(STATE_PATH_OVERRIDE or ROOT / "data" / "state.json")
OUTPUT_DIR = STATE_PATH.parent if STATE_PATH_OVERRIDE else ROOT / "data"
JSON_PATH = OUTPUT_DIR / "review_todo.json"
MD_PATH = OUTPUT_DIR / "review_todo.md"
SOON_TRADING_DAYS = 3


def now_text():
    return datetime.now().replace(microsecond=0).isoformat()


def load_state():
    with STATE_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def save_state(state):
    save_json_atomic(STATE_PATH, state)


def row_rank(row):
    priority_order = {"due_now": 0, "soon": 1, "waiting": 2, "error": 3, "not_applicable": 4, "done": 5}
    return (
        priority_order.get(row.get("todoPriority") or row.get("priority"), 9),
        row.get("estimatedReviewDate") or "9999-12-31",
        row.get("signalDate") or "9999-12-31",
    )


def enrich_row(row):
    enriched = dict(row)
    priority = row.get("priority")
    remaining = row.get("remainingTradingDays")
    try:
        remaining_number = float(remaining)
    except (TypeError, ValueError):
        remaining_number = None

    if priority == "due_now":
        todo_priority = "due_now"
        action = "今天先点击“回看信号结果”，把这个窗口写入真实结果。"
    elif priority == "waiting" and remaining_number is not None and remaining_number <= SOON_TRADING_DAYS:
        todo_priority = "soon"
        action = "快到期，保持排期提醒；到期当天点击“回看信号结果”。"
    elif priority == "waiting":
        todo_priority = "waiting"
        action = "继续等待真实交易日，不提前判断策略准不准。"
    elif priority == "done":
        todo_priority = "done"
        action = "已回看，保留样本结果。"
    else:
        todo_priority = priority or "unknown"
        action = "先复核该窗口的数据状态。"

    enriched["todoPriority"] = todo_priority
    enriched["todoAction"] = action
    return enriched


def build_report(state):
    maturity = build_maturity_report(state)
    rows = [enrich_row(row) for row in maturity.get("rows") or []]
    rows = sorted(rows, key=row_rank)

    due = [row for row in rows if row.get("todoPriority") == "due_now"]
    soon = [row for row in rows if row.get("todoPriority") == "soon"]
    waiting = [row for row in rows if row.get("todoPriority") == "waiting"]
    done = [row for row in rows if row.get("todoPriority") == "done"]
    errors = [row for row in rows if row.get("todoPriority") == "error"]
    next_item = (due or soon or waiting or errors or [None])[0]

    if due:
        phase = "需要回看"
        level = "warn"
        primary_action = "运行到期回看"
    elif soon:
        phase = "即将到期"
        level = "warn"
        primary_action = "准备回看"
    elif waiting:
        phase = "等待到期"
        level = "ok"
        primary_action = "继续等待"
    elif rows:
        phase = "已完成当前回看"
        level = "ok"
        primary_action = "继续积累信号"
    else:
        phase = "暂无样本"
        level = "warn"
        primary_action = "先积累正式信号"

    summary = {
        "signalCount": maturity.get("summary", {}).get("signalCount", 0),
        "rowCount": len(rows),
        "dueCount": len(due),
        "soonCount": len(soon),
        "waitingCount": len(waiting),
        "doneCount": len(done),
        "errorCount": len(errors),
        "nextItem": next_item,
        "primaryAction": primary_action,
        "soonThresholdTradingDays": SOON_TRADING_DAYS,
    }

    return {
        "ok": True,
        "time": now_text(),
        "phase": phase,
        "level": level,
        "summary": summary,
        "items": rows[:50],
        "dueItems": due[:20],
        "soonItems": soon[:20],
        "waitingItems": waiting[:20],
        "boundary": "回看待办只提醒复盘，不自动交易；未到期窗口不能提前拿来证明策略准确。",
    }


def clean_cell(value):
    return str(value if value is not None else "-").replace("\n", " ").replace("|", "/")


def item_label(item):
    candidate = item.get("candidate") or {}
    return " ".join(str(part) for part in (candidate.get("code"), candidate.get("name")) if part) or "-"


def build_markdown(report):
    summary = report["summary"]
    next_item = summary.get("nextItem") or {}
    lines = [
        "# 回看待办",
        "",
        f"更新时间：{report['time']}",
        "",
        "## 当前结论",
        "",
        (
            f"阶段：{report['phase']}；已到期 {summary['dueCount']} 个，"
            f"快到期 {summary['soonCount']} 个，等待 {summary['waitingCount']} 个，已回看 {summary['doneCount']} 个。"
        ),
        "",
        "## 下一件事",
        "",
        (
            f"- {clean_cell(next_item.get('signalDate'))} 的 {clean_cell(next_item.get('windowLabel'))}回看；"
            f"预计 {clean_cell(next_item.get('estimatedReviewDate'))}；"
            f"剩余 {clean_cell(next_item.get('remainingTradingDays'))} 个交易日；"
            f"{clean_cell(next_item.get('todoAction'))}"
            if next_item
            else "- 先积累正式信号。"
        ),
        "",
        "## 待办明细",
        "",
        "| 优先级 | 信号日期 | 窗口 | 预计回看日 | 剩余交易日 | 执行 | 主要候选 | 动作 |",
        "|---|---|---|---|---:|---|---|---|",
    ]
    if not report["items"]:
        lines.append("| - | - | - | - | - | - | - | 暂无正式信号 |")
    for item in report["items"][:20]:
        lines.append(
            "| "
            + " | ".join(
                [
                    clean_cell(item.get("todoPriority")),
                    clean_cell(item.get("signalDate")),
                    clean_cell(item.get("windowLabel")),
                    clean_cell(item.get("estimatedReviewDate")),
                    clean_cell(item.get("remainingTradingDays")),
                    clean_cell(item.get("executionStatus")),
                    clean_cell(item_label(item)),
                    clean_cell(item.get("todoAction")),
                ]
            )
            + " |"
        )
    lines.extend(["", "## 边界", "", report["boundary"]])
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    state = load_state()
    report = build_report(state)

    if not args.dry_run:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        JSON_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        MD_PATH.write_text(build_markdown(report), encoding="utf-8")
        state["reviewTodoReport"] = report
        runs = state.get("reviewTodoRuns") or []
        runs.insert(
            0,
            {
                "time": report["time"],
                "phase": report["phase"],
                "level": report["level"],
                **report["summary"],
            },
        )
        state["reviewTodoRuns"] = runs[:50]
        save_state(state)

    print(
        json.dumps(
            {
                "ok": True,
                "written": [] if args.dry_run else [str(JSON_PATH), str(MD_PATH)],
                "phase": report["phase"],
                "level": report["level"],
                **report["summary"],
                "report": report,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
