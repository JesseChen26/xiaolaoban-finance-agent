import argparse
import hashlib
import json
import os
from datetime import datetime
from pathlib import Path

from execution_status import normalize_execution_status
from state_store import save_json_atomic


ROOT = Path(__file__).resolve().parents[1]
STATE_PATH_OVERRIDE = os.environ.get("STATE_PATH_OVERRIDE")
STATE_PATH = Path(STATE_PATH_OVERRIDE or ROOT / "data" / "state.json")
OUTPUT_DIR = STATE_PATH.parent if STATE_PATH_OVERRIDE else ROOT / "data"
JSON_PATH = OUTPUT_DIR / "signal_integrity_audit.json"
MD_PATH = OUTPUT_DIR / "signal_integrity_audit.md"

REQUIRED_SIGNAL_FIELDS = ("id", "date", "time", "status", "recommendation", "reason", "actionHash")
REQUIRED_CHECKPOINTS = ("day5", "day20", "day60")


def now_text():
    return datetime.now().replace(microsecond=0).isoformat()


def load_state():
    with STATE_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def save_state(state):
    save_json_atomic(STATE_PATH, state)


def canonical_payload(signal):
    return {
        "id": signal.get("id"),
        "date": signal.get("date"),
        "time": signal.get("time"),
        "status": signal.get("status"),
        "recommendation": signal.get("recommendation"),
        "reason": signal.get("reason"),
        "actionHash": signal.get("actionHash"),
        "execution": signal.get("execution") or {},
        "checkpoints": signal.get("checkpoints") or {},
        "candidates": [
            {
                "code": item.get("code"),
                "name": item.get("name"),
                "grade": item.get("grade"),
                "totalScore": item.get("totalScore"),
                "status": item.get("status") or item.get("statusAtSignal"),
            }
            for item in (signal.get("candidates") or [])[:10]
        ],
    }


def signal_digest(signal):
    text = json.dumps(canonical_payload(signal), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def issue(kind, level, signal_id="", message="", detail=None):
    return {
        "kind": kind,
        "level": level,
        "signalId": signal_id,
        "message": message,
        "detail": detail or {},
    }


def current_signal_records(signals):
    records = {}
    duplicates = []
    for index, signal in enumerate(signals or []):
        signal_id = str(signal.get("id") or "").strip()
        if not signal_id:
            continue
        digest = signal_digest(signal)
        record = {
            "id": signal_id,
            "date": signal.get("date") or "",
            "status": signal.get("status") or "",
            "recommendation": signal.get("recommendation") or "",
            "digest": digest,
            "lastSeenAt": now_text(),
            "sampleIndex": index + 1,
        }
        if signal_id in records:
            duplicates.append(signal_id)
        records[signal_id] = record
    return records, duplicates


def duplicate_trading_day_issues(signals):
    by_date = {}
    for signal in signals or []:
        signal_date = str(signal.get("date") or "").strip()
        if not signal_date:
            continue
        by_date.setdefault(signal_date, []).append(str(signal.get("id") or "").strip() or "-")

    problems = []
    for signal_date, signal_ids in sorted(by_date.items()):
        if len(signal_ids) <= 1:
            continue
        problems.append(
            issue(
                "duplicate_trading_day",
                "danger",
                signal_ids[0],
                f"{signal_date} 出现 {len(signal_ids)} 条正式信号；同一交易日只能保留一条",
                {"date": signal_date, "signalIds": signal_ids},
            )
        )
    return problems


def validate_signal_shape(signal):
    problems = []
    signal_id = str(signal.get("id") or "").strip()
    for field in REQUIRED_SIGNAL_FIELDS:
        if signal.get(field) in (None, ""):
            problems.append(issue("missing_field", "warn", signal_id, f"信号缺少字段 {field}", {"field": field}))

    execution_status = normalize_execution_status((signal.get("execution") or {}).get("status"))
    if execution_status == "未记录":
        problems.append(issue("execution_pending", "warn", signal_id, "执行记录仍未补", {"status": execution_status}))

    checkpoints = signal.get("checkpoints") or {}
    for key in REQUIRED_CHECKPOINTS:
        checkpoint = checkpoints.get(key) or {}
        if not checkpoint:
            problems.append(issue("missing_checkpoint", "warn", signal_id, f"缺少 {key} 回看窗口", {"window": key}))
            continue
        if not checkpoint.get("status"):
            problems.append(issue("checkpoint_missing_status", "warn", signal_id, f"{key} 回看窗口缺少状态", {"window": key}))
    return problems


def build_audit(state):
    signals = state.get("signalHistory") or []
    previous_known = state.get("signalIntegrityKnownSignals") or {}
    current_records, duplicate_ids = current_signal_records(signals)
    current_ids = set(current_records)
    known_ids = set(previous_known)

    issues = []
    for duplicate_id in duplicate_ids:
        issues.append(issue("duplicate_id", "danger", duplicate_id, "同一个信号 ID 出现重复", {}))
    issues.extend(duplicate_trading_day_issues(signals))

    for missing_id in sorted(known_ids - current_ids):
        known = previous_known.get(missing_id) or {}
        issues.append(
            issue(
                "known_signal_missing",
                "danger",
                missing_id,
                "曾经出现过的正式信号从 signalHistory 消失，需复核是否误删失败样本",
                {"lastKnownDate": known.get("date"), "lastKnownDigest": known.get("digest")},
            )
        )

    for signal in signals:
        issues.extend(validate_signal_shape(signal))

    danger_count = sum(1 for item in issues if item["level"] == "danger")
    warn_count = sum(1 for item in issues if item["level"] == "warn")
    level = "danger" if danger_count else "warn" if warn_count else "ok"
    phase = "样本异常" if danger_count else "待补执行" if warn_count else "完整"

    merged_known = dict(previous_known)
    for signal_id, record in current_records.items():
        previous = merged_known.get(signal_id) or {}
        merged_known[signal_id] = {
            **previous,
            **record,
            "firstSeenAt": previous.get("firstSeenAt") or now_text(),
        }

    audit = {
        "ok": danger_count == 0,
        "time": now_text(),
        "phase": phase,
        "level": level,
        "signalCount": len(signals),
        "knownSignalCount": len(merged_known),
        "duplicateIdCount": len(duplicate_ids),
        "duplicateTradingDayCount": sum(1 for item in issues if item["kind"] == "duplicate_trading_day"),
        "missingKnownSignalCount": len(known_ids - current_ids),
        "warningCount": warn_count,
        "dangerCount": danger_count,
        "issues": issues[:50],
        "currentDigests": current_records,
        "boundary": "正式信号和失败样本都不能删除；若已知信号消失，必须先复核状态文件或备份。",
    }
    return audit, merged_known


def build_markdown(audit):
    lines = [
        "# 信号样本完整性审计",
        "",
        f"审计时间：{audit['time']}",
        "",
        "## 当前结论",
        "",
        f"阶段：{audit['phase']}；正式信号 {audit['signalCount']} 条；已知信号 {audit['knownSignalCount']} 条。",
        "",
        (
            f"重复 ID {audit['duplicateIdCount']} 个；重复交易日 {audit.get('duplicateTradingDayCount', 0)} 个；"
            f"已知信号消失 {audit['missingKnownSignalCount']} 个；"
            f"警告 {audit['warningCount']} 个；危险 {audit['dangerCount']} 个。"
        ),
        "",
        "## 问题明细",
        "",
        "| 级别 | 类型 | 信号 ID | 说明 |",
        "|---|---|---|---|",
    ]
    if not audit["issues"]:
        lines.append("| ok | - | - | 当前没有发现样本完整性问题 |")
    for item in audit["issues"]:
        lines.append(
            "| "
            + " | ".join(
                [
                    str(item.get("level") or "-"),
                    str(item.get("kind") or "-"),
                    str(item.get("signalId") or "-"),
                    str(item.get("message") or "-").replace("|", "/"),
                ]
            )
            + " |"
        )
    lines.extend(
        [
            "",
            "## 边界",
            "",
            audit["boundary"],
        ]
    )
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    state = load_state()
    audit, known_signals = build_audit(state)

    if not args.dry_run:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        JSON_PATH.write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8")
        MD_PATH.write_text(build_markdown(audit), encoding="utf-8")
        state["signalIntegrityAudit"] = audit
        state["signalIntegrityKnownSignals"] = known_signals
        runs = state.get("signalIntegrityRuns") or []
        runs.insert(
            0,
            {
                "time": audit["time"],
                "phase": audit["phase"],
                "level": audit["level"],
                "signalCount": audit["signalCount"],
                "knownSignalCount": audit["knownSignalCount"],
                "warningCount": audit["warningCount"],
                "dangerCount": audit["dangerCount"],
                "duplicateTradingDayCount": audit["duplicateTradingDayCount"],
                "missingKnownSignalCount": audit["missingKnownSignalCount"],
            },
        )
        state["signalIntegrityRuns"] = runs[:50]
        save_state(state)

    print(
        json.dumps(
            {
                "ok": audit["ok"],
                "written": [] if args.dry_run else [str(JSON_PATH), str(MD_PATH)],
                **{key: audit[key] for key in ("phase", "level", "signalCount", "knownSignalCount", "warningCount", "dangerCount", "duplicateTradingDayCount", "missingKnownSignalCount")},
                "audit": audit,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
