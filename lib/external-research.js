const path = require("path");
const { spawn } = require("child_process");

const HOUR = 60 * 60 * 1000;

function asTime(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function isStale(value, maxAgeMs, now = Date.now()) {
  const time = asTime(value);
  return !time || now - time > maxAgeMs;
}

function questionNeedsNews(question) {
  return /新闻|事件|消息|公告|政策|财报|影响|为什么|近期|今天/.test(String(question || ""));
}

function questionNeedsFinancials(question) {
  return /美股|财报|年报|季报|BlackRock|贝莱德|摩根|高盛|伯克希尔|SEC/i.test(String(question || ""));
}

function buildRefreshPlan(question, state, now = Date.now()) {
  const plan = [];
  if (!Array.isArray(state.sourceWhitelist) || !state.sourceWhitelist.length) {
    plan.push({ id: "source_policy", label: "加载权威来源白名单", script: "sync_source_whitelist.py", args: [], source: "本地来源治理规则", level: "A" });
  }
  if (!Array.isArray(state.efundsEtfs) || !state.efundsEtfs.length || isStale(state.efundsSync?.time, 7 * 24 * HOUR, now)) {
    plan.push({ id: "official_products", label: "同步基金公司官方产品", script: "sync_efunds_etfs.py", args: [], source: "易方达官网", level: "A" });
  }
  if (!Array.isArray(state.watchlist) || !state.watchlist.length || isStale(state.marketUpdates?.[0]?.time, 4 * HOUR, now)) {
    plan.push({ id: "market", label: "刷新ETF行情与历史指标", script: "update_market_data.py", args: ["12"], source: "腾讯行情 / 东方财富历史行情", level: "B" });
  }
  if (questionNeedsNews(question) && (!Array.isArray(state.newsEvents) || !state.newsEvents.length || isStale(state.newsSync?.time, 12 * HOUR, now))) {
    plan.push({ id: "official_news", label: "抓取基金公司官方事件", script: "sync_efunds_news.py", args: ["12"], source: "易方达官网指数专区", level: "A" });
  }
  if (questionNeedsFinancials(question) && (!Array.isArray(state.financialEvents) || !state.financialEvents.length || isStale(state.financialEventSync?.time, 24 * HOUR, now))) {
    plan.push({ id: "financial_filings", label: "抓取海外财报原文", script: "sync_financial_events.py", args: [], source: "SEC EDGAR", level: "A" });
  }
  return plan;
}

function parseLastJson(stdout) {
  const lines = String(stdout || "").trim().split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]) } catch { /* try an earlier line */ }
  }
  return null;
}

function briefWarning(value) {
  const lines = String(value || "").replace(/#< CLIXML[\s\S]*/i, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return (lines.at(-1) || lines[0] || "外部数据刷新失败").slice(0, 500);
}

function runPythonScript({ python, root, env, step, timeoutMs = 75_000 }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const scriptPath = path.join(root, "scripts", step.script);
    const child = spawn(python, [scriptPath, ...step.args], { cwd: root, env, windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...step, durationMs: Date.now() - started, ...payload });
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({ status: "timeout", warning: `外部数据刷新超过 ${Math.round(timeoutMs / 1000)} 秒，已停止。` });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => finish({ status: "error", warning: briefWarning(error.message) }));
    child.on("close", (code) => {
      const payload = parseLastJson(stdout) || parseLastJson(stderr);
      if (code === 0 && payload?.ok !== false && payload?.count !== 0) {
        finish({ status: "verified", updatedAt: payload?.time || new Date().toISOString(), count: payload?.count ?? null, sourceUrl: payload?.sourceUrl || "", details: payload || null });
      } else if (code === 0 && payload?.ok !== false && payload?.count === 0) {
        finish({ status: "empty", updatedAt: payload?.time || new Date().toISOString(), count: 0, sourceUrl: payload?.sourceUrl || "", warning: "来源已访问，但没有获得可用于本次研究的数据。" });
      } else {
        finish({ status: "error", warning: briefWarning(payload?.error || stderr || stdout || `exit ${code}`) });
      }
    });
  });
}

async function refreshExternalResearch(question, state, options) {
  const plan = buildRefreshPlan(question, state, options.now?.() || Date.now());
  const steps = [];
  for (const step of plan) {
    steps.push(await runPythonScript({
      python: options.python,
      root: options.root,
      env: options.env,
      step,
      timeoutMs: options.timeoutMs
    }));
  }
  const failed = steps.filter((step) => step.status !== "verified");
  return {
    attempted: steps.length > 0,
    status: failed.length ? (failed.length === steps.length ? "failed" : "partial") : (steps.length ? "verified" : "fresh"),
    refreshedAt: new Date(options.now?.() || Date.now()).toISOString(),
    steps,
    warning: failed.map((step) => `${step.label}：${step.warning}`),
    policy: "官方来源优先；行情使用结构化数据源；刷新失败、过期或冲突时降级，不编造。"
  };
}

module.exports = { buildRefreshPlan, refreshExternalResearch, isStale, questionNeedsNews, questionNeedsFinancials, briefWarning };
