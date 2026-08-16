import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from state_store import save_json_atomic
from urllib.request import Request, urlopen

from source_whitelist import match_source
from sync_efunds_news import event_returns


ROOT = Path(__file__).resolve().parents[1]
STATE_PATH_OVERRIDE = os.environ.get("STATE_PATH_OVERRIDE")
DATA_DIR_OVERRIDE = os.environ.get("DATA_DIR_OVERRIDE")
STATE_PATH = Path(
    STATE_PATH_OVERRIDE
    or (Path(DATA_DIR_OVERRIDE) / "state.json" if DATA_DIR_OVERRIDE else ROOT / "data" / "state.json")
)
SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
SEC_ARCHIVE_URL = "https://www.sec.gov/Archives/edgar/data/{cik_int}/{accession_path}/{document}"
SEC_USER_AGENT = os.environ.get(
    "SEC_USER_AGENT",
    "xiaolaoban-finance-agent/0.1 contact@example.com",
)

COMPANIES = [
    {
        "name": "BlackRock",
        "ticker": "BLK",
        "cik": "0001364742",
        "themes": ["金融巨头", "资产管理", "ETF资金趋势"],
        "matchedCodes": ["510300", "513090", "513050"],
    },
    {
        "name": "JPMorgan Chase",
        "ticker": "JPM",
        "cik": "0000019617",
        "themes": ["金融巨头", "银行", "信用周期"],
        "matchedCodes": ["510300", "513090", "512880"],
    },
    {
        "name": "Goldman Sachs",
        "ticker": "GS",
        "cik": "0000886982",
        "themes": ["金融巨头", "投行", "市场交易"],
        "matchedCodes": ["510300", "513090", "512880"],
    },
    {
        "name": "Morgan Stanley",
        "ticker": "MS",
        "cik": "0000895421",
        "themes": ["金融巨头", "财富管理", "投行"],
        "matchedCodes": ["510300", "513090", "512880"],
    },
    {
        "name": "Bank of America",
        "ticker": "BAC",
        "cik": "0000070858",
        "themes": ["金融巨头", "银行", "消费信贷"],
        "matchedCodes": ["510300", "513090", "512880"],
    },
    {
        "name": "Berkshire Hathaway",
        "ticker": "BRK",
        "cik": "0001067983",
        "themes": ["金融巨头", "保险", "长期资金"],
        "matchedCodes": ["510300", "513090"],
    },
]

FINANCIAL_FORMS = {"10-K", "10-Q"}


def fetch_json(url):
    request = Request(
        url,
        headers={
            "User-Agent": SEC_USER_AGENT,
            "Accept": "application/json",
        },
    )
    with urlopen(request, timeout=18) as response:
        return json.loads(response.read().decode("utf-8"))


def load_state():
    with STATE_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def save_state(state):
    save_json_atomic(STATE_PATH, state)


def filing_url(cik, accession, document):
    cik_int = str(int(cik))
    accession_path = str(accession).replace("-", "")
    return SEC_ARCHIVE_URL.format(cik_int=cik_int, accession_path=accession_path, document=document)


def recent_financial_filings(company, max_items=1):
    data = fetch_json(SEC_SUBMISSIONS_URL.format(cik=company["cik"]))
    recent = (data.get("filings") or {}).get("recent") or {}
    forms = recent.get("form") or []
    filings = []

    for index, form in enumerate(forms):
        if form not in FINANCIAL_FORMS:
            continue
        accession = (recent.get("accessionNumber") or [])[index]
        document = (recent.get("primaryDocument") or [])[index]
        filing_date = (recent.get("filingDate") or [])[index]
        report_date = (recent.get("reportDate") or [])[index]
        description = (recent.get("primaryDocDescription") or [])[index] if recent.get("primaryDocDescription") else ""
        if not accession or not document or not filing_date:
            continue
        filings.append({
            "company": company["name"],
            "ticker": company["ticker"],
            "cik": company["cik"],
            "form": form,
            "filingDate": filing_date,
            "reportDate": report_date,
            "description": description,
            "accessionNumber": accession,
            "documentUrl": filing_url(company["cik"], accession, document),
        })
        if len(filings) >= max_items:
            break

    return filings


def classify_results(results):
    post5 = [item["post5Pct"] for item in results if item.get("post5Pct") is not None]
    post20 = [item["post20Pct"] for item in results if item.get("post20Pct") is not None]
    if not post5 and not post20:
        return "待行情回看"
    avg5 = sum(post5) / len(post5) if post5 else None
    avg20 = sum(post20) / len(post20) if post20 else None
    if avg5 is not None and avg5 > 2:
        return "财报后短期风险偏好走强"
    if avg20 is not None and avg20 > 4:
        return "财报后中期风险偏好走强"
    if avg5 is not None and avg5 < -2:
        return "财报后短期风险偏好走弱"
    return "未见明显异常"


def economic_logic(event):
    results = event.get("results") or []
    pre5 = [item["pre5Pct"] for item in results if item.get("pre5Pct") is not None]
    post5 = [item["post5Pct"] for item in results if item.get("post5Pct") is not None]
    avg_pre5 = sum(pre5) / len(pre5) if pre5 else None
    avg_post5 = sum(post5) / len(post5) if post5 else None

    if avg_pre5 is not None and avg_pre5 > 2 and (avg_post5 is None or avg_post5 <= 1):
        timing = "相关 ETF 在财报前已经走强，财报更可能是事后确认，不能追。"
    elif avg_post5 is not None and avg_post5 > 2:
        timing = "财报后相关 ETF 继续走强，可作为风险偏好改善的观察证据。"
    elif avg_post5 is not None and avg_post5 < -2:
        timing = "财报后相关 ETF 走弱，说明市场没有继续认可，需降低主题权重。"
    else:
        timing = "财报前后没有明显同向波动，只能作为宏观和行业背景。"

    return (
        "金融巨头财报主要用于观察全球信用周期、投行业务、资产管理资金流和市场风险偏好，"
        "不作为 A 股 ETF 的单独买入信号。"
        f"{timing}"
    )


def annotate_source(event):
    source = match_source(event.get("url") or "", "SEC EDGAR")
    grade = source.get("grade") or "D"
    event["sourceName"] = source.get("name") or "SEC EDGAR"
    event["sourceGrade"] = grade
    event["sourceCategory"] = source.get("category") or "海外公告/财报原文"
    event["sourceUrl"] = source.get("url") or event.get("url") or ""
    event["sourceAllowedUse"] = "可进入事件验证" if grade in ("A", "B") else "只做背景或过滤"
    event["sourceCanTriggerObservation"] = grade in ("A", "B")
    event["sourcePolicy"] = "财报原文只作为事件验证和风险偏好证据，不单独触发交易。"
    return event


def build_event(company, filing):
    matched_codes = company.get("matchedCodes") or []
    results = []
    errors = []
    for code in matched_codes[:4]:
        try:
            result = event_returns(code, filing["filingDate"])
            if result:
                results.append(result)
            time.sleep(0.03)
        except Exception as exc:
            errors.append(f"{code}: {exc}")

    event = {
        "id": f"sec-{filing['ticker']}-{filing['accessionNumber']}",
        "type": "financial-report",
        "title": f"{filing['company']} {filing['form']} 财报申报",
        "company": filing["company"],
        "ticker": filing["ticker"],
        "cik": filing["cik"],
        "form": filing["form"],
        "date": filing["filingDate"],
        "filingDate": filing["filingDate"],
        "reportDate": filing["reportDate"],
        "description": filing.get("description") or filing["form"],
        "url": filing["documentUrl"],
        "themes": company.get("themes") or [],
        "matchedCodes": matched_codes,
        "results": results,
        "errors": errors,
    }
    event["conclusion"] = classify_results(results)
    event["economicLogic"] = economic_logic(event)
    annotate_source(event)
    return event


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else len(COMPANIES)
    events = []
    errors = []
    for company in COMPANIES[:limit]:
        try:
            filings = recent_financial_filings(company, max_items=1)
            if not filings:
                errors.append(f"{company['ticker']}: 未找到 10-K/10-Q 财报申报。")
                continue
            for filing in filings:
                events.append(build_event(company, filing))
            time.sleep(0.1)
        except Exception as exc:
            errors.append(f"{company['ticker']}: {exc}")

    events.sort(key=lambda item: item.get("filingDate") or "", reverse=True)
    state = load_state()
    sync = {
        "time": datetime.now().isoformat(timespec="seconds"),
        "count": len(events),
        "source": "SEC EDGAR company submissions",
        "sourceUrl": "https://data.sec.gov/submissions/",
        "sourceGrade": "A",
        "errors": errors[:12],
    }
    state["financialEvents"] = events
    state["financialEventSync"] = sync
    state.setdefault("financialEventUpdates", []).insert(0, sync)
    state["financialEventUpdates"] = state["financialEventUpdates"][:20]
    save_state(state)
    print(json.dumps({"ok": True, **sync}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
