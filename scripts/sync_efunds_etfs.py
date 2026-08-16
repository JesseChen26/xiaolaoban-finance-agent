import base64
import html
import json
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
STATE_PATH_OVERRIDE = os.environ.get("STATE_PATH_OVERRIDE")
DATA_DIR_OVERRIDE = os.environ.get("DATA_DIR_OVERRIDE")
STATE_PATH = Path(
    STATE_PATH_OVERRIDE
    or (Path(DATA_DIR_OVERRIDE) / "state.json" if DATA_DIR_OVERRIDE else ROOT / "data" / "state.json")
)
EFUNDS_ETF_URL = "https://www.efunds.com.cn/lm/jgfw/gmjj/etfssqd/"
HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://www.efunds.com.cn/",
}


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
            time.sleep(0.5 + attempt * 0.8)

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
    for encoding in ("utf-8", "gb18030"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def clean_text(value):
    value = re.sub(r"<[^>]+>", "", value)
    value = html.unescape(value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def normalize_url(url):
    url = html.unescape(url).strip()
    if url.startswith("http"):
        return url
    return "https://www.efunds.com.cn" + url


def infer_category(name):
    if "创业板" in name:
        return "创业板"
    if "科创" in name:
        return "科创"
    if "沪深300" in name:
        return "宽基-沪深300"
    if "中证500" in name:
        return "宽基-中证500"
    if "中证1000" in name:
        return "宽基-中证1000"
    if "上证50" in name:
        return "宽基-上证50"
    if "红利" in name or "股息" in name:
        return "红利"
    if "恒生科技" in name:
        return "港股-恒生科技"
    if "恒生" in name or "港股" in name:
        return "港股"
    if "中概" in name or "互联网" in name:
        return "中概互联网"
    if "医药" in name or "医疗" in name:
        return "医药/医疗"
    if "消费" in name or "食品" in name or "酒" in name:
        return "消费"
    if "芯片" in name or "半导体" in name:
        return "芯片/半导体"
    if "新能源" in name or "电池" in name or "光伏" in name:
        return "新能源"
    if "证券" in name or "金融" in name or "银行" in name:
        return "金融"
    if "黄金" in name or "有色" in name or "金属" in name:
        return "商品/资源"
    return "易方达ETF"


def parse_efunds_etfs(page_html):
    pattern = re.compile(
        r"<tr>\s*<td>\s*(?P<code>\d{6})\s*</td>\s*<td>\s*<a\s+href=\"(?P<url>[^\"]+)\"[^>]*>(?P<name>.*?)</a>",
        re.I | re.S,
    )
    products = []
    seen = set()
    for match in pattern.finditer(page_html):
        code = match.group("code")
        name = clean_text(match.group("name"))
        if code in seen or "ETF" not in name:
            continue
        seen.add(code)
        products.append(
            {
                "code": code,
                "name": name,
                "type": infer_category(name),
                "source": "易方达官网",
                "sourceUrl": normalize_url(match.group("url")),
            }
        )
    products.sort(key=lambda item: item["code"])
    return products


def load_state():
    with STATE_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def save_state(state):
    save_json_atomic(STATE_PATH, state)


def main():
    raw = fetch_bytes(EFUNDS_ETF_URL)
    page_html = decode_html(raw)
    products = parse_efunds_etfs(page_html)
    if not products:
        raise RuntimeError("未能从易方达官网解析到 ETF 产品列表")

    state = load_state()
    sync_info = {
        "time": datetime.now().isoformat(timespec="seconds"),
        "count": len(products),
        "source": "易方达官网 ETF申赎清单",
        "sourceUrl": EFUNDS_ETF_URL,
    }
    state["efundsEtfs"] = products
    state["efundsSync"] = sync_info
    state.setdefault("officialProductUpdates", []).insert(0, sync_info)
    state["officialProductUpdates"] = state["officialProductUpdates"][:20]
    save_state(state)
    print(json.dumps({"ok": True, **sync_info}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
