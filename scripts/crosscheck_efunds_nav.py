import base64
import json
import math
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from state_store import save_json_atomic
from urllib.request import Request, urlopen

try:
    import requests
except ImportError:
    requests = None


ROOT = Path(__file__).resolve().parents[1]
STATE_PATH = Path(os.environ.get("STATE_PATH_OVERRIDE") or ROOT / "data" / "state.json")
EFUNDS_FUND_URL = "https://www.efunds.com.cn/fund/{code}.shtml"
SOURCE_NAME = "易方达官网基金详情页"
HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://www.efunds.com.cn/",
}
NAV_TOLERANCE = 0.0001


def fetch_bytes(url, timeout=18):
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
            time.sleep(0.4 + attempt * 0.7)

    try:
        return fetch_bytes_with_powershell(url, timeout + 12)
    except Exception:
        raise last_error


def fetch_bytes_with_powershell(url, timeout):
    escaped_url = url.replace("'", "''")
    command = (
        "$ProgressPreference='SilentlyContinue';"
        "$wc=New-Object System.Net.WebClient;"
        "$wc.Headers.Add('User-Agent','Mozilla/5.0');"
        "$wc.Headers.Add('Referer','https://www.efunds.com.cn/');"
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


def decode_html(raw):
    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def clean_text(value):
    value = re.sub(r"<[^>]+>", " ", value or "")
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def safe_float(value):
    try:
        text = str(value).replace(",", "").replace("%", "").strip()
        result = float(text)
        if math.isfinite(result):
            return result
    except (TypeError, ValueError):
        pass
    return 0.0


def extract_by_id(page_html, element_id):
    pattern = re.compile(rf'id="{re.escape(element_id)}"[^>]*>(?P<value>.*?)</div>', re.I | re.S)
    match = pattern.search(page_html)
    return clean_text(match.group("value")) if match else ""


def parse_official_nav(code):
    url = EFUNDS_FUND_URL.format(code=code)
    page_html = decode_html(fetch_bytes(url))
    nav_text = extract_by_id(page_html, "net-today")
    daily_text = extract_by_id(page_html, "net-scale")
    date_match = re.search(
        r'<span\s+class="nav-update">\s*(?P<date>\d{4}-\d{2}-\d{2})\s*</span>',
        page_html,
        re.I,
    )
    if not date_match:
        date_match = re.search(r"基金净值日期：\s*<span[^>]*>\s*(?P<date>\d{4}-\d{2}-\d{2})", page_html)
    name_match = re.search(r'<p\s+class="fund-name">\s*(?P<name>.*?)\s*</p>', page_html, re.I | re.S)

    nav = safe_float(nav_text)
    if nav <= 0:
        raise RuntimeError(f"{code} 官网页面未解析到有效单位净值")

    return {
        "code": code,
        "name": clean_text(name_match.group("name")) if name_match else "",
        "nav": nav,
        "navDate": date_match.group("date") if date_match else "",
        "dailyPct": safe_float(daily_text),
        "source": SOURCE_NAME,
        "sourceUrl": url,
    }


def load_state():
    with STATE_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def save_state(state):
    save_json_atomic(STATE_PATH, state)


def should_check_position(item):
    code = str(item.get("code", "")).strip()
    item_type = item.get("type", "")
    if not re.fullmatch(r"\d{6}", code):
        return False
    return "场外" in item_type or "联接" in item_type or code.startswith(("0", "1"))


def compare_position(item, official):
    current = safe_float(item.get("current"))
    nav_diff = round(current - official["nav"], 6)
    nav_match = abs(nav_diff) <= NAV_TOLERANCE
    date_match = not item.get("navDate") or not official.get("navDate") or item.get("navDate") == official.get("navDate")

    if nav_match and date_match:
        status = "verified"
        message = "东方财富净值与易方达官网一致。"
    elif nav_match:
        status = "date_mismatch"
        message = "单位净值一致，但净值日期不一致，请以更新日期较新的来源复核。"
    else:
        status = "mismatch"
        message = "东方财富净值与易方达官网不一致，先不要据此执行操作。"

    result = {
        "code": item.get("code"),
        "name": item.get("name") or official.get("name"),
        "status": status,
        "message": message,
        "currentNav": current,
        "currentNavDate": item.get("navDate") or "",
        "officialNav": official["nav"],
        "officialNavDate": official.get("navDate") or "",
        "officialDailyPct": official.get("dailyPct"),
        "navDiff": nav_diff,
        "source": official["source"],
        "sourceUrl": official["sourceUrl"],
    }

    item["officialNav"] = official["nav"]
    item["officialNavDate"] = official.get("navDate") or ""
    item["officialDailyPct"] = official.get("dailyPct")
    item["officialNavSource"] = official["source"]
    item["officialNavSourceUrl"] = official["sourceUrl"]
    item["navCrossCheckStatus"] = status
    item["navCrossCheckMessage"] = message
    item["navCrossCheckDiff"] = nav_diff
    item["navCrossCheckedAt"] = datetime.now().isoformat(timespec="seconds")
    return result


def main():
    state = load_state()
    positions = state.get("portfolio", [])
    results = []
    errors = []

    for item in positions:
        if not should_check_position(item):
            continue
        code = str(item.get("code", "")).strip()
        try:
            official = parse_official_nav(code)
            results.append(compare_position(item, official))
            time.sleep(0.08)
        except Exception as exc:
            errors.append({"code": code, "name": item.get("name") or "", "error": str(exc)})

    ok_count = sum(1 for item in results if item["status"] == "verified")
    mismatch_count = sum(1 for item in results if item["status"] != "verified")
    summary = {
        "time": datetime.now().isoformat(timespec="seconds"),
        "source": SOURCE_NAME,
        "count": len(results),
        "verifiedCount": ok_count,
        "mismatchCount": mismatch_count,
        "errors": errors[:8],
        "results": results,
    }
    state["fundNavCrossCheck"] = summary
    state.setdefault("fundNavCrossCheckRuns", []).insert(0, {k: v for k, v in summary.items() if k != "results"})
    state["fundNavCrossCheckRuns"] = state["fundNavCrossCheckRuns"][:20]
    save_state(state)
    print(json.dumps({"ok": True, **summary}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
