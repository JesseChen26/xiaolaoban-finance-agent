import argparse
import html
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.request import Request, urlopen

from state_store import save_json_atomic

try:
    import requests
except ImportError:
    requests = None


ROOT = Path(__file__).resolve().parents[1]
STATE_PATH = Path(os.environ.get("STATE_PATH_OVERRIDE") or ROOT / "data" / "state.json")
MAPPING_PATH = ROOT / "config" / "fund-exposure-mappings.json"
SECTOR_PATH = ROOT / "config" / "security-sectors.json"
ARCHIVE_URL = "https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code={code}&topline=10"
HEADERS = {"User-Agent": "Mozilla/5.0", "Referer": "https://fundf10.eastmoney.com/"}


def fetch_text(url, timeout=20):
    last_error = None
    for attempt in range(2):
        try:
            if requests is not None:
                response = requests.get(url, headers=HEADERS, timeout=timeout)
                response.raise_for_status()
                return response.text
            request = Request(url, headers=HEADERS)
            with urlopen(request, timeout=timeout) as response:
                return response.read().decode("utf-8", errors="replace")
        except Exception as exc:
            last_error = exc
            time.sleep(0.4 + attempt * 0.6)
    raise last_error


def clean_cell(value):
    value = re.sub(r"<[^>]+>", "", value or "")
    return html.unescape(value).replace("&nbsp;", " ").strip()


def infer_market(code):
    if re.fullmatch(r"\d{6}", code or ""):
        return "中国A股"
    if re.fullmatch(r"[A-Z][A-Z0-9.-]{0,9}", code or ""):
        return "美国"
    return "其他"


def parse_holdings(text, code, sectors):
    section_match = re.search(
        r"(<h4[\s\S]*?截止至：<font[^>]*>(\d{4}-\d{2}-\d{2})</font>[\s\S]*?<table[\s\S]*?</table>)",
        text,
        re.IGNORECASE,
    )
    section = section_match.group(1) if section_match else text
    report_date = section_match.group(2) if section_match else ""
    title_match = re.search(r"title='([^']+)'", text)
    rows = []
    for row_html in re.findall(r"<tr[^>]*>([\s\S]*?)</tr>", section, re.IGNORECASE):
        cells = re.findall(r"<td[^>]*>([\s\S]*?)</td>", row_html)
        if len(cells) < 7:
            continue
        security_code = clean_cell(cells[1])
        name = clean_cell(cells[2])
        weight_text = clean_cell(cells[6]).replace("%", "")
        try:
            weight = float(weight_text)
        except ValueError:
            continue
        if not security_code or not name or weight <= 0:
            continue
        rows.append({
            "code": security_code,
            "name": name,
            "weightPct": round(weight, 4),
            "sector": sectors.get(security_code, "未分类"),
            "market": infer_market(security_code),
        })
    return {
        "code": code,
        "name": title_match.group(1) if title_match else code,
        "asOfDate": report_date,
        "holdings": rows,
        "source": "基金定期报告持仓（天天基金整理）",
        "sourceUrl": f"https://fundf10.eastmoney.com/ccmx_{code}.html",
    }


def is_stale(report_date, max_age_days=550):
    if not report_date:
        return True
    try:
        return datetime.strptime(report_date, "%Y-%m-%d") < datetime.now() - timedelta(days=max_age_days)
    except ValueError:
        return True


def merge_exposures(rows):
    merged = {}
    for row in rows:
        key = row["code"]
        if key not in merged:
            merged[key] = {**row, "weightPct": 0, "origins": []}
        merged[key]["weightPct"] += float(row.get("weightPct") or 0)
        origin = row.get("origin")
        if origin and origin not in merged[key]["origins"]:
            merged[key]["origins"].append(origin)
    result = []
    for row in merged.values():
        row["weightPct"] = round(row["weightPct"], 4)
        result.append(row)
    return sorted(result, key=lambda item: item["weightPct"], reverse=True)


def infer_mapping(position):
    name = str(position.get("name") or "")
    position_type = str(position.get("type") or "")
    combined = f"{name}{position_type}"
    if "股票" in position_type and "基金" not in position_type:
        return {"kind": "direct_security", "assetClass": "股票", "residualLabel": ""}
    if "债" in combined:
        return {"kind": "bond_fund", "assetClass": "债券", "residualLabel": "债券、现金及未披露资产"}
    if "ETF" in combined and "联接" not in combined and "场外" not in position_type:
        return {"kind": "index_fund", "assetClass": "场内ETF", "residualLabel": "其他成分股、现金及未披露资产"}
    if "QDII" in combined or "指数" in combined or "联接" in combined:
        return {"kind": "index_fund", "assetClass": "指数/海外基金", "residualLabel": "其他成分股、现金及未披露资产"}
    return {"kind": "active_fund", "assetClass": "股票/混合基金", "residualLabel": "其他股票、债券、现金及未披露资产"}


def build_fund_exposure(position, mapping, sectors):
    code = str(position.get("code", ""))
    kind = mapping.get("kind", "unknown")
    errors = []
    sources = []
    exposure_rows = []
    as_of_dates = []

    if kind == "direct_security":
        return {
            "code": code,
            "name": position.get("name") or code,
            "kind": kind,
            "assetClass": "股票",
            "target": None,
            "asOfDate": position.get("updatedAt") or position.get("importedAt") or "",
            "holdings": [{"code": code, "name": position.get("name") or code, "weightPct": 100, "sector": sectors.get(code, "未分类"), "market": infer_market(code), "origin": "用户直接持有", "origins": ["用户直接持有"]}],
            "assetBuckets": [{"name": "直接持有股票", "weightPct": 100}],
            "knownStockPct": 100,
            "unresolvedPct": 0,
            "confidence": "A",
            "method": "direct_security",
            "disclosureLabel": "用户直接持有记录",
            "sources": [{"name": "软件内本地持仓记录", "url": "", "level": "A"}],
            "errors": [],
        }

    if kind == "commodity_feeder":
        allocation = float(mapping.get("targetAllocationPct") or 0)
        return {
            "code": code,
            "name": position.get("name") or code,
            "kind": kind,
            "assetClass": mapping.get("assetClass", "商品"),
            "target": {"code": mapping.get("targetCode"), "name": mapping.get("targetName"), "allocationPct": allocation, "method": mapping.get("allocationMethod")},
            "asOfDate": position.get("navDate") or "",
            "holdings": [],
            "assetBuckets": [{"name": "黄金", "weightPct": allocation}, {"name": mapping.get("residualLabel", "其他资产"), "weightPct": round(100 - allocation, 4)}],
            "knownStockPct": 0,
            "unresolvedPct": round(100 - allocation, 4),
            "confidence": "B",
            "method": "commodity_proxy",
            "disclosureLabel": "目标黄金ETF与业绩基准近似",
            "sources": [{"name": mapping.get("mappingSource"), "url": mapping.get("mappingSourceUrl"), "level": "A"}],
            "errors": [],
        }

    direct = None
    try:
        direct = parse_holdings(fetch_text(ARCHIVE_URL.format(code=code)), code, sectors)
        sources.append({"name": direct["source"], "url": direct["sourceUrl"], "level": "B"})
        if is_stale(direct["asOfDate"]):
            errors.append(f"基金直接持仓披露已过期（{direct['asOfDate'] or '无日期'}），未计入穿透")
    except Exception as exc:
        errors.append(f"基金直接持仓：{exc}")

    target_code = str(mapping.get("targetCode") or "")
    if target_code:
        try:
            target = parse_holdings(fetch_text(ARCHIVE_URL.format(code=target_code)), target_code, sectors)
            allocation = float(mapping.get("targetAllocationPct") or 0) / 100
            sources.append({"name": f"{mapping.get('targetName') or target_code}定期报告持仓", "url": target["sourceUrl"], "level": "B"})
            if target["asOfDate"]:
                as_of_dates.append(target["asOfDate"])
            for row in target["holdings"]:
                exposure_rows.append({**row, "weightPct": round(row["weightPct"] * allocation, 4), "origin": f"目标ETF {target_code}×{allocation * 100:.0f}%"})
            if direct and direct["asOfDate"] == target["asOfDate"] and not is_stale(direct["asOfDate"]):
                for row in direct["holdings"]:
                    exposure_rows.append({**row, "origin": f"{code}同季度直接披露"})
            elif direct and direct["holdings"] and not is_stale(direct["asOfDate"]):
                errors.append(f"基金直接持仓季度与目标ETF不一致（{direct['asOfDate']} vs {target['asOfDate']}），未混合计算")
        except Exception as exc:
            errors.append(f"目标ETF持仓：{exc}")
    elif direct and not is_stale(direct["asOfDate"]):
        if direct["asOfDate"]:
            as_of_dates.append(direct["asOfDate"])
        for row in direct["holdings"]:
            exposure_rows.append({**row, "origin": f"{code}直接披露"})

    holdings = merge_exposures(exposure_rows)
    known = round(sum(float(item["weightPct"]) for item in holdings), 4)
    if known > 100.0001:
        errors.append(f"已知股票权重异常（{known:.2f}%），本次结果已拒绝展示")
        holdings = []
        known = 0
    unresolved = round(max(0, 100 - known), 4)
    if mapping.get("mappingSource"):
        sources.insert(0, {"name": mapping.get("mappingSource"), "url": mapping.get("mappingSourceUrl"), "level": "A"})
    if kind == "bond_fund":
        residual_label = mapping.get("residualLabel", "债券、现金及未披露资产")
    else:
        residual_label = mapping.get("residualLabel", "其他股票、现金及未披露资产")
    asset_buckets = []
    if known > 0:
        asset_buckets.append({"name": "已披露股票穿透", "weightPct": known})
    asset_buckets.append({"name": residual_label, "weightPct": unresolved})
    confidence = "B" if holdings and not target_code else "C" if holdings else "D"
    return {
        "code": code,
        "name": position.get("name") or code,
        "kind": kind,
        "assetClass": mapping.get("assetClass", "未分类"),
        "target": {"code": target_code, "name": mapping.get("targetName"), "allocationPct": mapping.get("targetAllocationPct"), "method": mapping.get("allocationMethod")} if target_code else None,
        "asOfDate": max(as_of_dates) if as_of_dates else "",
        "holdings": holdings,
        "assetBuckets": asset_buckets,
        "knownStockPct": known,
        "unresolvedPct": unresolved,
        "confidence": confidence,
        "method": "target_etf_lookthrough" if target_code else "quarterly_direct_holdings",
        "disclosureLabel": "目标ETF季度持仓×基准配置比例" if target_code else "最新季度前十大股票披露",
        "sources": sources,
        "errors": errors,
    }


def load_json(path):
    with Path(path).open("r", encoding="utf-8") as file:
        return json.load(file)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    state = load_json(STATE_PATH)
    existing = state.get("fundExposure") or {}
    last_sync = existing.get("updatedAt")
    if not args.force and last_sync:
        try:
            if datetime.fromisoformat(last_sync) > datetime.now() - timedelta(days=7):
                print(json.dumps({"ok": True, "skipped": True, "reason": "最近7天已同步持仓披露", "updatedAt": last_sync}, ensure_ascii=False))
                return
        except ValueError:
            pass

    mappings = load_json(MAPPING_PATH).get("funds", {})
    sectors = load_json(SECTOR_PATH)
    items = {}
    errors = []
    for position in state.get("portfolio", []):
        code = str(position.get("code", ""))
        mapping = mappings.get(code) or infer_mapping(position)
        try:
            item = build_fund_exposure(position, mapping, sectors)
            items[code] = item
            errors.extend([f"{code}: {message}" for message in item.get("errors", [])])
            time.sleep(0.08)
        except Exception as exc:
            errors.append(f"{code}: {exc}")

    payload = {
        "version": 1,
        "updatedAt": datetime.now().isoformat(timespec="seconds"),
        "fundCount": len(items),
        "mappedCount": len(items),
        "configuredMappingCount": len(mappings),
        "items": items,
        "errors": errors[:30],
        "methodology": "季度前十大持仓；ETF联接按目标ETF季度持仓乘以95%业绩基准代理；未披露部分单独保留，不推测为实时持仓。",
    }
    state["fundExposure"] = payload
    state.setdefault("fundExposureUpdates", []).insert(0, {key: payload[key] for key in ("updatedAt", "fundCount", "mappedCount", "errors")})
    state["fundExposureUpdates"] = state["fundExposureUpdates"][:20]
    save_json_atomic(STATE_PATH, state)
    print(json.dumps({"ok": True, **payload}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
