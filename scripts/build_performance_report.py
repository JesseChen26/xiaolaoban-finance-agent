import json
import math
import os
from collections import Counter
from datetime import datetime
from pathlib import Path

from execution_status import is_recorded_execution_status, normalize_execution_status
from state_store import save_json_atomic


ROOT = Path(__file__).resolve().parents[1]
STATE_PATH = Path(os.environ.get("STATE_PATH_OVERRIDE") or ROOT / "data" / "state.json")
DATA_DIR = STATE_PATH.parent
LATEST_JSON_PATH = DATA_DIR / "latest_performance_report.json"
LATEST_MD_PATH = DATA_DIR / "latest_performance_report.md"
REQUIRED_REVIEW_WINDOWS = ("day5", "day20", "day60")


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


def yuan(value):
    return f"{safe_float(value):.2f}"


def load_state():
    with STATE_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def save_state(state):
    save_json_atomic(STATE_PATH, state)


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


def recorded_week_count(signals):
    weeks = set()
    for signal in signals or []:
        parsed = parse_date(signal.get("date") or signal.get("time"))
        if parsed:
            year, week, _ = parsed.isocalendar()
            weeks.add(f"{year}-W{week:02d}")
    return len(weeks)


def validation_window_status(validation, required_signals=30):
    by_window = validation.get("byWindow") or {}
    done = {}
    required = int(required_signals or 30)
    for key in REQUIRED_REVIEW_WINDOWS:
        done[key] = int(safe_float((by_window.get(key) or {}).get("done")))
    missing = [key for key in REQUIRED_REVIEW_WINDOWS if done.get(key, 0) < required]
    return {
        "done": done,
        "required": required,
        "complete": not missing,
        "missing": missing,
    }


def current_prices(state):
    prices = {}
    names = {}
    for item in state.get("portfolio") or []:
        code = str(item.get("code") or "").strip()
        if code and safe_float(item.get("current")) > 0:
            prices[code] = safe_float(item.get("current"))
            names[code] = item.get("name") or ""
    for item in state.get("watchlist") or []:
        code = str(item.get("code") or "").strip()
        price = safe_float(item.get("price") or item.get("close"))
        if code and price > 0 and code not in prices:
            prices[code] = price
            names[code] = item.get("name") or ""
    return prices, names


def portfolio_snapshot(state):
    positions = state.get("portfolio") or []
    rows = []
    total_cost = 0.0
    total_value = 0.0
    for item in positions:
        quantity = safe_float(item.get("quantity"))
        cost = safe_float(item.get("cost"))
        current = safe_float(item.get("current"))
        cost_value = cost * quantity
        market_value = current * quantity
        pnl = market_value - cost_value
        total_cost += cost_value
        total_value += market_value
        rows.append({
            "code": item.get("code"),
            "name": item.get("name"),
            "type": item.get("type"),
            "quantity": quantity,
            "cost": cost,
            "current": current,
            "marketValue": round(market_value, 2),
            "pnl": round(pnl, 2),
            "pnlPct": round(pnl / cost_value * 100, 2) if cost_value > 0 else None,
        })
    pnl = total_value - total_cost
    return {
        "positionCount": len(rows),
        "cost": round(total_cost, 2),
        "marketValue": round(total_value, 2),
        "pnl": round(pnl, 2),
        "pnlPct": round(pnl / total_cost * 100, 2) if total_cost > 0 else None,
        "positions": rows,
    }


def normalize_trade(item):
    side = str(item.get("side") or "").strip()
    quantity = safe_float(item.get("quantity"))
    price = safe_float(item.get("price"))
    fee = safe_float(item.get("fee"))
    return {
        "date": item.get("date") or "",
        "code": str(item.get("code") or "").strip(),
        "name": item.get("name") or "",
        "side": side,
        "price": price,
        "quantity": quantity,
        "fee": fee,
        "amount": price * quantity,
        "notes": item.get("notes") or "",
    }


def trade_performance(state):
    trades = [normalize_trade(item) for item in state.get("trades") or []]
    trades = [
        item
        for item in trades
        if item["code"] and item["side"] in ("买入", "卖出") and item["price"] > 0 and item["quantity"] > 0
    ]
    trades.sort(key=lambda item: item["date"])
    prices, names = current_prices(state)
    positions = {}
    realized = 0.0
    buy_amount = 0.0
    sell_amount = 0.0
    fees = 0.0
    errors = []

    for trade in trades:
        code = trade["code"]
        position = positions.setdefault(code, {
            "code": code,
            "name": trade["name"] or names.get(code) or "",
            "quantity": 0.0,
            "costBasis": 0.0,
            "realizedPnl": 0.0,
        })
        fees += trade["fee"]
        if trade["side"] == "买入":
            gross = trade["amount"] + trade["fee"]
            position["quantity"] += trade["quantity"]
            position["costBasis"] += gross
            buy_amount += gross
        else:
            proceeds = trade["amount"] - trade["fee"]
            sell_amount += proceeds
            if position["quantity"] <= 0:
                errors.append(f"{code} 卖出 {trade['quantity']} 份，但没有对应持仓成本。")
                position["realizedPnl"] += proceeds
                realized += proceeds
                continue
            avg_cost = position["costBasis"] / position["quantity"]
            sell_quantity = min(trade["quantity"], position["quantity"])
            removed_cost = avg_cost * sell_quantity
            pnl = proceeds - removed_cost
            position["quantity"] -= sell_quantity
            position["costBasis"] -= removed_cost
            position["realizedPnl"] += pnl
            realized += pnl
            if trade["quantity"] > sell_quantity:
                errors.append(f"{code} 卖出数量超过可计算持仓，超出 {trade['quantity'] - sell_quantity:.2f} 份。")

    open_rows = []
    open_value = 0.0
    open_cost = 0.0
    for code, position in positions.items():
        quantity = position["quantity"]
        if quantity <= 0:
            continue
        price = prices.get(code)
        current_value = price * quantity if price else None
        cost_basis = position["costBasis"]
        open_cost += cost_basis
        if current_value is not None:
            open_value += current_value
        open_rows.append({
            "code": code,
            "name": position["name"],
            "quantity": round(quantity, 2),
            "costBasis": round(cost_basis, 2),
            "currentPrice": round(price, 4) if price else None,
            "marketValue": round(current_value, 2) if current_value is not None else None,
            "unrealizedPnl": round(current_value - cost_basis, 2) if current_value is not None else None,
        })

    unrealized = open_value - open_cost if open_rows and open_value is not None else 0.0
    total_pnl = realized + unrealized
    invested_base = buy_amount if buy_amount > 0 else None
    status = "无成交记录" if not trades else "可跟踪"
    if trades and errors:
        status = "需复核成交"

    return {
        "status": status,
        "tradeCount": len(trades),
        "buyAmount": round(buy_amount, 2),
        "sellAmount": round(sell_amount, 2),
        "fees": round(fees, 2),
        "realizedPnl": round(realized, 2),
        "openCost": round(open_cost, 2),
        "openMarketValue": round(open_value, 2),
        "unrealizedPnl": round(unrealized, 2),
        "totalPnl": round(total_pnl, 2),
        "totalReturnPct": round(total_pnl / invested_base * 100, 2) if invested_base else None,
        "openPositions": open_rows,
        "errors": errors,
        "note": "成交日志为空时，不能判断真实执行收益；只能查看当前持仓浮盈亏。" if not trades else "",
    }


def execution_discipline(state):
    signals = state.get("signalHistory") or []
    executions = [(signal.get("execution") or {}) for signal in signals]
    recorded = [item for item in executions if is_recorded_execution_status(item.get("status"))]
    status_counts = Counter(normalize_execution_status(item.get("status")) for item in executions)
    action_counts = Counter(item.get("action") or "未填写" for item in recorded)
    return {
        "signalCount": len(signals),
        "recorded": len(recorded),
        "pending": max(0, len(signals) - len(recorded)),
        "coveragePct": round(len(recorded) / len(signals) * 100, 2) if signals else None,
        "statusCounts": dict(status_counts),
        "actionCounts": dict(action_counts),
        "executionLogCount": len(state.get("executionLog") or []),
    }


def benchmark_summary(state):
    validation = state.get("signalValidation") or {}
    signals = state.get("signalHistory") or []
    weeks = recorded_week_count(signals)
    window_status = validation_window_status(validation, 30)
    execution = execution_discipline(state)
    enough_sample = (
        len(signals) >= 30
        and weeks >= 8
        and execution["pending"] == 0
        and window_status["complete"]
    )
    return {
        "benchmark": (validation.get("benchmark") or {"code": "510300", "name": "沪深300ETF"}),
        "signalCount": len(signals),
        "recordedWeeks": weeks,
        "executionPending": execution["pending"],
        "doneCheckpoints": validation.get("doneCheckpoints", 0),
        "reviewWindows": window_status,
        "avgExcessPct": validation.get("avgExcessPct"),
        "worstMaxDrawdownPct": validation.get("worstMaxDrawdownPct"),
        "canJudgeSignalEdge": bool(enough_sample),
        "note": "未达到 30 条信号、8 周记录、执行记录完整且 5/20/60 三类回看各满 30 个结果前，不能判断是否跑赢基准。",
    }


def verdict(report):
    trade = report["tradePerformance"]
    discipline = report["executionDiscipline"]
    benchmark = report["benchmarkComparison"]
    if trade["tradeCount"] == 0:
        return "无成交记录"
    if discipline["pending"] > 0:
        return "执行记录不完整"
    if not benchmark["canJudgeSignalEdge"]:
        return "样本不足"
    if safe_float(trade["totalPnl"]) > 0 and safe_float(benchmark.get("avgExcessPct")) > 0:
        return "初步有效"
    return "需要继续验证"


def build_markdown(report):
    trade = report["tradePerformance"]
    portfolio = report["portfolioSnapshot"]
    discipline = report["executionDiscipline"]
    benchmark = report["benchmarkComparison"]
    lines = [
        f"# 实际执行表现报告｜{report['verdict']}",
        "",
        f"生成时间：{report['time']}",
        "",
        "## 结论",
        f"- 当前持仓浮盈亏：{yuan(portfolio['pnl'])} 元，{pct(portfolio['pnlPct'])}。",
        f"- 成交日志：{trade['tradeCount']} 条；真实执行总盈亏：{yuan(trade['totalPnl'])} 元，收益率 {pct(trade['totalReturnPct'])}。",
        f"- 执行记录覆盖：{discipline['recorded']}/{discipline['signalCount']} 条，覆盖率 {pct(discipline['coveragePct'])}。",
        f"- 基准比较：信号 {benchmark['signalCount']}/30 条，记录 {benchmark['recordedWeeks']}/8 周，平均超额 {pct(benchmark['avgExcessPct'])}。",
        "",
        "## 真实成交表现",
        f"- 买入金额：{yuan(trade['buyAmount'])} 元；卖出金额：{yuan(trade['sellAmount'])} 元；手续费：{yuan(trade['fees'])} 元。",
        f"- 已实现盈亏：{yuan(trade['realizedPnl'])} 元；未实现盈亏：{yuan(trade['unrealizedPnl'])} 元。",
    ]
    if trade["note"]:
        lines.append(f"- 提醒：{trade['note']}")
    if trade["errors"]:
        lines.extend(["", "## 需复核"])
        lines.extend(f"- {item}" for item in trade["errors"])
    lines.extend([
        "",
        "## 边界",
        "- 这个报告只统计你手动记录的成交和执行结果，不自动交易。",
        "- 当前持仓浮盈亏不等于策略已经有效；策略有效还要看 30 条以上信号、8-12 周、执行记录完整和 5/20/60 三类回看各满 30 个结果。",
    ])
    return "\n".join(lines)


def build_report(state):
    report = {
        "time": datetime.now().isoformat(timespec="seconds"),
        "capital": {
            "totalCapital": safe_float((state.get("settings") or {}).get("totalCapital")),
            "trialCapital": safe_float((state.get("settings") or {}).get("trialCapital")),
        },
        "portfolioSnapshot": portfolio_snapshot(state),
        "tradePerformance": trade_performance(state),
        "executionDiscipline": execution_discipline(state),
        "benchmarkComparison": benchmark_summary(state),
    }
    report["verdict"] = verdict(report)
    report["body"] = build_markdown(report)
    return report


def main():
    state = load_state()
    report = build_report(state)
    state["actualPerformanceReport"] = report
    runs = state.get("actualPerformanceRuns") or []
    runs.insert(0, {
        "time": report["time"],
        "verdict": report["verdict"],
        "tradeCount": report["tradePerformance"]["tradeCount"],
        "totalPnl": report["tradePerformance"]["totalPnl"],
        "portfolioPnl": report["portfolioSnapshot"]["pnl"],
        "signalCount": report["executionDiscipline"]["signalCount"],
        "executionPending": report["executionDiscipline"]["pending"],
    })
    state["actualPerformanceRuns"] = runs[:50]
    save_state(state)

    with LATEST_JSON_PATH.open("w", encoding="utf-8") as file:
        json.dump(report, file, ensure_ascii=False, indent=2)
    LATEST_MD_PATH.write_text(report["body"], encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "verdict": report["verdict"],
        "tradeCount": report["tradePerformance"]["tradeCount"],
        "totalPnl": report["tradePerformance"]["totalPnl"],
        "portfolioPnl": report["portfolioSnapshot"]["pnl"],
        **report,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
