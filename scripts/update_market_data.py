import json
import math
import base64
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from state_store import save_json_atomic
from urllib.parse import urlencode
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
HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://quote.eastmoney.com/",
}

SEED_ETFS = [
    ("510300", "宽基-沪深300"),
    ("510500", "宽基-中证500"),
    ("512100", "宽基-中证1000"),
    ("510050", "宽基-上证50"),
    ("159845", "宽基-中证1000"),
    ("159915", "创业板"),
    ("159949", "创业板50"),
    ("588000", "科创50"),
    ("588080", "科创50"),
    ("510880", "红利"),
    ("515180", "红利"),
    ("512880", "证券"),
    ("512000", "证券"),
    ("512760", "芯片"),
    ("512480", "半导体"),
    ("159995", "芯片"),
    ("512010", "医药"),
    ("512170", "医疗"),
    ("159929", "医药"),
    ("512690", "消费-酒"),
    ("159928", "消费"),
    ("515030", "新能源车"),
    ("516160", "新能源"),
    ("515790", "光伏"),
    ("512660", "军工"),
    ("159819", "人工智能"),
    ("516010", "游戏"),
    ("513050", "中概互联网"),
    ("513180", "港股-恒生科技"),
    ("159920", "港股-恒生"),
]


def fetch_json(url, timeout=8):
    last_error = None
    for attempt in range(3):
        try:
            if requests is not None:
                response = requests.get(url, headers=HEADERS, timeout=timeout)
                response.raise_for_status()
                return response.json()

            request = Request(url, headers=HEADERS)
            with urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            last_error = exc
            time.sleep(0.4 + attempt * 0.6)

    try:
        return json.loads(fetch_text_with_powershell(url, timeout + 8))
    except Exception:
        raise last_error


def fetch_text_with_powershell(url, timeout):
    escaped_url = url.replace("'", "''")
    command = (
        "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;"
        "$ProgressPreference='SilentlyContinue';"
        f"(Invoke-WebRequest -UseBasicParsing -Uri '{escaped_url}' "
        "-Headers @{ 'User-Agent'='Mozilla/5.0'; 'Referer'='https://quote.eastmoney.com/' }).Content"
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
    return result.stdout


def eastmoney_sec_id(code):
    code = str(code)
    market = "1" if code.startswith(("5", "6", "9")) else "0"
    return f"{market}.{code}"


def get_spot_etfs(limit=80, official_etfs=None):
    seeded = get_seed_etfs(official_etfs or [])
    if seeded:
        return seeded[:limit]

    params = {
        "pn": 1,
        "pz": 2000,
        "po": 1,
        "np": 1,
        "fltt": 2,
        "invt": 2,
        "fid": "f6",
        "fs": "b:MK0021,b:MK0022,b:MK0023,b:MK0024",
        "fields": "f12,f14,f2,f3,f6,f20",
    }
    url = "https://push2.eastmoney.com/api/qt/clist/get?" + urlencode(params)
    data = fetch_json(url)
    rows = data.get("data", {}).get("diff", []) or []
    candidates = []
    for row in rows:
        code = str(row.get("f12") or "").strip()
        name = str(row.get("f14") or "").strip()
        price = safe_float(row.get("f2"))
        turnover = safe_float(row.get("f6"))
        fund_size = safe_float(row.get("f20")) / 100000000
        if not code or price <= 0:
            continue
        if any(word in name for word in ["杠杆", "反向", "做空", "二倍", "2倍"]):
            continue
        candidates.append(
            {
                "code": code,
                "name": name,
                "type": infer_type(name),
                "price": price,
                "turnoverYuan": turnover,
                "fundSizeYi": round(fund_size, 2),
                "bidAskSpreadPct": 0.1,
            }
        )
    candidates.sort(key=lambda item: item["turnoverYuan"], reverse=True)
    return candidates[:limit]


def get_seed_etfs(official_etfs):
    by_code = {code: {"code": code, "type": etf_type} for code, etf_type in SEED_ETFS}
    for item in official_etfs:
        code = str(item.get("code", "")).strip()
        if not re.match(r"^\d{6}$", code):
            continue
        by_code[code] = {
            "code": code,
            "name": item.get("name") or "",
            "type": item.get("type") or infer_type(item.get("name") or ""),
            "officialSource": item.get("source") or "易方达官网",
            "sourceUrl": item.get("sourceUrl") or "",
        }

    symbols = ",".join(tencent_symbol(code) for code in by_code)
    url = "https://qt.gtimg.cn/q=" + symbols
    text = fetch_text(url)
    candidates = []

    for line in text.splitlines():
        if '="' not in line:
            continue
        content = line.split('="', 1)[1].rstrip('";')
        parts = content.split("~")
        if len(parts) < 4:
            continue
        code = parts[2]
        name = parts[1]
        meta = by_code.get(code, {})
        price = safe_float(parts[3])
        turnover = 0.0
        for part in parts:
            if part.count("/") == 2:
                maybe_amount = safe_float(part.split("/")[-1])
                if maybe_amount > turnover:
                    turnover = maybe_amount
        if price <= 0:
            continue
        candidates.append(
            {
                "code": code,
                "name": meta.get("name") or name,
                "type": meta.get("type") or infer_type(name),
                "officialSource": meta.get("officialSource") or "",
                "sourceUrl": meta.get("sourceUrl") or "",
                "price": price,
                "turnoverYuan": turnover,
                "fundSizeYi": 0,
                "bidAskSpreadPct": 0.1,
            }
        )

    candidates.sort(key=lambda item: item["turnoverYuan"], reverse=True)
    return candidates


def fetch_text(url, timeout=8):
    last_error = None
    for attempt in range(3):
        try:
            if requests is not None:
                response = requests.get(url, headers=HEADERS, timeout=timeout)
                response.raise_for_status()
                response.encoding = response.apparent_encoding or "utf-8"
                return response.text

            request = Request(url, headers=HEADERS)
            with urlopen(request, timeout=timeout) as response:
                return response.read().decode("utf-8")
        except Exception as exc:
            last_error = exc
            time.sleep(0.4 + attempt * 0.6)

    try:
        return fetch_text_with_powershell(url, timeout + 8)
    except Exception:
        raise last_error


def get_daily_klines(code):
    tencent_history = get_tencent_daily_klines(code)
    if len(tencent_history) >= 65:
        return tencent_history

    params = {
        "secid": eastmoney_sec_id(code),
        "klt": 101,
        "fqt": 1,
        "beg": "20240101",
        "end": "20500101",
        "fields1": "f1,f2,f3,f4,f5,f6",
        "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
    }
    url = "https://push2his.eastmoney.com/api/qt/stock/kline/get?" + urlencode(params)
    data = fetch_json(url)
    rows = data.get("data", {}).get("klines", []) or []
    parsed = []
    for row in rows:
        parts = row.split(",")
        if len(parts) < 6:
            continue
        parsed.append({
            "date": parts[0],
            "open": safe_float(parts[1]),
            "close": safe_float(parts[2]),
            "high": safe_float(parts[3]),
            "low": safe_float(parts[4]),
            "volume": safe_float(parts[5]),
        })
    return parsed


def tencent_symbol(code):
    code = str(code)
    prefix = "sh" if code.startswith(("5", "6", "9")) else "sz"
    return f"{prefix}{code}"


def get_tencent_daily_klines(code):
    symbol = tencent_symbol(code)
    params = {"param": f"{symbol},day,,,120,qfq"}
    url = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?" + urlencode(params)
    data = fetch_json(url)
    raw = data.get("data", {}).get(symbol, {})
    rows = raw.get("qfqday") or raw.get("day") or []
    parsed = []
    for row in rows:
        if len(row) < 6:
            continue
        parsed.append({
            "date": row[0],
            "open": safe_float(row[1]),
            "close": safe_float(row[2]),
            "high": safe_float(row[3]),
            "low": safe_float(row[4]),
            "volume": safe_float(row[5]),
        })
    return parsed


def get_eastmoney_latest_close(code):
    params = {
        "secid": eastmoney_sec_id(code),
        "klt": 101,
        "fqt": 1,
        "beg": "20240101",
        "end": "20500101",
        "fields1": "f1,f2,f3,f4,f5,f6",
        "fields2": "f51,f52,f53,f54,f55,f56",
    }
    url = "https://push2his.eastmoney.com/api/qt/stock/kline/get?" + urlencode(params)
    data = fetch_json(url)
    rows = data.get("data", {}).get("klines", []) or []
    if not rows:
        raise RuntimeError(f"{code} Eastmoney history empty")
    parts = rows[-1].split(",")
    if len(parts) < 3 or safe_float(parts[2]) <= 0:
        raise RuntimeError(f"{code} Eastmoney latest close invalid")
    return {"date": parts[0], "close": safe_float(parts[2])}


def safe_float(value):
    try:
        result = float(value)
        if math.isfinite(result):
            return result
    except (TypeError, ValueError):
        pass
    return 0.0


def pct_change(values, periods):
    if len(values) <= periods:
        return 0.0
    base = values[-periods - 1]
    latest = values[-1]
    if base <= 0:
        return 0.0
    return (latest / base - 1) * 100


def moving_average(values, window, offset=0):
    end = len(values) - offset
    start = end - window
    if start < 0 or end <= 0:
        return 0.0
    segment = values[start:end]
    return sum(segment) / len(segment)


def chart_history(rows):
    """Keep only valid OHLCV rows and append deterministic MA20/MA60 points."""
    valid = []
    closes = []
    for row in rows:
        open_price = safe_float(row.get("open"))
        high = safe_float(row.get("high"))
        low = safe_float(row.get("low"))
        close = safe_float(row.get("close"))
        if not row.get("date") or min(open_price, high, low, close) <= 0:
            continue
        closes.append(close)
        valid.append({
            "time": row["date"],
            "open": round(open_price, 4),
            "high": round(high, 4),
            "low": round(low, 4),
            "close": round(close, 4),
            "volume": round(safe_float(row.get("volume")), 2),
            "ma20": round(sum(closes[-20:]) / 20, 4) if len(closes) >= 20 else None,
            "ma60": round(sum(closes[-60:]) / 60, 4) if len(closes) >= 60 else None,
        })
    return valid


def infer_type(name):
    if "红利" in name:
        return "红利ETF"
    if "低波" in name:
        return "低波ETF"
    if any(word in name for word in ["沪深300", "中证500", "中证1000", "创业板", "科创", "上证", "A500"]):
        return "宽基ETF"
    return "行业ETF"


def score_item(item, settings):
    price = safe_float(item.get("price") or item.get("close"))
    ma20 = safe_float(item.get("ma20"))
    ma60 = safe_float(item.get("ma60"))
    slope = safe_float(item.get("ma20Slope"))
    turnover = safe_float(item.get("turnoverYuan"))
    fund_size = safe_float(item.get("fundSizeYi"))
    spread = safe_float(item.get("bidAskSpreadPct"))
    r1 = safe_float(item.get("return1mPct"))
    r3 = safe_float(item.get("return3mPct"))
    b1 = safe_float(item.get("benchmarkReturn1mPct"))
    b3 = safe_float(item.get("benchmarkReturn3mPct"))
    trial_capital = safe_float(settings.get("trialCapital")) or 200

    if price <= 0 or ma20 <= 0 or ma60 <= 0:
        return {
            **item,
            "trendScore": 0,
            "liquidityScore": 0,
            "qualityScore": 0,
            "riskScore": 0,
            "capitalFitScore": 0,
            "totalScore": 0,
            "grade": "D",
            "status": "数据缺失",
            "recommendation": "请先补充行情数据。",
            "scoreReasons": [],
            "riskFlags": ["缺少价格、20日线或60日线，不能生成观察建议。"],
        }

    trend_score = 0
    score_reasons = []
    risk_flags = []

    trend_score += 8 if price > ma20 else 0
    score_reasons.append("价格高于20日线，短中期趋势未破。") if price > ma20 else risk_flags.append("价格低于20日线，趋势偏弱。")
    trend_score += 8 if slope > 0 else 0
    score_reasons.append("20日均线向上，趋势斜率为正。") if slope > 0 else risk_flags.append("20日均线没有向上，趋势确认不足。")
    trend_score += 6 if price >= ma60 * 0.985 else 0
    score_reasons.append("价格接近或高于60日线，中期位置尚可。") if price >= ma60 * 0.985 else risk_flags.append("价格明显低于60日线，中期趋势偏弱。")
    trend_score += 4 if r1 > b1 else 0
    score_reasons.append("近1个月表现强于沪深300基准。") if r1 > b1 else risk_flags.append("近1个月没有跑赢沪深300基准。")
    trend_score += 4 if r3 > b3 else 0
    score_reasons.append("近3个月表现强于沪深300基准。") if r3 > b3 else risk_flags.append("近3个月没有跑赢沪深300基准。")

    liquidity_score = 0
    liquidity_score += 8 if turnover >= 50000000 else 5 if turnover >= 10000000 else 2 if turnover > 0 else 0
    if turnover >= 50000000:
        score_reasons.append("成交额较高，买卖流动性较好。")
    elif turnover >= 10000000:
        score_reasons.append("成交额达到基础流动性要求。")
    else:
        risk_flags.append("成交额偏低，买卖可能不够顺畅。")
    liquidity_score += 5 if 0 < spread <= 0.12 else 3 if 0 < spread <= 0.3 else 0
    if 0 < spread <= 0.12:
        score_reasons.append("买卖价差较小。")
    elif spread > 0.3:
        risk_flags.append("买卖价差偏大，交易成本可能偏高。")
    liquidity_score += 4 if turnover >= 10000000 else 0
    liquidity_score += 3 if turnover >= 5000000 else 0

    text = f"{item.get('name', '')}{item.get('type', '')}"
    quality_score = 0
    quality_score += 7 if "ETF" in text else 0
    if "ETF" in text:
        score_reasons.append("产品类型清晰，属于ETF。")
    quality_score += 6 if fund_size >= 20 else 4 if fund_size >= 5 else 0
    if fund_size >= 20:
        score_reasons.append("基金规模较大。")
    elif fund_size >= 5:
        score_reasons.append("基金规模达到基础观察线。")
    else:
        risk_flags.append("基金规模偏小或缺少规模数据。")
    quality_score += 4 if item.get("name") else 0
    quality_score += 4 if not any(word in text for word in ["杠杆", "反向", "做空", "二倍", "2倍"]) else 0
    if any(word in text for word in ["杠杆", "反向", "做空", "二倍", "2倍"]):
        risk_flags.append("疑似杠杆、反向或复杂产品，第一阶段不碰。")
    quality_score += 4 if item.get("type") != "复杂产品" else 0

    risk_score = 0
    risk_score += 5 if r1 < 15 else 0
    if r1 >= 15:
        risk_flags.append("近1个月涨幅过高，可能已经过热。")
    risk_score += 4 if abs(r1) <= 12 else 0
    if abs(r1) > 12:
        risk_flags.append("近1个月波动偏大。")
    risk_score += 3 if not (r1 > 8 and r3 < 0) else 0
    if r1 > 8 and r3 < 0:
        risk_flags.append("短期走强但3个月仍弱，可能是反弹而不是趋势反转。")
    risk_score += 3 if price >= ma20 * 0.96 and price <= ma20 * 1.08 else 0
    if not (price >= ma20 * 0.96 and price <= ma20 * 1.08):
        risk_flags.append("价格偏离20日线较多，追买风险更高。")

    capital_fit_score = 0
    capital_fit_score += 5 if price * 100 <= trial_capital else 0
    capital_fit_score += 3 if price * 100 <= trial_capital * 0.95 else 0
    capital_fit_score += 2 if price * 100 >= 80 else 0
    if price * 100 <= trial_capital:
        score_reasons.append(f"100份约 {price * 100:.2f} 元，适配 {trial_capital:.2f} 元试验仓。")
    else:
        risk_flags.append(f"100份约 {price * 100:.2f} 元，超过 {trial_capital:.2f} 元试验仓。")

    hard_reject = (
        (0 < turnover < 1000000)
        or spread > 0.5
        or any(word in text for word in ["杠杆", "反向", "做空", "二倍", "2倍"])
        or r1 >= 25
        or price * 100 > trial_capital
    )
    if 0 < turnover < 1000000:
        risk_flags.append("成交额低于硬性流动性门槛。")
    if spread > 0.5:
        risk_flags.append("买卖价差超过硬性门槛。")
    if r1 >= 25:
        risk_flags.append("近1个月涨幅过热，第一阶段不追。")

    total = trend_score + liquidity_score + quality_score + risk_score + capital_fit_score
    if not hard_reject and total >= 80:
        grade, status = "A", "重点观察"
    elif not hard_reject and total >= 70:
        grade, status = "B", "普通观察"
    elif not hard_reject and total >= 60:
        grade, status = "C", "只记录"
    else:
        grade, status = "D", "剔除"

    recommendation = {
        "重点观察": "可以考虑手动检查，买入前必须写好止损价。",
        "普通观察": "继续观察，暂不买入。",
        "只记录": "只记录，不买入。",
        "剔除": "剔除或等待数据改善。",
    }[status]

    return {
        **item,
        "trendScore": trend_score,
        "liquidityScore": liquidity_score,
        "qualityScore": quality_score,
        "riskScore": risk_score,
        "capitalFitScore": capital_fit_score,
        "totalScore": total,
        "grade": grade,
        "status": status,
        "recommendation": recommendation,
        "scoreReasons": score_reasons,
        "riskFlags": risk_flags,
    }


def enrich_item(item, benchmark):
    history = get_daily_klines(item["code"])
    closes = [row["close"] for row in history if row["close"] > 0]
    if len(closes) < 65:
        raise RuntimeError(f"{item['code']} history too short")
    ma20 = moving_average(closes, 20)
    prev_ma20 = moving_average(closes, 20, offset=1)
    ma60 = moving_average(closes, 60)
    latest = closes[-1]
    cross_check = {"status": "single_source", "sourceCount": 1, "sources": ["腾讯行情"], "checkedAt": datetime.now().isoformat(timespec="seconds")}
    try:
        eastmoney = get_eastmoney_latest_close(item["code"])
        diff_pct = abs(eastmoney["close"] / latest - 1) * 100 if latest > 0 else None
        same_date = eastmoney["date"] == history[-1]["date"]
        verified = same_date and diff_pct is not None and diff_pct <= 0.3
        cross_check = {
            "status": "verified" if verified else "conflict",
            "sourceCount": 2,
            "sources": ["腾讯行情", "东方财富历史行情"],
            "primaryDate": history[-1]["date"],
            "secondaryDate": eastmoney["date"],
            "primaryClose": latest,
            "secondaryClose": eastmoney["close"],
            "diffPct": round(diff_pct, 4) if diff_pct is not None else None,
            "tolerancePct": 0.3,
            "checkedAt": datetime.now().isoformat(timespec="seconds"),
        }
    except Exception as exc:
        cross_check["warning"] = str(exc)
    return {
        **item,
        "price": latest,
        "close": latest,
        "ma20": round(ma20, 4),
        "ma60": round(ma60, 4),
        "ma20Slope": round(ma20 - prev_ma20, 6),
        "return1mPct": round(pct_change(closes, 20), 2),
        "return3mPct": round(pct_change(closes, 60), 2),
        "benchmarkReturn1mPct": benchmark["return1mPct"],
        "benchmarkReturn3mPct": benchmark["return3mPct"],
        "lastMarketDate": history[-1]["date"],
        "priceCrossCheck": cross_check,
        "_history": chart_history(history),
        "updatedAt": datetime.now().isoformat(timespec="seconds"),
    }


def benchmark_returns(code="510300"):
    history = get_daily_klines(code)
    closes = [row["close"] for row in history if row["close"] > 0]
    return {
        "return1mPct": round(pct_change(closes, 20), 2),
        "return3mPct": round(pct_change(closes, 60), 2),
    }


def load_state():
    with STATE_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def save_state(state):
    save_json_atomic(STATE_PATH, state)


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    state = load_state()
    settings = state.get("settings", {})
    benchmark = benchmark_returns()
    spot_items = get_spot_etfs(limit=max(limit * 2, 20), official_etfs=state.get("efundsEtfs", []))
    selected = []
    history_updates = {}
    errors = []

    for item in spot_items:
        if len(selected) >= limit:
            break
        try:
            enriched = enrich_item(item, benchmark)
            rows = enriched.pop("_history", [])
            scored = score_item(enriched, settings)
            selected.append(scored)
            history_updates[item["code"]] = {
                "code": item["code"],
                "name": item.get("name", ""),
                "updatedAt": enriched.get("updatedAt"),
                "lastMarketDate": enriched.get("lastMarketDate"),
                "priceSource": "腾讯行情（前复权）",
                "secondarySource": "东方财富历史行情",
                "crossCheck": enriched.get("priceCrossCheck", {}),
                "bars": rows,
            }
            time.sleep(0.03)
        except Exception as exc:
            errors.append(f"{item.get('code')} {item.get('name')}: {exc}")

    selected.sort(key=lambda item: item.get("totalScore", 0), reverse=True)
    state["watchlist"] = selected
    try:
        benchmark_rows = chart_history(get_daily_klines("510300"))
        history_updates["510300"] = {
            "code": "510300",
            "name": "沪深300ETF基准",
            "updatedAt": datetime.now().isoformat(timespec="seconds"),
            "lastMarketDate": benchmark_rows[-1]["time"] if benchmark_rows else None,
            "priceSource": "腾讯行情（前复权）",
            "secondarySource": "东方财富历史行情",
            "crossCheck": next((item.get("priceCrossCheck", {}) for item in selected if item.get("code") == "510300"), {}),
            "bars": benchmark_rows,
        }
    except Exception as exc:
        errors.append(f"510300 沪深300基准: {exc}")
    state["marketHistory"] = history_updates
    state.setdefault("marketUpdates", []).insert(
        0,
        {
            "time": datetime.now().isoformat(timespec="seconds"),
            "count": len(selected),
            "errors": errors[:10],
            "source": "腾讯行情 + 东方财富历史行情",
            "crossCheckedCount": sum(1 for item in selected if item.get("priceCrossCheck", {}).get("status") == "verified"),
            "conflictCount": sum(1 for item in selected if item.get("priceCrossCheck", {}).get("status") == "conflict"),
        },
    )
    state["marketUpdates"] = state["marketUpdates"][:20]
    save_state(state)
    print(json.dumps({"ok": True, "count": len(selected), "errors": errors[:5]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
