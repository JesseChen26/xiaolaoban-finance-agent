import argparse
import json
from datetime import datetime, timedelta

from record_signal import formal_start_gate, load_state, parse_date, save_state, safe_float
from execution_status import is_recorded_execution_status, normalize_execution_status


WINDOWS = {
    "day5": 5,
    "day20": 20,
    "day60": 60,
}


def now_text():
    return datetime.now().replace(microsecond=0).isoformat()


def days_since(value):
    parsed = parse_date(value)
    if not parsed:
        return None
    return (datetime.now().date() - parsed).days


def add_weekdays(start_date, days):
    current = start_date
    remaining = int(max(0, days))
    while remaining > 0:
        current += timedelta(days=1)
        if current.weekday() < 5:
            remaining -= 1
    return current


def estimated_review_date(signal_date, target_days):
    parsed = parse_date(signal_date)
    if not parsed:
        return ""
    return add_weekdays(parsed, target_days).isoformat()


def latest_market_update(state):
    updates = state.get("marketUpdates") or []
    if isinstance(updates, list) and updates:
        return updates[0]
    return state.get("marketUpdate") or None


def latest_trading_date(state):
    dates = []
    for item in state.get("watchlist") or []:
        value = item.get("lastMarketDate") or item.get("date")
        if value:
            dates.append(str(value)[:10])
    if dates:
        return sorted(dates)[-1]
    update = latest_market_update(state)
    if update and update.get("time"):
        return str(update["time"])[:10]
    return datetime.now().date().isoformat()


def recorded_week_count(signals):
    weeks = set()
    for signal in signals or []:
        parsed = parse_date(signal.get("date") or signal.get("time"))
        if parsed:
            year, week, _ = parsed.isocalendar()
            weeks.add(f"{year}-W{week:02d}")
    return len(weeks)


def signal_key(signal):
    return "|".join([
        str(signal.get("date") or ""),
        str(signal.get("reason") or ""),
        str(signal.get("actionHash") or ""),
    ])


def execution_summary(signals):
    counts = {}
    pending_signals = []
    for signal in signals or []:
        execution = signal.get("execution") or {}
        status = normalize_execution_status(execution.get("status"))
        counts[status] = counts.get(status, 0) + 1
        if not is_recorded_execution_status(status):
            pending_signals.append(
                {
                    "id": signal.get("id"),
                    "date": signal.get("date"),
                    "status": signal.get("status"),
                    "recommendation": signal.get("recommendation"),
                }
            )
    total = len(signals or [])
    pending = len(pending_signals)
    recorded = total - pending
    return {
        "totalSignals": total,
        "recorded": recorded,
        "pending": pending,
        "coveragePct": round(recorded / total * 100, 2) if total else None,
        "statusCounts": counts,
        "pendingSignals": pending_signals[:10],
    }


def duplicate_signals(signals):
    seen = {}
    duplicates = []
    for signal in signals or []:
        key = signal_key(signal)
        if not key.strip("|"):
            continue
        if key in seen:
            duplicates.append(
                {
                    "firstId": seen[key].get("id"),
                    "duplicateId": signal.get("id"),
                    "date": signal.get("date"),
                    "reason": signal.get("reason"),
                    "actionHash": signal.get("actionHash"),
                }
            )
        else:
            seen[key] = signal
    return duplicates


def due_checkpoints(signals):
    due = []
    for signal in signals or []:
        checkpoints = signal.get("checkpoints") or {}
        for key, target_days in WINDOWS.items():
            item = checkpoints.get(key) or {}
            latest_days = checkpoint_latest_days(item)
            if item.get("status") == "pending" and latest_days >= target_days:
                due.append(
                    {
                        "signalId": signal.get("id"),
                        "date": signal.get("date"),
                        "window": key,
                        "targetTradingDays": target_days,
                        "latestTradingDays": latest_days,
                        "estimatedReviewDate": estimated_review_date(signal.get("date"), target_days),
                        "estimatedReviewRule": "weekday_only",
                    }
                )
    return due


def checkpoint_latest_days(checkpoint):
    latest_days = safe_float(checkpoint.get("latestTradingDays"))
    if latest_days:
        return latest_days
    nested = checkpoint.get("pending") or []
    if not nested:
        return 0
    return max([safe_float(item.get("latestTradingDays")) for item in nested], default=0)


def next_checkpoints(signals):
    upcoming = []
    for signal in signals or []:
        checkpoints = signal.get("checkpoints") or {}
        for key, target_days in WINDOWS.items():
            item = checkpoints.get(key) or {}
            if item.get("status") != "pending":
                continue
            latest_days = checkpoint_latest_days(item)
            remaining = max(0, target_days - latest_days)
            upcoming.append(
                {
                    "signalId": signal.get("id"),
                    "date": signal.get("date"),
                    "window": key,
                    "targetTradingDays": target_days,
                    "latestTradingDays": latest_days,
                    "remainingTradingDays": remaining,
                    "estimatedReviewDate": estimated_review_date(signal.get("date"), target_days),
                    "estimatedReviewRule": "weekday_only",
                    "reason": item.get("reason") or "",
                }
            )
    upcoming.sort(key=lambda item: (item["remainingTradingDays"], item["date"] or ""))
    return upcoming


def add_check(checks, key, title, ok, status, meta, level=None, action=""):
    checks.append(
        {
            "key": key,
            "title": title,
            "ok": bool(ok),
            "level": level or ("ok" if ok else "warn"),
            "status": status,
            "meta": meta,
            "action": action,
        }
    )


def build_guard(state):
    signals = state.get("signalHistory") or []
    settings = state.get("settings") or {}
    formal_recording = bool(settings.get("formalSignalRecording"))
    latest_date = latest_trading_date(state)
    same_day_signals = [item for item in signals if item.get("date") == latest_date]
    execution = execution_summary(signals)
    duplicates = duplicate_signals(signals)
    due = due_checkpoints(signals)
    upcoming = next_checkpoints(signals)
    validation = state.get("signalValidation") or {}
    gate = formal_start_gate(state)
    weeks = recorded_week_count(signals)

    latest_market = latest_market_update(state)
    market_age = days_since(latest_market.get("time") if latest_market else None)
    fund_nav_age = days_since((state.get("fundNavSync") or {}).get("time"))
    crosscheck_age = days_since((state.get("fundNavCrossCheck") or {}).get("time"))
    source_age = days_since((state.get("sourceWhitelistSync") or {}).get("time"))
    news_age = days_since((state.get("newsSync") or {}).get("time"))
    financial_age = days_since((state.get("financialEventSync") or {}).get("time"))
    goal_audit_age = days_since((state.get("goalAudit") or {}).get("time"))
    latest_email = state.get("latestEmailReminder") or {}

    data_fresh = (
        latest_market
        and (market_age is None or market_age <= 3)
        and state.get("fundNavSync")
        and (fund_nav_age is None or fund_nav_age <= 3)
        and state.get("fundNavCrossCheck")
        and safe_float((state.get("fundNavCrossCheck") or {}).get("mismatchCount")) == 0
        and (crosscheck_age is None or crosscheck_age <= 3)
        and state.get("sourceWhitelistSync")
        and (source_age is None or source_age <= 30)
        and state.get("newsSync")
        and (news_age is None or news_age <= 14)
        and state.get("financialEventSync")
        and (financial_age is None or financial_age <= 14)
    )

    checks = []
    add_check(
        checks,
        "formal_mode",
        "正式样本状态",
        formal_recording,
        "正式记录中" if formal_recording else "预演模式",
        (
            f"正式信号 {len(signals)}/30 条，记录周数 {weeks}/8。"
            if formal_recording
            else "正式样本记录未开启；当前只预检、提醒和做数据健康检查。"
        ),
        level="ok" if formal_recording else "warn",
        action="准备开始时，从首页“正式实验开始检查”开启正式记录。",
    )
    add_check(
        checks,
        "start_gate",
        "开始门禁",
        gate.get("ready"),
        f"{gate.get('okCount', 0)}/{gate.get('total', 0)}",
        "正式记录写入前必须通过持仓、数据、候选解释、新闻/财报和邮件五问检查。",
        action="若门禁不通过，先处理阻塞项，不要强行记入正式样本。",
    )
    add_check(
        checks,
        "latest_signal",
        "最近交易日信号",
        (not formal_recording) or bool(same_day_signals),
        f"{len(same_day_signals)} 条",
        f"最近交易日 {latest_date}；正式记录开启后，当天至少要保存一条观察/空仓/操作建议。",
        level="ok" if (not formal_recording or same_day_signals) else "warn",
        action="正式记录开启后，若这里为 0，点击“每日运行”或“记录当前信号”。",
    )
    add_check(
        checks,
        "execution",
        "手动执行记录",
        execution["pending"] == 0,
        f"{execution['recorded']}/{execution['totalSignals']}",
        f"未补执行记录 {execution['pending']} 条；覆盖率 {execution['coveragePct'] if execution['coveragePct'] is not None else '-'}%。",
        action="每条正式信号下都要补“已执行/未执行/延后”和原因。",
    )
    add_check(
        checks,
        "duplicates",
        "重复样本",
        not duplicates,
        f"{len(duplicates)} 条",
        "同一交易日、同一理由、同一 actionHash 不应重复计入样本。",
        level="danger" if duplicates else "ok",
        action="如出现重复样本，先暂停正式记录并复核信号历史。",
    )
    add_check(
        checks,
        "validation",
        "5/20/60 回看",
        (not signals) or (validation.get("totalSignals") == len(signals) and not due),
        "待样本" if not signals else f"{validation.get('doneCheckpoints', 0)} 个窗口",
        f"到期未回看窗口 {len(due)} 个；最近验证 {validation.get('time') or '-'}。",
        action="若有到期窗口，点击“回看信号结果”。",
    )
    add_check(
        checks,
        "data_freshness",
        "数据新鲜度",
        data_fresh,
        "正常" if data_fresh else "待同步",
        (
            f"行情 {latest_market.get('time') if latest_market else '-'}；"
            f"净值 {(state.get('fundNavSync') or {}).get('time') or '-'}；"
            f"官网核对 {(state.get('fundNavCrossCheck') or {}).get('time') or '-'}；"
            f"信息源 {(state.get('sourceWhitelistSync') or {}).get('time') or '-'}；"
            f"新闻 {(state.get('newsSync') or {}).get('time') or '-'}；"
            f"财报 {(state.get('financialEventSync') or {}).get('time') or '-'}。"
        ),
        action="数据过期时，先运行“每日运行”，不要生成正式买入建议。",
    )
    add_check(
        checks,
        "email",
        "提醒邮件",
        bool(latest_email.get("body")) and len(latest_email.get("fiveAnswers") or []) == 5,
        f"{len(latest_email.get('fiveAnswers') or [])}/5",
        f"最近邮件 {latest_email.get('time') or '-'}；收件人 {settings.get('email') or '-'}。",
        action="邮件缺失时，先生成提醒，确保网页和邮件口径一致。",
    )
    add_check(
        checks,
        "goal_audit",
        "目标审计",
        state.get("goalAudit") and (goal_audit_age is None or goal_audit_age <= 7),
        "已审计" if state.get("goalAudit") else "未审计",
        f"最近目标审计 {(state.get('goalAudit') or {}).get('time') or '-'}。",
        action="每周至少运行一次目标审计，确认仍朝最终目标推进。",
    )

    bad = [item for item in checks if not item["ok"] and item["key"] not in ("formal_mode", "latest_signal")]
    warnings = [item for item in checks if not item["ok"]]
    if duplicates:
        phase = "样本异常"
        level = "danger"
    elif bad:
        phase = "需要处理"
        level = "warn"
    elif formal_recording:
        phase = "采集中"
        level = "ok"
    else:
        phase = "预演守护"
        level = "warn"

    next_actions = [item["action"] for item in warnings if item.get("action")]
    if not next_actions:
        next_actions = ["继续按每日流程积累样本，不扩大资金。"]

    return {
        "time": now_text(),
        "phase": phase,
        "level": level,
        "latestTradingDate": latest_date,
        "formalSignalRecording": formal_recording,
        "signalCount": len(signals),
        "recordedWeeks": weeks,
        "requiredSignals": 30,
        "requiredWeeks": 8,
        "sameDaySignalCount": len(same_day_signals),
        "execution": execution,
        "duplicateSignals": duplicates[:10],
        "dueCheckpoints": due[:20],
        "nextCheckpoints": upcoming[:20],
        "checks": checks,
        "nextActions": next_actions[:5],
        "conclusion": (
            "正式样本记录尚未开启，当前守护只检查准备状态。"
            if not formal_recording
            else "正式样本采集中；请每天检查是否漏记信号、漏补执行和漏回看。"
        ),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    state = load_state()
    guard = build_guard(state)
    if not args.dry_run:
        state["sampleGuard"] = guard
        runs = state.get("sampleGuardRuns") or []
        runs.insert(
            0,
            {
                "time": guard["time"],
                "phase": guard["phase"],
                "level": guard["level"],
                "formalSignalRecording": guard["formalSignalRecording"],
                "signalCount": guard["signalCount"],
                "recordedWeeks": guard["recordedWeeks"],
                "sameDaySignalCount": guard["sameDaySignalCount"],
                "executionPending": guard["execution"]["pending"],
                "dueCheckpointCount": len(guard["dueCheckpoints"]),
                "nextCheckpointCount": len(guard.get("nextCheckpoints") or []),
            },
        )
        state["sampleGuardRuns"] = runs[:50]
        save_state(state)

    print(json.dumps({"ok": True, "written": not args.dry_run, **guard, "guard": guard}, ensure_ascii=False))


if __name__ == "__main__":
    main()
