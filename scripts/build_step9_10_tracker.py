import json
import os
from datetime import datetime
from pathlib import Path

from build_next_action_report import build_report as build_next_action_report
from execution_status import signal_execution_recorded
from record_signal import parse_date


REQUIRED_REVIEW_WINDOWS = ("day5", "day20", "day60")


ROOT = Path(__file__).resolve().parents[1]
STATE_PATH_OVERRIDE = os.environ.get("STATE_PATH_OVERRIDE")
STATE_PATH = Path(STATE_PATH_OVERRIDE or ROOT / "data" / "state.json")
DATA_MD_PATH = (STATE_PATH.parent if STATE_PATH_OVERRIDE else ROOT / "data") / "step9_10_tracker.md"
ROOT_MD_PATH = (
    STATE_PATH.parent / "第9和第10步执行跟踪.md"
    if STATE_PATH_OVERRIDE
    else ROOT.parent / "第9和第10步执行跟踪.md"
)


def load_state():
    with STATE_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def is_recorded_execution(signal):
    return signal_execution_recorded(signal)


def recorded_week_count(signals):
    weeks = set()
    for signal in signals or []:
        parsed = parse_date(signal.get("date") or signal.get("time"))
        if parsed:
            year, week, _ = parsed.isocalendar()
            weeks.add(f"{year}-W{week:02d}")
    return len(weeks)


def pct(value):
    if value is None:
        return "-"
    try:
        return f"{float(value):.2f}%"
    except (TypeError, ValueError):
        return "-"


def validation_window_status(validation, required_signals=30):
    by_window = validation.get("byWindow") or {}
    done = {}
    required = int(required_signals or 30)
    for key in REQUIRED_REVIEW_WINDOWS:
        try:
            done[key] = int(float((by_window.get(key) or {}).get("done") or 0))
        except (TypeError, ValueError):
            done[key] = 0
    missing = [key for key in REQUIRED_REVIEW_WINDOWS if done.get(key, 0) < required]
    return {
        "done": done,
        "required": required,
        "complete": not missing,
        "missing": missing,
    }


def first_upcoming_checkpoint(state):
    guard = state.get("sampleGuard") or {}
    due = guard.get("dueCheckpoints") or []
    upcoming = guard.get("nextCheckpoints") or []
    if due:
        item = due[0]
        estimate = item.get("estimatedReviewDate") or "-"
        return f"{item.get('date') or '-'} 的 {item.get('targetTradingDays') or '-'} 日回看已到期，预计日期 {estimate}"
    if upcoming:
        item = upcoming[0]
        estimate = item.get("estimatedReviewDate") or "-"
        return (
            f"{item.get('date') or '-'} 的 {item.get('targetTradingDays') or '-'} 日回看，"
            f"还差约 {item.get('remainingTradingDays') or 0} 个交易日，预计日期 {estimate}"
        )
    return "暂无到期或排队回看窗口"


def pending_execution_rows(signals):
    pending = [signal for signal in signals or [] if not is_recorded_execution(signal)]
    rows = []
    for signal in pending[:10]:
        status = str(signal.get("status") or "")
        recommendation = str(signal.get("recommendation") or "")
        action_hint = (
            "确认已观察；没有下单也要记录原因"
            if "观察" in status or "观察" in recommendation or "继续持有" in recommendation
            else "选择已执行/未执行/延后，填写原因"
        )
        rows.append(
            "| "
            + " | ".join(
                [
                    str(signal.get("date") or "-"),
                    str(signal.get("status") or "-"),
                    str(signal.get("recommendation") or "-").replace("\n", " "),
                    action_hint,
                ]
            )
            + " |"
        )
    if not rows:
        rows.append("| - | - | 当前没有待补执行记录 | - |")
    return rows


def build_markdown(state):
    now = datetime.now().isoformat(timespec="seconds")
    signals = state.get("signalHistory") or []
    validation = state.get("signalValidation") or {}
    audit = (state.get("goalAudit") or {}).get("overall") or {}
    guard = state.get("sampleGuard") or {}
    email = state.get("latestEmailReminder") or {}
    maturity = state.get("signalMaturitySchedule") or {}
    maturity_summary = maturity.get("summary") or {}
    review_todo = state.get("reviewTodoReport") or {}
    review_todo_summary = review_todo.get("summary") or {}
    signal_export = state.get("signalHistoryExport") or {}
    signal_export_summary = signal_export.get("summary") or {}
    signal_integrity = state.get("signalIntegrityAudit") or {}
    state_backup = state.get("stateBackup") or {}
    credibility = state.get("credibilityReport") or {}
    credibility_metrics = credibility.get("metrics") or {}
    next_action = build_next_action_report(state)
    primary_action = next_action.get("primaryAction") or {}

    recorded = sum(1 for signal in signals if is_recorded_execution(signal))
    pending = max(0, len(signals) - recorded)
    weeks = recorded_week_count(signals)
    done_checkpoints = validation.get("doneCheckpoints") or 0
    pending_checkpoints = validation.get("pendingCheckpoints") or 0
    window_status = validation_window_status(validation, 30)
    milestones = next_action.get("milestones") or {}

    can_claim = (
        len(signals) >= 30
        and weeks >= 8
        and pending == 0
        and window_status["complete"]
    )
    phase = "可以初步评估" if can_claim else "正式样本积累中"

    lines = [
        "# 第 9 和第 10 步执行跟踪",
        "",
        f"更新时间：{now}",
        "",
        "## 当前结论",
        "",
        f"当前阶段：{phase}。",
        "",
        "第 9 步“保存每一次建议”已经进入正式阶段，但还要每天持续写入信号，并且每条信号都必须补执行记录。",
        "",
        "第 10 步“用 5/20/60 日结果验证可信度”还没有完成。现在只能说系统进入正式样本积累，不能说策略已经可信。",
        "",
        "## 当前进度",
        "",
        "| 项目 | 当前值 | 最低要求 | 状态 |",
        "|---|---:|---:|---|",
        f"| 正式样本记录 | {'已开启' if (state.get('settings') or {}).get('formalSignalRecording') else '未开启'} | 已开启 | {'通过' if (state.get('settings') or {}).get('formalSignalRecording') else '待开启'} |",
        f"| 目标审计 | {audit.get('okCount', 0)}/{audit.get('total', 10)} | 10/10 | {audit.get('phase') or '-'} |",
        f"| 正式信号数量 | {len(signals)} 条 | 30 条 | {'通过' if len(signals) >= 30 else '样本不足'} |",
        f"| 连续记录周数 | {weeks} 周 | 8 周 | {'通过' if weeks >= 8 else '周期不足'} |",
        f"| 执行记录覆盖 | {recorded}/{len(signals)} | {len(signals)}/{len(signals)} | {'通过' if pending == 0 else '待补'} |",
        "| 执行保存接口 | /api/signal-execution | 单条信号专用保存 | 已接入并通过临时状态测试 |",
        "| 网页进度面板 | 首页第9/10步进度 | 直接显示剩余门槛和待办 | 已接入 |",
        "| 观察类快捷回填 | 待办面板一键标记已观察 | 观察/继续持有也必须形成执行证据 | 已接入 |",
        "| 可信度闸门验收 | scripts/verify_step9_10_gate.py | 缺执行、缺20/60日回看都不能提前判定可评估 | 已接入 |",
        "| 运行态HTTP验收 | scripts/verify_runtime_console.py | 临时启动新版服务，验证健康检查、第9/10步接口和执行记录保存 | 已接入 |",
        f"| 信号回看到期表 | scripts/build_maturity_schedule.py | 逐条列出5/20/60日回看预计日期、到期状态和执行状态 | {'已生成' if maturity else '待生成'} |",
        f"| 回看待办 | scripts/build_review_todo.py | 把已到期、快到期和等待中的回看窗口整理成下一步待办 | {'已生成' if review_todo else '待生成'} |",
        f"| 信号历史导出 | scripts/export_signal_history.py | 导出CSV/JSON/Markdown，便于单独复查信号、执行和回看结果 | {'已生成' if signal_export else '待生成'} |",
        f"| 信号样本完整性 | scripts/audit_signal_integrity.py | 记住已出现信号，检查误删、重复、缺字段和缺回看窗口 | {'已审计' if signal_integrity else '待审计'} |",
        f"| 实验状态备份 | scripts/backup_experiment_state.py | 每日复制 state.json 并记录 SHA256，防止样本误删或文件损坏后无证据可查 | {'已备份' if state_backup else '待备份'} |",
        f"| 可信度判定报告 | scripts/build_credibility_report.py | 把样本门槛、胜率、超额、回撤和阻塞项合并成“能否评估”结论 | {credibility.get('verdict') if credibility else '待生成'} |",
        f"| 下一步行动报告 | data/latest_next_action.json | 每日流水线生成优先动作和阻塞项 | {'已生成' if next_action else '待生成'} |",
        "| 收盘自动任务 | 每日任务 a、周报任务 a-2 | 自动运行后也要通过可信度闸门验收 | 已更新 |",
        f"| 5/20/60 回看 | 5日 {window_status['done']['day5']}/{window_status['required']}，20日 {window_status['done']['day20']}/{window_status['required']}，60日 {window_status['done']['day60']}/{window_status['required']}；待完成 {pending_checkpoints} 个 | 三类窗口各满 30 个结果 | {'通过' if window_status['complete'] else '未形成完整结果'} |",
        f"| 平均超额收益 | {pct(validation.get('avgExcessPct'))} | 扣费后优于基准 | {'可观察' if validation.get('avgExcessPct') is not None else '暂无数据'} |",
        f"| 最差最大回撤 | {pct(validation.get('worstMaxDrawdownPct'))} | 不能超过预设风险 | {'可观察' if validation.get('worstMaxDrawdownPct') is not None else '暂无数据'} |",
        "",
        "## 执行记录待办",
        "",
        "观察类建议也要补执行记录。点击“确认已观察”只表示你按建议观察、没有下单；它不会触发交易。",
        "",
        "| 信号日期 | 当时状态 | 当时建议 | 你需要补什么 |",
        "|---|---|---|---|",
        *pending_execution_rows(signals),
        "",
        "## 下一次回看",
        "",
        f"- {first_upcoming_checkpoint(state)}。",
        f"- 回看到期表：已到期 {maturity_summary.get('dueCount', 0)} 个，排队 {maturity_summary.get('waitingCount', 0)} 个；文件 data/signal_maturity_schedule.md。",
        f"- 回看待办：已到期 {review_todo_summary.get('dueCount', 0)} 个，快到期 {review_todo_summary.get('soonCount', 0)} 个，等待 {review_todo_summary.get('waitingCount', 0)} 个；文件 data/review_todo.md。",
        f"- 信号历史导出：已导出 {signal_export_summary.get('exportedRowCount', 0)} 行；文件 data/signal_history_export.csv。",
        f"- 样本完整性：危险 {signal_integrity.get('dangerCount', 0)} 个，警告 {signal_integrity.get('warningCount', 0)} 个；已知信号 {signal_integrity.get('knownSignalCount', 0)} 条；文件 data/signal_integrity_audit.md。",
        f"- 实验状态备份：最近 {state_backup.get('time') or '-'}；文件 {state_backup.get('fileName') or '-'}；SHA256 {str(state_backup.get('sha256') or '-')[:12]}。",
        f"- 可信度判定：{credibility.get('verdict') or '-'}；平均超额 {pct(credibility_metrics.get('avgExcessPct'))}；胜率下界 {pct(credibility_metrics.get('wilsonLowerPct'))}；文件 data/credibility_report.md。",
        f"- 当前优先动作：{primary_action.get('title') or '-'}；{primary_action.get('detail') or '-'}",
        f"- 最早可信度初评参考日：{milestones.get('earliestCredibleEvaluationDate') or '-'}；按每个交易日最多 1 条信号、且第 30 条信号完成 60 日回看估算。",
        f"- 样本守护状态：{guard.get('phase') or '-'}；执行待补 {((guard.get('execution') or {}).get('pending')) if guard else pending} 条。",
        f"- 最近邮件：{email.get('time') or '-'}；标题：{email.get('subject') or '-'}。",
        "",
        "## 每日验收清单",
        "",
        "1. 每个交易日收盘后只保留一条不重复的正式信号。",
        "2. 每条正式信号都补“已执行 / 未执行 / 延后”和原因。",
        "3. 到 5/20/60 个交易日后必须运行回看。",
        "4. 邮件里的待补执行记录要和网页一致。",
        "5. 未达到 30 条信号和 8 周前，周报必须继续写“样本不足”。",
        "",
        "## 可信度口径",
        "",
        "少于 30 条正式信号，不能说策略准确。",
        "",
        "少于 8 周连续记录，不能说方法稳定。",
        "",
        "执行记录不完整，不能区分“策略问题”和“执行问题”。",
        "",
        "5/20/60 三类回看没有各满 30 个结果，不能判断是否跑赢基准。",
    ]
    return "\n".join(lines) + "\n"


def main():
    state = load_state()
    body = build_markdown(state)
    DATA_MD_PATH.write_text(body, encoding="utf-8")
    ROOT_MD_PATH.write_text(body, encoding="utf-8")
    print(
        json.dumps(
            {
                "ok": True,
                "written": [str(DATA_MD_PATH), str(ROOT_MD_PATH)],
                "signalCount": len(state.get("signalHistory") or []),
                "executionPending": sum(
                    1 for signal in state.get("signalHistory") or [] if not is_recorded_execution(signal)
                ),
                "doneCheckpoints": (state.get("signalValidation") or {}).get("doneCheckpoints") or 0,
                "integrityDangerCount": (state.get("signalIntegrityAudit") or {}).get("dangerCount") or 0,
                "integrityWarningCount": (state.get("signalIntegrityAudit") or {}).get("warningCount") or 0,
                "stateBackupTime": (state.get("stateBackup") or {}).get("time"),
                "reviewTodoDueCount": ((state.get("reviewTodoReport") or {}).get("summary") or {}).get("dueCount") or 0,
                "credibilityVerdict": (state.get("credibilityReport") or {}).get("verdict"),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
