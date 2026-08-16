from urllib.parse import urlparse


GRADE_RULES = [
    {
        "grade": "A",
        "label": "官方/监管/交易所/公告原文",
        "allowedUse": "可进入事件验证，可作为候选池观察理由，但仍需行情确认。",
    },
    {
        "grade": "B",
        "label": "国际机构/央行/金融巨头官方研究或财报",
        "allowedUse": "可进入事件验证，用于宏观、利率、行业风险偏好判断。",
    },
    {
        "grade": "C",
        "label": "权威财经媒体",
        "allowedUse": "只做背景解释，不单独触发买卖。",
    },
    {
        "grade": "D",
        "label": "自媒体/论坛/群消息/无来源转载",
        "allowedUse": "默认过滤，不进入策略判断。",
    },
]


SOURCE_WHITELIST = [
    {"name": "易方达官网", "grade": "A", "category": "基金公司官方", "url": "https://www.efunds.com.cn/", "domains": ["efunds.com.cn"], "useFor": "基金产品、指数专区新闻、净值核对、ETF产品信息"},
    {"name": "中国人民银行", "grade": "A", "category": "国内官方/监管", "url": "https://www.pbc.gov.cn/", "domains": ["pbc.gov.cn"], "useFor": "货币政策、LPR、公开市场、社融、汇率"},
    {"name": "中国证监会", "grade": "A", "category": "国内官方/监管", "url": "https://www.csrc.gov.cn/", "domains": ["csrc.gov.cn"], "useFor": "资本市场政策、监管处罚、基金行业监管"},
    {"name": "国家统计局", "grade": "A", "category": "国内官方/宏观", "url": "https://www.stats.gov.cn/sj/zxfb/", "domains": ["stats.gov.cn"], "useFor": "CPI、PPI、PMI、GDP、工业利润"},
    {"name": "国家发展改革委", "grade": "A", "category": "国内官方/产业", "url": "https://www.ndrc.gov.cn/", "domains": ["ndrc.gov.cn"], "useFor": "产业政策、价格政策、油价调整、重大项目"},
    {"name": "财政部", "grade": "A", "category": "国内官方/财政", "url": "https://www.mof.gov.cn/", "domains": ["mof.gov.cn"], "useFor": "财政政策、地方债、税费政策"},
    {"name": "国家外汇管理局", "grade": "A", "category": "国内官方/外汇", "url": "https://www.safe.gov.cn/", "domains": ["safe.gov.cn"], "useFor": "外汇收支、跨境资金、外储"},
    {"name": "海关总署", "grade": "A", "category": "国内官方/贸易", "url": "http://www.customs.gov.cn/", "domains": ["customs.gov.cn"], "useFor": "进出口数据"},
    {"name": "巨潮资讯", "grade": "A", "category": "公告/财报原文", "url": "https://www.cninfo.com.cn/", "domains": ["cninfo.com.cn"], "useFor": "A股公告、年报、季报、临时公告"},
    {"name": "上海证券交易所", "grade": "A", "category": "交易所", "url": "https://www.sse.com.cn/", "domains": ["sse.com.cn"], "useFor": "沪市公告、监管信息、ETF信息"},
    {"name": "深圳证券交易所", "grade": "A", "category": "交易所", "url": "https://www.szse.cn/", "domains": ["szse.cn"], "useFor": "深市公告、监管信息、ETF信息"},
    {"name": "港交所披露易", "grade": "A", "category": "交易所/港股公告", "url": "https://www.hkexnews.hk/", "domains": ["hkexnews.hk"], "useFor": "港股公告、财报、回购、停牌"},
    {"name": "SEC EDGAR", "grade": "A", "category": "海外公告/财报原文", "url": "https://www.sec.gov/edgar/search/", "domains": ["sec.gov"], "useFor": "美股10-K、10-Q、8-K、招股书"},
    {"name": "美联储", "grade": "B", "category": "国际央行/宏观", "url": "https://www.federalreserve.gov/newsevents/pressreleases.htm", "domains": ["federalreserve.gov"], "useFor": "FOMC、利率、金融稳定、监管"},
    {"name": "美国劳工统计局 BLS", "grade": "B", "category": "国际官方/宏观", "url": "https://www.bls.gov/bls/news-release/", "domains": ["bls.gov"], "useFor": "CPI、非农、工资、就业"},
    {"name": "美国经济分析局 BEA", "grade": "B", "category": "国际官方/宏观", "url": "https://www.bea.gov/news/schedule", "domains": ["bea.gov"], "useFor": "GDP、PCE、企业利润"},
    {"name": "欧洲央行 ECB", "grade": "B", "category": "国际央行/宏观", "url": "https://www.ecb.europa.eu/press/pubbydate/html/index.en.html", "domains": ["ecb.europa.eu"], "useFor": "欧元区货币政策、通胀、金融稳定"},
    {"name": "IMF", "grade": "B", "category": "国际机构", "url": "https://www.imf.org/en/news", "domains": ["imf.org"], "useFor": "全球经济展望、国家报告、金融风险"},
    {"name": "BIS", "grade": "B", "category": "国际机构", "url": "https://www.bis.org/press/", "domains": ["bis.org"], "useFor": "全球银行、金融稳定、央行研究"},
    {"name": "BlackRock Investor Relations", "grade": "B", "category": "金融巨头财报/研究", "url": "https://ir.blackrock.com/", "domains": ["ir.blackrock.com"], "useFor": "财报、资产管理规模、ETF资金趋势"},
    {"name": "BlackRock Investment Institute", "grade": "B", "category": "金融巨头研究", "url": "https://www.blackrock.com/corporate/insights/blackrock-investment-institute", "domains": ["blackrock.com"], "useFor": "周度市场观点、资产配置观点"},
    {"name": "JPMorgan Chase IR", "grade": "B", "category": "金融巨头财报", "url": "https://www.jpmorganchase.com/ir", "domains": ["jpmorganchase.com"], "useFor": "银行业景气、信用风险"},
    {"name": "Goldman Sachs IR", "grade": "B", "category": "金融巨头财报", "url": "https://www.goldmansachs.com/investor-relations", "domains": ["goldmansachs.com"], "useFor": "投行业务、交易业务、市场环境"},
    {"name": "Morgan Stanley IR", "grade": "B", "category": "金融巨头财报", "url": "https://www.morganstanley.com/about-us-ir", "domains": ["morganstanley.com"], "useFor": "财富管理、投行、市场环境"},
    {"name": "Bank of America IR", "grade": "B", "category": "金融巨头财报", "url": "https://investor.bankofamerica.com/", "domains": ["bankofamerica.com"], "useFor": "银行业、消费信贷、信用风险"},
    {"name": "Berkshire Hathaway Reports", "grade": "B", "category": "财报/股东信", "url": "https://www.berkshirehathaway.com/reports.html", "domains": ["berkshirehathaway.com"], "useFor": "年报、季报、股东信"},
    {"name": "新华财经/新华网财经", "grade": "C", "category": "权威财经媒体", "url": "https://www.xinhuanet.com/finance/", "domains": ["xinhuanet.com"], "useFor": "宏观、政策、上市公司新闻"},
    {"name": "中证网/中国证券报", "grade": "C", "category": "权威财经媒体", "url": "https://www.cs.com.cn/", "domains": ["cs.com.cn"], "useFor": "A股、基金、上市公司、宏观"},
    {"name": "证券时报", "grade": "C", "category": "权威财经媒体", "url": "https://www.stcn.com/", "domains": ["stcn.com"], "useFor": "资本市场、券商、基金、公司新闻"},
    {"name": "上海证券报/中国证券网", "grade": "C", "category": "权威财经媒体", "url": "https://www.cnstock.com/", "domains": ["cnstock.com"], "useFor": "政策、公司、行业新闻"},
    {"name": "第一财经", "grade": "C", "category": "权威财经媒体", "url": "https://www.yicai.com/", "domains": ["yicai.com"], "useFor": "宏观、产业、公司深度报道"},
    {"name": "财新", "grade": "C", "category": "权威财经媒体", "url": "https://www.caixin.com/", "domains": ["caixin.com"], "useFor": "深度调查、宏观和金融监管"},
    {"name": "Reuters Markets", "grade": "C", "category": "国际权威财经媒体", "url": "https://www.reuters.com/markets/", "domains": ["reuters.com"], "useFor": "全球市场快讯、公司新闻、宏观事件"},
    {"name": "Bloomberg Markets", "grade": "C", "category": "国际权威财经媒体", "url": "https://www.bloomberg.com/markets", "domains": ["bloomberg.com"], "useFor": "全球市场、宏观、资金流"},
    {"name": "Financial Times Markets", "grade": "C", "category": "国际权威财经媒体", "url": "https://www.ft.com/markets", "domains": ["ft.com"], "useFor": "全球金融、宏观、深度分析"},
    {"name": "Wall Street Journal Finance", "grade": "C", "category": "国际权威财经媒体", "url": "https://www.wsj.com/finance", "domains": ["wsj.com"], "useFor": "美股、金融、公司新闻"},
    {"name": "Nikkei Asia", "grade": "C", "category": "国际权威财经媒体", "url": "https://asia.nikkei.com/", "domains": ["asia.nikkei.com"], "useFor": "亚洲产业链、日本、半导体、供应链"},
]


BLACKLIST_RULES = [
    "微信群、QQ群、朋友圈截图",
    "没有原文链接的二手搬运",
    "只写“据传”“网传”“机构人士透露”但无可验证来源",
    "荐股号、付费群广告、短视频财经号",
    "标题含“必涨、暴涨、满仓、梭哈、内幕、确定性翻倍”等夸张词",
    "只引用单一匿名消息源的内容",
]


def allowed_use_for_grade(grade):
    for item in GRADE_RULES:
        if item["grade"] == grade:
            return item["allowedUse"]
    return "未分级，默认不进入策略判断。"


def normalize_domain(value):
    text = (value or "").strip().lower()
    if not text:
        return ""
    parsed = urlparse(text if "://" in text else f"https://{text}")
    domain = parsed.netloc or parsed.path
    return domain.replace("www.", "", 1)


def domain_matches(url_or_domain, domains):
    domain = normalize_domain(url_or_domain)
    if not domain:
        return False
    for item in domains or []:
        candidate = normalize_domain(item)
        if domain == candidate or domain.endswith(f".{candidate}"):
            return True
    return False


def match_source(url="", name=""):
    text = f"{url or ''} {name or ''}".lower()
    for item in SOURCE_WHITELIST:
        if url and domain_matches(url, item.get("domains")):
            return item
        if name and item["name"].lower() in text:
            return item
    return {
        "name": "未在白名单",
        "grade": "D",
        "category": "未知/未验证来源",
        "url": url or "",
        "domains": [],
        "useFor": "默认过滤，需要补充原始来源后才能进入事件验证。",
    }


def public_source_item(item):
    grade = item.get("grade") or "D"
    return {
        "name": item.get("name") or "",
        "grade": grade,
        "category": item.get("category") or "",
        "url": item.get("url") or "",
        "domains": item.get("domains") or [],
        "useFor": item.get("useFor") or "",
        "allowedUse": allowed_use_for_grade(grade),
        "canTriggerObservation": grade in ("A", "B"),
    }
