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
from urllib.parse import urljoin
from urllib.request import Request, urlopen

try:
    import requests
except ImportError:
    requests = None

from source_whitelist import match_source


ROOT = Path(__file__).resolve().parents[1]
STATE_PATH_OVERRIDE = os.environ.get("STATE_PATH_OVERRIDE")
DATA_DIR_OVERRIDE = os.environ.get("DATA_DIR_OVERRIDE")
STATE_PATH = Path(
    STATE_PATH_OVERRIDE
    or (Path(DATA_DIR_OVERRIDE) / "state.json" if DATA_DIR_OVERRIDE else ROOT / "data" / "state.json")
)
NEWS_LIST_URL = "https://www.efunds.com.cn/lm/zszqsy/zxdt/"
NEWS_TOP_API = "https://api.efunds.com.cn/xcowch/front/catalog/29426/top3"
NEWS_SEARCH_API = "https://api.efunds.com.cn/xcowch/front/contentsearch"
NEWS_CATALOG_INNER_CODE = "006169000007000010"
HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://www.efunds.com.cn/",
}

THEME_CODES = {
    "红利": ["510880", "515180", "560370"],
    "底仓": ["510300", "510880", "515180"],
    "价值": ["159263", "510880", "515180"],
    "自由现金流": ["159222", "159263"],
    "港股": ["513180", "159920", "159091", "520810"],
    "恒生科技": ["513180"],
    "中概": ["513050"],
    "互联网": ["513050"],
    "AI": ["159819", "159140"],
    "人工智能": ["159819", "159140"],
    "芯片": ["512480", "512760", "589030"],
    "半导体": ["512480", "512760", "589030"],
    "半导体设备": ["159558", "512760", "589030"],
    "通信": ["515880", "159593"],
    "机器人": ["159530"],
    "人形机器人": ["159530"],
    "科技成长": ["588020", "159597", "159140"],
    "医药": ["512010", "159929", "159051"],
    "医疗": ["512170", "159051"],
    "消费": ["159928", "560160"],
    "食品": ["560160"],
    "新能源": ["515030", "516160", "159009"],
    "电池": ["159175"],
    "证券": ["512880", "512000"],
    "金融": ["512880", "159091"],
    "创业板": ["159915", "159949"],
    "科创": ["588000", "588080", "589030", "159140"],
    "沪深300": ["510300"],
    "中证500": ["510500"],
    "中证1000": ["512100", "159845"],
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
            time.sleep(0.4 + attempt * 0.8)

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


def decode_page(raw):
    for encoding in ("utf-8", "gb18030"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def clean_text(value):
    value = re.sub(r"<script[\s\S]*?</script>", "", value, flags=re.I)
    value = re.sub(r"<style[\s\S]*?</style>", "", value, flags=re.I)
    value = re.sub(r"<[^>]+>", "", value)
    value = html.unescape(value)
    return re.sub(r"\s+", " ", value).strip()


def discover_article_urls():
    api_records = discover_article_records()
    if api_records:
        return [row["url"] for row in api_records if row.get("url")]

    api_urls = discover_article_urls_from_api()
    if api_urls:
        return api_urls

    urls = set()
    pages = [NEWS_LIST_URL, urljoin(NEWS_LIST_URL, "index_1.shtml")]
    for page_index in range(2, 6):
        pages.append(urljoin(NEWS_LIST_URL, f"index_{page_index}.shtml"))

    for page in pages:
        try:
            page_html = decode_page(fetch_bytes(page))
        except Exception:
            continue
        for match in re.finditer(r'href="([^"]*/c/\d+/\d+\.shtml[^"]*)"', page_html):
            urls.add(urljoin(page, html.unescape(match.group(1))))
    return sorted(urls, reverse=True)


def discover_article_records(max_pages=8):
    records = []
    seen = set()
    for page_index in range(max_pages):
        try:
            raw = fetch_bytes_post(
                NEWS_SEARCH_API,
                {
                    "siteID": "1",
                    "catalogInnerCode": NEWS_CATALOG_INNER_CODE,
                    "query": "",
                    "pageSize": "6",
                    "pageIndex": str(page_index),
                },
            )
            data = json.loads(decode_page(raw))
            rows = data.get("data", {}).get("data", []) or []
            for row in rows:
                url = row.get("url")
                if url and url not in seen:
                    seen.add(url)
                    records.append(row)
            if len(rows) < 6:
                break
        except Exception:
            break
    return records


def discover_article_urls_from_api():
    records = discover_article_records()
    if records:
        return [row["url"] for row in records if row.get("url")]

    try:
        raw = fetch_bytes_post(NEWS_TOP_API)
        data = json.loads(decode_page(raw))
        rows = data.get("data", {}).get("data", []) or []
        return [row["url"] for row in rows if row.get("url")]
    except Exception:
        return []


def fetch_bytes_post(url, form=None, timeout=16):
    try:
        if requests is not None:
            response = requests.post(url, data=form or {}, headers=HEADERS, timeout=timeout)
            response.raise_for_status()
            return response.content
    except Exception:
        pass
    return fetch_bytes_post_with_powershell(url, form or {}, timeout + 10)


def fetch_bytes_post_with_powershell(url, form, timeout):
    escaped_url = url.replace("'", "''")
    body = ""
    if form:
        pairs = []
        for key, value in form.items():
            safe_key = str(key).replace("'", "''")
            safe_value = str(value).replace("'", "''")
            pairs.append(f"'{safe_key}'='{safe_value}'")
        body = "-Body @{" + "; ".join(pairs) + "} "
    command = (
        "$ProgressPreference='SilentlyContinue';"
        f"$r=Invoke-WebRequest -UseBasicParsing -Method Post -Uri '{escaped_url}' "
        f"{body}-Headers @{{ 'User-Agent'='Mozilla/5.0'; 'Referer'='https://www.efunds.com.cn/' }};"
        "[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($r.Content))"
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
        raise RuntimeError((result.stderr or "").strip() or "PowerShell POST failed")
    return base64.b64decode(result.stdout.strip())


def parse_article(url):
    page_html = decode_page(fetch_bytes(url))
    title = ""
    title_match = re.search(r"<title>(.*?)</title>", page_html, re.I | re.S)
    if title_match:
        title = clean_text(title_match.group(1)).split(" - ")[0]

    date = ""
    date_match = re.search(r"PublishDate=(\d{4}-\d{2}-\d{2})", page_html)
    if date_match:
        date = date_match.group(1)
    else:
        date_match = re.search(r"(20\d{2})[./年-](\d{1,2})[./月-](\d{1,2})", page_html)
        if date_match:
            date = f"{date_match.group(1)}-{int(date_match.group(2)):02d}-{int(date_match.group(3)):02d}"

    body = clean_text(page_html)
    product_codes = sorted(set(re.findall(r"(?<!\d)(?:15|51|52|56|58)\d{4}(?!\d)", body)))
    themes = infer_themes(title + " " + body[:2000])
    matched_codes = sorted(set(product_codes[:8] + [code for theme in themes for code in THEME_CODES.get(theme, [])]))

    return {
        "url": url,
        "title": title or "未命名文章",
        "date": date,
        "themes": themes,
        "mentionedCodes": product_codes[:12],
        "matchedCodes": matched_codes[:10],
    }


def parse_api_article(row):
    title = clean_text(row.get("title", "")) or "未命名文章"
    date = (row.get("prop1") or row.get("publishDate") or row.get("addTime") or "")[:10]
    url = row.get("url", "")
    text = clean_text(" ".join([title, row.get("summary", ""), row.get("content", "")]))
    product_codes = sorted(set(re.findall(r"(?<!\d)(?:15|51|52|56|58)\d{4}(?!\d)", text)))
    themes = infer_themes(text[:4000])
    matched_codes = sorted(set(product_codes[:8] + [code for theme in themes for code in THEME_CODES.get(theme, [])]))

    return {
        "url": url,
        "title": title,
        "date": date,
        "themes": themes,
        "mentionedCodes": product_codes[:12],
        "matchedCodes": matched_codes[:10],
    }


def is_investment_news(article):
    title = article.get("title", "")
    skip_words = ["投资者须知", "风险揭示", "隐私", "反洗钱", "适当性", "应急处理"]
    if any(word in title for word in skip_words):
        return False
    return True


def infer_themes(text):
    themes = []
    for theme in THEME_CODES:
        if theme in text and theme not in themes:
            themes.append(theme)
    return themes[:6]


def tencent_symbol(code):
    return ("sh" if str(code).startswith(("5", "6", "9")) else "sz") + str(code)


def fetch_json(url):
    return json.loads(decode_page(fetch_bytes(url)))


def get_daily_klines(code):
    symbol = tencent_symbol(code)
    url = f"https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={symbol},day,,,180,qfq"
    data = fetch_json(url)
    raw = data.get("data", {}).get(symbol, {})
    rows = raw.get("qfqday") or raw.get("day") or []
    parsed = []
    for row in rows:
        if len(row) >= 3:
            parsed.append({"date": row[0], "close": safe_float(row[2])})
    return [row for row in parsed if row["close"] > 0]


def safe_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def event_returns(code, event_date):
    rows = get_daily_klines(code)
    if not rows or not event_date:
        return None

    idx = None
    for i, row in enumerate(rows):
        if row["date"] >= event_date:
            idx = i
            break
    if idx is None:
        return None

    try:
        event_trade_date = datetime.strptime(rows[idx]["date"], "%Y-%m-%d")
        source_date = datetime.strptime(event_date, "%Y-%m-%d")
        if (event_trade_date - source_date).days > 5:
            return None
    except ValueError:
        pass

    base = rows[idx]["close"]

    def ret(offset):
        target = idx + offset
        if target < 0 or target >= len(rows) or base <= 0:
            return None
        return round((rows[target]["close"] / base - 1) * 100, 2)

    return {
        "code": code,
        "eventTradeDate": rows[idx]["date"],
        "pre5Pct": ret(-5),
        "post5Pct": ret(5),
        "post20Pct": ret(20),
    }


def classify_event(item):
    results = item.get("results", [])
    valid_post5 = [r["post5Pct"] for r in results if r.get("post5Pct") is not None]
    valid_post20 = [r["post20Pct"] for r in results if r.get("post20Pct") is not None]
    if not valid_post5 and not valid_post20:
        return "观察中"
    avg5 = sum(valid_post5) / len(valid_post5) if valid_post5 else None
    avg20 = sum(valid_post20) / len(valid_post20) if valid_post20 else None
    if avg5 is not None and avg5 > 2:
        return "新闻后短期走强"
    if avg20 is not None and avg20 > 4:
        return "新闻后中期走强"
    if avg5 is not None and avg5 < -2:
        return "新闻后短期走弱"
    return "未见明显异常"


def economic_logic(item):
    themes = set(item.get("themes", []))
    results = item.get("results", [])
    valid_pre5 = [r["pre5Pct"] for r in results if r.get("pre5Pct") is not None]
    valid_post5 = [r["post5Pct"] for r in results if r.get("post5Pct") is not None]
    avg_pre5 = sum(valid_pre5) / len(valid_pre5) if valid_pre5 else None
    avg_post5 = sum(valid_post5) / len(valid_post5) if valid_post5 else None

    if avg_pre5 is not None and avg_pre5 > 3 and (avg_post5 is None or avg_post5 <= 2):
        timing = "更像是市场先涨、官网新闻随后解释，不能当成提前买入信号。"
    elif avg_post5 is not None and avg_post5 > 2:
        timing = "新闻后对应 ETF 短期继续走强，可以作为主题热度仍在的观察证据。"
    elif avg_post5 is not None and avg_post5 < -2:
        timing = "新闻后对应 ETF 走弱，说明市场没有继续认可这个叙事，不能追。"
    else:
        timing = "新闻前后没有明显同向波动，只能作为背景信息。"

    if themes & {"红利", "价值", "自由现金流", "底仓"}:
        logic = "红利/价值通常对应低估值、高股息、防守和均值回归逻辑。"
    elif themes & {"AI", "人工智能", "机器人", "人形机器人", "芯片", "半导体", "半导体设备", "通信", "科技成长", "科创", "创业板"}:
        logic = "科技成长主题通常受产业景气、资金风险偏好和前期涨幅影响，波动会更大。"
    elif themes & {"港股", "恒生科技", "中概", "互联网"}:
        logic = "港股/中概更受海外流动性、美元利率、平台经济政策和风险偏好影响。"
    elif themes & {"医药", "医疗", "消费", "食品"}:
        logic = "医药消费更看盈利修复、政策预期和估值位置，行情常偏中期。"
    elif themes & {"证券", "金融"}:
        logic = "证券金融通常和市场成交活跃度、指数行情、政策预期相关。"
    else:
        logic = "主题不够明确，需要回到 ETF 评分表和行情趋势判断。"

    return f"{logic}{timing}"


def annotate_source(article):
    source = match_source(article.get("url") or "", "易方达指数专区最新动态")
    grade = source.get("grade") or "D"
    article["sourceName"] = source.get("name") or "未在白名单"
    article["sourceGrade"] = grade
    article["sourceCategory"] = source.get("category") or ""
    article["sourceUrl"] = source.get("url") or article.get("url") or ""
    article["sourceAllowedUse"] = "可进入事件验证" if grade in ("A", "B") else "只做背景或过滤"
    article["sourceCanTriggerObservation"] = grade in ("A", "B")
    article["sourcePolicy"] = "A/B 来源可作为观察证据；C 只做背景；D 默认过滤。"
    return article


def load_state():
    with STATE_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def save_state(state):
    save_json_atomic(STATE_PATH, state)


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 12
    sources = discover_article_records()
    if not sources:
        sources = discover_article_urls()
    articles = []
    errors = []
    for source in sources[: max(limit * 3, limit)]:
        if len(articles) >= limit:
            break
        try:
            article = parse_api_article(source) if isinstance(source, dict) else parse_article(source)
            if not is_investment_news(article):
                continue
            if not article["date"] or not article["matchedCodes"]:
                continue
            results = []
            for code in article["matchedCodes"][:4]:
                try:
                    result = event_returns(code, article["date"])
                    if result:
                        results.append(result)
                    time.sleep(0.03)
                except Exception as exc:
                    errors.append(f"{code}: {exc}")
            article["results"] = results
            article["conclusion"] = classify_event(article)
            article["economicLogic"] = economic_logic(article)
            annotate_source(article)
            articles.append(article)
        except Exception as exc:
            errors.append(f"{source.get('url') if isinstance(source, dict) else source}: {exc}")

    state = load_state()
    sync = {
        "time": datetime.now().isoformat(timespec="seconds"),
        "count": len(articles),
        "source": "易方达指数专区最新动态",
        "sourceUrl": NEWS_LIST_URL,
        "sourceGrade": "A",
        "errors": errors[:8],
    }
    state["newsEvents"] = articles
    state["newsSync"] = sync
    state.setdefault("newsEventUpdates", []).insert(0, sync)
    state["newsEventUpdates"] = state["newsEventUpdates"][:20]
    save_state(state)
    print(json.dumps({"ok": True, **sync}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
