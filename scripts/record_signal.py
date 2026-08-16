import argparse
import hashlib
import json
import math
import os
import re
from datetime import date, datetime
from pathlib import Path

from execution_status import signal_execution_recorded
from state_store import save_json_atomic


ROOT = Path(__file__).resolve().parents[1]
STATE_PATH = Path(os.environ.get("STATE_PATH_OVERRIDE") or ROOT / "data" / "state.json")


def safe_float(value):
    try:
        result = float(value)
        if math.isfinite(result):
            return result
    except (TypeError, ValueError):
        pass
    return 0.0


def strip_end_punct(value):
    return str(value or "").strip().rstrip("。；;，, ")


def join_phrases(values, fallback=""):
    parts = [strip_end_punct(value) for value in values if strip_end_punct(value)]
    return "；".join(parts) or fallback


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


def days_since(value):
    parsed = parse_date(value)
    if parsed is None:
        return None
    return (date.today() - parsed).days


def position_action(item):
    current = safe_float(item.get("current"))
    target = safe_float(item.get("target"))
    stop = safe_float(item.get("stop"))
    if target > 0 and current >= target:
        return "达到退出目标，按计划手动赎回/卖出。"
    if target > 0 and current > 0:
        need_pct = (target / current - 1) * 100
        return f"退出计划：不加仓，距离目标价 {target:.4f} 还需约 {need_pct:.2f}%。"
    if stop > 0 and current > 0 and current <= stop:
        return "触发止损价，先核对数据，再手动卖出/赎回。"
    if "场外" in str(item.get("type", "")):
        return "场外基金：按最新净值和赎回规则跟踪。"
    return "按持仓规则继续观察。"


def portfolio_summary(state):
    positions = state.get("portfolio") or []
    settings = state.get("settings") or {}
    cost = sum(safe_float(item.get("cost")) * safe_float(item.get("quantity")) for item in positions)
    market_value = sum(safe_float(item.get("current")) * safe_float(item.get("quantity")) for item in positions)
    pnl = market_value - cost
    pnl_pct = pnl / cost * 100 if cost > 0 else 0
    stop_triggered = any(
        safe_float(item.get("current")) > 0
        and safe_float(item.get("stop")) > 0
        and safe_float(item.get("current")) <= safe_float(item.get("stop"))
        for item in positions
    )
    target_hit = next(
        (
            item
            for item in positions
            if safe_float(item.get("current")) > 0
            and safe_float(item.get("target")) > 0
            and safe_float(item.get("current")) >= safe_float(item.get("target"))
        ),
        None,
    )

    if positions:
        status = "持仓盈利" if pnl >= 0 else "持仓亏损"
        recommendation = "继续持有，按卖出规则观察趋势。" if pnl >= 0 else "继续观察，重点检查止损价。"
        level = "ok" if pnl >= 0 else "warn"
    else:
        status = "空仓"
        recommendation = "保持空仓，等待 ETF 候选池出现合格标的。"
        level = "ok"

    if target_hit:
        status = "达到退出目标"
        recommendation = f"{target_hit.get('code')} {target_hit.get('name') or ''} 已达到退出目标价，按计划手动赎回/卖出。"
        level = "warn"
    elif stop_triggered:
        status = "止损执行"
        recommendation = "已触发止损条件，请手动检查并卖出止损。"
        level = "danger"
    elif pnl <= -safe_float(settings.get("stopLoss")):
        status = "停止实验"
        recommendation = "试验仓亏损达到停止线，停止第一阶段实盘。"
        level = "danger"
    elif pnl <= -safe_float(settings.get("pauseLoss")):
        status = "暂停交易"
        recommendation = "试验仓亏损达到暂停线，暂停交易并复盘。"
        level = "warn"

    return {
        "cost": round(cost, 2),
        "marketValue": round(market_value, 2),
        "pnl": round(pnl, 2),
        "pnlPct": round(pnl_pct, 2),
        "status": status,
        "recommendation": recommendation,
        "level": level,
    }


def suggested_execution_action(status, recommendation=""):
    text = f"{status} {recommendation}"
    if status in ("持仓盈利", "持仓亏损"):
        return "观察"
    if status == "达到退出目标":
        return "赎回"
    if status == "止损执行":
        return "卖出"
    if status in ("暂停交易", "停止实验"):
        return "暂停"
    if status == "空仓":
        return "空仓"
    if "赎回" in text:
        return "赎回"
    if "触发止损" in text:
        return "卖出"
    if "暂停" in text:
        return "暂停"
    if "空仓" in text:
        return "空仓"
    if "买入" in text:
        return "买入"
    return "观察"


def default_execution_record(status, recommendation):
    return {
        "status": "未记录",
        "action": suggested_execution_action(status, recommendation),
        "date": "",
        "code": "",
        "price": "",
        "amountYuan": "",
        "quantity": "",
        "notes": "",
        "savedAt": "",
    }


def action_from_plan_item(item):
    side = item.get("side")
    if side == "记录":
        return "观察"
    if side in ("买入", "卖出", "赎回", "空仓", "暂停", "观察"):
        return side
    status = item.get("status") or ""
    if status in ("持仓盈利", "持仓亏损", "等待退出", "重点观察", "只观察", "无触发", "手动", "手动执行"):
        return "观察"
    if item.get("title") == "执行纪律":
        return "观察"
    if status == "执行退出":
        return "赎回"
    if status == "止损执行":
        return "卖出"
    if status == "暂停":
        return "暂停"
    if status == "空仓等待":
        return "空仓"
    text = f"{item.get('title') or ''} {item.get('status') or ''} {item.get('meta') or ''}"
    if "执行退出" in text or "赎回" in text:
        return "赎回"
    if "触发止损" in text:
        return "卖出"
    if "暂停" in text:
        return "暂停"
    if "空仓" in text:
        return "空仓"
    if "重点观察" in text or "只观察" in text or "等待退出" in text:
        return "观察"
    if "买入" in text:
        return "买入"
    return "观察"


def build_suggested_actions(operation_plan):
    actions = [
        {
            "title": item.get("title"),
            "status": item.get("status"),
            "action": action_from_plan_item(item),
            "level": item.get("level"),
            "meta": item.get("meta"),
        }
        for item in operation_plan.get("items", [])
    ]
    checklist = (operation_plan.get("manualOrderChecklist") or {}).get("items") or []
    actions.extend([
        {
            "title": item.get("title"),
            "status": item.get("status"),
            "action": action_from_plan_item(item),
            "level": item.get("level"),
            "meta": item.get("meta"),
            "code": item.get("code"),
            "quantity": item.get("quantity"),
            "referencePrice": item.get("referencePrice"),
            "estimatedAmount": item.get("estimatedAmount"),
            "stopPrice": item.get("stopPrice"),
        }
        for item in checklist
    ])
    return actions


def execution_pending_count(state):
    signals = state.get("signalHistory") or []
    return sum(1 for signal in signals if not signal_execution_recorded(signal))


def top_watchlist_candidates(state):
    rows = sorted(
        [item for item in state.get("watchlist") or [] if item.get("code")],
        key=lambda item: safe_float(item.get("totalScore")),
        reverse=True,
    )
    return [
        {
            "code": item.get("code"),
            "name": item.get("name"),
            "type": item.get("type"),
            "price": safe_float(item.get("price") or item.get("close")),
            "totalScore": safe_float(item.get("totalScore")),
            "grade": item.get("grade") or "D",
            "status": item.get("status") or "未评分",
            "recommendation": item.get("recommendation") or "",
            "trendScore": item.get("trendScore"),
            "liquidityScore": item.get("liquidityScore"),
            "qualityScore": item.get("qualityScore"),
            "riskScore": item.get("riskScore"),
            "capitalFitScore": item.get("capitalFitScore"),
            "scoreReasons": item.get("scoreReasons") or [],
            "riskFlags": item.get("riskFlags") or [],
            "return1mPct": item.get("return1mPct"),
            "return3mPct": item.get("return3mPct"),
            "lastMarketDate": item.get("lastMarketDate") or "",
        }
        for item in rows[:5]
    ]


def current_exit_plans(state):
    return [
        {
            "code": item.get("code"),
            "name": item.get("name"),
            "type": item.get("type"),
            "current": safe_float(item.get("current")),
            "cost": safe_float(item.get("cost")),
            "target": safe_float(item.get("target")),
            "stop": safe_float(item.get("stop")),
            "navDate": item.get("navDate") or "",
            "action": position_action(item),
        }
        for item in state.get("portfolio") or []
        if safe_float(item.get("target")) > 0 or safe_float(item.get("stop")) > 0
    ]


def available_trial_budget(state, summary):
    settings = state.get("settings") or {}
    total_capital = safe_float(settings.get("totalCapital"))
    trial_capital = safe_float(settings.get("trialCapital")) or 200
    remaining = max(0.0, total_capital - safe_float(summary.get("marketValue")))
    return min(trial_capital, remaining or trial_capital)


def candidate_score_text(item):
    parts = [
        f"{item.get('grade') or 'D'}级",
        f"{safe_float(item.get('totalScore')):.0f}分",
    ]
    if item.get("trendScore") is not None:
        parts.append(f"趋势 {safe_float(item.get('trendScore')):.0f}")
    if item.get("liquidityScore") is not None:
        parts.append(f"流动性 {safe_float(item.get('liquidityScore')):.0f}")
    if item.get("riskScore") is not None:
        parts.append(f"风险 {safe_float(item.get('riskScore')):.0f}")
    return "，".join(parts)


def build_manual_order_checklist(state, summary, budget, exits, top_candidate, buyable, risk_locked, execution_pending=0):
    settings = state.get("settings") or {}
    formal_recording = bool(settings.get("formalSignalRecording"))
    stop_loss_yuan = safe_float(settings.get("stopLoss")) or 20
    items = []

    for item in exits[:3]:
        current = safe_float(item.get("current"))
        target = safe_float(item.get("target"))
        stop = safe_float(item.get("stop"))
        target_hit = target > 0 and current >= target
        stop_hit = stop > 0 and current <= stop
        action = "手动赎回/卖出" if target_hit or stop_hit else "等待退出"
        items.append({
            "title": f"{item.get('code')} 退出复核",
            "level": "warn" if target_hit or stop_hit else "ok",
            "status": "触发退出" if target_hit or stop_hit else "等待",
            "action": action,
            "side": "赎回" if target_hit else "卖出" if stop_hit else "观察",
            "code": item.get("code"),
            "name": item.get("name"),
            "referencePrice": round(current, 4),
            "targetPrice": round(target, 4),
            "stopPrice": round(stop, 4),
            "quantity": safe_float(item.get("quantity")) if item.get("quantity") is not None else None,
            "estimatedAmount": None,
            "maxLossYuan": None,
            "meta": f"{item.get('action')} 当前 {current:.4f}，目标 {target:.4f}，不加仓。",
            "confirmations": ["先核对账户净值、赎回规则和到账时间。", "执行后回到信号页补执行记录。"],
        })

    if risk_locked:
        label = "今日不新增交易"
        level = "danger" if summary.get("level") == "danger" else "warn"
        items.append({
            "title": "新开仓清单",
            "level": level,
            "status": "暂停",
            "action": "不买入",
            "side": "暂停",
            "code": "",
            "name": "",
            "referencePrice": None,
            "targetPrice": None,
            "stopPrice": None,
            "quantity": 0,
            "estimatedAmount": 0,
            "maxLossYuan": 0,
            "meta": "账户处于风险、退出或暂停状态，先处理已有事项，不新增 ETF。",
            "confirmations": ["暂停新开仓。", "先处理止损、退出或复盘事项。"],
        })
    elif execution_pending > 0:
        label = "先补执行记录"
        level = "warn"
        items.append({
            "title": "新开仓清单",
            "level": "warn",
            "status": "暂停",
            "action": "先补执行记录",
            "side": "暂停",
            "code": "",
            "name": "",
            "referencePrice": None,
            "targetPrice": None,
            "stopPrice": None,
            "quantity": 0,
            "estimatedAmount": 0,
            "maxLossYuan": 0,
            "meta": f"还有 {execution_pending} 条正式信号没有补执行结果；先补已执行、未执行或延后和原因，今天不新增 ETF。",
            "confirmations": ["先在信号页补执行记录。", "补齐前不做新开仓，避免样本混乱。"],
        })
    elif not formal_recording:
        label = "今日不下单"
        level = "warn"
        candidate_text = (
            f"可观察 {top_candidate.get('code')} {top_candidate.get('name') or ''}，"
            f"{candidate_score_text(top_candidate)}。"
            if top_candidate
            else "当前没有 A/B 级候选。"
        )
        items.append({
            "title": "新开仓清单",
            "level": "warn",
            "status": "预演模式",
            "action": "不买入",
            "side": "观察",
            "code": top_candidate.get("code") if top_candidate else "",
            "name": top_candidate.get("name") if top_candidate else "",
            "referencePrice": round(safe_float(top_candidate.get("price")), 4) if top_candidate else None,
            "targetPrice": None,
            "stopPrice": None,
            "quantity": 0,
            "estimatedAmount": 0,
            "maxLossYuan": 0,
            "meta": f"{candidate_text} 正式样本记录未开启，今天只预检和观察，不手动下单。",
            "confirmations": ["准备开始真实样本后，先在首页开启正式记录。", "开启前不把观察结果计入策略表现。"],
        })
    elif buyable:
        price = safe_float(buyable.get("price"))
        quantity = 100
        amount = price * quantity
        stop_price = round(price * 0.92, 3)
        max_loss = round((price - stop_price) * quantity, 2)
        label = "可手动复核买入"
        level = "ok" if buyable.get("grade") == "A" else "warn"
        items.append({
            "title": "新开仓清单",
            "level": level,
            "status": "可复核买入",
            "action": "可手动买入 100 份",
            "side": "买入",
            "code": buyable.get("code"),
            "name": buyable.get("name"),
            "referencePrice": round(price, 4),
            "targetPrice": None,
            "stopPrice": stop_price,
            "quantity": quantity,
            "estimatedAmount": round(amount, 2),
            "maxLossYuan": min(max_loss, stop_loss_yuan),
            "meta": (
                f"{buyable.get('code')} {buyable.get('name') or ''}，100 份约 {amount:.2f} 元，"
                f"不超过 {budget:.2f} 元试验仓；计划止损价约 {stop_price:.3f}，单笔计划风险约 {max_loss:.2f} 元。"
            ),
            "confirmations": [
                "买入前核对代码、价格、交易单位和涨跌幅。",
                "实际成交后在信号页记录成交价、金额和数量。",
                "若价格跌破止损价或等级恶化到 C/D，按规则手动卖出。",
            ],
        })
    elif top_candidate:
        price = safe_float(top_candidate.get("price"))
        amount = price * 100
        label = "资金不适配"
        level = "warn"
        items.append({
            "title": "新开仓清单",
            "level": "warn",
            "status": "不买入",
            "action": "空仓等待",
            "side": "空仓",
            "code": top_candidate.get("code"),
            "name": top_candidate.get("name"),
            "referencePrice": round(price, 4),
            "targetPrice": None,
            "stopPrice": None,
            "quantity": 0,
            "estimatedAmount": round(amount, 2),
            "maxLossYuan": 0,
            "meta": f"{top_candidate.get('code')} 100 份约 {amount:.2f} 元，超过当前 {budget:.2f} 元试验仓，不买入。",
            "confirmations": ["保持空仓等待，不为了买入而提高预算。"],
        })
    else:
        label = "空仓等待"
        level = "ok"
        items.append({
            "title": "新开仓清单",
            "level": "ok",
            "status": "空仓等待",
            "action": "不买入",
            "side": "空仓",
            "code": "",
            "name": "",
            "referencePrice": None,
            "targetPrice": None,
            "stopPrice": None,
            "quantity": 0,
            "estimatedAmount": 0,
            "maxLossYuan": 0,
            "meta": "没有 A/B 级且资金适配的候选 ETF，保持空仓。",
            "confirmations": ["继续等待下一次每日评分。"],
        })

    items.append({
        "title": "执行纪律",
        "level": "ok",
        "status": "手动执行",
        "action": "记录结果",
        "side": "记录",
        "code": "",
        "name": "",
        "referencePrice": None,
        "targetPrice": None,
        "stopPrice": None,
        "quantity": 0,
        "estimatedAmount": 0,
        "maxLossYuan": 0,
        "meta": "系统不自动交易；任何实际买入、卖出、赎回或不执行，都要在信号页补执行记录。",
        "confirmations": ["执行和不执行都要记录原因。"],
    })

    return {
        "label": label,
        "level": level,
        "budget": round(budget, 2),
        "formalSignalRecording": formal_recording,
        "executionPending": execution_pending,
        "executionLocked": execution_pending > 0,
        "items": items,
    }


def build_operation_plan(state, summary=None, candidates=None, exits=None):
    summary = summary or portfolio_summary(state)
    candidates = candidates or top_watchlist_candidates(state)
    exits = exits or current_exit_plans(state)
    budget = available_trial_budget(state, summary)
    risk_locked = summary["status"] in ("停止实验", "暂停交易", "止损执行", "达到退出目标")
    execution_pending = execution_pending_count(state)
    ranked = [
        item
        for item in candidates
        if item.get("code")
        and item.get("grade") in ("A", "B")
        and item.get("status") not in ("剔除", "数据缺失")
    ]
    ranked.sort(key=lambda item: safe_float(item.get("totalScore")), reverse=True)
    buyable = next((item for item in ranked if safe_float(item.get("price")) * 100 <= budget and safe_float(item.get("price")) > 0), None)
    top_candidate = buyable or (ranked[0] if ranked else None)
    manual_order_checklist = build_manual_order_checklist(
        state,
        summary,
        budget,
        exits,
        top_candidate,
        buyable,
        risk_locked,
        execution_pending,
    )
    items = [{
        "title": "账户动作",
        "level": summary["level"],
        "status": summary["status"],
        "meta": f"{summary['recommendation']} 当前市值 {summary['marketValue']:.2f} 元，盈亏 {summary['pnl']:.2f} 元。",
    }]

    if exits:
        for item in exits[:3]:
            target_hit = safe_float(item.get("target")) > 0 and safe_float(item.get("current")) >= safe_float(item.get("target"))
            items.append({
                "title": f"{item.get('code')} {item.get('name') or ''}",
                "level": "warn" if target_hit else "ok",
                "status": "执行退出" if target_hit else "等待退出",
                "meta": f"{item.get('action')} 当前 {safe_float(item.get('current')):.4f}，目标 {safe_float(item.get('target')):.4f}，不加仓。",
            })
    else:
        items.append({
            "title": "退出计划",
            "level": "ok",
            "status": "无触发",
            "meta": "当前没有达到止损或退出目标的持仓。",
        })

    if risk_locked:
        items.append({
            "title": "新开仓",
            "level": "danger" if summary["level"] == "danger" else "warn",
            "status": "暂停",
            "meta": "先处理风险、退出或复盘事项，不新增 ETF 交易。",
        })
    elif execution_pending > 0:
        items.append({
            "title": "新开仓",
            "level": "warn",
            "status": "暂停",
            "meta": f"还有 {execution_pending} 条正式信号未补执行结果；先补执行记录，今天不新增 ETF 交易。",
        })
    elif top_candidate:
        price = safe_float(top_candidate.get("price"))
        min_amount = price * 100
        fit_text = (
            f"100 份约 {min_amount:.2f} 元，适配当前 {budget:.2f} 元试验预算"
            if min_amount <= budget
            else f"100 份约 {min_amount:.2f} 元，超过当前 {budget:.2f} 元试验预算"
        )
        reason_text = join_phrases((top_candidate.get("scoreReasons") or [])[:2], "暂无明确正向解释")
        risk_text = join_phrases((top_candidate.get("riskFlags") or [])[:2], "暂无明显硬伤")
        items.append({
            "title": f"{top_candidate.get('code')} {top_candidate.get('name') or ''}",
            "level": "ok" if buyable and top_candidate.get("grade") == "A" else "warn",
            "status": "重点观察" if buyable else "只观察",
            "meta": f"{fit_text}；{candidate_score_text(top_candidate)}；理由：{reason_text}；风险：{risk_text}；{top_candidate.get('recommendation') or '买入前必须人工确认价格和止损。'}",
        })
    else:
        items.append({
            "title": "新开仓",
            "level": "ok",
            "status": "空仓等待",
            "meta": "候选池没有 A/B 级且资金适配的 ETF，不新增交易。",
        })

    items.append({
        "title": "执行边界",
        "level": "ok",
        "status": "手动",
        "meta": "系统只提醒和记录，不自动登录券商，不自动买入或卖出；每次实际操作后要回到信号页记录执行结果。",
    })

    return {
        "level": summary["level"],
        "label": "先处理风险" if risk_locked else "先补执行记录" if execution_pending > 0 else "观察为主" if top_candidate else "空仓等待",
        "budget": round(budget, 2),
        "executionPending": execution_pending,
        "executionLocked": execution_pending > 0,
        "items": items,
        "manualOrderChecklist": manual_order_checklist,
    }


def latest_market_date(state):
    dates = [
        item.get("lastMarketDate")
        for item in state.get("watchlist") or []
        if re.match(r"^\d{4}-\d{2}-\d{2}$", str(item.get("lastMarketDate") or ""))
    ]
    return max(dates) if dates else date.today().isoformat()


def data_quality(state, signal_date):
    blockers = []
    warnings = []
    latest_market = (state.get("marketUpdates") or [None])[0]
    market_age = days_since(signal_date)
    fund_nav_age = days_since((state.get("fundNavSync") or {}).get("time"))
    crosscheck_age = days_since((state.get("fundNavCrossCheck") or {}).get("time"))
    fund_positions = [
        item
        for item in state.get("portfolio") or []
        if "场外" in str(item.get("type", "")) or "联接" in str(item.get("type", ""))
    ]
    crosscheck = state.get("fundNavCrossCheck") or {}

    if not state.get("sourceWhitelist"):
        blockers.append("信息源白名单尚未同步。")
    if not state.get("watchlist"):
        blockers.append("ETF 候选池为空。")
    if market_age is None or market_age > 7:
        blockers.append(f"场内 ETF 行情日期过旧：{signal_date or '-'}。")
    if latest_market and latest_market.get("errors"):
        warnings.append(f"行情同步有 {len(latest_market.get('errors') or [])} 条错误。")
    if fund_positions and (fund_nav_age is None or fund_nav_age > 7):
        blockers.append("场外/联接基金净值未在 7 天内同步。")
    if fund_positions and (crosscheck_age is None or crosscheck_age > 7):
        blockers.append("易方达官网净值核对未在 7 天内完成。")
    if crosscheck.get("mismatchCount") or crosscheck.get("errors"):
        blockers.append("易方达官网净值核对存在差异或错误。")
    if not state.get("newsEvents"):
        warnings.append("新闻事件为空，本次信号缺少事件背景。")
    if not state.get("financialEvents"):
        warnings.append("财报事件为空，本次信号缺少金融巨头财报背景。")

    return {
        "ok": not blockers,
        "blockers": blockers,
        "warnings": warnings,
        "signalDate": signal_date,
        "marketAgeDays": market_age,
        "fundNavAgeDays": fund_nav_age,
        "crossCheckAgeDays": crosscheck_age,
        "sourceWhitelistCount": len(state.get("sourceWhitelist") or []),
    }


def build_signal_snapshot(state, reason="daily-run", force_id=False):
    signal_date = latest_market_date(state)
    now = datetime.now().isoformat(timespec="seconds")
    summary = portfolio_summary(state)
    candidates = top_watchlist_candidates(state)
    exits = current_exit_plans(state)
    operation_plan = build_operation_plan(state, summary, candidates, exits)
    quality = data_quality(state, signal_date)
    positions = []

    for item in state.get("portfolio") or []:
        value = safe_float(item.get("current")) * safe_float(item.get("quantity"))
        cost_value = safe_float(item.get("cost")) * safe_float(item.get("quantity"))
        positions.append({
            "code": item.get("code"),
            "name": item.get("name"),
            "type": item.get("type"),
            "cost": safe_float(item.get("cost")),
            "current": safe_float(item.get("current")),
            "quantity": safe_float(item.get("quantity")),
            "marketValue": round(value, 2),
            "pnl": round(value - cost_value, 2),
            "target": safe_float(item.get("target")),
            "stop": safe_float(item.get("stop")),
            "navDate": item.get("navDate") or "",
            "action": position_action(item),
        })

    action_hash = hashlib.sha256(
        json.dumps(
            {
                "date": signal_date,
                "status": summary["status"],
                "recommendation": summary["recommendation"],
                "operationPlan": [(item.get("title"), item.get("status")) for item in operation_plan["items"]],
                "manualOrderChecklist": [
                    (
                        item.get("title"),
                        item.get("status"),
                        item.get("side"),
                        item.get("code"),
                        item.get("quantity"),
                        item.get("referencePrice"),
                        item.get("stopPrice"),
                    )
                    for item in (operation_plan.get("manualOrderChecklist") or {}).get("items", [])
                ],
                "candidates": [(item.get("code"), item.get("grade"), item.get("status")) for item in candidates],
                "exits": [(item.get("code"), item.get("target"), item.get("stop")) for item in exits],
            },
            ensure_ascii=False,
            sort_keys=True,
        ).encode("utf-8")
    ).hexdigest()[:16]
    suffix = hashlib.sha256(now.encode("utf-8")).hexdigest()[:8] if force_id else action_hash

    return {
        "id": f"signal-{signal_date}-{reason}-{suffix}",
        "date": signal_date,
        "time": now,
        "reason": reason,
        "actionHash": action_hash,
        "status": summary["status"],
        "recommendation": summary["recommendation"],
        "execution": default_execution_record(summary["status"], summary["recommendation"]),
        "marketValue": summary["marketValue"],
        "pnl": summary["pnl"],
        "pnlPct": summary["pnlPct"],
        "positions": positions,
        "exitPlans": exits,
        "candidates": candidates,
        "operationPlan": operation_plan,
        "manualOrderChecklist": operation_plan.get("manualOrderChecklist"),
        "suggestedActions": build_suggested_actions(operation_plan),
        "dataQuality": quality,
        "dataSnapshot": {
            "marketUpdate": (state.get("marketUpdates") or [None])[0],
            "fundNavSync": state.get("fundNavSync"),
            "fundNavCrossCheck": state.get("fundNavCrossCheck"),
            "efundsSync": state.get("efundsSync"),
            "newsSync": state.get("newsSync"),
            "financialEventSync": state.get("financialEventSync"),
        },
        "checkpoints": {
            "day5": {"status": "pending", "returnPct": None, "excessPct": None, "maxDrawdownPct": None},
            "day20": {"status": "pending", "returnPct": None, "excessPct": None, "maxDrawdownPct": None},
            "day60": {"status": "pending", "returnPct": None, "excessPct": None, "maxDrawdownPct": None},
        },
    }


def formal_start_gate(state):
    portfolio = state.get("portfolio") or []
    watchlist = state.get("watchlist") or []
    latest_market = (state.get("marketUpdates") or [None])[0]
    market_age = days_since(latest_market.get("time") if latest_market else None)
    fund_nav_age = days_since((state.get("fundNavSync") or {}).get("time"))
    crosscheck_age = days_since((state.get("fundNavCrossCheck") or {}).get("time"))
    source_age = days_since((state.get("sourceWhitelistSync") or {}).get("time"))
    news_age = days_since((state.get("newsSync") or {}).get("time"))
    financial_age = days_since((state.get("financialEventSync") or {}).get("time"))
    fund_positions = [
        item
        for item in portfolio
        if "场外" in str(item.get("type", "")) or "联接" in str(item.get("type", ""))
    ]
    typed_positions = [
        item
        for item in portfolio
        if item.get("type")
        and item.get("code")
        and item.get("name")
        and safe_float(item.get("cost")) > 0
        and safe_float(item.get("current")) > 0
        and safe_float(item.get("quantity")) > 0
    ]
    explained_candidates = [
        item
        for item in watchlist
        if item.get("code")
        and item.get("grade")
        and item.get("totalScore") is not None
        and isinstance(item.get("scoreReasons"), list)
        and isinstance(item.get("riskFlags"), list)
    ]
    actionable_candidates = [
        item
        for item in explained_candidates
        if item.get("grade") in ("A", "B")
        and item.get("status") not in ("剔除", "数据缺失")
        and safe_float(item.get("price") or item.get("close")) > 0
    ]
    crosscheck = state.get("fundNavCrossCheck") or {}
    email = state.get("latestEmailReminder") or {}
    signal = build_signal_snapshot(state, reason="start-gate")
    signal_quality = signal.get("dataQuality") or {}
    items = []

    def add(key, title, ok, status, message):
        items.append({
            "key": key,
            "title": title,
            "ok": bool(ok),
            "status": status,
            "message": message,
        })

    add("portfolio", "真实持仓台账", bool(portfolio) and len(typed_positions) == len(portfolio), f"{len(typed_positions)}/{len(portfolio)} 完整", "每只持仓都要有代码、名称、类型、成本、当前价和份额。")
    add("source_whitelist", "权威信息源白名单", bool(state.get("sourceWhitelist")) and (source_age is None or source_age <= 30), f"{len(state.get('sourceWhitelist') or [])} 个来源", "白名单为空或超过 30 天未同步，新闻不能进入正式样本。")
    add("market_data", "场内 ETF 行情", latest_market and (market_age is None or market_age <= 3) and bool(watchlist), f"{latest_market.get('count') if latest_market else 0} 只", "ETF 行情缺失或超过 3 天，不能保存正式建议。")
    add("fund_nav", "场外基金净值", not fund_positions or (state.get("fundNavSync") and (fund_nav_age is None or fund_nav_age <= 3)), f"{(state.get('fundNavSync') or {}).get('count') or 0} 只", "有场外/联接基金持仓时，净值必须在 3 天内同步。")
    add(
        "fund_crosscheck",
        "官网净值核对",
        not fund_positions or (
            crosscheck
            and crosscheck.get("mismatchCount", 0) == 0
            and not crosscheck.get("errors")
            and (crosscheck_age is None or crosscheck_age <= 3)
        ),
        f"一致 {crosscheck.get('verifiedCount') or 0}/{crosscheck.get('count') or 0}",
        "易方达官网核对不能有差异或错误，并且要在 3 天内完成。",
    )
    add("candidate_explain", "ETF 候选解释", bool(explained_candidates) and bool(actionable_candidates), f"可解释 {len(explained_candidates)} 只，A/B {len(actionable_candidates)} 只", "候选 ETF 必须有分数、等级、正向理由、风险提示，且至少有 1 只 A/B 级可观察标的。")
    add("news_events", "新闻事件", bool(state.get("newsEvents")) and (news_age is None or news_age <= 14), f"{len(state.get('newsEvents') or [])} 条", "权威新闻事件为空或超过 14 天未同步。")
    add("financial_events", "财报事件", bool(state.get("financialEvents")) and (financial_age is None or financial_age <= 14), f"{len(state.get('financialEvents') or [])} 条", "金融巨头财报事件为空或超过 14 天未同步。")
    add("email_five_answers", "邮件五个问题", len(email.get("fiveAnswers") or []) == 5 and "## 五个问题" in str(email.get("body") or ""), f"{len(email.get('fiveAnswers') or [])}/5", "每日邮件必须能回答 5 个核心问题，避免提醒和网页口径不一致。")
    add("signal_preview", "今日信号预检", bool(signal_quality.get("ok")), "通过" if signal_quality.get("ok") else "阻塞", "当前信号预检或数据质量检查未通过。")

    blockers = [item for item in items if not item["ok"]]
    return {
        "ready": not blockers,
        "time": datetime.now().isoformat(timespec="seconds"),
        "okCount": len(items) - len(blockers),
        "total": len(items),
        "items": items,
        "blockers": blockers,
    }


def record_signal(state, reason="daily-run", force=False, allow_stale=False, enforce_start_gate=False):
    signal = build_signal_snapshot(state, reason=reason, force_id=force)
    quality = signal["dataQuality"]
    if not quality["ok"] and not allow_stale:
        return {
            "ok": False,
            "status": "skipped",
            "reason": "critical_data_not_ready",
            "message": "关键数据未就绪，未保存新信号。",
            "dataQuality": quality,
            "signal": signal,
        }

    if enforce_start_gate:
        gate = formal_start_gate(state)
        if not gate["ready"]:
            return {
                "ok": False,
                "status": "gate_blocked",
                "reason": "formal_start_gate_not_ready",
                "message": "正式实验开始检查未通过，未写入正式信号样本。",
                "startGate": gate,
                "dataQuality": quality,
                "signal": signal,
            }

    signals = state.setdefault("signalHistory", [])
    duplicate = find_duplicate_signal(signals, signal)
    if duplicate and not force:
        return {
            "ok": True,
            "status": "duplicate",
            "reason": "same_trading_day_already_recorded",
            "message": "同一交易日已经保存正式信号，本次不重复记录。",
            "signalId": duplicate.get("id"),
            "date": duplicate.get("date"),
        }

    pending_count = execution_pending_count(state)
    if pending_count > 0 and not force:
        return {
            "ok": True,
            "status": "execution_pending_blocked",
            "reason": "pending_execution_records",
            "message": f"还有 {pending_count} 条正式信号没有补执行结果，本次不新增正式信号；请先补已执行、未执行或延后和原因。",
            "date": signal.get("date"),
            "executionPending": pending_count,
            "signal": signal,
        }

    signals.insert(0, signal)
    state["signalHistory"] = signals[:200]
    experiment = state.get("formalExperiment")
    if isinstance(experiment, dict) and experiment.get("status") == "active":
        experiment["currentSignalCount"] = len(state["signalHistory"])
        experiment["lastSignalAt"] = signal.get("time")
        experiment["lastSignalDate"] = signal.get("date")
        experiment["updatedAt"] = datetime.now().isoformat(timespec="seconds")
        state["formalExperiment"] = experiment
    return {
        "ok": True,
        "status": "recorded",
        "message": "已保存当前建议信号。",
        "signalId": signal["id"],
        "date": signal["date"],
        "dataQuality": quality,
    }


def find_duplicate_signal(signals, signal):
    return next(
        (
            item
            for item in signals
            if item.get("date") == signal["date"]
        ),
        None,
    )


def preview_signal(state, reason="manual", allow_stale=False):
    signal = build_signal_snapshot(state, reason=reason)
    quality = signal["dataQuality"]
    if not quality["ok"] and not allow_stale:
        return {
            "ok": False,
            "status": "skipped",
            "reason": "critical_data_not_ready",
            "message": "关键数据未就绪，正式保存会被跳过。",
            "dataQuality": quality,
            "signal": signal,
        }

    duplicate = find_duplicate_signal(state.get("signalHistory") or [], signal)
    if duplicate:
        return {
            "ok": True,
            "status": "duplicate",
            "reason": "same_trading_day_already_recorded",
            "message": "同一交易日已经保存正式信号，正式保存不会重复记录。",
            "signalId": duplicate.get("id"),
            "date": duplicate.get("date"),
            "signal": signal,
        }

    return {
        "ok": True,
        "status": "preview",
        "message": "预检通过，正式保存会新增一条信号。",
        "date": signal["date"],
        "dataQuality": quality,
        "signal": signal,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reason", default="daily-run")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--allow-stale", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--enforce-start-gate", action="store_true")
    args = parser.parse_args()

    state = load_state()
    if args.dry_run:
        result = preview_signal(state, reason=args.reason, allow_stale=args.allow_stale)
    else:
        result = record_signal(
            state,
            reason=args.reason,
            force=args.force,
            allow_stale=args.allow_stale,
            enforce_start_gate=args.enforce_start_gate,
        )

    if not args.dry_run and result.get("status") == "recorded":
        save_state(state)
    print(json.dumps({"ok": result.get("ok", False), **result}, ensure_ascii=False))


if __name__ == "__main__":
    main()
