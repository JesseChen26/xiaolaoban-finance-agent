import argparse
import json
import math
import os
from datetime import datetime
from pathlib import Path

from execution_status import signal_execution_recorded
from record_signal import parse_date, safe_float
from state_store import save_json_atomic


ROOT = Path(__file__).resolve().parents[1]
STATE_PATH_OVERRIDE = os.environ.get("STATE_PATH_OVERRIDE")
STATE_PATH = Path(STATE_PATH_OVERRIDE or ROOT / "data" / "state.json")
OUTPUT_DIR = STATE_PATH.parent if STATE_PATH_OVERRIDE else ROOT / "data"
JSON_PATH = OUTPUT_DIR / "credibility_report.json"
MD_PATH = OUTPUT_DIR / "credibility_report.md"
REQUIRED_SIGNALS = 30
REQUIRED_WEEKS = 8
REQUIRED_REVIEW_WINDOWS = ("day5", "day20", "day60")


def now_text():
    return datetime.now().replace(microsecond=0).isoformat()


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


def execution_summary(signals):
    total = len(signals or [])
    recorded = sum(1 for signal in signals or [] if signal_execution_recorded(signal))
    return {
        "totalSignals": total,
        "recorded": recorded,
        "pending": max(0, total - recorded),
        "coveragePct": round(recorded / total * 100, 2) if total else None,
    }


def validation_window_status(validation, required_signals=REQUIRED_SIGNALS):
    by_window = validation.get("byWindow") or {}
    done = {}
    total = {}
    missing = []
    for key in REQUIRED_REVIEW_WINDOWS:
        item = by_window.get(key) or {}
        done[key] = int(safe_float(item.get("done")))
        total[key] = int(safe_float(item.get("total")))
        if done[key] < required_signals:
            missing.append(key)
    return {
        "done": done,
        "total": total,
        "required": required_signals,
        "complete": not missing,
        "missing": missing,
    }


def window_label(key):
    return {"day5": "5日", "day20": "20日", "day60": "60日"}.get(key, key)


def estimate_success_count(validation):
    done = int(safe_float(validation.get("doneCheckpoints")))
    success = int(safe_float(validation.get("successCheckpoints")))
    if success:
        return success, done

    by_window = validation.get("byWindow") or {}
    estimated_success = 0
    estimated_done = 0
    for item in by_window.values():
        window_done = int(safe_float(item.get("done")))
        win_rate = item.get("winRatePct")
        if window_done <= 0:
            continue
        estimated_done += window_done
        if win_rate is not None:
            estimated_success += round(window_done * safe_float(win_rate) / 100)
    return estimated_success, done or estimated_done


def wilson_lower_bound(success, total, confidence=0.95):
    if total <= 0:
        return None
    z = 1.96 if confidence == 0.95 else 1.96
    p = success / total
    denominator = 1 + z * z / total
    centre = p + z * z / (2 * total)
    margin = z * math.sqrt((p * (1 - p) + z * z / (4 * total)) / total)
    return max(0, (centre - margin) / denominator) * 100


def build_checks(state, validation, execution, weeks, window_status):
    signals = state.get("signalHistory") or []
    settings = state.get("settings") or {}
    checks = []

    def add(key, title, ok, status, detail, level=None):
        checks.append({
            "key": key,
            "title": title,
            "ok": bool(ok),
            "status": status,
            "detail": detail,
            "level": level or ("ok" if ok else "warn"),
        })

    add(
        "formal_recording",
        "正式样本记录",
        bool(settings.get("formalSignalRecording")),
        "已开启" if settings.get("formalSignalRecording") else "未开启",
        "只有正式样本记录开启后，信号才进入可信度验证。",
    )
    add(
        "signal_count",
        "正式信号数量",
        len(signals) >= REQUIRED_SIGNALS,
        f"{len(signals)}/{REQUIRED_SIGNALS}",
        f"还差 {max(0, REQUIRED_SIGNALS - len(signals))} 条正式信号。",
    )
    add(
        "recorded_weeks",
        "记录周期",
        weeks >= REQUIRED_WEEKS,
        f"{weeks}/{REQUIRED_WEEKS}",
        f"还差 {max(0, REQUIRED_WEEKS - weeks)} 周记录。",
    )
    add(
        "execution",
        "执行记录覆盖",
        execution["pending"] == 0,
        f"{execution['recorded']}/{execution['totalSignals']}",
        f"还有 {execution['pending']} 条信号没有补执行结果。",
    )
    missing_windows = "、".join(window_label(key) for key in window_status["missing"])
    add(
        "review_windows",
        "5/20/60 回看",
        window_status["complete"],
        f"5日 {window_status['done']['day5']}/{REQUIRED_SIGNALS}，20日 {window_status['done']['day20']}/{REQUIRED_SIGNALS}，60日 {window_status['done']['day60']}/{REQUIRED_SIGNALS}",
        f"未完成窗口：{missing_windows or '无'}。",
    )
    return checks


def build_report(state):
    signals = state.get("signalHistory") or []
    validation = state.get("signalValidation") or {}
    settings = state.get("settings") or {}
    execution = execution_summary(signals)
    weeks = recorded_week_count(signals)
    window_status = validation_window_status(validation)
    checks = build_checks(state, validation, execution, weeks, window_status)
    blockers = [item for item in checks if not item["ok"]]

    success, done = estimate_success_count(validation)
    wilson_lower = wilson_lower_bound(success, done)
    avg_excess = validation.get("avgExcessPct")
    avg_return = validation.get("avgReturnPct")
    worst_drawdown = validation.get("worstMaxDrawdownPct")
    stop_loss = safe_float(settings.get("stopLoss") or 20) or 20
    risk_floor = -abs(stop_loss)
    enough_to_evaluate = not blockers
    positive_excess = avg_excess is not None and safe_float(avg_excess) > 0
    risk_ok = worst_drawdown is None or safe_float(worst_drawdown) >= risk_floor
    can_claim_positive_edge = enough_to_evaluate and positive_excess and risk_ok

    if not enough_to_evaluate:
        verdict = "不可评估"
        phase = "样本积累中"
        level = "warn"
        conclusion = "当前只能做实验记录和流程复盘，不能说策略准确或可盈利。"
    elif not positive_excess:
        verdict = "未跑赢基准"
        phase = "可评估但未通过"
        level = "danger"
        conclusion = "样本门槛已满足，但平均超额收益没有为正，不能认为策略有优势。"
    elif not risk_ok:
        verdict = "风险超限"
        phase = "可评估但需降风险"
        level = "danger"
        conclusion = f"平均超额为正，但最差回撤超过 {stop_loss:.2f}% 风控线，不能扩大资金。"
    else:
        verdict = "可初步评估"
        phase = "小资金继续验证"
        level = "ok"
        conclusion = "样本门槛已满足且平均超额为正，可写阶段复盘，但仍只适合小资金继续验证。"

    metrics = {
        "signalCount": len(signals),
        "recordedWeeks": weeks,
        "execution": execution,
        "reviewWindows": window_status,
        "doneCheckpoints": int(safe_float(validation.get("doneCheckpoints"))),
        "successCheckpoints": success,
        "overallWinRatePct": validation.get("overallWinRatePct")
        if validation.get("overallWinRatePct") is not None
        else round(success / done * 100, 2) if done else None,
        "wilsonLowerPct": round(wilson_lower, 2) if wilson_lower is not None else None,
        "avgReturnPct": avg_return,
        "avgExcessPct": avg_excess,
        "worstMaxDrawdownPct": worst_drawdown,
        "riskFloorPct": risk_floor,
        "benchmark": validation.get("benchmark") or {"code": "510300", "name": "沪深300ETF"},
    }

    next_actions = []
    if blockers:
        for item in blockers[:5]:
            next_actions.append(f"{item['title']}：{item['detail']}")
    elif not can_claim_positive_edge:
        next_actions.append("写阶段复盘，保持 200 元试验仓，不扩大资金。")
    else:
        next_actions.append("写阶段复盘；继续小资金验证，观察后续样本是否保持正超额。")

    return {
        "ok": True,
        "time": now_text(),
        "verdict": verdict,
        "phase": phase,
        "level": level,
        "canClaimCredible": enough_to_evaluate,
        "canClaimPositiveEdge": can_claim_positive_edge,
        "conclusion": conclusion,
        "checks": checks,
        "blockers": blockers,
        "blockerCount": len(blockers),
        "metrics": metrics,
        "nextActions": next_actions,
        "boundary": "这份报告只判定实验信号是否达到可评估门槛，不构成投资建议；未达门槛前不能说策略准确，也不能扩大资金。",
    }


def pct(value):
    if value is None:
        return "-"
    try:
        return f"{float(value):.2f}%"
    except (TypeError, ValueError):
        return "-"


def build_markdown(report):
    metrics = report["metrics"]
    windows = metrics["reviewWindows"]
    lines = [
        "# 可信度判定报告",
        "",
        f"更新时间：{report['time']}",
        "",
        "## 当前结论",
        "",
        f"- 判定：{report['verdict']}（{report['phase']}）。",
        f"- 结论：{report['conclusion']}",
        f"- 边界：{report['boundary']}",
        "",
        "## 核心指标",
        "",
        f"- 正式信号：{metrics['signalCount']}/{REQUIRED_SIGNALS}。",
        f"- 记录周期：{metrics['recordedWeeks']}/{REQUIRED_WEEKS} 周。",
        f"- 执行覆盖：{metrics['execution']['recorded']}/{metrics['execution']['totalSignals']}，待补 {metrics['execution']['pending']}。",
        f"- 回看窗口：5日 {windows['done']['day5']}/{REQUIRED_SIGNALS}，20日 {windows['done']['day20']}/{REQUIRED_SIGNALS}，60日 {windows['done']['day60']}/{REQUIRED_SIGNALS}。",
        f"- 胜率：{pct(metrics['overallWinRatePct'])}；Wilson 95% 下界：{pct(metrics['wilsonLowerPct'])}。",
        f"- 平均收益：{pct(metrics['avgReturnPct'])}；平均超额：{pct(metrics['avgExcessPct'])}；最差回撤：{pct(metrics['worstMaxDrawdownPct'])}。",
        "",
        "## 检查项",
        "",
        "| 项目 | 状态 | 说明 |",
        "|---|---|---|",
    ]
    for item in report["checks"]:
        lines.append(f"| {item['title']} | {item['status']} | {item['detail']} |")
    lines.extend(["", "## 下一步", ""])
    for action in report["nextActions"]:
        lines.append(f"- {action}")
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
        state["credibilityReport"] = report
        runs = state.get("credibilityRuns") or []
        runs.insert(
            0,
            {
                "time": report["time"],
                "verdict": report["verdict"],
                "phase": report["phase"],
                "level": report["level"],
                "canClaimCredible": report["canClaimCredible"],
                "canClaimPositiveEdge": report["canClaimPositiveEdge"],
                "blockerCount": report["blockerCount"],
                "signalCount": report["metrics"]["signalCount"],
                "avgExcessPct": report["metrics"]["avgExcessPct"],
                "worstMaxDrawdownPct": report["metrics"]["worstMaxDrawdownPct"],
            },
        )
        state["credibilityRuns"] = runs[:50]
        save_state(state)

    print(
        json.dumps(
            {
                "ok": True,
                "written": [] if args.dry_run else [str(JSON_PATH), str(MD_PATH)],
                "verdict": report["verdict"],
                "phase": report["phase"],
                "level": report["level"],
                "canClaimCredible": report["canClaimCredible"],
                "canClaimPositiveEdge": report["canClaimPositiveEdge"],
                "blockerCount": report["blockerCount"],
                **report["metrics"],
                "report": report,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
