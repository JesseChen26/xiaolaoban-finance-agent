const crypto = require("crypto");
const { buildPortfolioExposure } = require("./portfolio-exposure");

const TOOL_LIMIT = 8;
const TURN_LIMIT = 10;
const TOOL_RETRY_LIMIT = 1;
const API_RETRY_LIMIT = 2;
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-terra";
const DEFAULT_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value, max = 300) {
  return String(value ?? "").trim().slice(0, max);
}

function newestTime(items = []) {
  return items.map((item) => item.updatedAt || item.time || item.date || item.publishedAt || "")
    .filter(Boolean).sort().at(-1) || null;
}

function sourceEnvelope(data, options = {}) {
  return {
    status: options.status || "success",
    data,
    source: options.source || "小老板理财本地数据",
    source_level: options.sourceLevel || "B",
    source_url: options.sourceUrl || "",
    verification_status: options.verificationStatus || "single_source",
    source_count: options.sourceCount || 1,
    updated_at: options.updatedAt || null,
    warning: (options.warning || []).filter(Boolean)
  };
}

function scoreCandidate(item, trialCapital = 200) {
  if (item.totalScore !== undefined && item.grade && item.status) return { ...item };
  const price = num(item.price || item.close);
  const ma20 = num(item.ma20);
  const ma60 = num(item.ma60);
  const slope = num(item.ma20Slope);
  const turnover = num(item.turnoverYuan);
  const size = num(item.fundSizeYi);
  const spread = num(item.bidAskSpreadPct);
  const r1 = num(item.return1mPct);
  const r3 = num(item.return3mPct);
  const b1 = num(item.benchmarkReturn1mPct);
  const b3 = num(item.benchmarkReturn3mPct);
  if (price <= 0 || ma20 <= 0 || ma60 <= 0) {
    return { ...item, totalScore: 0, grade: "D", status: "数据缺失", scoreReasons: [], riskFlags: ["价格或均线数据不完整，不能形成判断。"] };
  }
  let score = 0;
  const reasons = [];
  const risks = [];
  if (price > ma20) { score += 8; reasons.push("价格高于20日线，短中期趋势未破。") } else risks.push("价格低于20日线，短期趋势偏弱。");
  if (slope > 0) { score += 8; reasons.push("20日均线斜率为正。") } else risks.push("20日均线尚未向上。");
  if (price >= ma60 * 0.985) { score += 6; reasons.push("价格接近或高于60日线。") } else risks.push("价格明显低于60日线。");
  if (r1 > b1) { score += 4; reasons.push("近1个月表现强于沪深300基准。") } else risks.push("近1个月未跑赢基准。");
  if (r3 > b3) { score += 4; reasons.push("近3个月表现强于沪深300基准。") } else risks.push("近3个月未跑赢基准。");
  if (turnover >= 50_000_000) { score += 15; reasons.push("成交活跃，流动性较好。") } else if (turnover >= 10_000_000) { score += 10; reasons.push("成交额达到基础流动性要求。") } else risks.push("成交额偏低。");
  if (spread > 0 && spread <= 0.12) { score += 5; reasons.push("买卖价差较小。") } else if (spread > 0.3) risks.push("买卖价差偏大。");
  if (size >= 20) { score += 13; reasons.push("基金规模较大。") } else if (size >= 5) score += 8; else risks.push("基金规模数据偏低或缺失。");
  if (price * 100 <= trialCapital) { score += 15; reasons.push(`一手约${(price * 100).toFixed(0)}元，适配试验仓。`) } else risks.push(`一手约${(price * 100).toFixed(0)}元，超过当前试验仓预算。`);
  if (price <= ma20 * 1.08) score += 12; else risks.push("价格偏离20日线较多，存在追高风险。");
  if (/ETF/i.test(`${item.type || ""}${item.name || ""}`)) score += 10;
  const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : "D";
  return { ...item, totalScore: score, grade, status: grade === "A" ? "重点研究" : grade === "B" ? "普通观察" : "暂不关注", scoreReasons: reasons, riskFlags: risks };
}

function codesFrom(input) {
  if (Array.isArray(input)) return input.map((item) => text(item, 20)).filter(Boolean);
  return [...String(input || "").matchAll(/(?<!\d)(\d{6})(?!\d)/g)].map((match) => match[1]);
}

function findCandidate(state, code) {
  const watchlist = Array.isArray(state.watchlist) ? state.watchlist : [];
  return watchlist.find((item) => text(item.code, 20) === text(code, 20));
}

function createTools(state) {
  const scored = () => (state.watchlist || []).map((item) => scoreCandidate(item, num(state.settings?.trialCapital, 200)))
    .sort((a, b) => num(b.totalScore) - num(a.totalScore));
  return {
    get_etf_market(args = {}) {
      const codes = codesFrom(args.codes || args.code);
      const rows = (state.watchlist || []).filter((item) => !codes.length || codes.includes(text(item.code, 20))).map((item) => ({
        code: item.code, name: item.name, price: num(item.price || item.close), ma20: num(item.ma20), ma60: num(item.ma60),
        ma20Slope: num(item.ma20Slope), return1mPct: num(item.return1mPct), return3mPct: num(item.return3mPct),
        benchmarkReturn1mPct: num(item.benchmarkReturn1mPct), benchmarkReturn3mPct: num(item.benchmarkReturn3mPct),
        turnoverYuan: num(item.turnoverYuan), bidAskSpreadPct: num(item.bidAskSpreadPct), updatedAt: item.updatedAt || item.date || null,
        priceCrossCheck: item.priceCrossCheck || { status: "single_source", sourceCount: 1 }
      }));
      const conflicts = rows.filter((item) => item.priceCrossCheck?.status === "conflict");
      const verified = rows.filter((item) => item.priceCrossCheck?.status === "verified");
      return sourceEnvelope(rows, { source: "腾讯行情 + 东方财富历史行情", sourceLevel: "B", sourceCount: 2, verificationStatus: conflicts.length ? "conflict" : verified.length === rows.length && rows.length ? "verified" : "partial", updatedAt: newestTime(rows), warning: rows.length ? conflicts.map((item) => `${item.code} 两个行情源的日期或收盘价不一致，不能按高置信数据使用。`) : ["未找到对应ETF行情，请先更新候选池。"] });
    },
    get_etf_score(args = {}) {
      const codes = codesFrom(args.codes || args.code);
      const rows = scored().filter((item) => !codes.length || codes.includes(text(item.code, 20))).slice(0, codes.length || 5).map((item) => ({
        code: item.code, name: item.name, totalScore: num(item.totalScore), grade: item.grade, status: item.status,
        scoreReasons: item.scoreReasons || [], riskFlags: item.riskFlags || [], recommendation: item.recommendation || ""
      }));
      return sourceEnvelope(rows, { source: "小老板理财确定性评分引擎", sourceLevel: "A", updatedAt: newestTime(state.watchlist), warning: rows.length ? [] : ["候选池为空，无法评分。"] });
    },
    get_verified_news(args = {}) {
      const codes = codesFrom(args.codes || args.code);
      const query = text(args.query || "", 120).toLowerCase();
      const sourceLevels = Array.isArray(args.sourceLevels) ? args.sourceLevels.map((item) => text(item, 10).toUpperCase()) : [];
      const limit = Math.min(20, Math.max(1, num(args.limit, 8)));
      const rows = [...(state.newsEvents || []), ...(state.financialEvents || [])]
        .filter((item) => !codes.length || codes.some((code) => JSON.stringify(item).includes(code)))
        .filter((item) => !query || JSON.stringify(item).toLowerCase().includes(query))
        .filter((item) => !sourceLevels.length || sourceLevels.includes(text(item.sourceLevel || item.grade || "B", 10).toUpperCase()))
        .sort((a, b) => String(b.publishedAt || b.date || b.time || "").localeCompare(String(a.publishedAt || a.date || a.time || "")))
        .slice(0, limit).map((item) => ({ title: item.title || item.name || item.event || "未命名事件", summary: item.summary || item.description || item.notes || "", source: item.source || item.sourceName || "", sourceLevel: item.sourceLevel || item.grade || "B", url: item.url || item.link || "", time: item.publishedAt || item.date || item.time || null }));
      return sourceEnvelope(rows, { source: "已验证新闻与财报事件库", sourceLevel: "A/B", updatedAt: newestTime(rows), warning: rows.length ? [] : ["没有匹配的已验证事件；不能据此判断近期事件影响。"] });
    },
    get_fund_nav(args = {}) {
      const codes = codesFrom(args.codes || args.code);
      const rows = (state.efundsEtfs || []).filter((item) => !codes.length || codes.includes(text(item.code || item.fundCode, 20))).map((item) => ({ code: item.code || item.fundCode, name: item.name || item.fundName, nav: num(item.nav || item.latestNav), date: item.navDate || item.date || item.updatedAt || null, crossChecked: Boolean(item.crossChecked || item.officialChecked) }));
      return sourceEnvelope(rows, { source: "基金净值与官网核对库", sourceLevel: "A", updatedAt: newestTime(rows), warning: rows.length ? [] : ["没有匹配的基金净值记录。"] });
    },
    get_portfolio() {
      const rows = (state.portfolio || []).map((item) => ({ code: item.code, name: item.name, quantity: num(item.quantity), cost: num(item.cost), current: num(item.current), pnlPct: num(item.cost) > 0 ? (num(item.current) / num(item.cost) - 1) * 100 : 0, notes: item.notes || "" }));
      return sourceEnvelope(rows, { source: "本地真实持仓记录", sourceLevel: "A", updatedAt: newestTime(state.portfolio), warning: rows.length ? [] : ["当前没有持仓记录。"] });
    },
    get_portfolio_exposure(args = {}) {
      const code = codesFrom(args.codes || args.code)[0] || "";
      const exposure = buildPortfolioExposure(state, code);
      const data = {
        totalValue: exposure.totalValue,
        coverage: exposure.coverage,
        selected: exposure.selected ? {
          code: exposure.selected.code, name: exposure.selected.name, reportDate: exposure.selected.asOfDate,
          knownStockPct: exposure.selected.knownStockPct, holdings: exposure.selected.holdings?.slice(0, 10),
          confidence: exposure.selected.confidence, method: exposure.selected.disclosureLabel, errors: exposure.selected.errors || []
        } : null,
        aggregateTopStocks: exposure.stocks.slice(0, 12),
        sectors: exposure.sectors.slice(0, 8),
        markets: exposure.markets,
        warnings: exposure.warnings
      };
      return sourceEnvelope([data], { source: "基金季度报告持仓穿透 + 本地持仓市值", sourceLevel: "B", updatedAt: exposure.updatedAt, warning: exposure.updatedAt ? exposure.warnings : ["尚未同步基金持仓穿透数据。"] });
    },
    get_signal_history(args = {}) {
      const codes = codesFrom(args.codes || args.code);
      const limit = Math.min(30, Math.max(1, num(args.limit, 10)));
      const rows = (state.signalHistory || []).filter((item) => !codes.length || codes.some((code) => JSON.stringify(item).includes(code))).slice(0, limit).map((item) => ({ id: item.id, date: item.date || item.time, status: item.status, recommendation: item.recommendation, execution: item.execution || null, validation: item.validation || item.review || null, candidates: item.candidates || item.watchlist || [] }));
      return sourceEnvelope(rows, { source: "正式信号与5/20/60日验证库", sourceLevel: "A", updatedAt: newestTime(rows), warning: rows.length ? [] : ["没有匹配的历史信号，不能进行事后有效性判断。"] });
    },
    compare_etfs(args = {}) {
      const codes = codesFrom(args.codes || args.code);
      const rows = scored().filter((item) => codes.includes(text(item.code, 20))).map((item) => ({ code: item.code, name: item.name, score: num(item.totalScore), grade: item.grade, status: item.status, price: num(item.price || item.close), relative1mPct: num(item.return1mPct) - num(item.benchmarkReturn1mPct), relative3mPct: num(item.return3mPct) - num(item.benchmarkReturn3mPct), turnoverYuan: num(item.turnoverYuan), reasons: item.scoreReasons || [], risks: item.riskFlags || [] }));
      return sourceEnvelope(rows, { source: "小老板理财ETF比较引擎", sourceLevel: "A", updatedAt: newestTime(state.watchlist), warning: rows.length >= 2 ? [] : ["比较至少需要两只候选池中的ETF。"] });
    }
  };
}

const toolDefinitions = [
  ["refresh_external_data", "仅在数据缺失或过期时主动刷新外部行情、官方产品、新闻或财报。返回每个来源的状态；同一研究最多调用一次。", { query: { type: "string" }, reason: { type: "string" } }],
  ["get_etf_market", "读取ETF价格、均线、相对基准收益和流动性数据。", { codes: { type: "array", items: { type: "string" } } }],
  ["get_etf_score", "读取确定性评分、正向理由、反向风险和观察等级。", { codes: { type: "array", items: { type: "string" } } }],
  ["get_verified_news", "按ETF代码、关键词和来源等级读取已验证新闻与财报事件。若精确查询为空，可换关键词或放宽代码后再调用。", { codes: { type: "array", items: { type: "string" } }, query: { type: "string" }, sourceLevels: { type: "array", items: { type: "string" } }, limit: { type: "number" } }],
  ["get_fund_nav", "读取基金净值和官网交叉核对状态。", { codes: { type: "array", items: { type: "string" } } }],
  ["get_portfolio", "读取用户本地持仓；只读，不执行交易。", {}],
  ["get_portfolio_exposure", "读取基金背后的已披露股票、个人折算金额、重复股票、行业和市场分布。季度披露不是实时仓位。", { code: { type: "string" }, codes: { type: "array", items: { type: "string" } } }],
  ["get_signal_history", "读取历史信号、执行记录和后续验证。", { codes: { type: "array", items: { type: "string" } }, limit: { type: "number" } }],
  ["compare_etfs", "用确定性指标比较两只或多只ETF。", { codes: { type: "array", items: { type: "string" } } }]
].map(([name, description, properties]) => ({ type: "function", name, description, parameters: { type: "object", properties, additionalProperties: false } }));

function planQuestion(question, state) {
  const codes = codesFrom(question);
  const compare = /比较|对比|区别|哪只|二选一|vs/i.test(question) || codes.length >= 2;
  const review = /复盘|历史|信号|成功|失败|回看|验证/.test(question);
  const portfolio = /持仓|我有|仓位/.test(question);
  const exposure = /穿透|成分股|股票占比|重仓|行业分布|重复持仓|底层股票/.test(question);
  const tasks = [];
  if (compare) tasks.push({ name: "建立对比样本", tool: "compare_etfs" });
  else tasks.push({ name: "读取候选评分", tool: "get_etf_score" });
  tasks.push({ name: "核验行情与时效", tool: "get_etf_market" });
  if (/新闻|事件|消息|财报|为什么|影响/.test(question)) tasks.push({ name: "检查已验证事件", tool: "get_verified_news" });
  if (review) tasks.push({ name: "回看历史信号", tool: "get_signal_history" });
  if (exposure) tasks.push({ name: "穿透基金底层资产", tool: "get_portfolio_exposure" });
  else if (portfolio) tasks.push({ name: "核对当前持仓", tool: "get_portfolio" });
  return { intent: review ? "signal_review" : compare ? "etf_compare" : "etf_research", codes, tasks: tasks.slice(0, 5), target: codes.length ? codes.join(" / ") : "候选池优先标的", generatedFrom: "本地意图规划器" };
}

function questionRequirements(question) {
  return {
    comparison: /比较|对比|区别|哪只|二选一|vs/i.test(question) || codesFrom(question).length >= 2,
    news: /新闻|事件|消息|公告|政策|财报|为什么|影响|近期|今天/.test(question),
    history: /复盘|历史|信号|成功|失败|回看|验证|准不准|赚钱/.test(question),
    portfolio: /持仓|我有|仓位|账户|穿透|成分股|股票占比|重仓|行业分布|重复持仓|底层股票/.test(question),
    nav: /净值|场外|联接基金/.test(question)
  };
}

function parseTime(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function needsExternalRefresh(question, state, now = Date.now()) {
  const requirements = questionRequirements(question);
  const marketTime = parseTime(state.marketUpdates?.[0]?.time);
  const newsTime = parseTime(state.newsSync?.time);
  const financialTime = parseTime(state.financialEventSync?.time);
  if (!Array.isArray(state.watchlist) || !state.watchlist.length || !marketTime || now - marketTime > 4 * 60 * 60 * 1000) return true;
  if (requirements.news && (!Array.isArray(state.newsEvents) || !state.newsEvents.length || !newsTime || now - newsTime > 12 * 60 * 60 * 1000)) return true;
  if (/财报|年报|季报|SEC|美股/i.test(question) && (!Array.isArray(state.financialEvents) || !state.financialEvents.length || !financialTime || now - financialTime > 24 * 60 * 60 * 1000)) return true;
  return false;
}

function toolSignature(name, args) {
  const normalized = { ...args };
  if (Array.isArray(normalized.codes)) normalized.codes = [...new Set(normalized.codes.map(String))].sort();
  return `${name}:${JSON.stringify(normalized)}`;
}

function observationFor(result) {
  const output = result.output || {};
  const count = Array.isArray(output.data) ? output.data.length : 0;
  if (output.status === "error") return { status: "error", label: "工具失败", detail: (output.warning || ["工具执行失败"])[0] };
  if (output.verification_status === "conflict") return { status: "conflict", label: "发现来源冲突", detail: (output.warning || ["关键来源存在冲突"])[0] };
  if (!count && output.warning?.length) return { status: "insufficient", label: "证据不足", detail: output.warning[0] };
  if (output.warning?.length) return { status: "partial", label: "获得部分证据", detail: `${count} 条结果；${output.warning[0]}` };
  return { status: "success", label: "获得可用证据", detail: `${count} 条结果；核验状态 ${output.verification_status || "single_source"}` };
}

function stopLabel(code) {
  return ({ complete: "证据达到停止条件", source_conflict: "来源冲突，停止高置信判断", insufficient: "关键数据不足", tool_limit: "达到工具调用上限", turn_limit: "达到规划轮次上限", model_complete: "模型确认研究完成" })[code] || "研究结束";
}

function makeTrace(type, label, detail, extra = {}) {
  return { id: `trace-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`, type, label, detail, time: new Date().toISOString(), ...extra };
}

function buildExternalTool(runtimeState) {
  return async (args = {}) => {
    if (runtimeState.refreshUsed) return sourceEnvelope([], { status: "error", source: "外部信息刷新器", warning: ["同一研究已执行过外部刷新，禁止重复刷新。"] });
    if (typeof runtimeState.externalRefresh !== "function") return sourceEnvelope([], { status: "error", source: "外部信息刷新器", warning: ["当前运行环境没有配置外部刷新能力。"] });
    runtimeState.refreshUsed = true;
    const payload = await runtimeState.externalRefresh({ query: text(args.query || runtimeState.question, 1200), reason: text(args.reason || "补齐研究数据", 300) });
    runtimeState.refresh = payload?.refresh || payload || null;
    if (payload?.state) runtimeState.state = payload.state;
    const rows = (runtimeState.refresh?.steps || []).map((step) => ({ id: step.id, source: step.source, level: step.level, status: step.status, count: step.count, updatedAt: step.updatedAt, warning: step.warning || "" }));
    return sourceEnvelope(rows, {
      status: runtimeState.refresh?.status === "failed" ? "error" : "success",
      source: "主动外部信息刷新器",
      sourceLevel: "A/B",
      verificationStatus: runtimeState.refresh?.status === "verified" ? "verified" : runtimeState.refresh?.status === "fresh" ? "fresh" : "partial",
      sourceCount: new Set(rows.map((row) => row.source).filter(Boolean)).size || 1,
      updatedAt: runtimeState.refresh?.refreshedAt || new Date().toISOString(),
      warning: runtimeState.refresh?.warning || []
    });
  };
}

function toolbox(runtimeState) {
  return { refresh_external_data: buildExternalTool(runtimeState), ...createTools(runtimeState.state) };
}

async function executeTool(name, args, runtimeState, trace) {
  const signature = toolSignature(name, args);
  const cached = runtimeState.cache.get(signature);
  if (cached) {
    trace.push(makeTrace("reuse", `复用 ${name} 的既有结果`, "参数与之前完全相同，不重复消耗工具调用。", { tool: name, args }));
    return { ...cached, reused: true };
  }
  let lastError = null;
  const retryLimit = name === "refresh_external_data" ? 0 : TOOL_RETRY_LIMIT;
  for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
    const started = Date.now();
    if (attempt) trace.push(makeTrace("retry", `重试工具 ${name}`, `第 ${attempt + 1} 次执行。`, { tool: name, args, attempt: attempt + 1 }));
    try {
      const selected = toolbox(runtimeState)[name];
      const output = selected ? await selected(args) : sourceEnvelope([], { status: "error", warning: ["模型请求了未授权工具。"] });
      const result = { tool: name, task: toolDefinitions.find((item) => item.name === name)?.description || name, args, output, startedAt: new Date(started).toISOString(), durationMs: Date.now() - started, attempt: attempt + 1 };
      if (output.status !== "error" || attempt === retryLimit) {
        runtimeState.cache.set(signature, result);
        return result;
      }
      lastError = new Error((output.warning || ["工具返回错误"])[0]);
    } catch (error) {
      lastError = error;
      if (attempt === retryLimit) {
        const result = { tool: name, task: name, args, output: sourceEnvelope([], { status: "error", warning: [text(error.message, 500)] }), startedAt: new Date(started).toISOString(), durationMs: Date.now() - started, attempt: attempt + 1 };
        runtimeState.cache.set(signature, result);
        return result;
      }
    }
  }
  throw lastError;
}

function classifyVerdict(results) {
  const scoreResult = results.find((item) => item.tool === "get_etf_score" || item.tool === "compare_etfs");
  const rows = scoreResult?.output?.data || [];
  const top = [...rows].sort((a, b) => num(b.totalScore ?? b.score) - num(a.totalScore ?? a.score))[0];
  if (!top) return { level: "数据不足", tone: "insufficient", score: null };
  const score = num(top.totalScore ?? top.score);
  return { level: score >= 85 ? "重点研究" : score >= 70 ? "普通观察" : score >= 55 ? "暂不关注" : "数据不足", tone: score >= 85 ? "focus" : score >= 70 ? "watch" : score >= 55 ? "avoid" : "insufficient", score };
}

function reliabilitySummary(results, refresh, verdict) {
  const outputs = results.map((item) => item.output || {});
  const conflicts = outputs.filter((item) => item.verification_status === "conflict").length;
  const verified = outputs.filter((item) => item.verification_status === "verified").length;
  const warnings = outputs.flatMap((item) => item.warning || []).length + (refresh?.warning?.length || 0);
  if (verdict.tone === "insufficient" || conflicts || refresh?.status === "failed") {
    return { level: "低", status: conflicts ? "来源冲突" : "数据不足", tone: "low", verifiedSources: verified, conflicts, warnings };
  }
  if (refresh?.status === "partial" || warnings || !verified) {
    return { level: "中", status: refresh?.status === "partial" ? "部分核验" : "单源/待复核", tone: "medium", verifiedSources: verified, conflicts, warnings };
  }
  return { level: "中高", status: "多源核验", tone: "high", verifiedSources: verified, conflicts, warnings };
}

function buildDossier(question, plan, results, narrative, mode, context = {}) {
  const verdict = classifyVerdict(results);
  const scoring = results.find((item) => ["get_etf_score", "compare_etfs"].includes(item.tool));
  const rows = scoring?.output?.data || [];
  const top = [...rows].sort((a, b) => num(b.totalScore ?? b.score) - num(a.totalScore ?? a.score))[0];
  const evidence = [];
  const risks = [];
  const relevantRows = plan.intent === "etf_compare" ? rows.slice(0, 3) : rows.slice(0, 1);
  relevantRows.forEach((row) => {
    (row.scoreReasons || row.reasons || []).slice(0, 3).forEach((detail) => evidence.push({ title: `${row.code} ${row.name || ""}`.trim(), detail, kind: "rule", source: scoring.output.source }));
    (row.riskFlags || row.risks || []).slice(0, 3).forEach((detail) => risks.push({ title: `${row.code} ${row.name || ""}`.trim(), detail }));
  });
  results.forEach((item) => (item.output.warning || []).forEach((detail) => risks.push({ title: "数据边界", detail })));
  const refresh = context.refresh || null;
  const refreshSources = (refresh?.steps || []).map((step) => ({ tool: `external:${step.id}`, name: step.source, level: step.level, url: step.sourceUrl || "", updatedAt: step.updatedAt || refresh.refreshedAt, status: step.status, verificationStatus: step.status === "verified" ? "verified" : "failed", sourceCount: 1 }));
  const sources = [...refreshSources, ...results.map((item) => ({ tool: item.tool, name: item.output.source, level: item.output.source_level, url: item.output.source_url || "", updatedAt: item.output.updated_at, status: item.output.status, verificationStatus: item.output.verification_status, sourceCount: item.output.source_count }))];
  const reliability = reliabilitySummary(results, refresh, verdict);
  const defaultNarrative = top
    ? `${top.code} ${top.name || ""}当前为${verdict.level}，确定性评分${verdict.score ?? "-"}分。该结论用于决定是否继续研究，不等于买入建议。`
    : "当前数据不足，无法形成可靠判断。请先补齐候选池行情或明确ETF代码。";
  return {
    id: `research-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    createdAt: new Date().toISOString(), question, mode, plan, verdict, focusCode: String(top?.code || plan.codes?.[0] || ""),
    narrative: text(narrative || defaultNarrative, 5000), evidence: evidence.slice(0, 8), risks: risks.slice(0, 8), sources, reliability, refresh,
    trace: Array.isArray(context.trace) ? context.trace : [],
    loop: context.loop || { adaptive: false, iterations: results.length, toolCalls: results.length, retries: 0, stopReason: { code: "complete", label: stopLabel("complete") } },
    disclosure: "外部事实按白名单主动刷新并保留来源；关键行情尝试双源核验；分数由确定性规则计算；模型仅负责规划与解释。本系统不执行真实交易，研究可靠性不等于未来收益确定性。"
  };
}

function chooseLocalAction(question, runtimeState, results, focusCodes) {
  const requirements = questionRequirements(question);
  const used = new Set(results.map((item) => item.tool));
  if (typeof runtimeState.externalRefresh === "function" && !runtimeState.refreshUsed && needsExternalRefresh(question, runtimeState.state, runtimeState.now())) {
    return { tool: "refresh_external_data", args: { query: question, reason: "研究所需数据缺失或超过时效阈值" }, reason: "先确保行情和事件数据处于可用时效内。" };
  }
  const primary = requirements.comparison ? "compare_etfs" : "get_etf_score";
  if (!used.has(primary)) return { tool: primary, args: { codes: focusCodes }, reason: requirements.comparison ? "问题要求比较多个标的，先建立统一比较基线。" : "先确定最相关标的及确定性评分。" };
  const primaryResult = results.find((item) => item.tool === primary);
  if (!primaryResult?.output?.data?.length) return { stop: "insufficient", detail: "评分或比较工具没有返回可用标的。" };
  if (!used.has("get_etf_market")) return { tool: "get_etf_market", args: { codes: focusCodes }, reason: "评分之后必须核验价格、均线、时效和双源一致性。" };
  const market = results.find((item) => item.tool === "get_etf_market")?.output;
  if (market?.verification_status === "conflict") return { stop: "source_conflict", detail: (market.warning || ["关键行情来源存在冲突。"])[0] };
  if (market?.status === "error" || !market?.data?.length) return { stop: "insufficient", detail: (market?.warning || ["没有可用行情。"])[0] };
  const newsResults = results.filter((item) => item.tool === "get_verified_news");
  if (requirements.news && !newsResults.length) return { tool: "get_verified_news", args: { codes: focusCodes, sourceLevels: ["A", "B"], limit: 10 }, reason: "问题涉及原因或近期影响，需要补充已验证事件。" };
  if (requirements.news && newsResults.length === 1 && !newsResults[0].output?.data?.length && focusCodes.length) return { tool: "get_verified_news", args: { codes: [], sourceLevels: ["A", "B"], limit: 10 }, reason: "精确代码没有匹配事件，放宽代码条件检查同主题权威事件，避免直接把空结果当作没有影响。" };
  if (requirements.history && !used.has("get_signal_history")) return { tool: "get_signal_history", args: { codes: focusCodes, limit: 10 }, reason: "问题涉及历史有效性，需要读取事后验证记录。" };
  if (requirements.portfolio && !used.has("get_portfolio")) return { tool: "get_portfolio", args: {}, reason: "问题涉及账户状态，需要核对真实持仓。" };
  if (requirements.nav && !used.has("get_fund_nav")) return { tool: "get_fund_nav", args: { codes: focusCodes }, reason: "问题涉及净值，需要读取官网核对记录。" };
  return { stop: "complete", detail: "核心评分、行情以及问题要求的附加证据均已检查。" };
}

async function runLocalAgent(question, state, context = {}) {
  const seedPlan = planQuestion(question, state);
  const results = [];
  const trace = [makeTrace("plan", "建立初始研究目标", `识别为${seedPlan.intent}；目标 ${seedPlan.target}。`)];
  const runtimeState = { question, state, refresh: context.refresh || null, refreshUsed: Boolean(context.refresh?.attempted), externalRefresh: context.externalRefresh, cache: new Map(), now: context.now || (() => Date.now()) };
  let focusCodes = [...seedPlan.codes];
  let stopReason = null;
  let iterations = 0;
  while (iterations < TURN_LIMIT && results.length < TOOL_LIMIT) {
    iterations += 1;
    const action = chooseLocalAction(question, runtimeState, results, focusCodes);
    if (action.stop) { stopReason = { code: action.stop, label: stopLabel(action.stop), detail: action.detail }; break }
    trace.push(makeTrace("replan", `选择工具 ${action.tool}`, action.reason, { tool: action.tool, args: action.args, iteration: iterations }));
    const result = await executeTool(action.tool, action.args, runtimeState, trace);
    results.push(result);
    trace.push(makeTrace("tool", `完成 ${action.tool}`, `第 ${result.attempt} 次尝试`, { tool: action.tool, args: action.args, durationMs: result.durationMs, attempt: result.attempt }));
    const observation = observationFor(result);
    trace.push(makeTrace("observe", observation.label, observation.detail, { tool: action.tool, status: observation.status }));
    if (!focusCodes.length && ["get_etf_score", "compare_etfs"].includes(action.tool) && result.output.data?.[0]?.code) focusCodes = [String(result.output.data[0].code)];
  }
  if (!stopReason) stopReason = results.length >= TOOL_LIMIT
    ? { code: "tool_limit", label: stopLabel("tool_limit"), detail: `最多允许 ${TOOL_LIMIT} 次工具调用。` }
    : { code: "turn_limit", label: stopLabel("turn_limit"), detail: `最多允许 ${TURN_LIMIT} 轮规划。` };
  trace.push(makeTrace("stop", stopReason.label, stopReason.detail, { code: stopReason.code }));
  const actualTasks = results.map((item) => ({ name: item.task, tool: item.tool, status: item.output.status, observation: observationFor(item).label }));
  const plan = { ...seedPlan, codes: focusCodes.length ? focusCodes : seedPlan.codes, tasks: actualTasks, generatedFrom: "本地自适应研究循环" };
  return buildDossier(question, plan, results, "", "local", {
    ...context,
    refresh: runtimeState.refresh,
    trace,
    loop: { adaptive: true, engine: "local", iterations, toolCalls: results.length, retries: results.reduce((sum, item) => sum + Math.max(0, item.attempt - 1), 0), stopReason }
  });
}

function responseText(payload) {
  if (payload.output_text) return payload.output_text;
  return (payload.output || []).flatMap((item) => item.content || []).filter((item) => item.type === "output_text").map((item) => item.text).join("\n");
}

async function callResponses(body, apiKey, timeoutMs = 45_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${DEFAULT_BASE_URL}/responses`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body), signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error?.message || `模型请求失败：HTTP ${response.status}`);
      error.status = response.status;
      error.retryable = response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") error.retryable = true;
    throw error;
  } finally { clearTimeout(timer) }
}

async function callResponsesWithRetry(body, apiKey, trace, options = {}) {
  const caller = options.callResponses || ((requestBody) => callResponses(requestBody, apiKey, options.timeoutMs));
  let lastError = null;
  for (let attempt = 0; attempt <= API_RETRY_LIMIT; attempt += 1) {
    try {
      return await caller(body);
    } catch (error) {
      lastError = error;
      const retryable = error?.retryable !== false && (!error?.status || [408, 409, 429].includes(error.status) || error.status >= 500);
      trace.push(makeTrace(attempt < API_RETRY_LIMIT && retryable ? "retry" : "error", attempt < API_RETRY_LIMIT && retryable ? "重试模型请求" : "模型请求失败", text(error.message, 500), { attempt: attempt + 1, status: error.status || null }));
      if (!retryable || attempt === API_RETRY_LIMIT) throw error;
      await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs ?? 200 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function runModelAgent(question, state, context = {}, options = {}) {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return runLocalAgent(question, state, context);
  const seedPlan = planQuestion(question, state);
  const results = [];
  const trace = [makeTrace("plan", "模型接管研究规划", `初始意图 ${seedPlan.intent}；允许根据工具结果动态修改路径。`)];
  const runtimeState = { question, state, refresh: context.refresh || null, refreshUsed: Boolean(context.refresh?.attempted), externalRefresh: context.externalRefresh, cache: new Map(), now: context.now || (() => Date.now()) };
  let input = [{ role: "user", content: question }];
  let narrative = "";
  let stopReason = null;
  let forceFinalize = false;
  let iterations = 0;
  for (let turn = 0; turn < TURN_LIMIT; turn += 1) {
    iterations = turn + 1;
    if (results.length >= TOOL_LIMIT && !forceFinalize) {
      forceFinalize = true;
      stopReason = { code: "tool_limit", label: stopLabel("tool_limit"), detail: `达到 ${TOOL_LIMIT} 次工具调用上限，要求模型使用已有证据收束。` };
    }
    trace.push(makeTrace("reason", turn ? "根据观察重新规划" : "分析问题并选择首个工具", turn ? "模型已收到上一轮工具输出，可继续检索、换工具或停止。" : "先判断需要哪些事实，再选择最小充分工具集。", { iteration: iterations }));
    const payload = await callResponsesWithRetry({
      model: DEFAULT_MODEL,
      instructions: `<role>你是小老板理财的ETF投研Agent。</role>
<agent_loop>每一轮都执行：检查目标与已有证据 → 选择一个最有价值的工具或并行的无依赖工具 → 观察结果 → 判断是否需要换参数、换来源、补充工具或停止。不要照搬固定步骤。禁止重复相同工具和相同参数；数据新鲜且充分时不要刷新。外部刷新最多一次。关键行情来源冲突时停止高置信判断并明确降级。工具失败时可调整参数重试；仍失败则保留失败证据并继续可行路径。最多 ${TOOL_LIMIT} 次实际工具调用、${TURN_LIMIT} 轮。满足问题所需事实、反向风险和来源时立即停止。</agent_loop>
<boundaries>只使用提供的只读工具。关键数字不得自行编造或脱离工具结果计算；不得承诺收益，不得代替用户交易。最终中文结论必须区分事实、确定性规则和模型推断；数据不足或冲突时必须明确说明。</boundaries>`,
      input,
      tools: toolDefinitions,
      tool_choice: forceFinalize || results.length >= TOOL_LIMIT ? "none" : "auto",
      max_output_tokens: 1400
    }, apiKey, trace, options);
    const calls = (payload.output || []).filter((item) => item.type === "function_call");
    if (!calls.length) {
      narrative = responseText(payload);
      stopReason ||= { code: forceFinalize ? "source_conflict" : "model_complete", label: stopLabel(forceFinalize ? "source_conflict" : "model_complete"), detail: forceFinalize ? "关键行情存在来源冲突，模型已按低置信边界收束。" : "模型判断已有证据足以回答问题。" };
      break;
    }
    input = [...input, ...(payload.output || [])];
    trace.push(makeTrace("replan", "模型追加工具调用", `本轮选择 ${calls.map((call) => call.name).join("、")}。`, { iteration: iterations, tools: calls.map((call) => call.name) }));
    for (const call of calls) {
      let args = {};
      try { args = JSON.parse(call.arguments || "{}") } catch { args = {} }
      if (results.length >= TOOL_LIMIT) {
        const output = sourceEnvelope([], { status: "error", warning: [`已达到 ${TOOL_LIMIT} 次工具调用上限，请使用已有证据形成结论。`] });
        input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(output) });
        stopReason = { code: "tool_limit", label: stopLabel("tool_limit"), detail: `达到 ${TOOL_LIMIT} 次工具调用上限。` };
        forceFinalize = true;
        continue;
      }
      const result = await executeTool(call.name, args, runtimeState, trace);
      if (!result.reused) results.push(result);
      trace.push(makeTrace("tool", `完成 ${call.name}`, `${result.reused ? "复用缓存" : "实际执行"} · 状态 ${result.output.status}`, { tool: call.name, args, durationMs: result.durationMs, attempt: result.attempt, reused: Boolean(result.reused) }));
      const observation = observationFor(result);
      trace.push(makeTrace("observe", observation.label, observation.detail, { tool: call.name, status: observation.status }));
      input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result.output) });
      if (result.output.verification_status === "conflict" && call.name === "get_etf_market") {
        stopReason = { code: "source_conflict", label: stopLabel("source_conflict"), detail: (result.output.warning || ["关键行情来源冲突。"])[0] };
        forceFinalize = true;
      }
    }
  }
  if (!results.length) {
    const fallback = await runLocalAgent(question, runtimeState.state, { ...context, refresh: runtimeState.refresh, externalRefresh: runtimeState.externalRefresh, now: runtimeState.now });
    fallback.trace.unshift(makeTrace("fallback", "模型未调用研究工具，切换本地自适应循环", "保留模型失败边界，使用确定性工具路径完成研究。"));
    fallback.loop.fallbackFromModel = true;
    return fallback;
  }
  if (!stopReason) stopReason = { code: "turn_limit", label: stopLabel("turn_limit"), detail: `达到 ${TURN_LIMIT} 轮规划上限。` };
  trace.push(makeTrace("stop", stopReason.label, stopReason.detail, { code: stopReason.code }));
  const focusCodes = seedPlan.codes.length ? seedPlan.codes : codesFrom(results.flatMap((item) => item.output?.data || []).map((item) => item.code).filter(Boolean)).slice(0, 3);
  const plan = { ...seedPlan, codes: focusCodes, tasks: results.map((item) => ({ name: item.task, tool: item.tool, status: item.output.status, observation: observationFor(item).label })), generatedFrom: `模型自主研究循环 · ${DEFAULT_MODEL}` };
  return buildDossier(question, plan, results, narrative, "model", {
    ...context,
    refresh: runtimeState.refresh,
    trace,
    loop: { adaptive: true, engine: "model", iterations, toolCalls: results.length, retries: trace.filter((item) => item.type === "retry").length, stopReason }
  });
}

function agentStatus() {
  return { configured: Boolean(process.env.OPENAI_API_KEY), mode: process.env.OPENAI_API_KEY ? "model" : "local", model: process.env.OPENAI_API_KEY ? DEFAULT_MODEL : "本地自适应研究循环", baseUrl: process.env.OPENAI_API_KEY ? DEFAULT_BASE_URL : null, toolCount: toolDefinitions.length, maxToolCalls: TOOL_LIMIT, maxTurns: TURN_LIMIT, adaptiveLoop: true, externalRefreshTool: true, retries: { tool: TOOL_RETRY_LIMIT, api: API_RETRY_LIMIT } };
}

module.exports = { runAgent: runModelAgent, runModelAgent, runLocalAgent, agentStatus, createTools, toolDefinitions, scoreCandidate, needsExternalRefresh, observationFor };
