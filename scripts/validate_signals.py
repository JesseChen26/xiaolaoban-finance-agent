import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from state_store import save_json_atomic

sys.path.insert(0, str(Path(__file__).resolve().parent))
from update_market_data import get_daily_klines, safe_float  # noqa: E402


ROOT = Path(__file__).resolve().parents[1]
STATE_PATH = Path(os.environ.get("STATE_PATH_OVERRIDE") or ROOT / "data" / "state.json")
WINDOWS = {"day5": 5, "day20": 20, "day60": 60}
BENCHMARK = {"code": "510300", "name": "沪深300ETF"}
HISTORY_CACHE = {}


def load_state():
    with STATE_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def save_state(state):
    save_json_atomic(STATE_PATH, state)


def parse_signal_date(signal):
    for field in ("date", "time"):
        value = signal.get(field)
        if not value:
            continue
        text = str(value).replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(text).date()
        except ValueError:
            try:
                return datetime.strptime(text[:10], "%Y-%m-%d").date()
            except ValueError:
                continue
    return None


def get_history(code):
    code = str(code or "").strip()
    if not re.match(r"^\d{6}$", code):
        return []
    if code in HISTORY_CACHE:
        return HISTORY_CACHE[code]

    rows = get_daily_klines(code)
    parsed = []
    seen = set()
    for row in rows:
        day = str(row.get("date", ""))[:10]
        close = safe_float(row.get("close"))
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", day) or close <= 0 or day in seen:
            continue
        seen.add(day)
        parsed.append({"date": day, "close": close})

    parsed.sort(key=lambda item: item["date"])
    HISTORY_CACHE[code] = parsed
    return parsed


def trading_window_return(code, signal_date, days):
    history = get_history(code)
    if not history:
        return {"status": "error", "reason": "无可用日K线"}

    signal_day = signal_date.isoformat()
    start_index = None
    for index, row in enumerate(history):
        if row["date"] <= signal_day:
            start_index = index
        else:
            break

    if start_index is None:
        return {
            "status": "error",
            "reason": f"历史行情覆盖不到信号日，最早数据为 {history[0]['date']}",
            "latestDate": history[-1]["date"],
        }

    target_index = start_index + days
    if target_index >= len(history):
        return {
            "status": "pending",
            "reason": f"还没到第 {days} 个交易日",
            "startDate": history[start_index]["date"],
            "latestDate": history[-1]["date"],
            "latestTradingDays": len(history) - start_index - 1,
        }

    start = history[start_index]
    end = history[target_index]
    max_drawdown = max_drawdown_pct(history[start_index : target_index + 1])
    return_pct = (end["close"] / start["close"] - 1) * 100
    return {
        "status": "done",
        "startDate": start["date"],
        "startClose": round(start["close"], 4),
        "endDate": end["date"],
        "endClose": round(end["close"], 4),
        "returnPct": round(return_pct, 2),
        "maxDrawdownPct": max_drawdown,
    }


def max_drawdown_pct(rows):
    peak = None
    worst = 0.0
    for row in rows:
        close = safe_float(row.get("close"))
        if close <= 0:
            continue
        if peak is None or close > peak:
            peak = close
        if peak:
            drawdown = (close / peak - 1) * 100
            worst = min(worst, drawdown)
    return round(worst, 2)


def eligible_candidates(signal):
    candidates = signal.get("candidates") or []
    selected = [
        item
        for item in candidates
        if item.get("grade") in ("A", "B") and item.get("status") not in ("剔除", "数据缺失")
    ]
    if not selected:
        selected = [item for item in candidates if item.get("status") not in ("剔除", "数据缺失")]
    if not selected:
        selected = candidates

    result = []
    seen = set()
    for item in selected:
        code = str(item.get("code", "")).strip()
        if not re.match(r"^\d{6}$", code) or code in seen:
            continue
        seen.add(code)
        result.append(item)
        if len(result) >= 5:
            break
    return result


def validate_checkpoint(signal, key, days):
    signal_date = parse_signal_date(signal)
    if signal_date is None:
        return {"status": "error", "reason": "信号缺少有效日期", "targetTradingDays": days}

    candidates = eligible_candidates(signal)
    if not candidates:
        return {
            "status": "not_applicable",
            "reason": "当时没有可验证候选 ETF",
            "targetTradingDays": days,
            "signalDate": signal_date.isoformat(),
        }

    benchmark_result = trading_window_return(BENCHMARK["code"], signal_date, days)
    items = []
    pending = []
    errors = []

    for candidate in candidates:
        code = str(candidate.get("code", "")).strip()
        result = trading_window_return(code, signal_date, days)
        base = {
            "code": code,
            "name": candidate.get("name") or "",
            "grade": candidate.get("grade") or "",
            "statusAtSignal": candidate.get("status") or "",
        }

        if result["status"] == "done":
            item = {**base, **result}
            if benchmark_result.get("status") == "done":
                item["benchmarkReturnPct"] = benchmark_result["returnPct"]
                item["excessPct"] = round(item["returnPct"] - benchmark_result["returnPct"], 2)
            items.append(item)
        elif result["status"] == "pending":
            pending.append({**base, **result})
        else:
            errors.append({**base, **result})
        time.sleep(0.03)

    if not items:
        latest_trading_days = max(
            [safe_float(item.get("latestTradingDays")) for item in pending],
            default=0,
        )
        status = "pending" if pending else "error"
        reason = pending[0]["reason"] if pending else errors[0]["reason"] if errors else "没有可计算结果"
        return {
            "status": status,
            "reason": reason,
            "targetTradingDays": days,
            "latestTradingDays": latest_trading_days if pending else None,
            "remainingTradingDays": max(0, days - latest_trading_days) if pending else None,
            "signalDate": signal_date.isoformat(),
            "benchmark": benchmark_result,
            "pending": pending[:5],
            "errors": errors[:5],
        }

    avg_return = sum(item["returnPct"] for item in items) / len(items)
    drawdowns = [item["maxDrawdownPct"] for item in items if item.get("maxDrawdownPct") is not None]
    best = max(items, key=lambda item: item["returnPct"])
    worst = min(items, key=lambda item: item["returnPct"])
    benchmark_return = benchmark_result.get("returnPct") if benchmark_result.get("status") == "done" else None
    benchmark_drawdown = benchmark_result.get("maxDrawdownPct") if benchmark_result.get("status") == "done" else None
    excess = round(avg_return - benchmark_return, 2) if benchmark_return is not None else None
    outperform_count = sum(1 for item in items if item.get("excessPct", -999) > 0)
    verdict = "优于基准" if excess is not None and excess > 0 else "弱于基准" if excess is not None else "已回看"

    return {
        "status": "done",
        "verdict": verdict,
        "targetTradingDays": days,
        "signalDate": signal_date.isoformat(),
        "sampleCount": len(items),
        "returnPct": round(avg_return, 2),
        "avgReturnPct": round(avg_return, 2),
        "benchmarkCode": BENCHMARK["code"],
        "benchmarkName": BENCHMARK["name"],
        "benchmarkReturnPct": benchmark_return,
        "benchmarkMaxDrawdownPct": benchmark_drawdown,
        "excessPct": excess,
        "maxDrawdownPct": min(drawdowns) if drawdowns else None,
        "avgMaxDrawdownPct": round(sum(drawdowns) / len(drawdowns), 2) if drawdowns else None,
        "worstMaxDrawdownPct": min(drawdowns) if drawdowns else None,
        "outperformCount": outperform_count,
        "positiveCount": sum(1 for item in items if item["returnPct"] > 0),
        "best": {"code": best["code"], "returnPct": best["returnPct"]},
        "worst": {"code": worst["code"], "returnPct": worst["returnPct"]},
        "items": items,
        "pending": pending[:5],
        "errors": errors[:5],
    }


def summarize(signals, validated_at):
    by_window = {}
    total_done = 0
    total_pending = 0
    total_success = 0
    excess_values = []
    return_values = []
    drawdown_values = []

    for key in WINDOWS:
        checkpoints = [signal.get("checkpoints", {}).get(key, {}) for signal in signals]
        done = [item for item in checkpoints if item.get("status") == "done"]
        pending = [item for item in checkpoints if item.get("status") == "pending"]
        not_applicable = [item for item in checkpoints if item.get("status") == "not_applicable"]
        errors = [item for item in checkpoints if item.get("status") == "error"]
        success = [item for item in done if safe_float(item.get("excessPct")) > 0]
        window_returns = [safe_float(item.get("avgReturnPct")) for item in done]
        window_excess = [safe_float(item.get("excessPct")) for item in done if item.get("excessPct") is not None]
        window_drawdowns = [
            safe_float(item.get("worstMaxDrawdownPct") if item.get("worstMaxDrawdownPct") is not None else item.get("maxDrawdownPct"))
            for item in done
            if item.get("worstMaxDrawdownPct") is not None or item.get("maxDrawdownPct") is not None
        ]

        total_done += len(done)
        total_pending += len(pending)
        total_success += len(success)
        return_values.extend(window_returns)
        excess_values.extend(window_excess)
        drawdown_values.extend(window_drawdowns)

        by_window[key] = {
            "total": len(checkpoints),
            "done": len(done),
            "pending": len(pending),
            "notApplicable": len(not_applicable),
            "errors": len(errors),
            "winRatePct": round(len(success) / len(done) * 100, 2) if done else None,
            "avgReturnPct": round(sum(window_returns) / len(window_returns), 2) if window_returns else None,
            "avgExcessPct": round(sum(window_excess) / len(window_excess), 2) if window_excess else None,
            "avgMaxDrawdownPct": round(sum(window_drawdowns) / len(window_drawdowns), 2) if window_drawdowns else None,
            "worstMaxDrawdownPct": min(window_drawdowns) if window_drawdowns else None,
        }

    return {
        "time": validated_at,
        "source": "腾讯复权日K线",
        "benchmark": BENCHMARK,
        "totalSignals": len(signals),
        "doneCheckpoints": total_done,
        "pendingCheckpoints": total_pending,
        "successCheckpoints": total_success,
        "overallWinRatePct": round(total_success / total_done * 100, 2) if total_done else None,
        "avgReturnPct": round(sum(return_values) / len(return_values), 2) if return_values else None,
        "avgExcessPct": round(sum(excess_values) / len(excess_values), 2) if excess_values else None,
        "avgMaxDrawdownPct": round(sum(drawdown_values) / len(drawdown_values), 2) if drawdown_values else None,
        "worstMaxDrawdownPct": min(drawdown_values) if drawdown_values else None,
        "byWindow": by_window,
        "note": "少于30条信号、8-12周记录前，只能做实验复盘，不能声称预测可信。",
    }


def validate_state(state):
    signals = state.get("signalHistory") or []
    validated_at = datetime.now().isoformat(timespec="seconds")

    for signal in signals:
        checkpoints = signal.setdefault("checkpoints", {})
        for key, days in WINDOWS.items():
            checkpoints[key] = validate_checkpoint(signal, key, days)

    summary = summarize(signals, validated_at)
    state["signalValidation"] = summary
    state.setdefault("signalValidationRuns", []).insert(0, summary)
    state["signalValidationRuns"] = state["signalValidationRuns"][:20]
    return summary


def main():
    state = load_state()
    summary = validate_state(state)
    save_state(state)
    print(json.dumps({"ok": True, **summary}, ensure_ascii=False))


if __name__ == "__main__":
    main()
