import argparse
import json
from datetime import datetime

from execution_status import signal_execution_recorded
from record_signal import (
    build_operation_plan,
    formal_start_gate,
    load_state,
    parse_date,
    portfolio_summary,
    save_state,
    safe_float,
)


REQUIRED_REVIEW_WINDOWS = ("day5", "day20", "day60")


def now_text():
    return datetime.now().replace(microsecond=0).isoformat()


def latest_market_update(state):
    updates = state.get("marketUpdates") or []
    if isinstance(updates, list) and updates:
        return updates[0]
    return state.get("marketUpdate") or None


def recorded_week_count(signals):
    weeks = set()
    for signal in signals or []:
        parsed = parse_date(signal.get("date") or signal.get("time"))
        if parsed:
            year, week, _ = parsed.isocalendar()
            weeks.add(f"{year}-W{week:02d}")
    return len(weeks)


def days_since(value):
    parsed = parse_date(value)
    if not parsed:
        return None
    return (datetime.now().date() - parsed).days


def grade_counts(state):
    counts = {}
    for source in state.get("sourceWhitelist") or []:
        grade = source.get("grade") or "未分级"
        counts[grade] = counts.get(grade, 0) + 1
    return counts


def clean_phrase(value):
    return str(value or "").strip().rstrip("。；;，, ")


def execution_summary(signals):
    total = len(signals or [])
    recorded = 0
    for signal in signals or []:
        if signal_execution_recorded(signal):
            recorded += 1
    return {
        "totalSignals": total,
        "recorded": recorded,
        "pending": max(0, total - recorded),
        "coveragePct": round(recorded / total * 100, 2) if total else None,
    }


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


def is_typed_position(item):
    return (
        item.get("code")
        and item.get("name")
        and item.get("type")
        and safe_float(item.get("cost")) > 0
        and safe_float(item.get("current")) > 0
        and safe_float(item.get("quantity")) > 0
    )


def is_explained_candidate(item):
    return (
        item.get("code")
        and item.get("grade")
        and item.get("totalScore") is not None
        and isinstance(item.get("scoreReasons"), list)
        and isinstance(item.get("riskFlags"), list)
    )


def add_step(items, step, title, ok, status, evidence, next_action, level=None):
    items.append(
        {
            "step": step,
            "title": title,
            "ok": bool(ok),
            "level": level or ("ok" if ok else "warn"),
            "status": status,
            "evidence": evidence,
            "nextAction": next_action,
        }
    )


def build_audit(state):
    portfolio = state.get("portfolio") or []
    watchlist = state.get("watchlist") or []
    signals = state.get("signalHistory") or []
    settings = state.get("settings") or {}
    latest_market = latest_market_update(state)
    plan = build_operation_plan(state)
    gate = formal_start_gate(state)
    summary = portfolio_summary(state)
    validation = state.get("signalValidation") or {}
    latest_email = state.get("latestEmailReminder") or {}
    execution = execution_summary(signals)

    typed_positions = [item for item in portfolio if is_typed_position(item)]
    explained = [item for item in watchlist if is_explained_candidate(item)]
    ab_candidates = [item for item in explained if item.get("grade") in ("A", "B")]
    top_candidate = sorted(ab_candidates, key=lambda item: safe_float(item.get("totalScore")), reverse=True)
    top_candidate = top_candidate[0] if top_candidate else None
    top_reasons = [clean_phrase(item) for item in ((top_candidate or {}).get("scoreReasons") or [])[:2]]
    top_reason_text = "；".join(item for item in top_reasons if item) or "-"

    market_age = days_since(latest_market.get("time") if latest_market else None)
    fund_nav_age = days_since((state.get("fundNavSync") or {}).get("time"))
    crosscheck_age = days_since((state.get("fundNavCrossCheck") or {}).get("time"))
    source_age = days_since((state.get("sourceWhitelistSync") or {}).get("time"))
    news_age = days_since((state.get("newsSync") or {}).get("time"))
    financial_age = days_since((state.get("financialEventSync") or {}).get("time"))

    fund_crosscheck = state.get("fundNavCrossCheck") or {}
    source_count = len(state.get("sourceWhitelist") or [])
    news_count = len(state.get("newsEvents") or [])
    financial_count = len(state.get("financialEvents") or [])
    signal_count = len(signals)
    weeks = recorded_week_count(signals)
    formal_recording = bool(settings.get("formalSignalRecording"))
    window_status = validation_window_status(validation, 30)
    validation_ready = (
        signal_count >= 30
        and weeks >= 8
        and window_status["complete"]
        and execution["pending"] == 0
    )

    steps = []
    add_step(
        steps,
        1,
        "稳定打开软件",
        True,
        "已具备",
        "本地服务、首页文件和健康接口已建立；当前审计由后端脚本生成。",
        "继续固定使用 http://localhost:4173，不再直接打开 file:// 页面。",
    )
    add_step(
        steps,
        2,
        "建立真实持仓台账",
        bool(portfolio) and len(typed_positions) == len(portfolio),
        "已记录" if portfolio else "待录入",
        f"持仓 {len(portfolio)} 只；字段完整 {len(typed_positions)}/{len(portfolio)}；当前市值 {summary['marketValue']:.2f} 元，盈亏 {summary['pnl']:.2f} 元。",
        "继续用账户截图或成交记录核对成本、份额和最新净值。",
    )
    add_step(
        steps,
        3,
        "建立权威信息源白名单",
        source_count > 0 and (source_age is None or source_age <= 30),
        "已接入" if source_count else "待同步",
        f"白名单 {source_count} 个来源；分级 {grade_counts(state)}；黑名单规则 {len(state.get('sourceBlacklistRules') or [])} 条。",
        "只允许 A/B 来源进入事件验证，C 级只做背景，D 级过滤。",
    )
    add_step(
        steps,
        4,
        "同步行情、净值、基金数据",
        bool(latest_market)
        and (market_age is None or market_age <= 3)
        and bool(state.get("fundNavSync"))
        and (fund_nav_age is None or fund_nav_age <= 3)
        and bool(fund_crosscheck)
        and safe_float(fund_crosscheck.get("mismatchCount")) == 0
        and (crosscheck_age is None or crosscheck_age <= 3),
        "正常" if latest_market and state.get("fundNavSync") else "待同步",
        (
            f"ETF 行情 {latest_market.get('count') if latest_market else 0} 只，"
            f"最近 {latest_market.get('time') if latest_market else '-'}；基金净值 "
            f"{(state.get('fundNavSync') or {}).get('count', 0)} 只；官网核对一致 "
            f"{fund_crosscheck.get('verifiedCount', 0)}/{fund_crosscheck.get('count', 0)}。"
        ),
        "若行情、净值或官网核对超过 3 天，先同步数据再生成建议。",
    )
    add_step(
        steps,
        5,
        "建立 ETF 候选池评分",
        bool(explained) and bool(ab_candidates),
        "可解释" if explained else "待补充",
        f"候选 ETF {len(watchlist)} 只；带评分解释 {len(explained)} 只；A/B 级 {len(ab_candidates)} 只。",
        "每天只从 A/B 级里观察，C 级只记录，D 级剔除或等待改善。",
    )
    add_step(
        steps,
        6,
        "生成每日操作建议",
        bool(plan.get("items")),
        plan.get("label") or "待计算",
        f"今日操作计划 {len(plan.get('items') or [])} 项；当前账户状态：{summary['status']}。",
        "建议必须写明持有、观察、空仓、暂停或退出，不能只写模糊判断。",
    )
    add_step(
        steps,
        7,
        "接入邮件提醒",
        bool(latest_email.get("body")) and len(latest_email.get("fiveAnswers") or []) == 5,
        "已生成" if latest_email.get("body") else "待生成",
        f"收件人 {settings.get('email') or '-'}；邮件五问 {len(latest_email.get('fiveAnswers') or [])}/5；最近生成 {latest_email.get('time') or '-'}。",
        "每日收盘后继续发送，邮件数字必须和软件一致。",
    )
    add_step(
        steps,
        8,
        "做新闻和财报事件验证",
        news_count > 0
        and (news_age is None or news_age <= 14)
        and financial_count > 0
        and (financial_age is None or financial_age <= 14),
        "已接入" if news_count and financial_count else "待接入",
        f"新闻事件 {news_count} 条，最近 {((state.get('newsSync') or {}).get('time') or '-')}; 财报事件 {financial_count} 条，最近 {((state.get('financialEventSync') or {}).get('time') or '-')}。",
        "新闻和财报只能作为事件证据，不能单独触发买入。",
    )
    add_step(
        steps,
        9,
        "保存每一次买入/卖出/空仓建议",
        formal_recording and signal_count > 0,
        "已开始" if formal_recording and signal_count else "预演模式" if not formal_recording else "待积累",
        f"正式样本记录 {'已开启' if formal_recording else '未开启'}；正式信号 {signal_count}/30 条；执行记录 {execution['recorded']}/{execution['totalSignals']}。",
        "正式开始后，每一条观察、买入、卖出、赎回、空仓和暂停都要保存，失败样本也不能删除。",
    )
    add_step(
        steps,
        10,
        "用 5/20/60 日结果验证可信度",
        validation_ready,
        "可评估" if validation_ready else "样本不足",
        (
            f"正式信号 {signal_count}/30 条；记录周数 {weeks}/8；"
            f"5日 {window_status['done']['day5']}/30、20日 {window_status['done']['day20']}/30、"
            f"60日 {window_status['done']['day60']}/30；执行待补 {execution['pending']} 条。"
        ),
        "至少 30 条信号、连续 8-12 周、5/20/60 三类回看各满 30 个结果且执行记录完整后，才允许评价是否可信。",
    )

    ok_count = sum(1 for item in steps if item["ok"])
    can_start_formal = bool(gate.get("ready"))
    if validation_ready:
        phase = "可以初步评估"
        level = "ok"
    elif can_start_formal and formal_recording:
        phase = "正式样本积累中"
        level = "warn"
    elif can_start_formal:
        phase = "建设基本就绪，等待开启正式样本"
        level = "warn"
    else:
        phase = "建设中"
        level = "warn"

    five_questions = [
        {
            "question": "我现在持有什么？",
            "level": "ok" if portfolio else "warn",
            "answer": f"{len(portfolio)} 只持仓，当前市值 {summary['marketValue']:.2f} 元，盈亏 {summary['pnl']:.2f} 元。",
        },
        {
            "question": "我现在是盈利、亏损、空仓、暂停交易，还是该退出？",
            "level": "ok",
            "answer": f"{summary['status']}：{summary['recommendation']}",
        },
        {
            "question": "今天有没有值得观察的 ETF/基金？为什么？",
            "level": "ok" if top_candidate else "warn",
            "answer": (
                f"{top_candidate.get('code')} {top_candidate.get('name')}，{top_candidate.get('grade')}级，"
                f"{top_candidate.get('totalScore')} 分；理由：{top_reason_text}。"
                if top_candidate
                else "暂无 A/B 级候选，保持空仓或只观察。"
            ),
        },
        {
            "question": "每条建议来自哪些数据和规则？",
            "level": "ok" if ok_count >= 7 else "warn",
            "answer": f"行情、净值、官网核对、白名单新闻、财报事件、ETF 评分、持仓退出规则和止损规则共同生成；当前 {ok_count}/10 项通过。",
        },
        {
            "question": "过去这些建议到底准不准，是否真的赚钱？",
            "level": "ok" if validation_ready else "warn",
            "answer": (
                "样本、周期、回看和执行记录达到最低门槛，可以进入初步评估。"
                if validation_ready
                else f"还不能下结论：正式信号 {signal_count}/30 条，记录 {weeks}/8 周。"
            ),
        },
    ]

    blockers = [item for item in steps if not item["ok"]]
    return {
        "time": now_text(),
        "overall": {
            "phase": phase,
            "level": level,
            "okCount": ok_count,
            "total": len(steps),
            "canStartFormal": can_start_formal,
            "canClaimCredible": validation_ready,
            "formalSignalRecording": formal_recording,
            "signalCount": signal_count,
            "recordedWeeks": weeks,
            "requiredSignals": 30,
            "requiredWeeks": 8,
            "blockerCount": len(blockers),
        },
        "sampleGate": {
            "formalSignalRecording": formal_recording,
            "formalExperiment": state.get("formalExperiment"),
            "signalCount": signal_count,
            "recordedWeeks": weeks,
            "doneCheckpoints": validation.get("doneCheckpoints", 0),
            "reviewWindows": window_status,
            "executionPending": execution["pending"],
            "canEvaluate": validation_ready,
        },
        "startGate": gate,
        "steps": steps,
        "fiveQuestions": five_questions,
        "conclusion": (
            "系统建设已经接近正式实验条件，但仍不能称为预测可信；必须等待正式样本积累。"
            if not validation_ready
            else "样本门槛已达到，可以开始审慎评估策略表现。"
        ),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    state = load_state()
    audit = build_audit(state)
    if not args.dry_run:
        state["goalAudit"] = audit
        runs = state.get("goalAuditRuns") or []
        runs.insert(
            0,
            {
                "time": audit["time"],
                "phase": audit["overall"]["phase"],
                "okCount": audit["overall"]["okCount"],
                "total": audit["overall"]["total"],
                "canStartFormal": audit["overall"]["canStartFormal"],
                "canClaimCredible": audit["overall"]["canClaimCredible"],
                "signalCount": audit["overall"]["signalCount"],
                "recordedWeeks": audit["overall"]["recordedWeeks"],
                "blockerCount": audit["overall"]["blockerCount"],
            },
        )
        state["goalAuditRuns"] = runs[:30]
        save_state(state)

    print(json.dumps({"ok": True, "written": not args.dry_run, "audit": audit}, ensure_ascii=False))


if __name__ == "__main__":
    main()
