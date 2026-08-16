import json
import os
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path
from state_store import save_json_atomic

from source_whitelist import BLACKLIST_RULES, GRADE_RULES, SOURCE_WHITELIST, match_source, public_source_item


ROOT = Path(__file__).resolve().parents[1]
STATE_PATH = Path(os.environ.get("STATE_PATH_OVERRIDE") or ROOT / "data" / "state.json")


def load_state():
    with STATE_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def save_state(state):
    save_json_atomic(STATE_PATH, state)


def annotate_event(event):
    source = match_source(event.get("url") or event.get("sourceUrl") or "", event.get("source") or event.get("title") or "")
    grade = source.get("grade") or "D"
    event["sourceName"] = source.get("name") or "未在白名单"
    event["sourceGrade"] = grade
    event["sourceCategory"] = source.get("category") or ""
    event["sourceUrl"] = source.get("url") or event.get("url") or ""
    event["sourceAllowedUse"] = "可进入事件验证" if grade in ("A", "B") else "只做背景或过滤"
    event["sourceCanTriggerObservation"] = grade in ("A", "B")
    event["sourcePolicy"] = "A/B 来源可作为观察证据；C 只做背景；D 默认过滤。"
    return event


def main():
    state = load_state()
    sources = [public_source_item(item) for item in SOURCE_WHITELIST]
    events = [annotate_event(item) for item in state.get("newsEvents") or []]
    grade_counts = Counter(item["grade"] for item in sources)
    event_grade_counts = Counter(item.get("sourceGrade") or "D" for item in events)
    sync = {
        "time": datetime.now().isoformat(timespec="seconds"),
        "count": len(sources),
        "source": "本地权威信息源白名单",
        "sourceDocument": "权威新闻与财报信息源清单.md",
        "gradeCounts": dict(sorted(grade_counts.items())),
        "eventGradeCounts": dict(sorted(event_grade_counts.items())),
        "blacklistCount": len(BLACKLIST_RULES),
    }

    state["sourceWhitelist"] = sources
    state["sourceGradeRules"] = GRADE_RULES
    state["sourceBlacklistRules"] = BLACKLIST_RULES
    state["sourceWhitelistSync"] = sync
    state["newsEvents"] = events
    state.setdefault("sourceWhitelistRuns", []).insert(0, sync)
    state["sourceWhitelistRuns"] = state["sourceWhitelistRuns"][:20]
    save_state(state)
    print(json.dumps({"ok": True, **sync}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
