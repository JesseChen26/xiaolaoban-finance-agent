import json
import math
import os
import hashlib
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path

from execution_status import is_recorded_execution_status, normalize_execution_status
from state_store import save_json_atomic


ROOT = Path(__file__).resolve().parents[1]
STATE_PATH = Path(os.environ.get("STATE_PATH_OVERRIDE") or ROOT / "data" / "state.json")
DATA_DIR = STATE_PATH.parent
LATEST_JSON_PATH = DATA_DIR / "latest_weekly_review.json"
LATEST_MD_PATH = DATA_DIR / "latest_weekly_review.md"


def safe_float(value):
    try:
        result = float(value)
        if math.isfinite(result):
            return result
    except (TypeError, ValueError):
        pass
    return 0.0


def pct(value):
    if value is None:
        return "-"
    return f"{safe_float(value):.2f}%"


def parse_date(value):
    if not value:
        return None
    text = str(value).replace("Z", "+00:00")
    for parser in (
        lambda item: datetime.fromisoformat(item).date(),
        lambda item: datetime.strptime(item[:10], "%Y-%m-%d").date(),
    ):
        try:
            return parser(text)
        except ValueError:
            continue
    return None


def week_range(today=None):
    current = today or date.today()
    start = current - timedelta(days=current.weekday())
    end = start + timedelta(days=6)
    return start, end


def in_range(item, start, end):
    item_date = parse_date(item.get("date") or item.get("time") or item.get("savedAt"))
    return item_date is not None and start <= item_date <= end


def load_state():
    with STATE_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def save_state(state):
    save_json_atomic(STATE_PATH, state)


def portfolio_summary(state):
    positions = state.get("portfolio") or []
    cost = sum(safe_float(item.get("cost")) * safe_float(item.get("quantity")) for item in positions)
    market_value = sum(safe_float(item.get("current")) * safe_float(item.get("quantity")) for item in positions)
    pnl = market_value - cost
    return {
        "positionCount": len(positions),
        "cost": round(cost, 2),
        "marketValue": round(market_value, 2),
        "pnl": round(pnl, 2),
        "pnlPct": round(pnl / cost * 100, 2) if cost > 0 else 0,
    }


def signal_checkpoint_stats(signals):
    windows = {}
    total_done = 0
    success = 0
    excess_values = []
    return_values = []
    drawdown_values = []

    for key, label in (("day5", "5日"), ("day20", "20日"), ("day60", "60日")):
        checkpoints = [(signal.get("checkpoints") or {}).get(key) or {} for signal in signals]
        done = [item for item in checkpoints if item.get("status") == "done"]
        window_success = [item for item in done if safe_float(item.get("excessPct")) > 0]
        window_excess = [safe_float(item.get("excessPct")) for item in done if item.get("excessPct") is not None]
        window_returns = [safe_float(item.get("avgReturnPct") if item.get("avgReturnPct") is not None else item.get("returnPct")) for item in done]
        window_drawdowns = [
            safe_float(item.get("worstMaxDrawdownPct") if item.get("worstMaxDrawdownPct") is not None else item.get("maxDrawdownPct"))
            for item in done
            if item.get("worstMaxDrawdownPct") is not None or item.get("maxDrawdownPct") is not None
        ]

        total_done += len(done)
        success += len(window_success)
        excess_values.extend(window_excess)
        return_values.extend(window_returns)
        drawdown_values.extend(window_drawdowns)
        windows[key] = {
            "label": label,
            "done": len(done),
            "pending": len([item for item in checkpoints if item.get("status") == "pending"]),
            "winRatePct": round(len(window_success) / len(done) * 100, 2) if done else None,
            "avgReturnPct": round(sum(window_returns) / len(window_returns), 2) if window_returns else None,
            "avgExcessPct": round(sum(window_excess) / len(window_excess), 2) if window_excess else None,
            "avgMaxDrawdownPct": round(sum(window_drawdowns) / len(window_drawdowns), 2) if window_drawdowns else None,
            "worstMaxDrawdownPct": min(window_drawdowns) if window_drawdowns else None,
        }

    return {
        "doneCheckpoints": total_done,
        "successCheckpoints": success,
        "overallWinRatePct": round(success / total_done * 100, 2) if total_done else None,
        "avgReturnPct": round(sum(return_values) / len(return_values), 2) if return_values else None,
        "avgExcessPct": round(sum(excess_values) / len(excess_values), 2) if excess_values else None,
        "avgMaxDrawdownPct": round(sum(drawdown_values) / len(drawdown_values), 2) if drawdown_values else None,
        "worstMaxDrawdownPct": min(drawdown_values) if drawdown_values else None,
        "byWindow": windows,
    }


def execution_stats(signals, execution_log):
    executions = [(signal.get("execution") or {}) for signal in signals]
    recorded = [item for item in executions if is_recorded_execution_status(item.get("status"))]
    status_counts = Counter(normalize_execution_status(item.get("status")) for item in executions)
    action_counts = Counter(item.get("action") or "未填写" for item in recorded)
    skipped_notes = [
        item.get("notes") or ""
        for item in recorded
        if item.get("status") in ("未执行", "延后", "部分执行") and item.get("notes")
    ]
    recent_log = sorted(execution_log, key=lambda item: item.get("savedAt") or "", reverse=True)[:10]

    return {
        "totalSignals": len(signals),
        "recorded": len(recorded),
        "pending": max(0, len(signals) - len(recorded)),
        "coveragePct": round(len(recorded) / len(signals) * 100, 2) if signals else None,
        "statusCounts": dict(status_counts),
        "actionCounts": dict(action_counts),
        "deviationNotes": skipped_notes[:10],
        "recentLog": recent_log,
    }


def classify_review(review):
    signals = review["signals"]["total"]
    sample_target = int(review["signals"].get("sampleTarget") or 30)
    recorded = review["execution"]["recorded"]
    avg_excess = review["validation"]["avgExcessPct"]
    by_window = review["validation"].get("byWindow") or {}
    complete_windows = all(
        safe_float((by_window.get(key) or {}).get("done")) >= sample_target
        for key in ("day5", "day20", "day60")
    )

    if signals < sample_target:
        return "样本不足"
    if recorded < signals:
        return "执行记录不完整"
    if not complete_windows:
        return "回看窗口不足"
    if avg_excess is not None and avg_excess > 0:
        return "初步优于基准"
    return "需要调整规则"


def build_markdown(review):
    lines = [
        f"# A股小资金实验周报｜{review['verdict']}",
        "",
        f"周期：{review['period']['start']} 至 {review['period']['end']}",
        f"生成时间：{review['time']}",
        "",
        "## 结论",
        f"- 本周信号：{review['signals']['weekly']} 条；累计信号：{review['signals']['total']} 条。",
        f"- 执行记录：{review['execution']['recorded']}/{review['execution']['totalSignals']} 条，覆盖率 {pct(review['execution']['coveragePct'])}。",
        f"- 回看窗口：已完成 {review['validation']['doneCheckpoints']} 个，平均超额 {pct(review['validation']['avgExcessPct'])}。",
        f"- 最大回撤：最差窗口 {pct(review['validation']['worstMaxDrawdownPct'])}，平均窗口 {pct(review['validation']['avgMaxDrawdownPct'])}。",
        f"- 当前持仓市值：{review['portfolio']['marketValue']:.2f} 元；当前盈亏：{review['portfolio']['pnl']:.2f} 元，{pct(review['portfolio']['pnlPct'])}。",
        "",
        "## 实际执行表现",
    ]

    performance = review.get("actualPerformance") or {}
    trade = performance.get("tradePerformance") or {}
    if performance:
        lines.extend([
            f"- 结论：{performance.get('verdict')}。",
            f"- 成交日志：{trade.get('tradeCount', 0)} 条；真实成交盈亏：{safe_float(trade.get('totalPnl')):.2f} 元，收益率 {pct(trade.get('totalReturnPct'))}。",
            f"- 当前持仓浮盈亏：{safe_float((performance.get('portfolioSnapshot') or {}).get('pnl')):.2f} 元。",
        ])
    else:
        lines.append("- 尚未生成执行表现报告，暂不能判断真实成交盈亏。")

    lines.extend([
        "",
        "## 执行偏差",
    ])

    if review["execution"]["deviationNotes"]:
        for note in review["execution"]["deviationNotes"]:
            lines.append(f"- {note}")
    else:
        lines.append("- 暂无未执行/延后/部分执行备注。")

    lines.extend(["", "## 可信度边界"])
    lines.append("- 少于 30 条信号、8-12 周记录前，不能说策略可信，只能做实验复盘。")
    lines.append("- 周报用于区分策略问题、执行问题和市场问题，不作为自动交易指令。")
    return "\n".join(lines)


def build_review(state):
    start, end = week_range()
    settings = state.get("settings") or {}
    signals = state.get("signalHistory") or []
    weekly_signals = [signal for signal in signals if in_range(signal, start, end)]
    execution_log = state.get("executionLog") or []
    weekly_execution_log = [item for item in execution_log if in_range(item, start, end)]
    validation = signal_checkpoint_stats(signals)
    execution = execution_stats(signals, execution_log)
    weekly_execution = execution_stats(weekly_signals, weekly_execution_log)

    review = {
        "id": f"weekly-{start.isoformat()}-{end.isoformat()}",
        "time": datetime.now().isoformat(timespec="seconds"),
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "to": settings.get("email") or "",
        "signals": {
            "total": len(signals),
            "weekly": len(weekly_signals),
            "sampleTarget": 30,
        },
        "execution": execution,
        "weeklyExecution": weekly_execution,
        "validation": validation,
        "portfolio": portfolio_summary(state),
        "actualPerformance": state.get("actualPerformanceReport"),
        "dataHealth": {
            "fundNavSync": state.get("fundNavSync"),
            "fundNavCrossCheck": state.get("fundNavCrossCheck"),
            "marketUpdate": (state.get("marketUpdates") or [None])[0],
            "newsSync": state.get("newsSync"),
        },
        "note": "少于30条信号、8-12周记录前，只能做实验复盘，不能声称预测可信。",
    }
    review["verdict"] = classify_review(review)
    review["body"] = build_markdown(review)
    review["subject"] = f"A股小资金实验周报｜{review['verdict']}｜信号 {review['signals']['total']}/30｜{end.isoformat()}"
    review["contentHash"] = hashlib.sha256(review["body"].encode("utf-8")).hexdigest()[:16]
    last = state.get("lastWeeklyReviewEmail") or {}
    same_sent = last.get("id") == review["id"] and last.get("contentHash") == review["contentHash"]
    review["shouldSend"] = not same_sent
    review["sendReason"] = "本周周报尚未发送。" if review["shouldSend"] else "本周同内容周报已发送，避免重复。"
    return review


def mark_sent(state):
    review = state.get("weeklyReview")
    if not review and LATEST_JSON_PATH.exists():
        review = json.loads(LATEST_JSON_PATH.read_text(encoding="utf-8"))
    if not review:
        raise RuntimeError("没有可标记的最新周报。请先生成周报。")

    sent = {
        "id": review.get("id"),
        "date": datetime.now().date().isoformat(),
        "time": datetime.now().isoformat(timespec="seconds"),
        "period": review.get("period"),
        "to": review.get("to"),
        "subject": review.get("subject"),
        "verdict": review.get("verdict"),
        "contentHash": review.get("contentHash"),
    }
    state["lastWeeklyReviewEmail"] = sent
    state.setdefault("weeklyReviewEmailRuns", []).insert(0, sent)
    state["weeklyReviewEmailRuns"] = state["weeklyReviewEmailRuns"][:50]
    return sent


def main():
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--mark-sent", action="store_true")
    args = parser.parse_args()

    state = load_state()
    if args.mark_sent:
        payload = {"ok": True, "markedSent": mark_sent(state)}
        save_state(state)
        print(json.dumps(payload, ensure_ascii=False))
        return

    review = build_review(state)
    state["weeklyReview"] = review
    state.setdefault("weeklyReviewRuns", []).insert(0, {k: v for k, v in review.items() if k != "body"})
    state["weeklyReviewRuns"] = state["weeklyReviewRuns"][:30]
    LATEST_JSON_PATH.write_text(json.dumps(review, ensure_ascii=False, indent=2), encoding="utf-8")
    LATEST_MD_PATH.write_text(review["body"], encoding="utf-8")
    save_state(state)
    print(json.dumps({"ok": True, **review}, ensure_ascii=False))


if __name__ == "__main__":
    main()
