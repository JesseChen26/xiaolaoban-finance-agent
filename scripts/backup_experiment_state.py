import argparse
import hashlib
import json
import os
import shutil
from datetime import datetime
from pathlib import Path

from execution_status import signal_execution_recorded
from state_store import save_json_atomic


ROOT = Path(__file__).resolve().parents[1]
STATE_PATH_OVERRIDE = os.environ.get("STATE_PATH_OVERRIDE")
STATE_PATH = Path(STATE_PATH_OVERRIDE or ROOT / "data" / "state.json")
OUTPUT_DIR = STATE_PATH.parent if STATE_PATH_OVERRIDE else ROOT / "data"
BACKUP_DIR = OUTPUT_DIR / "backups"
MANIFEST_PATH = OUTPUT_DIR / "state_backups_manifest.json"
MD_PATH = OUTPUT_DIR / "state_backups_manifest.md"
KEEP_DEFAULT = 60


def now_text():
    return datetime.now().replace(microsecond=0).isoformat()


def read_state_bytes():
    return STATE_PATH.read_bytes()


def load_state(raw):
    return json.loads(raw.decode("utf-8"))


def file_sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def execution_summary(signals):
    recorded = sum(1 for signal in signals if signal_execution_recorded(signal))
    return {
        "totalSignals": len(signals),
        "recorded": recorded,
        "pending": max(0, len(signals) - recorded),
    }


def backup_summary(state, raw, backup_path, reason):
    signals = state.get("signalHistory") or []
    known = state.get("signalIntegrityKnownSignals") or {}
    digest = file_sha256(raw)
    return {
        "ok": True,
        "time": now_text(),
        "reason": reason,
        "file": str(backup_path),
        "fileName": backup_path.name,
        "sha256": digest,
        "bytes": len(raw),
        "signalCount": len(signals),
        "knownSignalCount": len(known),
        "execution": execution_summary(signals),
        "dailyRunTime": (state.get("dailyExperimentRun") or {}).get("time"),
        "integrityLevel": (state.get("signalIntegrityAudit") or {}).get("level"),
        "integrityDangerCount": (state.get("signalIntegrityAudit") or {}).get("dangerCount", 0),
    }


def load_manifest():
    if not MANIFEST_PATH.exists():
        return {"items": []}
    try:
        return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"items": []}


def prune_backups(items, keep):
    kept = items[:keep]
    stale = items[keep:]
    for item in stale:
        path = Path(item.get("file") or "")
        if path.exists() and path.parent == BACKUP_DIR:
            try:
                path.unlink()
            except OSError:
                pass
    return kept


def build_markdown(items):
    lines = [
        "# 实验状态备份清单",
        "",
        f"更新时间：{now_text()}",
        "",
        "| 时间 | 原因 | 信号 | 执行待补 | 完整性危险 | 文件 | SHA256 |",
        "|---|---|---:|---:|---:|---|---|",
    ]
    if not items:
        lines.append("| - | - | 0 | 0 | 0 | - | - |")
    for item in items[:20]:
        execution = item.get("execution") or {}
        lines.append(
            "| "
            + " | ".join(
                [
                    str(item.get("time") or "-"),
                    str(item.get("reason") or "-"),
                    str(item.get("signalCount") or 0),
                    str(execution.get("pending") or 0),
                    str(item.get("integrityDangerCount") or 0),
                    str(item.get("fileName") or "-"),
                    str(item.get("sha256") or "-")[:12],
                ]
            )
            + " |"
        )
    return "\n".join(lines) + "\n"


def create_backup(reason, keep):
    raw = read_state_bytes()
    state = load_state(raw)
    digest = file_sha256(raw)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    backup_path = BACKUP_DIR / f"state-{stamp}-{digest[:8]}.json"
    counter = 1
    while backup_path.exists():
        backup_path = BACKUP_DIR / f"state-{stamp}-{digest[:8]}-{counter}.json"
        counter += 1

    backup_path.write_bytes(raw)
    summary = backup_summary(state, raw, backup_path, reason)

    manifest = load_manifest()
    items = manifest.get("items") or []
    items.insert(0, summary)
    items = prune_backups(items, keep)
    manifest = {
        "ok": True,
        "time": now_text(),
        "backupCount": len(items),
        "latest": summary,
        "items": items,
    }
    save_json_atomic(MANIFEST_PATH, manifest)
    MD_PATH.write_text(build_markdown(items), encoding="utf-8")

    state["stateBackup"] = summary
    runs = state.get("stateBackupRuns") or []
    runs.insert(0, summary)
    state["stateBackupRuns"] = runs[:keep]
    save_json_atomic(STATE_PATH, state)

    return summary, manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reason", default="manual")
    parser.add_argument("--keep", type=int, default=KEEP_DEFAULT)
    args = parser.parse_args()

    summary, manifest = create_backup(args.reason, max(1, args.keep))
    print(
        json.dumps(
            {
                "ok": True,
                **summary,
                "backupCount": manifest["backupCount"],
                "manifest": str(MANIFEST_PATH),
                "markdown": str(MD_PATH),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
