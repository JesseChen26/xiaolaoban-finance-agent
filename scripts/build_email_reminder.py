import argparse
import hashlib
import json
import math
import os
from datetime import datetime
from pathlib import Path

from build_next_action_report import build_report as build_next_action_report
from execution_status import signal_execution_recorded
from record_signal import build_operation_plan
from state_store import save_json_atomic


ROOT = Path(__file__).resolve().parents[1]
STATE_PATH = Path(os.environ.get("STATE_PATH_OVERRIDE") or ROOT / "data" / "state.json")
DATA_DIR = STATE_PATH.parent
LATEST_JSON_PATH = DATA_DIR / "latest_email_reminder.json"
LATEST_MD_PATH = DATA_DIR / "latest_email_reminder.md"


def safe_float(value):
    try:
        result = float(value)
        if math.isfinite(result):
            return result
    except (TypeError, ValueError):
        pass
    return 0.0


def yuan(value):
    return f"{safe_float(value):.2f}"


def pct(value):
    return f"{safe_float(value):.2f}%"


def maybe_pct(value):
    return "-" if value is None else pct(value)


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


def top_candidates(state):
    rows = sorted(
        state.get("watchlist") or [],
        key=lambda item: safe_float(item.get("totalScore")),
        reverse=True,
    )
    return rows[:5]


def signal_week_key(value):
    if not value:
        return None
    text = str(value).replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text[:10])
    except ValueError:
        return None
    year, week, _ = parsed.isocalendar()
    return f"{year}-W{week:02d}"


def recorded_week_count(signals):
    return len({
        key
        for key in (signal_week_key(item.get("date") or item.get("time")) for item in signals or [])
        if key
    })


REQUIRED_REVIEW_WINDOWS = ("day5", "day20", "day60")


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


def is_execution_recorded(signal):
    return signal_execution_recorded(signal)


def execution_summary(state):
    signals = state.get("signalHistory") or []
    recorded = [
        item
        for item in signals
        if is_execution_recorded(item)
    ]
    pending = max(0, len(signals) - len(recorded))
    return {
        "totalSignals": len(signals),
        "recorded": len(recorded),
        "pending": pending,
        "coveragePct": round(len(recorded) / len(signals) * 100, 2) if signals else None,
    }


def execution_todo_items(state):
    items = []
    for signal in state.get("signalHistory") or []:
        if is_execution_recorded(signal):
            continue
        action = (signal.get("execution") or {}).get("action") or "观察"
        action_items = [
            "先补执行记录：选择已执行、未执行、部分执行或延后，并写清楚原因",
            f"当时建议动作：{action}；如果没有下单，就标记为未执行或已观察",
            "补齐前暂停新开仓，避免样本混乱",
        ]
        items.append(
            {
                "signalId": signal.get("id"),
                "date": signal.get("date"),
                "status": signal.get("status"),
                "recommendation": signal.get("recommendation"),
                "action": action,
                "actionItems": action_items,
            }
        )
    return items[:10]


def build_five_answers(state, summary):
    positions = state.get("portfolio") or []
    signals = state.get("signalHistory") or []
    weeks = recorded_week_count(signals)
    validation = state.get("signalValidation") or {}
    execution = execution_summary(state)
    performance = state.get("actualPerformanceReport") or {}
    trade_performance = performance.get("tradePerformance") or {}
    credibility = state.get("credibilityReport") or {}
    credibility_metrics = credibility.get("metrics") or {}
    formal_recording = bool((state.get("settings") or {}).get("formalSignalRecording"))
    window_status = validation_window_status(validation, 30)
    can_evaluate = (
        len(signals) >= 30
        and weeks >= 8
        and execution["pending"] == 0
        and window_status["complete"]
    )
    exits = [item for item in positions if safe_float(item.get("target")) > 0 or safe_float(item.get("stop")) > 0]
    candidates = top_candidates(state)
    top_candidate = next(
        (
            item
            for item in candidates
            if (item.get("grade") or "") in ("A", "B") and (item.get("status") or "") not in ("剔除", "数据缺失")
        ),
        candidates[0] if candidates else None,
    )
    latest_market = (state.get("marketUpdates") or [None])[0]
    source_count = len(state.get("sourceWhitelist") or [])
    news_count = len(state.get("newsEvents") or [])
    financial_count = len(state.get("financialEvents") or [])
    position_names = "；".join(f"{item.get('code')} {item.get('name') or ''}" for item in positions[:3])
    exit_summaries = join_phrases(f"{item.get('code')} {position_action(item)}" for item in exits[:2])

    holding_answer = (
        f"{len(positions)} 只持仓，当前市值 {yuan(summary['marketValue'])} 元，盈亏 {yuan(summary['pnl'])} 元。"
        f"主要持仓：{position_names}。"
        if positions
        else "当前没有持仓，应保持空仓，只观察候选池。"
    )
    exit_answer = (
        f"{summary['status']}。{summary['recommendation']} 退出关注："
        f"{exit_summaries}。"
        if exits
        else f"{summary['status']}。{summary['recommendation']} 当前没有触发止损或退出目标。"
    )
    if top_candidate:
        reasons = join_phrases((top_candidate.get("scoreReasons") or [])[:2], "暂无明确正向解释")
        risks = join_phrases((top_candidate.get("riskFlags") or [])[:2], "暂无明显硬伤")
        candidate_answer = (
            f"{top_candidate.get('code')} {top_candidate.get('name') or ''}："
            f"{top_candidate.get('grade') or 'D'}级，{safe_float(top_candidate.get('totalScore')):.0f}分，"
            f"{top_candidate.get('status') or '未评分'}。理由：{reasons}。风险：{risks}。"
        )
        candidate_status = f"{top_candidate.get('grade') or 'D'}级"
    else:
        candidate_answer = "当前没有可展示的候选 ETF，保持空仓等待。"
        candidate_status = "无候选"

    rule_answer = "；".join([
        f"ETF 行情 {latest_market.get('time')}，{latest_market.get('count')} 只" if latest_market else "ETF 行情未更新",
        f"基金净值 {state.get('fundNavSync', {}).get('time')}，{state.get('fundNavSync', {}).get('count')} 只" if state.get("fundNavSync") else "基金净值未同步",
        f"官网核对一致 {state.get('fundNavCrossCheck', {}).get('verifiedCount') or 0}/{state.get('fundNavCrossCheck', {}).get('count') or 0}" if state.get("fundNavCrossCheck") else "官网核对未完成",
        f"白名单 {source_count} 个来源",
        f"新闻 {news_count} 条",
        f"财报 {financial_count} 条",
    ]) + "。建议由持仓规则、退出规则、ETF 评分、数据质量和手动执行边界共同生成。"
    trade_answer = (
        f"真实成交：{performance.get('verdict')}，成交 {trade_performance.get('tradeCount', 0)} 条，"
        f"成交盈亏 {safe_float(trade_performance.get('totalPnl')):.2f} 元。"
        if performance
        else "真实成交：尚未生成执行表现报告。"
    )
    if credibility and credibility.get("canClaimCredible"):
        signal_answer = (
            f"可信度判定：{credibility.get('verdict')}；"
            f"平均超额 {maybe_pct(credibility_metrics.get('avgExcessPct'))}，"
            f"胜率下界 {maybe_pct(credibility_metrics.get('wilsonLowerPct'))}，"
            f"最差回撤 {maybe_pct(credibility_metrics.get('worstMaxDrawdownPct'))}。"
        )
    elif can_evaluate:
        signal_answer = (
            f"已有 {len(signals)} 条信号、{weeks} 周记录；已回看 {validation.get('doneCheckpoints') or 0} 个窗口，"
            f"平均超额 {maybe_pct(validation.get('avgExcessPct'))}，"
            f"最差最大回撤 {maybe_pct(validation.get('worstMaxDrawdownPct'))}。"
        )
    elif not formal_recording:
        signal_answer = (
            f"当前为预演模式，正式信号 {len(signals)}/30 条；每日运行和生成评分只预检，不计入样本。"
            "开启正式样本记录后，才开始积累 8-12 周和 30 条信号。"
        )
    else:
        prefix = (
            f"可信度判定：{credibility.get('verdict')}，阻塞项 {credibility.get('blockerCount', 0)} 个；"
            if credibility
            else ""
        )
        signal_answer = (
            prefix
            + f"正式信号 {len(signals)}/30 条，记录 {weeks}/8 周，执行记录 {execution['recorded']}/{execution['totalSignals']} 条；"
            + f"5日 {window_status['done']['day5']}/30，20日 {window_status['done']['day20']}/30，60日 {window_status['done']['day60']}/30；"
            + "样本不足，不能说预测可信，也不能扩大仓位。"
        )
    accuracy_answer = f"{signal_answer} {trade_answer}"

    return [
        {"title": "我现在持有什么？", "status": f"{len(positions)} 只" if positions else "空仓", "answer": holding_answer},
        {"title": "我现在是什么状态，是否该退出？", "status": summary["status"], "answer": exit_answer},
        {"title": "今天有没有值得观察的 ETF/基金？为什么？", "status": candidate_status, "answer": candidate_answer},
        {"title": "每条建议来自哪些数据和规则？", "status": "可追溯", "answer": rule_answer},
        {"title": "过去这些建议准不准，是否赚钱？", "status": credibility.get("verdict") if credibility else "可评估" if can_evaluate else "样本不足" if formal_recording else "预演模式", "answer": accuracy_answer},
    ]


def checkpoint_status_line(state):
    guard = state.get("sampleGuard") or {}
    due = guard.get("dueCheckpoints") or []
    upcoming = guard.get("nextCheckpoints") or []
    if due:
        item = due[0]
        target = int(safe_float(item.get("targetTradingDays")))
        estimated = item.get("estimatedReviewDate") or "-"
        return f"复盘提醒：{len(due)} 个回看窗口已到期，先回看 {item.get('date') or '-'} 的 {target} 日结果；预计日期 {estimated}。"
    if upcoming:
        item = upcoming[0]
        target = int(safe_float(item.get("targetTradingDays")))
        remaining = int(safe_float(item.get("remainingTradingDays")))
        estimated = item.get("estimatedReviewDate") or "-"
        return f"复盘提醒：下一次是 {item.get('date') or '-'} 的 {target} 日回看，还差约 {remaining} 个交易日；预计日期 {estimated}。"
    if state.get("signalHistory"):
        return "复盘提醒：暂无到期回看窗口，继续等待真实交易日。"
    return "复盘提醒：还没有正式信号。"


def data_health(state):
    latest_market = (state.get("marketUpdates") or [None])[0]
    signals = state.get("signalHistory") or []
    experiment = state.get("formalExperiment") or {}
    experiment_events = state.get("formalExperimentEvents") or []
    sample_guard = state.get("sampleGuard") or {}
    performance = state.get("actualPerformanceReport") or {}
    trade_performance = performance.get("tradePerformance") or {}
    credibility = state.get("credibilityReport") or {}
    next_action_report = build_next_action_report(state)
    primary_action = next_action_report.get("primaryAction") or {}
    recording = bool((state.get("settings") or {}).get("formalSignalRecording"))
    if experiment.get("startedAt"):
        experiment_status = (
            f"正式实验：{'记录中' if recording and experiment.get('status') == 'active' else '已暂停'}，"
            f"起点 {experiment.get('startedAt')}，本轮样本 {max(0, len(signals) - int(safe_float(experiment.get('startSignalCount'))))}/30，"
            f"事件 {len(experiment_events)} 条"
        )
    else:
        experiment_status = "正式实验：预演模式，尚未开始计入正式样本"
    recorded = [
        item
        for item in signals
        if signal_execution_recorded(item)
    ]
    return [
        f"待补执行记录：{len(execution_todo_items(state))} 条；必须在信号验证页补已执行/未执行/延后和原因。",
        f"行情：{latest_market.get('time')}，{latest_market.get('count')} 只候选 ETF" if latest_market else "行情：尚未更新",
        f"净值：{state.get('fundNavSync', {}).get('time')}，{state.get('fundNavSync', {}).get('count')} 只持仓" if state.get("fundNavSync") else "净值：尚未更新",
        f"信息源：白名单 {len(state.get('sourceWhitelist') or [])} 个，A/B 来源可进入事件验证" if state.get("sourceWhitelist") else "信息源：白名单尚未同步",
        f"新闻：{state.get('newsSync', {}).get('time')}，{len(state.get('newsEvents') or [])} 条事件" if state.get("newsSync") else "新闻：尚未同步",
        f"财报：{state.get('financialEventSync', {}).get('time')}，{len(state.get('financialEvents') or [])} 条事件" if state.get("financialEventSync") else "财报：尚未同步",
        f"信号：{len(state.get('signalHistory') or [])}/30 条，回看窗口 {state.get('signalValidation', {}).get('doneCheckpoints') or 0} 个",
        f"正式样本记录：{'已开启，会写入 signalHistory' if (state.get('settings') or {}).get('formalSignalRecording') else '未开启，只预检不计样本'}",
        experiment_status,
        (
            f"样本守护：{sample_guard.get('phase')}，最近交易日 {sample_guard.get('latestTradingDate')}，"
            f"当日信号 {sample_guard.get('sameDaySignalCount', 0)} 条，执行待补 {(sample_guard.get('execution') or {}).get('pending', 0)} 条"
            if sample_guard
            else "样本守护：尚未运行"
        ),
        (
            f"执行表现：{performance.get('verdict')}，成交 {trade_performance.get('tradeCount', 0)} 条，"
            f"真实成交盈亏 {safe_float(trade_performance.get('totalPnl')):.2f} 元"
            if performance
            else "执行表现：尚未生成"
        ),
        (
            f"可信度判定：{credibility.get('verdict')}，{credibility.get('phase')}，阻塞项 {credibility.get('blockerCount', 0)} 个"
            if credibility
            else "可信度判定：尚未生成"
        ),
        (
            f"下一步行动：{primary_action.get('title')}；{primary_action.get('detail')}"
            if primary_action
            else "下一步行动：尚未生成"
        ),
        f"执行：{len(recorded)}/{len(signals)} 条信号已记录手动执行结果",
        f"周报：{state.get('weeklyReview', {}).get('verdict')}，生成于 {state.get('weeklyReview', {}).get('time')}" if state.get("weeklyReview") else "周报：尚未生成",
    ]


def build_body(state, reminder):
    settings = state.get("settings") or {}
    summary = reminder["summary"]
    operation_plan = reminder.get("operationPlan") or build_operation_plan(state, summary=summary)
    five_answers = reminder.get("fiveAnswers") or build_five_answers(state, summary)
    positions = state.get("portfolio") or []
    candidates = top_candidates(state)
    exits = [item for item in positions if safe_float(item.get("target")) > 0 or safe_float(item.get("stop")) > 0]
    validation = state.get("signalValidation") or {}
    credibility = state.get("credibilityReport") or {}
    credibility_metrics = credibility.get("metrics") or {}

    lines = [
        f"# A股小资金实验提醒｜{summary['status']}",
        "",
        f"时间：{reminder['time']}",
        f"收件人：{settings.get('email') or '-'}",
        "",
        "## 今日结论",
        f"- 当前状态：{summary['status']}",
        f"- 建议操作：{summary['recommendation']}",
        "- 执行方式：只提醒，不自动交易；需要你自己登录账户手动执行。",
        "",
        "## 五个问题",
    ]

    for index, item in enumerate(five_answers, start=1):
        lines.append(f"- {index}. {item.get('title')}（{item.get('status')}）：{item.get('answer')}")

    lines.extend([
        "",
        "## 今日操作计划",
    ])

    for item in operation_plan.get("items", []):
        lines.append(f"- {item.get('title')}：{item.get('status')}。{item.get('meta')}")

    lines.extend([
        "",
        "## 手动操作清单",
    ])

    manual_checklist = operation_plan.get("manualOrderChecklist") or {}
    for item in manual_checklist.get("items") or []:
        details = []
        if item.get("code"):
            details.append(f"代码 {item.get('code')}")
        if safe_float(item.get("quantity")):
            details.append(f"数量 {safe_float(item.get('quantity')):.0f} 份")
        if item.get("referencePrice") is not None:
            details.append(f"参考价 {safe_float(item.get('referencePrice')):.4f}")
        if safe_float(item.get("estimatedAmount")):
            details.append(f"预计金额 {yuan(item.get('estimatedAmount'))} 元")
        if item.get("stopPrice") is not None and safe_float(item.get("stopPrice")):
            details.append(f"止损价 {safe_float(item.get('stopPrice')):.3f}")
        if safe_float(item.get("maxLossYuan")):
            details.append(f"计划风险 {yuan(item.get('maxLossYuan'))} 元")
        suffix = f"（{'；'.join(details)}）" if details else ""
        lines.append(f"- {item.get('title')}：{item.get('action') or item.get('status')}。{item.get('meta')}{suffix}")
        for confirm in item.get("confirmations") or []:
            lines.append(f"  - 确认：{confirm}")

    lines.extend([
        "",
        "## 账户概览",
        f"- 总实验资金：{settings.get('totalCapital', 0)} 元",
        f"- 第一阶段实盘资金：{settings.get('trialCapital', 0)} 元",
        f"- 当前持仓市值：{yuan(summary['marketValue'])} 元",
        f"- 当前盈亏：{yuan(summary['pnl'])} 元，{pct(summary['pnlPct'])}",
        "",
        "## 持仓与退出计划",
    ])

    if positions:
        for item in positions:
            value = safe_float(item.get("current")) * safe_float(item.get("quantity"))
            pnl_value = value - safe_float(item.get("cost")) * safe_float(item.get("quantity"))
            lines.append(
                f"- {item.get('code') or '-'} {item.get('name') or '-'}：{item.get('type') or '-'}，"
                f"市值 {yuan(value)} 元，盈亏 {yuan(pnl_value)} 元，当前 {safe_float(item.get('current')):.4f}，"
                f"成本 {safe_float(item.get('cost')):.4f}。{position_action(item)}"
            )
    else:
        lines.append("- 暂无持仓，保持空仓观察。")

    lines.extend(["", "## 重点退出提醒"])
    if exits:
        for item in exits:
            lines.append(
                f"- {item.get('code')} {item.get('name') or ''}：目标价 {safe_float(item.get('target')):.4f}，"
                f"止损价 {safe_float(item.get('stop')):.4f}，当前价 {safe_float(item.get('current')):.4f}。{position_action(item)}"
            )
    else:
        lines.append("- 暂无退出目标。")

    lines.extend(["", "## ETF 候选池"])
    if candidates:
        for item in candidates[:3]:
            reasons = join_phrases((item.get("scoreReasons") or [])[:2], "暂无明确正向解释")
            risks = join_phrases((item.get("riskFlags") or [])[:2], "暂无明显硬伤")
            lines.append(
                f"- {item.get('code') or '-'} {item.get('name') or '-'}："
                f"{item.get('grade') or 'D'}级，{safe_float(item.get('totalScore')):.0f}分，"
                f"{item.get('status') or '未评分'}。理由：{reasons}。风险：{risks}。{item.get('recommendation') or ''}"
            )
    else:
        lines.append("- 暂无候选 ETF。")

    lines.extend(["", "## 数据与可信度"])
    for item in data_health(state):
        lines.append(f"- {item}")
    if credibility:
        lines.extend([
            "",
            "## 可信度判定",
            f"- 判定：{credibility.get('verdict')}（{credibility.get('phase')}）。",
            f"- 结论：{credibility.get('conclusion')}",
            f"- 门槛：信号 {credibility_metrics.get('signalCount', 0)}/30，周数 {credibility_metrics.get('recordedWeeks', 0)}/8，执行待补 {(credibility_metrics.get('execution') or {}).get('pending', 0)} 条。",
            f"- 指标：平均超额 {maybe_pct(credibility_metrics.get('avgExcessPct'))}，胜率下界 {maybe_pct(credibility_metrics.get('wilsonLowerPct'))}，最差回撤 {maybe_pct(credibility_metrics.get('worstMaxDrawdownPct'))}。",
        ])
        for item in (credibility.get("blockers") or [])[:4]:
            lines.append(f"- 阻塞：{item.get('title')}：{item.get('detail')}")
    lines.append(f"- {checkpoint_status_line(state)}")
    lines.append(
        f"- 回看结果：已回看 {validation.get('doneCheckpoints') or 0} 个窗口，"
        f"平均超额 {pct(validation.get('avgExcessPct')) if validation.get('avgExcessPct') is not None else '-'}。"
    )
    lines.append("- 可信度边界：少于 30 条信号、8-12 周记录、执行记录完整和 5/20/60 三类回看各满 30 个结果前，只能叫实验复盘，不能说策略可信。")

    lines.extend(["", "## 注意", "以上为小资金策略实验提醒，不是自动交易，也不保证盈利。"])
    return "\n".join(lines)


def should_send(state, reminder):
    settings = state.get("settings") or {}
    if not settings.get("onlyOnStatusChange"):
        return True, "按设置每日发送。"

    last = state.get("lastEmailReminder") or {}
    if reminder["summary"]["level"] == "danger":
        return True, "风险等级为 danger，即使状态未变也发送。"
    if last.get("status") != reminder["summary"]["status"]:
        return True, "状态发生变化。"
    if last.get("actionHash") != reminder["actionHash"]:
        return True, "建议内容发生变化。"
    return False, "设置为只在状态变化时提醒，当前状态和建议未变。"


def build_reminder(state):
    now = datetime.now().isoformat(timespec="seconds")
    today = now[:10]
    settings = state.get("settings") or {}
    summary = portfolio_summary(state)
    operation_plan = build_operation_plan(state, summary=summary)
    action_hash = hashlib.sha256(
        json.dumps(
            {
                "status": summary["status"],
                "recommendation": summary["recommendation"],
                "operationPlan": [(item.get("title"), item.get("status")) for item in operation_plan.get("items", [])],
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
            },
            ensure_ascii=False,
            sort_keys=True,
        ).encode("utf-8")
    ).hexdigest()[:16]
    subject = f"A股小资金实验提醒｜{summary['status']}｜盈亏 {yuan(summary['pnl'])} 元｜{today}"
    reminder = {
        "id": f"email-{today}-{action_hash}",
        "date": today,
        "time": now,
        "to": settings.get("email") or "",
        "subject": subject,
        "summary": summary,
        "operationPlan": operation_plan,
        "manualOrderChecklist": operation_plan.get("manualOrderChecklist"),
        "executionTodo": execution_todo_items(state),
        "credibilityReport": state.get("credibilityReport"),
        "fiveAnswers": build_five_answers(state, summary),
        "actionHash": action_hash,
    }
    reminder["shouldSend"], reminder["sendReason"] = should_send(state, reminder)
    reminder["body"] = build_body(state, reminder)
    return reminder


def write_latest(state, reminder):
    state["latestEmailReminder"] = {
        key: reminder[key]
        for key in ("id", "date", "time", "to", "subject", "summary", "operationPlan", "manualOrderChecklist", "executionTodo", "credibilityReport", "fiveAnswers", "actionHash", "shouldSend", "sendReason", "body")
    }
    with LATEST_JSON_PATH.open("w", encoding="utf-8") as file:
        json.dump(reminder, file, ensure_ascii=False, indent=2)
    LATEST_MD_PATH.write_text(reminder["body"], encoding="utf-8")


def mark_sent(state):
    reminder = state.get("latestEmailReminder")
    if not reminder and LATEST_JSON_PATH.exists():
        reminder = json.loads(LATEST_JSON_PATH.read_text(encoding="utf-8"))
    if not reminder:
        raise RuntimeError("没有可标记的最新邮件提醒。请先生成提醒。")

    sent = {
        "id": reminder.get("id"),
        "date": reminder.get("date"),
        "time": datetime.now().isoformat(timespec="seconds"),
        "to": reminder.get("to"),
        "subject": reminder.get("subject"),
        "status": (reminder.get("summary") or {}).get("status"),
        "actionHash": reminder.get("actionHash"),
    }
    state["lastEmailReminder"] = sent
    state.setdefault("emailReminderRuns", []).insert(0, sent)
    state["emailReminderRuns"] = state["emailReminderRuns"][:50]
    return sent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mark-sent", action="store_true")
    args = parser.parse_args()

    state = load_state()
    if args.mark_sent:
        payload = {"ok": True, "markedSent": mark_sent(state)}
        save_state(state)
        print(json.dumps(payload, ensure_ascii=False))
        return

    reminder = build_reminder(state)
    write_latest(state, reminder)
    save_state(state)
    print(json.dumps({"ok": True, **reminder}, ensure_ascii=False))


if __name__ == "__main__":
    main()
