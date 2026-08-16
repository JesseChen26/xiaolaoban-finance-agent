import argparse
import csv
import json
import os
from datetime import datetime
from pathlib import Path

from build_maturity_schedule import WINDOWS, estimated_review_date
from execution_status import normalize_execution_action, signal_execution_recorded, signal_execution_status
from state_store import save_json_atomic


ROOT = Path(__file__).resolve().parents[1]
STATE_PATH_OVERRIDE = os.environ.get("STATE_PATH_OVERRIDE")
STATE_PATH = Path(STATE_PATH_OVERRIDE or ROOT / "data" / "state.json")
OUTPUT_DIR = STATE_PATH.parent if STATE_PATH_OVERRIDE else ROOT / "data"
JSON_PATH = OUTPUT_DIR / "signal_history_export.json"
CSV_PATH = OUTPUT_DIR / "signal_history_export.csv"
MD_PATH = OUTPUT_DIR / "signal_history_export.md"


def now_text():
    return datetime.now().replace(microsecond=0).isoformat()


def load_state():
    with STATE_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def save_state(state):
    save_json_atomic(STATE_PATH, state)


def safe_text(value):
    return str(value if value is not None else "").replace("\n", " ").strip()


def value_or_empty(value):
    return "" if value is None else value


def pct_value(checkpoint, *keys):
    for key in keys:
        if checkpoint.get(key) is not None:
            return checkpoint.get(key)
    return ""


def top_candidate(signal):
    candidates = signal.get("candidates") or []
    if not candidates:
        return {}
    return candidates[0] or {}


def candidate_pool_text(signal, limit=5):
    parts = []
    for item in (signal.get("candidates") or [])[:limit]:
        code = safe_text(item.get("code"))
        name = safe_text(item.get("name"))
        grade = safe_text(item.get("grade"))
        score = value_or_empty(item.get("totalScore"))
        status = safe_text(item.get("status") or item.get("statusAtSignal"))
        parts.append(" ".join(str(part) for part in (code, name, grade, score, status) if part != ""))
    return "；".join(parts)


def manual_order_text(signal):
    checklist = (signal.get("manualOrderChecklist") or {}).get("items") or []
    if not checklist:
        checklist = ((signal.get("operationPlan") or {}).get("manualOrderChecklist") or {}).get("items") or []
    parts = []
    for item in checklist:
        title = safe_text(item.get("title"))
        action = safe_text(item.get("action") or item.get("side") or item.get("status"))
        code = safe_text(item.get("code"))
        amount = value_or_empty(item.get("estimatedAmount"))
        parts.append(" ".join(str(part) for part in (title, action, code, amount) if part != ""))
    return "；".join(parts)


def checkpoint_fields(signal, key):
    checkpoint = (signal.get("checkpoints") or {}).get(key) or {}
    target_days = int(checkpoint.get("targetTradingDays") or WINDOWS[key]["targetTradingDays"])
    signal_date = signal.get("date") or safe_text(signal.get("time"))[:10]
    return {
        f"{key}Status": checkpoint.get("status") or "",
        f"{key}EstimatedReviewDate": checkpoint.get("estimatedReviewDate") or estimated_review_date(signal_date, target_days),
        f"{key}LatestTradingDays": value_or_empty(checkpoint.get("latestTradingDays")),
        f"{key}RemainingTradingDays": value_or_empty(checkpoint.get("remainingTradingDays")),
        f"{key}ReturnPct": pct_value(checkpoint, "avgReturnPct", "returnPct"),
        f"{key}BenchmarkReturnPct": value_or_empty(checkpoint.get("benchmarkReturnPct")),
        f"{key}ExcessPct": value_or_empty(checkpoint.get("excessPct")),
        f"{key}MaxDrawdownPct": pct_value(checkpoint, "worstMaxDrawdownPct", "maxDrawdownPct"),
        f"{key}Verdict": checkpoint.get("verdict") or "",
        f"{key}Reason": checkpoint.get("reason") or "",
    }


def build_rows(state):
    rows = []
    for index, signal in enumerate(state.get("signalHistory") or [], start=1):
        execution = signal.get("execution") or {}
        candidate = top_candidate(signal)
        row = {
            "sampleNo": index,
            "signalId": signal.get("id") or "",
            "signalDate": signal.get("date") or "",
            "recordedAt": signal.get("time") or "",
            "signalStatus": signal.get("status") or "",
            "recommendation": signal.get("recommendation") or "",
            "reason": signal.get("reason") or "",
            "marketValue": value_or_empty(signal.get("marketValue")),
            "pnl": value_or_empty(signal.get("pnl")),
            "pnlPct": value_or_empty(signal.get("pnlPct")),
            "executionRecorded": signal_execution_recorded(signal),
            "executionStatus": signal_execution_status(signal),
            "executionAction": normalize_execution_action(execution.get("action")),
            "executionDate": execution.get("date") or "",
            "executionCode": execution.get("code") or "",
            "executionPrice": value_or_empty(execution.get("price")),
            "executionAmountYuan": value_or_empty(execution.get("amountYuan")),
            "executionQuantity": value_or_empty(execution.get("quantity")),
            "executionNotes": execution.get("notes") or "",
            "executionSavedAt": execution.get("savedAt") or "",
            "topCandidateCode": candidate.get("code") or "",
            "topCandidateName": candidate.get("name") or "",
            "topCandidateGrade": candidate.get("grade") or "",
            "topCandidateScore": value_or_empty(candidate.get("totalScore")),
            "topCandidateStatus": candidate.get("status") or candidate.get("statusAtSignal") or "",
            "candidatePool": candidate_pool_text(signal),
            "manualOrders": manual_order_text(signal),
        }
        for key in WINDOWS:
            row.update(checkpoint_fields(signal, key))
        rows.append(row)
    return rows


CSV_COLUMNS = [
    "sampleNo",
    "signalId",
    "signalDate",
    "recordedAt",
    "signalStatus",
    "recommendation",
    "reason",
    "marketValue",
    "pnl",
    "pnlPct",
    "executionRecorded",
    "executionStatus",
    "executionAction",
    "executionDate",
    "executionCode",
    "executionPrice",
    "executionAmountYuan",
    "executionQuantity",
    "executionNotes",
    "executionSavedAt",
    "topCandidateCode",
    "topCandidateName",
    "topCandidateGrade",
    "topCandidateScore",
    "topCandidateStatus",
    "candidatePool",
    "manualOrders",
]

for window_key in WINDOWS:
    CSV_COLUMNS.extend(
        [
            f"{window_key}Status",
            f"{window_key}EstimatedReviewDate",
            f"{window_key}LatestTradingDays",
            f"{window_key}RemainingTradingDays",
            f"{window_key}ReturnPct",
            f"{window_key}BenchmarkReturnPct",
            f"{window_key}ExcessPct",
            f"{window_key}MaxDrawdownPct",
            f"{window_key}Verdict",
            f"{window_key}Reason",
        ]
    )


def summarize(rows):
    done_by_window = {}
    pending_by_window = {}
    for key in WINDOWS:
        done_by_window[key] = sum(1 for row in rows if row.get(f"{key}Status") == "done")
        pending_by_window[key] = sum(1 for row in rows if row.get(f"{key}Status") == "pending")
    recorded = sum(1 for row in rows if row.get("executionRecorded"))
    return {
        "signalCount": len(rows),
        "exportedRowCount": len(rows),
        "executionRecorded": recorded,
        "executionPending": max(0, len(rows) - recorded),
        "doneByWindow": done_by_window,
        "pendingByWindow": pending_by_window,
    }


def write_csv(rows):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with CSV_PATH.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=CSV_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def clean_cell(value):
    return safe_text(value).replace("|", "/") or "-"


def build_markdown(report):
    summary = report["summary"]
    lines = [
        "# 信号历史导出",
        "",
        f"导出时间：{report['time']}",
        "",
        "## 汇总",
        "",
        f"- 正式信号：{summary['signalCount']} 条。",
        f"- 执行记录：已补 {summary['executionRecorded']} 条，待补 {summary['executionPending']} 条。",
        (
            f"- 回看窗口：5日 {summary['doneByWindow']['day5']}/30，"
            f"20日 {summary['doneByWindow']['day20']}/30，"
            f"60日 {summary['doneByWindow']['day60']}/30。"
        ),
        "",
        "## 明细",
        "",
        "| 序号 | 日期 | 状态 | 建议 | 执行 | 首位候选 | 5日 | 20日 | 60日 |",
        "|---:|---|---|---|---|---|---|---|---|",
    ]
    for row in report["rows"][:50]:
        lines.append(
            "| "
            + " | ".join(
                [
                    clean_cell(row.get("sampleNo")),
                    clean_cell(row.get("signalDate")),
                    clean_cell(row.get("signalStatus")),
                    clean_cell(row.get("recommendation")),
                    clean_cell(row.get("executionStatus")),
                    clean_cell(" ".join(part for part in (row.get("topCandidateCode"), row.get("topCandidateName"), row.get("topCandidateGrade")) if part)),
                    clean_cell(row.get("day5Status")),
                    clean_cell(row.get("day20Status")),
                    clean_cell(row.get("day60Status")),
                ]
            )
            + " |"
        )
    if not report["rows"]:
        lines.append("| - | - | - | 暂无正式信号 | - | - | - | - | - |")
    lines.extend(
        [
            "",
            "## 说明",
            "",
            "这份导出只整理已保存的正式信号，不新增信号，不修改执行记录，也不代表策略已经可信。",
        ]
    )
    return "\n".join(lines) + "\n"


def build_report(state):
    rows = build_rows(state)
    summary = summarize(rows)
    return {
        "ok": True,
        "time": now_text(),
        "summary": summary,
        "columns": CSV_COLUMNS,
        "rows": rows,
        "files": {
            "json": str(JSON_PATH),
            "csv": str(CSV_PATH),
            "markdown": str(MD_PATH),
        },
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    state = load_state()
    report = build_report(state)

    if not args.dry_run:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        JSON_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        write_csv(report["rows"])
        MD_PATH.write_text(build_markdown(report), encoding="utf-8")
        state["signalHistoryExport"] = {
            "time": report["time"],
            "summary": report["summary"],
            "files": report["files"],
        }
        runs = state.get("signalHistoryExportRuns") or []
        runs.insert(0, state["signalHistoryExport"])
        state["signalHistoryExportRuns"] = runs[:50]
        save_state(state)

    print(
        json.dumps(
            {
                "ok": True,
                "written": [] if args.dry_run else [str(JSON_PATH), str(CSV_PATH), str(MD_PATH)],
                **report["summary"],
                "report": report,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
