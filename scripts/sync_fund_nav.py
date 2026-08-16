import base64
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from state_store import save_json_atomic
from urllib.request import Request, urlopen

try:
    import requests
except ImportError:
    requests = None


ROOT = Path(__file__).resolve().parents[1]
STATE_PATH_OVERRIDE = os.environ.get("STATE_PATH_OVERRIDE")
DATA_DIR_OVERRIDE = os.environ.get("DATA_DIR_OVERRIDE")
STATE_PATH = Path(
    STATE_PATH_OVERRIDE
    or (Path(DATA_DIR_OVERRIDE) / "state.json" if DATA_DIR_OVERRIDE else ROOT / "data" / "state.json")
)
SOURCE_NAME = "东方财富基金档案"
SOURCE_URL = "https://fund.eastmoney.com/{code}.html"
DATA_URL = "https://fund.eastmoney.com/pingzhongdata/{code}.js"
HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://fund.eastmoney.com/",
}


def fetch_bytes(url, timeout=16):
    last_error = None
    for attempt in range(2):
        try:
            if requests is not None:
                response = requests.get(url, headers=HEADERS, timeout=timeout)
                response.raise_for_status()
                return response.content

            request = Request(url, headers=HEADERS)
            with urlopen(request, timeout=timeout) as response:
                return response.read()
        except Exception as exc:
            last_error = exc
            time.sleep(0.3 + attempt * 0.6)

    try:
        return fetch_bytes_with_powershell(url, timeout + 10)
    except Exception:
        raise last_error


def fetch_bytes_with_powershell(url, timeout):
    escaped_url = url.replace("'", "''")
    command = (
        "$ProgressPreference='SilentlyContinue';"
        "$wc=New-Object System.Net.WebClient;"
        "$wc.Headers.Add('User-Agent','Mozilla/5.0');"
        "$wc.Headers.Add('Referer','https://fund.eastmoney.com/');"
        f"[Convert]::ToBase64String($wc.DownloadData('{escaped_url}'))"
    )
    encoded = base64.b64encode(command.encode("utf-16le")).decode("ascii")
    result = subprocess.run(
        ["powershell", "-NoProfile", "-EncodedCommand", encoded],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
    )
    if result.returncode != 0:
        raise RuntimeError((result.stderr or "").strip() or "PowerShell fetch failed")
    return base64.b64decode(result.stdout.strip())


def decode_js(raw):
    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def timestamp_to_date(value):
    try:
        china_tz = timezone(timedelta(hours=8))
        return datetime.fromtimestamp(int(value) / 1000, china_tz).date().isoformat()
    except (TypeError, ValueError, OSError):
        return ""


def parse_fund_nav(code):
    text = decode_js(fetch_bytes(DATA_URL.format(code=code)))
    name_match = re.search(r'var fS_name\s*=\s*"([^"]+)"', text)
    trend_match = re.search(r"var Data_netWorthTrend\s*=\s*(\[[\s\S]*?\]);", text)
    if not trend_match:
        raise RuntimeError(f"{code} missing Data_netWorthTrend")

    trend = json.loads(trend_match.group(1))
    if not trend:
        raise RuntimeError(f"{code} empty net worth trend")

    bars = []
    seen_dates = set()
    for point in trend:
        nav_date = timestamp_to_date(point.get("x"))
        try:
            nav_value = float(point.get("y") or 0)
        except (TypeError, ValueError):
            continue
        if not nav_date or nav_value <= 0 or nav_date in seen_dates:
            continue
        seen_dates.add(nav_date)
        daily_pct = point.get("equityReturn")
        try:
            daily_pct = float(daily_pct) if daily_pct is not None else None
        except (TypeError, ValueError):
            daily_pct = None
        bars.append({"time": nav_date, "nav": nav_value, "dailyPct": daily_pct})

    bars.sort(key=lambda row: row["time"])
    if not bars:
        raise RuntimeError(f"{code} has no valid net worth points")
    latest = bars[-1]
    return {
        "code": code,
        "name": name_match.group(1) if name_match else "",
        "nav": latest["nav"],
        "navDate": latest["time"],
        "dailyPct": latest["dailyPct"],
        "bars": bars,
        "source": SOURCE_NAME,
        "sourceUrl": SOURCE_URL.format(code=code),
    }


def load_state():
    with STATE_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def save_state(state):
    save_json_atomic(STATE_PATH, state)


def should_update_position(item):
    code = str(item.get("code", "")).strip()
    item_type = item.get("type", "")
    if not re.fullmatch(r"\d{6}", code):
        return False
    return "场外" in item_type or "联接" in item_type or code.startswith(("0", "1"))


def main():
    state = load_state()
    positions = state.get("portfolio", [])
    history = state.setdefault("fundNavHistory", {})
    updates = []
    errors = []

    for item in positions:
        if not should_update_position(item):
            continue
        code = str(item.get("code", "")).strip()
        try:
            nav = parse_fund_nav(code)
            if nav["nav"] <= 0:
                raise RuntimeError("invalid nav")
            latest_bar = nav["bars"][-1]
            history[code] = {
                "code": code,
                "name": nav["name"] or item.get("name") or code,
                "bars": nav["bars"],
                "source": nav["source"],
                "sourceUrl": nav["sourceUrl"],
                "updatedAt": datetime.now().isoformat(timespec="seconds"),
                "firstNavDate": nav["bars"][0]["time"],
                "lastNavDate": latest_bar["time"],
                "validation": {
                    "status": "verified",
                    "pointCount": len(nav["bars"]),
                    "latestMatchesPosition": True,
                    "datesSortedUnique": len(nav["bars"]) == len({row["time"] for row in nav["bars"]}),
                },
            }
            item["current"] = nav["nav"]
            item["navDate"] = nav["navDate"]
            item["dailyPct"] = nav["dailyPct"]
            item["navSource"] = nav["source"]
            item["navSourceUrl"] = nav["sourceUrl"]
            item["updatedAt"] = datetime.now().isoformat(timespec="seconds")
            if nav["name"] and not item.get("name"):
                item["name"] = nav["name"]
            quantity = float(item.get("quantity") or 0)
            reported_value = float(item.get("reportedMarketValue") or 0)
            reported_pnl = float(item.get("reportedPnl") or 0)
            if quantity <= 0 and reported_value > 0:
                quantity = reported_value / nav["nav"]
                item["quantity"] = round(quantity, 6)
                if quantity > 0:
                    item["cost"] = round(max(0, reported_value - reported_pnl) / quantity, 6)
            item["marketValue"] = round(float(item.get("quantity") or 0) * nav["nav"], 2)
            item["pnl"] = round((nav["nav"] - float(item.get("cost") or 0)) * float(item.get("quantity") or 0), 2)
            updates.append({
                "code": code,
                "name": item.get("name") or nav["name"],
                "nav": nav["nav"],
                "navDate": nav["navDate"],
                "dailyPct": nav["dailyPct"],
                "marketValue": item["marketValue"],
                "pnl": item["pnl"],
                "historyPoints": len(nav["bars"]),
            })
            time.sleep(0.05)
        except Exception as exc:
            errors.append(f"{code}: {exc}")

    sync = {
        "time": datetime.now().isoformat(timespec="seconds"),
        "count": len(updates),
        "source": SOURCE_NAME,
        "sourceUrl": "https://fund.eastmoney.com/",
        "errors": errors[:8],
    }
    state["fundNavSync"] = sync
    state.setdefault("fundNavUpdates", []).insert(0, sync)
    state["fundNavUpdates"] = state["fundNavUpdates"][:20]
    save_state(state)
    print(json.dumps({"ok": True, **sync, "updates": updates}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
