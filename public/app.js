const state = {
  settings: {},
  portfolio: [],
  watchlist: [],
  marketHistory: {},
  fundNavHistory: {},
  fundExposure: { items: {} },
  fundExposureUpdates: [],
  equityHistory: [],
  efundsEtfs: [],
  sourceWhitelist: [],
  sourceGradeRules: [],
  sourceBlacklistRules: [],
  sourceWhitelistSync: null,
  efundsSync: null,
  newsEvents: [],
  newsSync: null,
  financialEvents: [],
  financialEventSync: null,
  financialEventUpdates: [],
  fundNavSync: null,
  trades: [],
  executionLog: [],
  dailyStatus: [],
  signalHistory: [],
  signalValidation: null,
  signalValidationRuns: [],
  formalExperiment: null,
  formalExperimentEvents: [],
  goalAudit: null,
  goalAuditRuns: [],
  sampleGuard: null,
  sampleGuardRuns: [],
  latestEmailReminder: null,
  lastEmailReminder: null,
  emailReminderRuns: [],
  fundNavCrossCheck: null,
  fundNavCrossCheckRuns: [],
  weeklyReview: null,
  weeklyReviewRuns: [],
  actualPerformanceReport: null,
  actualPerformanceRuns: [],
  credibilityReport: null,
  credibilityRuns: [],
  latestNextActionReport: null,
  nextActionRuns: [],
  signalMaturitySchedule: null,
  signalMaturityScheduleRuns: [],
  reviewTodoReport: null,
  reviewTodoRuns: [],
  signalHistoryExport: null,
  signalHistoryExportRuns: [],
  signalIntegrityAudit: null,
  signalIntegrityKnownSignals: {},
  signalIntegrityRuns: [],
  stateBackup: null,
  stateBackupRuns: [],
  lastWeeklyReviewEmail: null,
  weeklyReviewEmailRuns: [],
  dailyExperimentRun: null,
  dailyExperimentRuns: [],
  simulatedTrading: {
    weeklyBudget: 500,
    totalContributed: 0,
    cash: 0,
    invested: 0,
    marketValue: 0,
    totalAssets: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    pnl: 0,
    pnlPct: 0,
    lastContributionWeek: "",
    lastPricedAt: "",
    positions: [],
    orders: [],
    runs: []
  },
  marketUpdates: []
};

const fallbackState = {
  settings: {
    email: "",
    totalCapital: 1000,
    trialCapital: 200,
    pauseLoss: 10,
    stopLoss: 20,
    closeReminderTime: "15:45",
    intradayRiskCheck: false,
    onlyOnStatusChange: false,
    formalSignalRecording: false
  },
  portfolio: [],
  watchlist: [
    {
      id: "demo-512880",
      code: "512880",
      name: "证券ETF国泰",
      type: "证券",
      price: 1.099,
      turnoverYuan: 2457657971,
      fundSizeYi: 0,
      bidAskSpreadPct: 0.1,
      close: 1.099,
      ma20: 1.1245,
      ma60: 1.0828,
      ma20Slope: -0.0004,
      return1mPct: -0.72,
      return3mPct: 3.97,
      benchmarkReturn1mPct: -4.2,
      benchmarkReturn3mPct: -1.69,
      totalScore: 78,
      grade: "B",
      status: "普通观察",
      recommendation: "继续观察，暂不买入。"
    }
  ],
  marketHistory: {},
  fundNavHistory: {},
  fundExposure: { items: {} },
  fundExposureUpdates: [],
  equityHistory: [],
  efundsEtfs: [],
  sourceWhitelist: [],
  sourceGradeRules: [],
  sourceBlacklistRules: [],
  sourceWhitelistSync: null,
  efundsSync: null,
  newsEvents: [],
  newsSync: null,
  financialEvents: [],
  financialEventSync: null,
  financialEventUpdates: [],
  fundNavSync: null,
  trades: [],
  executionLog: [],
  dailyStatus: [],
  signalHistory: [],
  signalValidation: null,
  signalValidationRuns: [],
  formalExperiment: null,
  formalExperimentEvents: [],
  goalAudit: null,
  goalAuditRuns: [],
  sampleGuard: null,
  sampleGuardRuns: [],
  latestEmailReminder: null,
  lastEmailReminder: null,
  emailReminderRuns: [],
  fundNavCrossCheck: null,
  fundNavCrossCheckRuns: [],
  weeklyReview: null,
  weeklyReviewRuns: [],
  actualPerformanceReport: null,
  actualPerformanceRuns: [],
  credibilityReport: null,
  credibilityRuns: [],
  latestNextActionReport: null,
  nextActionRuns: [],
  signalMaturitySchedule: null,
  signalMaturityScheduleRuns: [],
  reviewTodoReport: null,
  reviewTodoRuns: [],
  signalHistoryExport: null,
  signalHistoryExportRuns: [],
  signalIntegrityAudit: null,
  signalIntegrityKnownSignals: {},
  signalIntegrityRuns: [],
  stateBackup: null,
  stateBackupRuns: [],
  lastWeeklyReviewEmail: null,
  weeklyReviewEmailRuns: [],
  dailyExperimentRun: null,
  dailyExperimentRuns: [],
  simulatedTrading: {
    weeklyBudget: 500,
    totalContributed: 0,
    cash: 0,
    invested: 0,
    marketValue: 0,
    totalAssets: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    pnl: 0,
    pnlPct: 0,
    lastContributionWeek: "",
    lastPricedAt: "",
    positions: [],
    orders: [],
    runs: []
  },
  marketUpdates: []
};

const isFileMode = window.location.protocol === "file:";
const today = () => new Date().toISOString().slice(0, 10);
const yuan = (value) => Number(value || 0).toFixed(2);
const pct = (value) => `${Number(value || 0).toFixed(2)}%`;
const number = (value) => Number(value || 0);
const maybePct = (value) => value === null || value === undefined || Number.isNaN(Number(value)) ? "-" : pct(value);
const stripEndPunct = (value) => String(value ?? "").trim().replace(/[。；;，,\s]+$/u, "");
const joinPhrases = (values, fallback = "") => {
  const parts = (values || []).map(stripEndPunct).filter(Boolean);
  return parts.join("；") || fallback;
};

function friendlyErrorMessage(value) {
  const raw = String(value || "").trim();
  const lower = raw.toLowerCase();
  if (/winerror 10013|访问权限不允许|forbidden by its access permissions/.test(lower)) {
    return "外部数据连接被当前进程或 Windows 防火墙拦截。请重启小老板理财后重试；最近一次成功数据已保留。";
  }
  if (/failed to establish|无法连接到远程服务器|connectionerror|connection refused|getaddrinfo/.test(lower)) {
    return "暂时无法连接外部数据源。请检查网络后重试；最近一次成功数据已保留。";
  }
  if (/timed out|timeout|超时/.test(lower)) {
    return "外部数据源响应超时。请稍后重试；最近一次成功数据已保留。";
  }
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return (lines.findLast((line) => /error|exception|失败|错误/i.test(line)) || lines.at(-1) || "操作失败").slice(0, 260);
}

function alert(message) {
  showRuntimeBanner(friendlyErrorMessage(message), "warn");
}
function signalWeekKey(value) {
  if (!value) return null;
  const date = new Date(String(value).replace("Z", "+00:00"));
  if (Number.isNaN(date.getTime())) return null;
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekDay = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekDay);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((day - yearStart) / 86_400_000) + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function recordedWeekCount(signals) {
  const weeks = new Set();
  (signals || []).forEach((signal) => {
    const key = signalWeekKey(signal.date || signal.time);
    if (key) weeks.add(key);
  });
  return weeks.size;
}

const requiredReviewWindows = ["day5", "day20", "day60"];
const recordedExecutionStatuses = new Set(["已执行", "部分执行", "未执行", "延后"]);
const validExecutionStatuses = new Set(["未记录", ...recordedExecutionStatuses]);

function validationWindowStatus(validation = {}, requiredSignals = 30) {
  const byWindow = validation?.byWindow || {};
  const done = {};
  const required = Number(requiredSignals || 30);
  requiredReviewWindows.forEach((key) => {
    done[key] = number(byWindow[key]?.done);
  });
  const missing = requiredReviewWindows.filter((key) => done[key] < required);
  return {
    done,
    required,
    complete: missing.length === 0,
    missing
  };
}

function normalizeExecutionStatus(value) {
  const status = String(value || "").trim();
  return validExecutionStatuses.has(status) ? status : "未记录";
}

function credibilityGate(signals = [], validation = {}, execution = {}, requiredSignals = 30, requiredWeeks = 8) {
  const weeks = recordedWeekCount(signals);
  const windowStatus = validationWindowStatus(validation || {}, requiredSignals);
  const pending = Number(execution.pending || 0);
  return {
    weeks,
    windowStatus,
    canEvaluate: (
      signals.length >= Number(requiredSignals || 30) &&
      weeks >= Number(requiredWeeks || 8) &&
      pending === 0 &&
      windowStatus.complete
    )
  };
}

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
})[char]);

const titles = {
  agent: "AI 投研室",
  dashboard: "仪表盘",
  market: "专业行情",
  "fund-market": "我的基金曲线",
  exposure: "持仓穿透",
  watchlist: "ETF 候选池",
  portfolio: "持仓管理",
  trades: "交易日志",
  simulation: "模拟炒股",
  news: "新闻验证",
  signals: "信号验证",
  settings: "提醒设置",
  review: "复盘报告"
};

function normalizeStateDefaults() {
  state.settings = {
    ...fallbackState.settings,
    ...(state.settings || {})
  };
  state.marketHistory = state.marketHistory && typeof state.marketHistory === "object" ? state.marketHistory : {};
  state.fundNavHistory = state.fundNavHistory && typeof state.fundNavHistory === "object" ? state.fundNavHistory : {};
  state.fundExposure = state.fundExposure && typeof state.fundExposure === "object" ? state.fundExposure : { items: {} };
  state.fundExposureUpdates = Array.isArray(state.fundExposureUpdates) ? state.fundExposureUpdates : [];
  state.equityHistory = Array.isArray(state.equityHistory) ? state.equityHistory : [];
  state.formalExperiment = state.formalExperiment || null;
  state.formalExperimentEvents = Array.isArray(state.formalExperimentEvents) ? state.formalExperimentEvents : [];
  state.goalAudit = state.goalAudit || null;
  state.goalAuditRuns = Array.isArray(state.goalAuditRuns) ? state.goalAuditRuns : [];
  state.sampleGuard = state.sampleGuard || null;
  state.sampleGuardRuns = Array.isArray(state.sampleGuardRuns) ? state.sampleGuardRuns : [];
  state.actualPerformanceReport = state.actualPerformanceReport || null;
  state.actualPerformanceRuns = Array.isArray(state.actualPerformanceRuns) ? state.actualPerformanceRuns : [];
  state.credibilityReport = state.credibilityReport || null;
  state.credibilityRuns = Array.isArray(state.credibilityRuns) ? state.credibilityRuns : [];
  state.latestNextActionReport = state.latestNextActionReport || null;
  state.nextActionRuns = Array.isArray(state.nextActionRuns) ? state.nextActionRuns : [];
  state.signalMaturitySchedule = state.signalMaturitySchedule || null;
  state.signalMaturityScheduleRuns = Array.isArray(state.signalMaturityScheduleRuns) ? state.signalMaturityScheduleRuns : [];
  state.reviewTodoReport = state.reviewTodoReport || null;
  state.reviewTodoRuns = Array.isArray(state.reviewTodoRuns) ? state.reviewTodoRuns : [];
  state.signalHistoryExport = state.signalHistoryExport || null;
  state.signalHistoryExportRuns = Array.isArray(state.signalHistoryExportRuns) ? state.signalHistoryExportRuns : [];
  state.signalIntegrityAudit = state.signalIntegrityAudit || null;
  state.signalIntegrityKnownSignals = state.signalIntegrityKnownSignals || {};
  state.signalIntegrityRuns = Array.isArray(state.signalIntegrityRuns) ? state.signalIntegrityRuns : [];
  state.stateBackup = state.stateBackup || null;
  state.stateBackupRuns = Array.isArray(state.stateBackupRuns) ? state.stateBackupRuns : [];
  const simulatedTrading = state.simulatedTrading || {};
  state.simulatedTrading = {
    ...fallbackState.simulatedTrading,
    ...simulatedTrading,
    positions: Array.isArray(simulatedTrading.positions) ? simulatedTrading.positions : [],
    orders: Array.isArray(simulatedTrading.orders) ? simulatedTrading.orders : [],
    runs: Array.isArray(simulatedTrading.runs) ? simulatedTrading.runs : []
  };
}

function scoreEtf(item) {
  const price = number(item.price || item.close);
  const ma20 = number(item.ma20);
  const ma60 = number(item.ma60);
  const slope = number(item.ma20Slope);
  const turnover = number(item.turnoverYuan);
  const fundSize = number(item.fundSizeYi);
  const spread = number(item.bidAskSpreadPct);
  const r1 = number(item.return1mPct);
  const r3 = number(item.return3mPct);
  const b1 = number(item.benchmarkReturn1mPct);
  const b3 = number(item.benchmarkReturn3mPct);

  const dataMissing = price <= 0 || ma20 <= 0 || ma60 <= 0;
  if (dataMissing) {
    return {
      ...item,
      trendScore: 0,
      liquidityScore: 0,
      qualityScore: 0,
      riskScore: 0,
      capitalFitScore: 0,
      totalScore: 0,
      grade: "D",
      status: "数据缺失",
      recommendation: "请先补充价格、20日线和60日线。",
      scoreReasons: [],
      riskFlags: ["缺少价格、20日线或60日线，不能生成观察建议。"]
    };
  }

  let trendScore = 0;
  const scoreReasons = [];
  const riskFlags = [];

  if (price > ma20) trendScore += 8;
  if (price > ma20) scoreReasons.push("价格高于20日线，短中期趋势未破。");
  else riskFlags.push("价格低于20日线，趋势偏弱。");
  if (slope > 0) trendScore += 8;
  if (slope > 0) scoreReasons.push("20日均线向上，趋势斜率为正。");
  else riskFlags.push("20日均线没有向上，趋势确认不足。");
  if (price >= ma60 * 0.985) trendScore += 6;
  if (price >= ma60 * 0.985) scoreReasons.push("价格接近或高于60日线，中期位置尚可。");
  else riskFlags.push("价格明显低于60日线，中期趋势偏弱。");
  if (r1 > b1) trendScore += 4;
  if (r1 > b1) scoreReasons.push("近1个月表现强于沪深300基准。");
  else riskFlags.push("近1个月没有跑赢沪深300基准。");
  if (r3 > b3) trendScore += 4;
  if (r3 > b3) scoreReasons.push("近3个月表现强于沪深300基准。");
  else riskFlags.push("近3个月没有跑赢沪深300基准。");

  let liquidityScore = 0;
  if (turnover >= 50_000_000) liquidityScore += 8;
  else if (turnover >= 10_000_000) liquidityScore += 5;
  else if (turnover > 0) liquidityScore += 2;
  if (turnover >= 50_000_000) scoreReasons.push("成交额较高，买卖流动性较好。");
  else if (turnover >= 10_000_000) scoreReasons.push("成交额达到基础流动性要求。");
  else riskFlags.push("成交额偏低，买卖可能不够顺畅。");
  if (spread > 0 && spread <= 0.12) liquidityScore += 5;
  else if (spread > 0 && spread <= 0.3) liquidityScore += 3;
  if (spread > 0 && spread <= 0.12) scoreReasons.push("买卖价差较小。");
  else if (spread > 0.3) riskFlags.push("买卖价差偏大，交易成本可能偏高。");
  if (turnover >= 10_000_000) liquidityScore += 4;
  if (turnover >= 5_000_000) liquidityScore += 3;

  const itemText = `${item.name || ""}${item.type || ""}`;
  let qualityScore = 0;
  if (itemText.includes("ETF")) qualityScore += 7;
  if (itemText.includes("ETF")) scoreReasons.push("产品类型清晰，属于ETF。");
  if (fundSize >= 20) qualityScore += 6;
  else if (fundSize >= 5) qualityScore += 4;
  if (fundSize >= 20) scoreReasons.push("基金规模较大。");
  else if (fundSize >= 5) scoreReasons.push("基金规模达到基础观察线。");
  else riskFlags.push("基金规模偏小或缺少规模数据。");
  if (item.name) qualityScore += 4;
  if (!/(杠杆|反向|做空|二倍|2倍)/.test(itemText)) qualityScore += 4;
  else riskFlags.push("疑似杠杆、反向或复杂产品，第一阶段不碰。");
  if (item.type && item.type !== "复杂产品") qualityScore += 4;

  let riskScore = 0;
  if (r1 < 15) riskScore += 5;
  else riskFlags.push("近1个月涨幅过高，可能已经过热。");
  if (Math.abs(r1) <= 12) riskScore += 4;
  else riskFlags.push("近1个月波动偏大。");
  if (!(r1 > 8 && r3 < 0)) riskScore += 3;
  else riskFlags.push("短期走强但3个月仍弱，可能是反弹而不是趋势反转。");
  if (price >= ma20 * 0.96 && price <= ma20 * 1.08) riskScore += 3;
  else riskFlags.push("价格偏离20日线较多，追买风险更高。");

  let capitalFitScore = 0;
  if (price > 0 && price * 100 <= state.settings.trialCapital) capitalFitScore += 5;
  if (price > 0 && price * 100 <= state.settings.trialCapital * 0.95) capitalFitScore += 3;
  if (price > 0 && price * 100 >= 80) capitalFitScore += 2;
  if (price > 0 && price * 100 <= state.settings.trialCapital) {
    scoreReasons.push(`100份约 ${yuan(price * 100)} 元，适配 ${yuan(state.settings.trialCapital)} 元试验仓。`);
  } else {
    riskFlags.push(`100份约 ${yuan(price * 100)} 元，超过 ${yuan(state.settings.trialCapital)} 元试验仓。`);
  }

  const hardReject =
    turnover > 0 && turnover < 1_000_000 ||
    spread > 0.5 ||
    /(杠杆|反向|做空|二倍|2倍)/.test(itemText) ||
    r1 >= 25 ||
    price * 100 > state.settings.trialCapital;

  if (turnover > 0 && turnover < 1_000_000) riskFlags.push("成交额低于硬性流动性门槛。");
  if (spread > 0.5) riskFlags.push("买卖价差超过硬性门槛。");
  if (r1 >= 25) riskFlags.push("近1个月涨幅过热，第一阶段不追。");

  const totalScore = trendScore + liquidityScore + qualityScore + riskScore + capitalFitScore;
  let grade = "D";
  if (!hardReject && totalScore >= 80) grade = "A";
  else if (!hardReject && totalScore >= 70) grade = "B";
  else if (!hardReject && totalScore >= 60) grade = "C";

  const status = hardReject ? "剔除" : grade === "A" ? "重点观察" : grade === "B" ? "普通观察" : grade === "C" ? "只记录" : "剔除";
  const recommendation = status === "重点观察"
    ? "可以考虑手动检查，买入前必须写好止损价。"
    : status === "普通观察"
      ? "继续观察，暂不买入。"
      : status === "只记录"
        ? "只记录，不买入。"
        : "剔除或等待数据改善。";

  return {
    ...item,
    trendScore,
    liquidityScore,
    qualityScore,
    riskScore,
    capitalFitScore,
    totalScore,
    grade,
    status,
    recommendation,
    scoreReasons,
    riskFlags
  };
}

function portfolioSummary() {
  const cost = state.portfolio.reduce((sum, item) => sum + positionCostValue(item), 0);
  const marketValue = state.portfolio.reduce((sum, item) => sum + positionMarketValue(item), 0);
  const pnl = marketValue - cost;
  const pnlPct = cost > 0 ? pnl / cost * 100 : 0;
  const stopTriggered = state.portfolio.some((item) => number(item.current) > 0 && number(item.stop) > 0 && number(item.current) <= number(item.stop));
  const targetHit = state.portfolio.find((item) => number(item.current) > 0 && number(item.target) > 0 && number(item.current) >= number(item.target));
  const hasPosition = state.portfolio.length > 0;

  let status = "空仓";
  let recommendation = "保持空仓，等待 ETF 候选池出现合格标的。";
  let level = "ok";

  if (hasPosition) {
    status = pnl >= 0 ? "持仓盈利" : "持仓亏损";
    recommendation = pnl >= 0 ? "继续持有，按卖出规则观察趋势。" : "继续观察，重点检查止损价。";
  }

  if (targetHit) {
    status = "达到退出目标";
    recommendation = `${targetHit.code} ${targetHit.name || ""} 已达到退出目标价，按计划手动赎回/卖出。`;
    level = "warn";
  } else if (stopTriggered) {
    status = "止损执行";
    recommendation = "已触发止损条件，请手动检查并卖出止损。";
    level = "danger";
  } else if (pnl <= -number(state.settings.stopLoss)) {
    status = "停止实验";
    recommendation = "试验仓亏损达到停止线，停止第一阶段实盘。";
    level = "danger";
  } else if (pnl <= -number(state.settings.pauseLoss)) {
    status = "暂停交易";
    recommendation = "试验仓亏损达到暂停线，暂停交易并复盘。";
    level = "warn";
  } else if (pnl < 0) {
    level = "warn";
  }

  return { cost, marketValue, pnl, pnlPct, status, recommendation, level };
}

function positionMarketValue(item) {
  const calculated = number(item.current) * number(item.quantity);
  return calculated > 0 ? calculated : number(item.reportedMarketValue);
}

function positionCostValue(item) {
  const calculated = number(item.cost) * number(item.quantity);
  if (calculated > 0) return calculated;
  const reported = number(item.reportedMarketValue);
  return reported > 0 ? Math.max(0, reported - number(item.reportedPnl)) : 0;
}

function simulatedTradingSummary() {
  const sim = state.simulatedTrading || fallbackState.simulatedTrading;
  const invested = number(sim.invested);
  const marketValue = number(sim.marketValue);
  const cash = number(sim.cash);
  const totalContributed = number(sim.totalContributed);
  const totalAssets = number(sim.totalAssets || cash + marketValue);
  const pnl = number(sim.pnl);
  const pnlPct = totalContributed > 0 ? number(sim.pnlPct) : 0;
  return {
    ...sim,
    totalContributed,
    invested,
    marketValue,
    cash,
    pnl,
    pnlPct,
    totalAssets
  };
}

function shortDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderSimulation() {
  const root = document.getElementById("simulation-view");
  if (!root) return;

  const sim = simulatedTradingSummary();
  const positions = sim.positions || [];
  const orders = sim.orders || [];
  const runs = sim.runs || [];
  const pnlClass = sim.pnl >= 0 ? "positive" : "negative";

  document.getElementById("sim-weekly-budget").textContent = `${yuan(sim.weeklyBudget)} / 累投 ${yuan(sim.totalContributed)}`;
  document.getElementById("sim-cash").textContent = yuan(sim.cash);
  document.getElementById("sim-market-value").textContent = yuan(sim.marketValue);
  const pnlEl = document.getElementById("sim-pnl");
  pnlEl.textContent = `${yuan(sim.pnl)} (${pct(sim.pnlPct)})`;
  pnlEl.className = pnlClass;

  document.getElementById("sim-run-badge").textContent = runs.length ? shortDateTime(runs[0].createdAt || runs[0].date) : "未运行";
  document.getElementById("sim-position-badge").textContent = `${positions.length} 只`;
  document.getElementById("sim-order-badge").textContent = `${orders.length} 笔`;

  const runList = document.getElementById("sim-run-list");
  runList.innerHTML = runs.slice(0, 5).map((run) => `
    <article class="check-item">
      <header>
        <strong>${escapeHtml(run.week || run.date || "-")}</strong>
        <span class="badge ${number(run.pnl) >= 0 ? "ok" : "warn"}">${escapeHtml(run.status || "-")}</span>
      </header>
      <div class="check-meta">${escapeHtml(run.message || "已刷新模拟账户。")}</div>
      <div class="check-meta">动作 ${number(run.actionCount).toFixed(0)} 笔；现金 ${yuan(run.cash)} 元；市值 ${yuan(run.marketValue)} 元；总资产 ${yuan(run.totalAssets || number(run.cash) + number(run.marketValue))} 元；盈亏 ${yuan(run.pnl)} 元（${pct(run.pnlPct)}）。</div>
    </article>
  `).join("") || '<div class="empty">还没有模拟运行记录。点击“本周模拟决策”后开始记账。</div>';

  const positionList = document.getElementById("sim-position-list");
  positionList.innerHTML = positions.map((item) => `
    <article class="check-item">
      <header>
        <strong>${escapeHtml(item.code || "-")} ${escapeHtml(item.name || "")}</strong>
        <span class="${number(item.pnl) >= 0 ? "positive" : "negative"}">${yuan(item.pnl)} (${pct(item.pnlPct)})</span>
      </header>
      <div class="check-meta">数量 ${number(item.quantity).toFixed(0)} 份；均价 ${yuan(item.avgCost)}；现价 ${yuan(item.currentPrice)}；市值 ${yuan(item.currentValue)}。</div>
      <div class="check-meta">首次买入 ${escapeHtml(item.firstBuyDate || "-")}；最近买入 ${escapeHtml(item.lastBuyDate || "-")}。</div>
    </article>
  `).join("") || '<div class="empty">模拟账户暂时空仓，等待本周模拟决策。</div>';

  const orderList = document.getElementById("sim-order-list");
  orderList.innerHTML = orders.slice(0, 20).map((order) => `
    <article class="check-item">
      <header>
        <strong>${escapeHtml(order.date || "-")} ${escapeHtml(order.code || "-")} ${escapeHtml(order.name || "")}</strong>
        <span class="badge">${escapeHtml(order.grade || "-")} ${number(order.score).toFixed(0)}分</span>
      </header>
      <div class="check-meta">${escapeHtml(order.side || "买入")} ${number(order.quantity).toFixed(0)} 份，价格 ${yuan(order.price)}，金额 ${yuan(order.amount)} 元${order.side === "卖出" ? `；已实现盈亏 ${yuan(order.realizedPnl)} 元（${pct(order.pnlPct)}）` : ""}。</div>
      <div class="check-meta">${escapeHtml(order.reason || "")}</div>
    </article>
  `).join("") || '<div class="empty">暂无模拟交易记录。</div>';
}

async function refreshSimulatedPortfolio(options = {}) {
  if (isFileMode) {
    showRuntimeBanner('模拟账户刷新需要本地服务。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 后再点击。', "warn");
    return null;
  }

  const res = await fetch("/api/simulated-portfolio");
  const payload = await res.json();
  if (!res.ok || !payload.ok) {
    throw new Error(payload.error || "模拟账户刷新失败");
  }
  state.simulatedTrading = payload.simulatedTrading;
  normalizeStateDefaults();
  renderDashboard();
  renderSimulation();
  if (!options.silent) {
    showRuntimeBanner("模拟账户盈亏已按最新候选池行情刷新。");
  }
  return payload;
}

async function runSimulatedWeeklyBuyFromButton(button) {
  if (isFileMode) {
    showRuntimeBanner('模拟买入需要本地服务。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 后再点击。', "warn");
    return;
  }

  button.textContent = "模拟中";
  button.disabled = true;
  try {
    const res = await fetch("/api/simulate-weekly-buy", { method: "POST" });
    const payload = await res.json();
    if (!res.ok || !payload.ok) {
      throw new Error(payload.error || "本周模拟决策失败");
    }
    state.simulatedTrading = payload.simulatedTrading;
    normalizeStateDefaults();
    renderAll();
    button.textContent = payload.orders?.length ? "已模拟决策" : "已持币";
    showRuntimeBanner(payload.run?.message || "模拟账户已更新。");
  } catch (error) {
    button.textContent = "模拟失败";
    alert(error.message);
  } finally {
    button.disabled = false;
    setTimeout(() => {
      button.textContent = "本周模拟决策";
    }, 1600);
  }
}

function buildFiveAnswers() {
  const summary = portfolioSummary();
  const positions = state.portfolio || [];
  const signals = state.signalHistory || [];
  const weeks = recordedWeekCount(signals);
  const validation = state.signalValidation || {};
  const execution = executionSummary();
  const performance = state.actualPerformanceReport || null;
  const tradePerformance = performance?.tradePerformance || {};
  const formalRecording = Boolean(state.settings.formalSignalRecording);
  const gate = credibilityGate(signals, validation, execution);
  const exitPlans = currentExitPlans();
  const candidates = topWatchlistCandidates();
  const topCandidate = candidates.find((item) => ["A", "B"].includes(item.grade) && !["剔除", "数据缺失"].includes(item.status)) || candidates[0];
  const latestMarket = state.marketUpdates?.[0];
  const sourceCount = (state.sourceWhitelist || []).length;
  const newsCount = (state.newsEvents || []).length;
  const financialCount = (state.financialEvents || []).length;

  const holdingAnswer = positions.length
    ? `${positions.length} 只持仓，当前市值 ${yuan(summary.marketValue)} 元，盈亏 ${yuan(summary.pnl)} 元。` +
      ` 主要持仓：${positions.slice(0, 3).map((item) => `${item.code} ${item.name || ""}`).join("；")}。`
    : "当前没有持仓，应保持空仓，只观察候选池。";

  const exitAnswer = exitPlans.length
    ? `${summary.status}。${summary.recommendation} 退出关注：${joinPhrases(exitPlans.slice(0, 2).map((item) => `${item.code} ${item.action}`))}。`
    : `${summary.status}。${summary.recommendation} 当前没有触发止损或退出目标。`;

  const candidateReasons = topCandidate ? joinPhrases((topCandidate.scoreReasons || []).slice(0, 2), "暂无明确正向解释") : "";
  const candidateRisks = topCandidate ? joinPhrases((topCandidate.riskFlags || []).slice(0, 2), "暂无明显硬伤") : "";
  const candidateAnswer = topCandidate
    ? `${topCandidate.code} ${topCandidate.name || ""}：${topCandidate.grade}级，${number(topCandidate.totalScore).toFixed(0)}分，${topCandidate.status}。理由：${candidateReasons}。风险：${candidateRisks}。`
    : "当前没有可展示的候选 ETF，保持空仓等待。";

  const ruleAnswer = [
    latestMarket ? `ETF 行情 ${latestMarket.time}，${latestMarket.count} 只` : "ETF 行情未更新",
    state.fundNavSync ? `基金净值 ${state.fundNavSync.time}，${state.fundNavSync.count} 只` : "基金净值未同步",
    state.fundNavCrossCheck ? `官网核对一致 ${state.fundNavCrossCheck.verifiedCount || 0}/${state.fundNavCrossCheck.count || 0}` : "官网核对未完成",
    `白名单 ${sourceCount} 个来源`,
    `新闻 ${newsCount} 条`,
    `财报 ${financialCount} 条`
  ].join("；") + "。建议由持仓规则、退出规则、ETF 评分、数据质量和手动执行边界共同生成。";

  const signalAnswer = gate.canEvaluate
    ? `已有 ${signals.length} 条信号、${weeks} 周记录；已回看 ${validation.doneCheckpoints || 0} 个窗口，平均超额 ${maybePct(validation.avgExcessPct)}，最差最大回撤 ${maybePct(validation.worstMaxDrawdownPct)}。`
    : !formalRecording
      ? `当前为预演模式，正式信号 ${signals.length}/30 条；每日运行和生成评分只预检，不计入样本。开启正式样本记录后，才开始积累 8-12 周和 30 条信号。`
      : `正式信号 ${signals.length}/30 条，记录 ${weeks}/8 周，执行记录 ${execution.recorded}/${execution.totalSignals} 条；样本不足，不能说预测可信，也不能扩大仓位。`;
  const tradeAnswer = performance
    ? `真实成交：${performance.verdict || "-"}，成交 ${tradePerformance.tradeCount || 0} 条，成交盈亏 ${yuan(tradePerformance.totalPnl)} 元。`
    : "真实成交：尚未生成执行表现报告。";
  const accuracyAnswer = `${signalAnswer} ${tradeAnswer}`;

  return [
    {
      title: "我现在持有什么？",
      level: positions.length ? "ok" : "warn",
      status: positions.length ? `${positions.length} 只` : "空仓",
      meta: holdingAnswer
    },
    {
      title: "我现在是什么状态，是否该退出？",
      level: summary.level,
      status: summary.status,
      meta: exitAnswer
    },
    {
      title: "今天有没有值得观察的 ETF/基金？为什么？",
      level: topCandidate && ["A", "B"].includes(topCandidate.grade) ? "ok" : "warn",
      status: topCandidate ? `${topCandidate.grade || "D"}级` : "无候选",
      meta: candidateAnswer
    },
    {
      title: "每条建议来自哪些数据和规则？",
      level: latestMarket && state.fundNavSync && sourceCount ? "ok" : "warn",
      status: "可追溯",
      meta: ruleAnswer
    },
    {
      title: "过去这些建议准不准，是否赚钱？",
      level: gate.canEvaluate ? "ok" : "warn",
      status: gate.canEvaluate ? "可评估" : formalRecording ? "样本不足" : "预演模式",
      meta: accuracyAnswer
    }
  ];
}

function emailText() {
  if (state.latestEmailReminder?.date === today() && state.latestEmailReminder?.body) {
    return state.latestEmailReminder.body;
  }

  const summary = portfolioSummary();
  const plan = buildOperationPlan();
  const fiveAnswers = buildFiveAnswers()
    .map((item, index) => `- ${index + 1}. ${item.title}（${item.status}）：${item.meta}`)
    .join("\n");
  const top = topWatchlistCandidates()
    .slice(0, 3)
    .map((item) => {
      const reasons = joinPhrases((item.scoreReasons || []).slice(0, 2), "暂无明确正向解释");
      const risks = joinPhrases((item.riskFlags || []).slice(0, 2), "暂无明显硬伤");
      return `- ${item.code || "-"} ${item.name || "-"}：${item.grade || "D"}级，${number(item.totalScore).toFixed(0)}分，${item.status || "未评分"}。理由：${reasons}。风险：${risks}`;
    })
    .join("\n") || "- 暂无候选 ETF";
  const exits = [...(state.portfolio || [])]
    .filter((item) => number(item.target) > 0)
    .map((item) => `- ${item.code} ${item.name || ""}：目标价 ${number(item.target).toFixed(4)}，当前价 ${number(item.current).toFixed(4)}，${positionAction(item)}`)
    .join("\n") || "- 暂无退出目标";
  const manualOrders = (plan.manualOrderChecklist?.items || [])
    .map((item) => {
      const details = [
        item.code ? `代码 ${item.code}` : "",
        item.quantity ? `数量 ${item.quantity} 份` : "",
        item.referencePrice != null ? `参考价 ${number(item.referencePrice).toFixed(4)}` : "",
        item.estimatedAmount ? `预计金额 ${yuan(item.estimatedAmount)} 元` : "",
        item.stopPrice ? `止损价 ${number(item.stopPrice).toFixed(3)}` : "",
        item.maxLossYuan ? `计划风险 ${yuan(item.maxLossYuan)} 元` : ""
      ].filter(Boolean).join("；");
      return `- ${item.title}：${item.action || item.status}。${item.meta}${details ? `（${details}）` : ""}`;
    })
    .join("\n") || "- 今日无手动操作清单";

  return `当前状态：${summary.status}

五个问题：
${fiveAnswers}

账户概览：
- 总实验资金：${state.settings.totalCapital} 元
- 第一阶段实盘资金：${state.settings.trialCapital} 元
- 当前持仓市值：${yuan(summary.marketValue)} 元
- 当前盈亏：${yuan(summary.pnl)} 元，${pct(summary.pnlPct)}

退出计划：
${exits}

ETF 候选池：
${top}

建议操作：
- ${summary.recommendation}

今日操作计划：
${plan.items.map((item) => `- ${item.title}：${item.status}。${item.meta}`).join("\n")}

手动操作清单：
${manualOrders}

注意：以上为策略实验提醒，不是自动交易。请用户自行登录券商账户手动执行。`;
}

function emailReminderStatusText() {
  const latest = state.latestEmailReminder;
  const last = state.lastEmailReminder;
  if (!latest) {
    return "尚未生成今日提醒。";
  }

  const sendText = latest.shouldSend ? "本次应发送" : "本次不发送";
  const sentText = last?.time ? `上次发送：${last.time}` : "尚无发送记录";
  return `最近生成：${latest.time || "-"}；${sendText}，${latest.sendReason || "-"}；${sentText}。`;
}

function latestDeliveryState(kind) {
  const latest = kind === "daily" ? state.latestEmailReminder : state.weeklyReview;
  const last = kind === "daily" ? state.lastEmailReminder : state.lastWeeklyReviewEmail;
  const title = kind === "daily" ? "每日提醒" : "周报提醒";

  if (!latest) {
    return {
      title,
      status: "未生成",
      level: "warn",
      ok: false,
      meta: kind === "daily"
        ? "点击“生成提醒”，或等待工作日收盘后的自动任务。"
        : "进入“复盘报告”生成周报，或等待周五自动任务。",
      subject: ""
    };
  }

  const sameId = last?.id && latest.id && last.id === latest.id;
  const sameHash = kind === "daily"
    ? last?.actionHash && latest.actionHash && last.actionHash === latest.actionHash
    : last?.contentHash && latest.contentHash && last.contentHash === latest.contentHash;
  const sent = Boolean(last?.time && sameId && sameHash);
  const sendReason = latest.sendReason || "-";
  const generatedText = latest.time ? `生成：${latest.time}` : "生成时间：-";
  const lastText = last?.time ? `上次发送：${last.time}` : "尚无发送记录";

  if (sent) {
    return {
      title,
      status: "已发送",
      level: "ok",
      ok: true,
      meta: `${generatedText}；${lastText}。`,
      subject: latest.subject || ""
    };
  }

  if (latest.shouldSend) {
    return {
      title,
      status: "待发送",
      level: "warn",
      ok: false,
      meta: `${generatedText}；${sendReason}；${lastText}。`,
      subject: latest.subject || ""
    };
  }

  return {
    title,
    status: "不重复发送",
    level: "ok",
    ok: true,
    meta: `${generatedText}；${sendReason}；${lastText}。`,
    subject: latest.subject || ""
  };
}

function deliverySummary() {
  const items = [latestDeliveryState("daily"), latestDeliveryState("weekly")];
  const pending = items.filter((item) => !item.ok).length;
  return {
    items,
    pending,
    label: pending ? `${pending} 项待处理` : "正常",
    level: pending ? "warn" : "ok"
  };
}

async function loadState() {
  if (isFileMode) {
    Object.assign(state, fallbackState);
    normalizeStateDefaults();
    showRuntimeBanner(
      '你现在是用文件方式打开页面，所以不能保存数据、更新行情或发邮件。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 使用完整功能。',
      "warn"
    );
    renderAll();
    return;
  }

  try {
    const res = await fetch("/api/state");
    const data = await res.json();
    Object.assign(state, data);
    normalizeStateDefaults();
  } catch (error) {
    Object.assign(state, fallbackState);
    normalizeStateDefaults();
    showRuntimeBanner(`本地服务暂时不可用：${error.message}。请确认 Node 服务正在运行。`, "warn");
  }
  renderAll();
}

let activeMarketCode = "";
let activeFundCode = "";
let activeExposureCode = "";

function marketPct(value) {
  return value === null || value === undefined ? "—" : `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(2)}%`;
}

async function loadMarketVisualization(code = activeMarketCode) {
  if (isFileMode) {
    document.getElementById("market-symbol-meta").textContent = "专业图表需要本地服务";
    return null;
  }
  const select = document.getElementById("market-symbol-select");
  const requested = code || select?.value || (state.watchlist || []).find((item) => state.marketHistory?.[item.code])?.code || Object.keys(state.marketHistory || {})[0] || "";
  if (!requested) {
    document.getElementById("market-symbol-meta").textContent = "点击顶部“更新行情”生成 OHLCV 历史";
    return null;
  }
  document.getElementById("market-symbol-meta").textContent = "正在读取历史行情…";
  try {
    const response = await fetch(`/api/market-visualization?code=${encodeURIComponent(requested)}`);
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "行情图表加载失败");
    activeMarketCode = payload.instrument.code;
    select.innerHTML = payload.available.map((item) => `<option value="${escapeHtml(item.code)}">${escapeHtml(item.grade)}级 ${escapeHtml(String(item.score ?? "-"))}分 · ${escapeHtml(item.code)} · ${escapeHtml(item.name)}</option>`).join("");
    select.value = activeMarketCode;
    document.getElementById("market-symbol-title").textContent = `${payload.instrument.code} ${payload.instrument.name}`;
    document.getElementById("market-symbol-meta").textContent = `${payload.bars.length} 个交易日 · ${payload.instrument.priceSource || "历史行情"}`;
    const verified = payload.instrument.crossCheck?.status === "verified";
    const conflict = payload.instrument.crossCheck?.status === "conflict";
    const verify = document.getElementById("market-verify-status");
    verify.textContent = verified ? "双源一致" : conflict ? "来源有差异" : "单源可用";
    verify.dataset.tone = verified ? "ok" : conflict ? "danger" : "warn";
    document.getElementById("market-grade").textContent = `${payload.candidate.grade} · ${payload.candidate.score ?? "-"}分`;
    document.getElementById("market-last-date").textContent = payload.instrument.lastMarketDate || payload.bars.at(-1)?.time || "-";
    document.getElementById("market-strategy-method").textContent = payload.strategy.methodology;
    document.getElementById("market-validation-grid").innerHTML = payload.validation.map((item) => `<article><span>${item.days} 日</span><strong class="${Number(item.excess) >= 0 ? "positive" : "negative"}">${marketPct(item.value)}</strong><small>基准 ${marketPct(item.benchmark)} · 超额 ${marketPct(item.excess)}</small></article>`).join("");
    const portfolioEmpty = document.getElementById("market-portfolio-empty");
    portfolioEmpty.textContent = payload.portfolio.length ? `已记录 ${payload.portfolio.length} 个资产快照。` : "尚无组合历史；每次刷新行情或模拟决策后会自动记录。";
    window.MarketCharts?.render(payload);
    return payload;
  } catch (error) {
    document.getElementById("market-symbol-meta").textContent = friendlyErrorMessage(error.message);
    return null;
  }
}

function fundPct(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "-";
  const numberValue = Number(value);
  return `${numberValue >= 0 ? "+" : ""}${numberValue.toFixed(2)}%`;
}

async function loadFundVisualization(code = activeFundCode) {
  if (isFileMode) {
    document.getElementById("fund-symbol-meta").textContent = "基金曲线需要本地服务";
    return null;
  }
  const select = document.getElementById("fund-symbol-select");
  const requested = code || select?.value || (state.portfolio || []).find((item) => state.fundNavHistory?.[item.code])?.code || "";
  if (!requested) {
    document.getElementById("fund-symbol-meta").textContent = "请先导入持仓并点击顶部“更新净值”";
    return null;
  }
  document.getElementById("fund-symbol-meta").textContent = "正在读取历史净值…";
  try {
    const response = await fetch(`/api/fund-visualization?code=${encodeURIComponent(requested)}`);
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "基金曲线加载失败");
    activeFundCode = payload.instrument.code;
    select.innerHTML = payload.available.map((item) => `<option value="${escapeHtml(item.code)}">${escapeHtml(item.code)} · ${escapeHtml(item.name)} · ${item.points}点</option>`).join("");
    select.value = activeFundCode;
    document.getElementById("fund-symbol-title").textContent = `${payload.instrument.code} ${payload.instrument.name}`;
    document.getElementById("fund-symbol-meta").textContent = `${payload.bars.length} 个净值日 · ${payload.instrument.source}`;
    document.getElementById("fund-current-nav").textContent = payload.holding.currentNav.toFixed(4);
    document.getElementById("fund-cost-nav").textContent = payload.holding.costNav > 0 ? payload.holding.costNav.toFixed(4) : "未录入";
    const pnl = document.getElementById("fund-holding-pnl");
    pnl.textContent = `${payload.holding.pnl >= 0 ? "+" : ""}${payload.holding.pnl.toFixed(2)} 元 · ${fundPct(payload.holding.pnlPct)}`;
    pnl.className = payload.holding.pnl >= 0 ? "positive" : "negative";
    const verified = payload.instrument.validation?.status === "verified";
    document.getElementById("fund-last-date").textContent = `${payload.instrument.lastNavDate} · ${verified ? "历史序列已校验" : "单源数据"}`;
    document.getElementById("fund-metrics-grid").innerHTML = [
      ...payload.metrics.map((item) => `<article><span>${item.label}</span><strong class="${Number(item.value) >= 0 ? "positive" : "negative"}">${fundPct(item.value)}</strong><small>${item.value == null ? "历史长度不足" : `${item.days} 个净值交易日`}</small></article>`),
      `<article><span>最大回撤</span><strong class="negative">${fundPct(payload.maxDrawdown)}</strong><small>${payload.instrument.firstNavDate} 至今</small></article>`
    ].join("");
    document.getElementById("fund-data-notes").innerHTML = `
      <p><strong>曲线是什么：</strong>该基金公开披露的每日单位净值，不是场内分时或 OHLC K 线。</p>
      <p><strong>你的数据：</strong>份额 ${payload.holding.quantity.toFixed(4)}，成本金额 ${payload.holding.costValue.toFixed(2)} 元，当前市值 ${payload.holding.marketValue.toFixed(2)} 元；来源为 ${escapeHtml(payload.holding.importSource)}。</p>
      <p><strong>边界：</strong>当前没有每笔真实申购日期，因此成本线可核对当前盈亏，但不能把整段历史曲线称为“你的历史收益”。</p>
      <p><strong>自动记录：</strong>周一至周五启动软件时会检查一次；保持软件开启时，每晚 21:00 后会再次同步。周末跳过，重复日期自动覆盖，网络失败保留最近成功曲线。</p>
      <p><a href="${escapeHtml(payload.instrument.sourceUrl)}" target="_blank" rel="noreferrer">打开净值来源页 ↗</a></p>`;
    window.FundCharts?.render(payload);
    return payload;
  } catch (error) {
    document.getElementById("fund-symbol-meta").textContent = friendlyErrorMessage(error.message);
    return null;
  }
}

function exposureBarRows(rows = [], limit = 10) {
  const visible = rows.filter((item) => Number(item.amount) > 0).slice(0, limit);
  const max = Math.max(1, ...visible.map((item) => Number(item.portfolioPct || 0)));
  if (!visible.length) return '<p class="muted-line">暂无可展示数据。</p>';
  return visible.map((item) => `<div class="exposure-bar"><div class="exposure-bar-label"><span>${escapeHtml(item.name)}</span><strong>${Number(item.amount).toFixed(2)} 元 · ${Number(item.portfolioPct).toFixed(2)}%</strong></div><div class="exposure-bar-track"><div class="exposure-bar-fill" style="width:${Math.max(1, Number(item.portfolioPct) / max * 100).toFixed(2)}%"></div></div></div>`).join("");
}

async function loadPortfolioExposure(code = activeExposureCode) {
  if (isFileMode) return null;
  try {
    const response = await fetch(`/api/portfolio-exposure?code=${encodeURIComponent(code || "")}`);
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "持仓穿透加载失败");
    activeExposureCode = payload.selected?.code || "";
    const select = document.getElementById("exposure-fund-select");
    select.innerHTML = payload.available.map((item) => `<option value="${escapeHtml(item.code)}">${escapeHtml(item.code)} · ${escapeHtml(item.name)}${item.asOfDate ? ` · ${escapeHtml(item.asOfDate)}` : ""}</option>`).join("");
    select.value = activeExposureCode;
    document.getElementById("exposure-total-value").textContent = `${Number(payload.totalValue).toFixed(2)} 元`;
    document.getElementById("exposure-known-stock").textContent = `${Number(payload.coverage.knownStockAmount).toFixed(2)} 元 · ${Number(payload.coverage.knownStockPct).toFixed(2)}%`;
    document.getElementById("exposure-mapped-funds").textContent = `${payload.coverage.mappedFunds} / ${payload.coverage.totalFunds}`;
    document.getElementById("exposure-updated-at").textContent = payload.updatedAt ? String(payload.updatedAt).replace("T", " ") : "尚未同步";
    document.getElementById("exposure-asset-bars").innerHTML = exposureBarRows(payload.assetClasses, 14);
    document.getElementById("exposure-sector-bars").innerHTML = exposureBarRows(payload.sectors, 8);
    document.getElementById("exposure-market-bars").innerHTML = exposureBarRows(payload.markets, 8);

    const selected = payload.selected;
    document.getElementById("exposure-selected-title").textContent = selected ? `${selected.code} ${selected.name}` : "基金持仓明细";
    document.getElementById("exposure-selected-meta").textContent = selected ? `${selected.disclosureLabel || "未同步"} · 报告期 ${selected.asOfDate || "无股票披露"} · 已知 ${Number(selected.knownStockPct || 0).toFixed(2)}%` : "暂无持仓";
    document.getElementById("exposure-confidence").textContent = selected ? `${selected.confidence || "D"} 级口径` : "-";
    document.getElementById("exposure-fund-holdings").innerHTML = selected?.holdings?.length ? selected.holdings.map((item) => `<tr><td><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.code)}</small></td><td>${Number(item.weightPct).toFixed(2)}%</td><td>${Number(item.amount).toFixed(2)} 元</td><td>${Number(item.portfolioPct).toFixed(2)}%</td><td>${escapeHtml(item.sector)}<small>${escapeHtml(item.market)}</small></td></tr>`).join("") : '<tr><td colspan="5">这只基金没有可用的股票披露；债券基金不会被伪装成股票组合。</td></tr>';
    document.getElementById("exposure-selected-warning").textContent = selected?.errors?.join("；") || "";
    document.getElementById("exposure-aggregate-stocks").innerHTML = payload.stocks.length ? payload.stocks.slice(0, 25).map((item) => `<tr><td><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.code)} · ${escapeHtml(item.sector)}</small></td><td>${Number(item.amount).toFixed(2)} 元</td><td>${Number(item.portfolioPct).toFixed(2)}%</td><td>${item.funds.map((fund) => `${escapeHtml(fund.code)} ${Number(fund.amount).toFixed(2)}元`).join("<br>")}</td><td>${item.repeated ? `<span class="overlap-tag">${item.fundCount} 只基金重叠</span>` : "单一来源"}</td></tr>`).join("") : '<tr><td colspan="5">尚无可合并的股票披露。</td></tr>';
    const sources = selected?.sources || [];
    document.getElementById("exposure-methodology").innerHTML = `<strong>计算方法：</strong>${escapeHtml(payload.methodology)}<ul>${payload.warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>${sources.length ? `<p><strong>当前基金来源：</strong> ${sources.map((item) => `<a href="${escapeHtml(item.url || "#")}" target="_blank" rel="noreferrer">${escapeHtml(item.name)} [${escapeHtml(item.level)}]</a>`).join(" · ")}</p>` : ""}`;
    return payload;
  } catch (error) {
    showRuntimeBanner(`持仓穿透暂时不可用：${escapeHtml(friendlyErrorMessage(error.message))}`, "warn");
    return null;
  }
}

async function saveState() {
  if (isFileMode) {
    showRuntimeBanner('文件方式打开时不能保存。请使用 <a href="http://localhost:4173">http://localhost:4173</a>。', "warn");
    return;
  }

  await fetch("/api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state)
  });
}

async function setFormalRecording(enabled) {
  if (isFileMode) {
    showRuntimeBanner('正式样本记录需要本地服务。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 后再操作。', "warn");
    renderSettings();
    renderFormalStartGate();
    return false;
  }

  const gate = formalStartGate();
  if (enabled && !gate.ready) {
    const blockers = gate.blockers.map((item) => item.title).join("、") || "开始检查未通过";
    alert(`暂不能开启正式样本记录：${blockers}。请先处理这些项目。`);
    renderSettings();
    renderFormalStartGate();
    return false;
  }

  const confirmText = enabled
    ? "确认开启正式样本记录？开启后，后续买入、卖出、赎回、空仓、暂停或观察建议会计入 30 条正式样本。"
    : "确认暂停正式样本记录？暂停后，每日运行和生成今日评分只做预检，不再写入正式样本。";
  if (!window.confirm(confirmText)) {
    renderSettings();
    renderFormalStartGate();
    return false;
  }

  const now = new Date().toISOString();
  const signals = state.signalHistory || [];
  const previous = state.formalExperiment || {};
  const event = {
    id: `formal-event-${Date.now()}`,
    type: enabled ? (previous.startedAt ? "resume" : "start") : "pause",
    time: now,
    signalCount: signals.length,
    gate: {
      ready: gate.ready,
      okCount: gate.okCount,
      total: gate.total,
      blockers: gate.blockers.map((item) => ({
        title: item.title,
        status: item.status,
        meta: item.meta
      }))
    },
    note: enabled ? "用户确认开启正式样本记录。" : "用户确认暂停正式样本记录。"
  };

  state.settings.formalSignalRecording = enabled;
  if (enabled) {
    state.formalExperiment = {
      id: previous.id || `formal-experiment-${Date.now()}`,
      status: "active",
      startedAt: previous.startedAt || now,
      resumedAt: previous.startedAt ? now : "",
      startSignalCount: previous.startSignalCount ?? signals.length,
      currentSignalCount: signals.length,
      sampleTarget: 30,
      weekTarget: 8,
      startGate: gate,
      updatedAt: now
    };
  } else {
    state.formalExperiment = {
      ...previous,
      id: previous.id || `formal-experiment-${Date.now()}`,
      status: "paused",
      pausedAt: now,
      pauseSignalCount: signals.length,
      currentSignalCount: signals.length,
      updatedAt: now
    };
  }
  state.formalExperimentEvents = [event, ...(state.formalExperimentEvents || [])].slice(0, 100);
  await saveState();
  await loadState();
  showRuntimeBanner(enabled ? "正式样本记录已开启。后续建议会进入 30 条样本统计。" : "正式样本记录已暂停。系统回到预演模式，不再写入正式样本。");
  return true;
}

function showRuntimeBanner(message) {
  const banner = document.getElementById("runtime-banner");
  banner.innerHTML = message;
  banner.classList.remove("hidden");
}

function switchView(name) {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === name);
  });
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.getElementById(`${name}-view`).classList.add("active");
  document.getElementById("view-title").textContent = titles[name];
  document.querySelector(".main")?.classList.toggle("agent-mode", name === "agent");
  const moreNavigation = document.querySelector(".nav-more");
  if (moreNavigation) moreNavigation.open = Boolean(moreNavigation.querySelector(`[data-view="${name}"]`));
  if (name === "market") requestAnimationFrame(() => loadMarketVisualization());
  if (name === "fund-market") requestAnimationFrame(() => loadFundVisualization());
  if (name === "exposure") requestAnimationFrame(() => loadPortfolioExposure());
}

function daysSince(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

function positionAction(item) {
  const current = number(item.current);
  const target = number(item.target);
  const stop = number(item.stop);
  if (target > 0 && current >= target) {
    return "达到退出目标，按计划手动赎回/卖出。";
  }
  if (target > 0 && current > 0) {
    const needPct = (target / current - 1) * 100;
    return `退出计划：不加仓，距离目标价 ${target.toFixed(4)} 还需约 ${needPct.toFixed(2)}%。`;
  }
  if (stop > 0 && current > 0 && current <= stop) {
    return "触发止损价，先核对数据，再手动卖出/赎回。";
  }
  if ((item.type || "").includes("场外")) {
    return "场外基金：按最新净值和赎回规则跟踪。";
  }
  return "按持仓规则继续观察。";
}

function renderPositionSnapshot() {
  const container = document.getElementById("position-snapshot");
  const badge = document.getElementById("position-count-badge");
  const positions = state.portfolio || [];
  badge.textContent = `${positions.length} 只`;
  container.innerHTML = "";

  if (!positions.length) {
    container.innerHTML = '<div class="empty">暂无持仓。当前应保持空仓，只观察候选池。</div>';
    return;
  }

  positions.forEach((item) => {
    const value = positionMarketValue(item);
    const costValue = positionCostValue(item);
    const pnl = value - costValue;
    const crossCheckText = item.navCrossCheckStatus
      ? ` · 官网核对 ${item.navCrossCheckStatus === "verified" ? "一致" : "有差异"}`
      : "";
    const div = document.createElement("article");
    div.className = "snapshot-item";
    div.innerHTML = `
      <header>
        <strong>${item.code || "-"} ${item.name || "-"}</strong>
        <span class="${pnl >= 0 ? "positive" : "negative"}">${yuan(pnl)}</span>
      </header>
      <div class="snapshot-meta">${item.type || "未分类"} · 市值 ${yuan(value)} · 当前价 ${number(item.current).toFixed(4)} · 成本 ${number(item.cost).toFixed(4)} · 净值日 ${item.navDate || "-"}${crossCheckText}</div>
      <div class="action-text">${positionAction(item)}</div>
    `;
    container.appendChild(div);
  });
}

function renderFiveAnswers() {
  const container = document.getElementById("five-answer-list");
  const badge = document.getElementById("five-answer-badge");
  if (!container || !badge) return;

  const answers = buildFiveAnswers();
  const unresolved = answers.filter((item) => item.level !== "ok").length;
  badge.textContent = unresolved ? `${unresolved} 项需积累` : "可回答";
  badge.className = `badge ${unresolved ? "warn" : "ok"}`;
  container.innerHTML = answers.map((item, index) => `
    <article class="check-item">
      <header>
        <strong>${escapeHtml(`${index + 1}. ${item.title}`)}</strong>
        <span class="badge ${item.level}">${escapeHtml(item.status)}</span>
      </header>
      <div class="check-meta">${escapeHtml(item.meta)}</div>
    </article>
  `).join("");
}

function formalStartGate() {
  const portfolio = state.portfolio || [];
  const watchlist = state.watchlist || [];
  const latestMarket = state.marketUpdates?.[0];
  const marketAge = daysSince(latestMarket?.time);
  const fundNavAge = daysSince(state.fundNavSync?.time);
  const crossCheckAge = daysSince(state.fundNavCrossCheck?.time);
  const sourceAge = daysSince(state.sourceWhitelistSync?.time);
  const newsAge = daysSince(state.newsSync?.time);
  const financialAge = daysSince(state.financialEventSync?.time);
  const fundPositions = portfolio.filter((item) =>
    String(item.type || "").includes("场外") || String(item.type || "").includes("联接")
  );
  const typedPositions = portfolio.filter((item) =>
    item.type &&
    item.code &&
    item.name &&
    number(item.cost) > 0 &&
    number(item.current) > 0 &&
    number(item.quantity) > 0
  );
  const explainedCandidates = watchlist.filter((item) =>
    item.code &&
    item.grade &&
    item.totalScore !== undefined &&
    Array.isArray(item.scoreReasons) &&
    Array.isArray(item.riskFlags)
  );
  const actionableCandidates = explainedCandidates.filter((item) =>
    ["A", "B"].includes(item.grade) &&
    !["剔除", "数据缺失"].includes(item.status) &&
    number(item.price || item.close) > 0
  );
  const preview = buildSignalSnapshot("start-gate");
  const quality = preview.dataQuality || {};
  const email = state.latestEmailReminder || {};
  const crosscheck = state.fundNavCrossCheck || {};
  const items = [
    {
      title: "本地服务",
      ok: !isFileMode,
      status: isFileMode ? "文件模式" : "服务模式",
      meta: isFileMode ? "请使用 http://localhost:4173，文件模式不能正式记录。" : "当前可以保存和调用本地接口。"
    },
    {
      title: "真实持仓台账",
      ok: portfolio.length > 0 && typedPositions.length === portfolio.length,
      status: `${typedPositions.length}/${portfolio.length} 完整`,
      meta: "每只持仓都要有代码、名称、类型、成本、当前价和份额。"
    },
    {
      title: "权威信息源白名单",
      ok: (state.sourceWhitelist || []).length > 0 && (sourceAge == null || sourceAge <= 30),
      status: `${(state.sourceWhitelist || []).length} 个来源`,
      meta: "白名单为空或超过 30 天未同步时，不进入正式样本。"
    },
    {
      title: "场内 ETF 行情",
      ok: latestMarket && (marketAge == null || marketAge <= 3) && watchlist.length > 0,
      status: latestMarket ? `${latestMarket.count || watchlist.length} 只` : "未更新",
      meta: "ETF 行情必须在 3 天内更新。"
    },
    {
      title: "场外基金净值",
      ok: !fundPositions.length || (state.fundNavSync && (fundNavAge == null || fundNavAge <= 3)),
      status: state.fundNavSync ? `${state.fundNavSync.count || 0} 只` : "未同步",
      meta: "有场外/联接基金持仓时，净值必须在 3 天内同步。"
    },
    {
      title: "官网净值核对",
      ok: !fundPositions.length || (
        state.fundNavCrossCheck &&
        crosscheck.mismatchCount === 0 &&
        !(crosscheck.errors || []).length &&
        (crossCheckAge == null || crossCheckAge <= 3)
      ),
      status: state.fundNavCrossCheck ? `一致 ${crosscheck.verifiedCount || 0}/${crosscheck.count || 0}` : "未核对",
      meta: "官网核对不能有差异或错误。"
    },
    {
      title: "ETF 候选解释",
      ok: explainedCandidates.length > 0 && actionableCandidates.length > 0,
      status: `可解释 ${explainedCandidates.length} 只，A/B ${actionableCandidates.length} 只`,
      meta: "至少要有 1 只 A/B 级可观察 ETF，并且每只候选都有理由和风险。"
    },
    {
      title: "新闻事件",
      ok: (state.newsEvents || []).length > 0 && (newsAge == null || newsAge <= 14),
      status: `${(state.newsEvents || []).length} 条`,
      meta: "权威新闻事件为空或超过 14 天未同步时，只能预演。"
    },
    {
      title: "财报事件",
      ok: (state.financialEvents || []).length > 0 && (financialAge == null || financialAge <= 14),
      status: `${(state.financialEvents || []).length} 条`,
      meta: "金融巨头财报事件为空或超过 14 天未同步时，只能预演。"
    },
    {
      title: "邮件五个问题",
      ok: (email.fiveAnswers || []).length === 5 && String(email.body || "").includes("## 五个问题"),
      status: `${(email.fiveAnswers || []).length}/5`,
      meta: "每日邮件必须能回答 5 个核心问题。"
    },
    {
      title: "今日信号预检",
      ok: Boolean(quality.ok),
      status: quality.ok ? "通过" : "阻塞",
      meta: quality.ok ? "当前建议可生成预检快照。" : `阻塞：${(quality.blockers || []).join("；")}`
    }
  ];

  const blockers = items.filter((item) => !item.ok);
  return {
    ready: blockers.length === 0,
    okCount: items.length - blockers.length,
    total: items.length,
    items,
    blockers
  };
}

function formalExperimentStatus() {
  const experiment = state.formalExperiment || {};
  const events = state.formalExperimentEvents || [];
  const signals = state.signalHistory || [];
  const startedAt = experiment.startedAt || "";
  const days = startedAt ? daysSince(startedAt) : null;
  const weeks = days == null ? 0 : Math.floor(days / 7);
  const startSignalCount = number(experiment.startSignalCount);
  const signalsSinceStart = Math.max(0, signals.length - startSignalCount);
  const active = state.settings.formalSignalRecording && experiment.status === "active";

  if (!startedAt) {
    return {
      active: false,
      status: "预演模式",
      badge: "未开始",
      meta: "正式实验尚未开始；当前只做预检、邮件提醒和数据健康检查。",
      days: 0,
      weeks: 0,
      startedAt: "",
      signalsSinceStart,
      eventCount: events.length
    };
  }

  return {
    active,
    status: active ? "正式记录中" : "已暂停",
    badge: active ? "记录中" : "暂停",
    meta: `起点 ${startedAt}；已过 ${days ?? 0} 天，约 ${weeks} 周；本轮样本 ${signalsSinceStart}/30 条；事件日志 ${events.length} 条。`,
    days: days ?? 0,
    weeks,
    startedAt,
    signalsSinceStart,
    eventCount: events.length
  };
}

function renderFormalStartGate() {
  const container = document.getElementById("formal-start-list");
  const badge = document.getElementById("formal-start-badge");
  const button = document.getElementById("formal-start-toggle");
  if (!container || !badge) return;

  const gate = formalStartGate();
  const recording = Boolean(state.settings.formalSignalRecording);
  const experimentStatus = formalExperimentStatus();
  badge.textContent = gate.ready ? recording ? "已开启" : "可开启" : `${gate.blockers.length} 项未过`;
  badge.className = `badge ${gate.ready && recording ? "ok" : gate.ready ? "warn" : "warn"}`;
  if (button) {
    button.textContent = recording ? "暂停正式记录" : "开启正式记录";
    button.className = recording ? "danger-button" : "primary-button";
    button.disabled = isFileMode || (!recording && !gate.ready);
    button.title = recording
      ? "暂停后只预检，不写入正式样本"
      : gate.ready
        ? "开启后后续建议会计入 30 条正式样本"
        : "开始检查未通过，暂不能开启正式记录";
  }
  const intro = gate.ready
    ? recording
      ? "正式样本记录已开启；后续建议会进入 30 条样本统计。"
      : "开始条件已通过；确认要开始统计时，可以点击“开启正式记录”。"
    : "暂不建议开启正式样本记录；未通过项目会让样本不干净。";

  container.innerHTML = `
    <article class="check-item">
      <header>
        <strong>开始状态</strong>
        <span class="badge ${gate.ready ? "ok" : "warn"}">${gate.okCount}/${gate.total}</span>
      </header>
      <div class="check-meta">${escapeHtml(intro)}</div>
    </article>
    <article class="check-item">
      <header>
        <strong>正式实验状态</strong>
        <span class="badge ${experimentStatus.active ? "ok" : "warn"}">${escapeHtml(experimentStatus.badge)}</span>
      </header>
      <div class="check-meta">${escapeHtml(experimentStatus.meta)}</div>
    </article>
    ${gate.items.map((item) => `
      <article class="check-item">
        <header>
          <strong>${escapeHtml(item.title)}</strong>
          <span class="badge ${item.ok ? "ok" : "warn"}">${escapeHtml(item.status)}</span>
        </header>
        <div class="check-meta">${escapeHtml(item.meta)}</div>
      </article>
    `).join("")}
  `;
}

function renderDataHealth() {
  const container = document.getElementById("data-health-list");
  const badge = document.getElementById("data-health-badge");
  const latestMarket = state.marketUpdates && state.marketUpdates[0];
  const marketAge = daysSince(latestMarket?.time);
  const fundNavAge = daysSince(state.fundNavSync?.time);
  const crossCheckAge = daysSince(state.fundNavCrossCheck?.time);
  const newsAge = daysSince(state.newsSync?.time);
  const financialAge = daysSince(state.financialEventSync?.time);
  const efundsAge = daysSince(state.efundsSync?.time);
  const sourceAge = daysSince(state.sourceWhitelistSync?.time);
  const dailyRunAge = daysSince(state.dailyExperimentRun?.time);
  const fundPositions = (state.portfolio || []).filter((item) => (item.type || "").includes("场外") || (item.type || "").includes("联接"));
  const execution = executionSummary();
  const delivery = deliverySummary();
  const formalRecording = Boolean(state.settings.formalSignalRecording);
  const checks = [
    {
      name: "本地服务",
      ok: !isFileMode,
      meta: isFileMode ? "当前是文件模式，按钮不会真正同步。" : "服务模式正常，按钮可以调用本地接口。"
    },
    {
      name: "持仓数据",
      ok: Array.isArray(state.portfolio),
      meta: `已记录 ${(state.portfolio || []).length} 只持仓。`
    },
    {
      name: "场内 ETF 行情",
      ok: latestMarket && (marketAge == null || marketAge <= 3),
      meta: latestMarket ? `最近更新：${latestMarket.time}，数量：${latestMarket.count}` : "尚未更新。"
    },
    {
      name: "场外基金净值",
      ok: !fundPositions.length || (state.fundNavSync && (fundNavAge == null || fundNavAge <= 3)),
      meta: fundPositions.length
        ? state.fundNavSync
          ? `最近更新：${state.fundNavSync.time}，数量：${state.fundNavSync.count}`
          : `有 ${fundPositions.length} 只场外/联接基金，尚未同步净值。`
        : "暂无场外基金持仓。"
    },
    {
      name: "易方达官网核对",
      ok: !fundPositions.length || (
        state.fundNavCrossCheck &&
        state.fundNavCrossCheck.mismatchCount === 0 &&
        (!state.fundNavCrossCheck.errors || state.fundNavCrossCheck.errors.length === 0) &&
        (crossCheckAge == null || crossCheckAge <= 3)
      ),
      meta: fundPositions.length
        ? state.fundNavCrossCheck
          ? `最近核对：${state.fundNavCrossCheck.time}，一致 ${state.fundNavCrossCheck.verifiedCount || 0}/${state.fundNavCrossCheck.count || 0}，差异 ${state.fundNavCrossCheck.mismatchCount || 0}`
          : "尚未用易方达官网核对净值。"
        : "暂无易方达场外/联接基金持仓。"
    },
    {
      name: "易方达产品库",
      ok: (state.efundsEtfs || []).length > 0 && (efundsAge == null || efundsAge <= 14),
      meta: (state.efundsEtfs || []).length ? `已同步 ${(state.efundsEtfs || []).length} 只，时间：${state.efundsSync?.time || "-"}` : "尚未同步。"
    },
    {
      name: "信息源白名单",
      ok: (state.sourceWhitelist || []).length > 0 && (sourceAge == null || sourceAge <= 30),
      meta: (state.sourceWhitelist || []).length
        ? `已收录 ${(state.sourceWhitelist || []).length} 个来源，时间：${state.sourceWhitelistSync?.time || "-"}。`
        : "尚未同步权威信息源白名单。"
    },
    {
      name: "新闻事件",
      ok: (state.newsEvents || []).length > 0 && (newsAge == null || newsAge <= 14),
      meta: (state.newsEvents || []).length ? `已记录 ${(state.newsEvents || []).length} 条，时间：${state.newsSync?.time || "-"}` : "尚未同步。"
    },
    {
      name: "财报事件",
      ok: (state.financialEvents || []).length > 0 && (financialAge == null || financialAge <= 14),
      meta: (state.financialEvents || []).length
        ? `已记录 ${(state.financialEvents || []).length} 条，时间：${state.financialEventSync?.time || "-"}。`
        : "尚未同步金融巨头财报事件。"
    },
    {
      name: "手动执行记录",
      ok: execution.totalSignals === 0 || execution.pending === 0,
      meta: execution.totalSignals
        ? `已记录 ${execution.recorded}/${execution.totalSignals} 条信号的执行结果；已执行 ${execution.executed}，未执行 ${execution.skipped}，延后 ${execution.delayed}。`
        : "暂无信号样本，生成信号后再记录是否手动执行。"
    },
    {
      name: "每日实验运行",
      ok: state.dailyExperimentRun && state.dailyExperimentRun.ok && (dailyRunAge == null || dailyRunAge <= 3),
      meta: state.dailyExperimentRun
        ? `最近运行：${state.dailyExperimentRun.time || "-"}；结果：${state.dailyExperimentRun.ok ? "成功" : "失败"}；信号：${state.dailyExperimentRun.summary?.recordStatus || "-"}；模式：${state.dailyExperimentRun.summary?.signalMode === "record" ? "正式记录" : "预检"}。`
        : "尚未运行一键实验流程。"
    },
    {
      name: "正式样本记录",
      ok: formalRecording || (state.signalHistory || []).length === 0,
      meta: formalRecording
        ? "已开启。每日运行和生成评分会写入正式信号样本。"
        : "未开启。每日运行和生成评分只做预检与邮件提醒，不写入正式信号样本。"
    },
    {
      name: "提醒发送状态",
      ok: delivery.pending === 0,
      meta: delivery.items.map((item) => `${item.title}：${item.status}`).join("；")
    }
  ];

  const failed = checks.filter((item) => !item.ok);
  badge.textContent = failed.length ? `${failed.length} 项待处理` : "正常";
  badge.className = `badge ${failed.length ? "warn" : "ok"}`;
  container.innerHTML = checks.map((item) => `
    <article class="check-item">
      <header>
        <strong>${item.name}</strong>
        <span class="badge ${item.ok ? "ok" : "warn"}">${item.ok ? "正常" : "待处理"}</span>
      </header>
      <div class="check-meta">${item.meta}</div>
    </article>
  `).join("");
}

function renderGoalAcceptance() {
  const container = document.getElementById("goal-acceptance-list");
  const badge = document.getElementById("goal-acceptance-badge");
  if (!container || !badge) return;

  if (state.goalAudit && Array.isArray(state.goalAudit.steps)) {
    const audit = state.goalAudit;
    const overall = audit.overall || {};
    const okCount = Number(overall.okCount || audit.steps.filter((item) => item.ok).length);
    const total = Number(overall.total || audit.steps.length);
    const level = overall.level || (okCount === total ? "ok" : "warn");
    badge.textContent = `${okCount}/${total} 就绪`;
    badge.className = `badge ${level}`;
    const questions = (audit.fiveQuestions || []).map((item) => `
      <article class="check-item">
        <header>
          <strong>${escapeHtml(item.question)}</strong>
          <span class="badge ${item.level || "warn"}">${item.level === "ok" ? "已回答" : "待验证"}</span>
        </header>
        <div class="check-meta">${escapeHtml(item.answer || "-")}</div>
      </article>
    `).join("");
    container.innerHTML = `
      <article class="check-item">
        <header>
          <strong>审计结论</strong>
          <span class="badge ${level}">${escapeHtml(overall.phase || "待检查")}</span>
        </header>
        <div class="check-meta">
          ${escapeHtml(audit.conclusion || "")}
          最近审计：${escapeHtml(audit.time || "-")}；正式样本 ${Number(overall.signalCount || 0)}/${Number(overall.requiredSignals || 30)} 条；
          记录周数 ${Number(overall.recordedWeeks || 0)}/${Number(overall.requiredWeeks || 8)}。
        </div>
      </article>
      ${audit.steps.map((item) => {
        const itemLevel = item.level || (item.ok ? "ok" : "warn");
        return `
          <article class="check-item">
            <header>
              <strong>${item.step}. ${escapeHtml(item.title)}</strong>
              <span class="badge ${itemLevel}">${escapeHtml(item.status || (item.ok ? "正常" : "待处理"))}</span>
            </header>
            <div class="check-meta">${escapeHtml(item.evidence || "")}</div>
            <div class="action-text">${escapeHtml(item.nextAction || "")}</div>
          </article>
        `;
      }).join("")}
      <article class="check-item">
        <header>
          <strong>五个问题审计</strong>
          <span class="badge ${audit.fiveQuestions?.every((item) => item.level === "ok") ? "ok" : "warn"}">${audit.fiveQuestions?.filter((item) => item.level === "ok").length || 0}/5</span>
        </header>
        <div class="check-meta">这里检查系统是否每天能清楚回答最终目标里的 5 个问题。</div>
      </article>
      ${questions}
    `;
    return;
  }

  const portfolio = state.portfolio || [];
  const watchlist = state.watchlist || [];
  const signals = state.signalHistory || [];
  const latestMarket = state.marketUpdates && state.marketUpdates[0];
  const marketAge = daysSince(latestMarket?.time);
  const fundNavAge = daysSince(state.fundNavSync?.time);
  const crossCheckAge = daysSince(state.fundNavCrossCheck?.time);
  const newsAge = daysSince(state.newsSync?.time);
  const financialAge = daysSince(state.financialEventSync?.time);
  const sourceAge = daysSince(state.sourceWhitelistSync?.time);
  const plan = buildOperationPlan();
  const dailyDelivery = latestDeliveryState("daily");
  const explainedCandidates = watchlist.filter((item) =>
    item.code &&
    item.grade &&
    item.totalScore !== undefined &&
    Array.isArray(item.scoreReasons) &&
    Array.isArray(item.riskFlags)
  );
  const typedPositions = portfolio.filter((item) =>
    item.type &&
    number(item.cost) > 0 &&
    number(item.current) > 0 &&
    number(item.quantity) > 0
  );
  const sourceOk = (state.sourceWhitelist || []).length > 0 && (sourceAge == null || sourceAge <= 30);
  const marketOk = latestMarket && (marketAge == null || marketAge <= 3);
  const fundOk = !portfolio.length || (
    state.fundNavSync &&
    (fundNavAge == null || fundNavAge <= 3) &&
    state.fundNavCrossCheck &&
    state.fundNavCrossCheck.mismatchCount === 0 &&
    (crossCheckAge == null || crossCheckAge <= 3)
  );
  const newsOk = (state.newsEvents || []).length > 0 && (newsAge == null || newsAge <= 14);
  const financialOk = (state.financialEvents || []).length > 0 && (financialAge == null || financialAge <= 14);
  const weeks = recordedWeekCount(signals);
  const validation = state.signalValidation;
  const windowStatus = validationWindowStatus(validation || {});
  const execution = executionSummary();
  const gate = credibilityGate(signals, validation || {}, execution);
  const validationReady = Boolean(validation) && gate.canEvaluate;
  const formalRecording = Boolean(state.settings.formalSignalRecording);

  const items = [
    {
      step: 1,
      title: "稳定打开软件",
      level: isFileMode ? "warn" : "ok",
      status: isFileMode ? "待处理" : "正常",
      meta: isFileMode
        ? "当前是 file:// 文件模式，按钮不能真正同步。请使用 http://localhost:4173。"
        : "当前是本地服务模式，页面可以读取和保存状态。"
    },
    {
      step: 2,
      title: "真实持仓台账",
      level: portfolio.length && typedPositions.length === portfolio.length ? "ok" : "warn",
      status: portfolio.length ? "已记录" : "待录入",
      meta: `已记录 ${portfolio.length} 只持仓；类型、成本、当前价、份额完整 ${typedPositions.length}/${portfolio.length}。`
    },
    {
      step: 3,
      title: "权威信息源白名单",
      level: sourceOk ? "ok" : "warn",
      status: sourceOk ? "已接入" : "待同步",
      meta: (state.sourceWhitelist || []).length
        ? `白名单 ${(state.sourceWhitelist || []).length} 个来源，黑名单规则 ${(state.sourceBlacklistRules || []).length} 条。`
        : "尚未同步权威信息源，新闻不应进入策略判断。"
    },
    {
      step: 4,
      title: "行情、净值、基金数据同步",
      level: marketOk && fundOk ? "ok" : "warn",
      status: marketOk && fundOk ? "正常" : "待检查",
      meta: `ETF 行情 ${latestMarket ? `${latestMarket.count} 只，${latestMarket.time}` : "未更新"}；基金净值 ${state.fundNavSync ? `${state.fundNavSync.count} 只` : "未同步"}；官网核对 ${state.fundNavCrossCheck ? `一致 ${state.fundNavCrossCheck.verifiedCount || 0}/${state.fundNavCrossCheck.count || 0}` : "未核对"}。`
    },
    {
      step: 5,
      title: "ETF 候选池评分",
      level: explainedCandidates.length ? "ok" : "warn",
      status: explainedCandidates.length ? "可解释" : "待补充",
      meta: `候选 ETF ${watchlist.length} 只；已带分数、等级、正向理由和风险提示 ${explainedCandidates.length} 只。`
    },
    {
      step: 6,
      title: "每日操作建议",
      level: plan.items.length ? "ok" : "warn",
      status: plan.label || "待计算",
      meta: `今日操作计划 ${plan.items.length} 项；当前结论：${plan.label || "-"}。`
    },
    {
      step: 7,
      title: "邮件提醒",
      level: state.latestEmailReminder?.body && state.settings?.email ? (dailyDelivery.ok ? "ok" : "warn") : "warn",
      status: state.latestEmailReminder?.body ? dailyDelivery.status : "待生成",
      meta: state.latestEmailReminder?.body
        ? `收件人 ${state.settings?.email || "-"}；${dailyDelivery.meta}`
        : "尚未生成每日提醒邮件。"
    },
    {
      step: 8,
      title: "新闻和财报事件验证",
      level: newsOk && financialOk ? "ok" : "warn",
      status: newsOk && financialOk ? "已接入" : newsOk ? "缺财报" : financialOk ? "缺新闻" : "待接入",
      meta: `新闻事件 ${(state.newsEvents || []).length} 条，最近 ${state.newsSync?.time || "-"}；财报事件 ${(state.financialEvents || []).length} 条，最近 ${state.financialEventSync?.time || "-"}。`
    },
    {
      step: 9,
      title: "保存每一次建议",
      level: formalRecording && signals.length ? "ok" : "warn",
      status: formalRecording ? (signals.length ? "已开始" : "待积累") : "预演模式",
      meta: `正式样本记录${formalRecording ? "已开启" : "未开启"}；正式信号 ${signals.length}/30 条；同一交易日同一自动建议会防重复保存。`
    },
    {
      step: 10,
      title: "5/20/60 日可信度验证",
      level: validationReady ? "ok" : "warn",
      status: validationReady ? "可评估" : "样本不足",
      meta: `信号 ${signals.length}/30 条，记录 ${weeks}/8 周；执行待补 ${execution.pending} 条；5日 ${windowStatus.done.day5}/30，20日 ${windowStatus.done.day20}/30，60日 ${windowStatus.done.day60}/30。未达标前不能说预测可信。`
    }
  ];

  const okCount = items.filter((item) => item.level === "ok").length;
  badge.textContent = `${okCount}/${items.length} 就绪`;
  badge.className = `badge ${okCount === items.length ? "ok" : "warn"}`;
  container.innerHTML = items.map((item) => `
    <article class="check-item">
      <header>
        <strong>${item.step}. ${escapeHtml(item.title)}</strong>
        <span class="badge ${item.level}">${escapeHtml(item.status)}</span>
      </header>
      <div class="check-meta">${escapeHtml(item.meta)}</div>
    </article>
  `).join("");
}

function progressWidth(current, required) {
  if (!required || required <= 0) return 0;
  return Math.max(0, Math.min(100, number(current) / number(required) * 100));
}

function parseLocalDate(value) {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isoLocalDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addWeekdaysLocal(startDate, days) {
  const current = new Date(startDate.getTime());
  let remaining = Math.max(0, Number(days || 0));
  while (remaining > 0) {
    current.setDate(current.getDate() + 1);
    if (current.getDay() !== 0 && current.getDay() !== 6) remaining -= 1;
  }
  return current;
}

function estimateCredibilityMilestones(signals = [], requiredSignals = 30, requiredWeeks = 8) {
  const dates = signals
    .map((signal) => parseLocalDate(signal.date || signal.time))
    .filter(Boolean)
    .sort((a, b) => a - b);
  const todayDate = parseLocalDate(today()) || new Date();
  const anchor = dates[dates.length - 1] || todayDate;
  const firstSignal = dates[0] || null;
  const missingSignals = Math.max(0, Number(requiredSignals || 30) - signals.length);
  const estimated30thSignal = addWeekdaysLocal(anchor, missingSignals);
  let estimated8thWeek;
  if (firstSignal) {
    estimated8thWeek = new Date(firstSignal.getTime());
    const mondayOffset = (estimated8thWeek.getDay() + 6) % 7;
    estimated8thWeek.setDate(estimated8thWeek.getDate() - mondayOffset + (Number(requiredWeeks || 8) - 1) * 7);
  } else {
    estimated8thWeek = new Date(todayDate.getTime());
    estimated8thWeek.setDate(estimated8thWeek.getDate() + Number(requiredWeeks || 8) * 7);
  }
  const estimated30thSignalDay60 = addWeekdaysLocal(estimated30thSignal, 60);
  const earliestCredible = new Date(Math.max(
    estimated30thSignal.getTime(),
    estimated8thWeek.getTime(),
    estimated30thSignalDay60.getTime()
  ));
  return {
    rule: "weekday_only_conservative",
    missingSignals,
    estimated30thSignalDate: isoLocalDate(estimated30thSignal),
    estimated8thWeekDate: isoLocalDate(estimated8thWeek),
    estimated30thSignalDay60Date: isoLocalDate(estimated30thSignalDay60),
    earliestCredibleEvaluationDate: isoLocalDate(earliestCredible),
    note: "按每个交易日最多新增 1 条正式信号估算；节假日未扣除，因此只是保守排期参考，不是交易承诺。"
  };
}

function renderStepTracker() {
  const container = document.getElementById("step-tracker-list");
  const badge = document.getElementById("step-tracker-badge");
  if (!container || !badge) return;

  const signals = state.signalHistory || [];
  const execution = executionSummary();
  const validation = state.signalValidation || {};
  const guard = state.sampleGuard || {};
  const overall = state.goalAudit?.overall || {};
  const formalRecording = Boolean(state.settings.formalSignalRecording);
  const requiredSignals = Number(overall.requiredSignals || guard.requiredSignals || 30);
  const requiredWeeks = Number(overall.requiredWeeks || guard.requiredWeeks || 8);
  const weeks = recordedWeekCount(signals);
  const doneCheckpoints = Number(validation.doneCheckpoints || 0);
  const pendingCheckpoints = Number(validation.pendingCheckpoints || 0);
  const windowStatus = validationWindowStatus(validation, requiredSignals);
  const gate = credibilityGate(signals, validation, execution, requiredSignals, requiredWeeks);
  const dueCheckpoints = guard.dueCheckpoints || [];
  const nextCheckpoints = guard.nextCheckpoints || [];
  const canClaimCredible = gate.canEvaluate;
  const nextCheckpoint = dueCheckpoints[0] || nextCheckpoints[0] || null;
  const checkpointText = dueCheckpoints.length
    ? `${dueCheckpoints.length} 个回看窗口已到期，先运行信号回看。`
    : nextCheckpoint
      ? `下一次是 ${nextCheckpoint.date || "-"} 的 ${checkpointWindowText(nextCheckpoint)}回看，还差约 ${nextCheckpoint.remainingTradingDays || 0} 个交易日${checkpointEstimateText(nextCheckpoint) ? `，${checkpointEstimateText(nextCheckpoint)}` : ""}。`
      : "还没有可排期的回看窗口。";

  const rows = [
    {
      title: "第9步：正式保存建议",
      ok: formalRecording && signals.length > 0,
      level: formalRecording ? "ok" : "warn",
      status: formalRecording ? "已开启" : "未开启",
      meta: `当前正式信号 ${signals.length}/${requiredSignals} 条；每天收盘后只保留一条不重复信号。`,
      action: formalRecording ? "继续每日运行，失败样本也保留。" : "先通过正式实验开始检查，再开启正式样本记录。"
    },
    {
      title: "第9步：补执行结果",
      ok: signals.length > 0 && execution.pending === 0,
      level: execution.pending ? "warn" : "ok",
      status: `${execution.recorded}/${execution.totalSignals}`,
      meta: `未补执行 ${execution.pending} 条；执行覆盖率 ${maybePct(execution.coveragePct)}。`,
      action: execution.pending ? "去信号页选择已执行、未执行或延后，并写原因。" : "执行记录完整，后续继续保持。"
    },
    {
      title: "第10步：样本数量",
      ok: signals.length >= requiredSignals,
      level: signals.length >= requiredSignals ? "ok" : "warn",
      status: `${signals.length}/${requiredSignals}`,
      meta: `还差 ${Math.max(0, requiredSignals - signals.length)} 条正式信号。`,
      action: "样本不足时，只能复盘流程，不能宣称策略准确。"
    },
    {
      title: "第10步：记录周期",
      ok: weeks >= requiredWeeks,
      level: weeks >= requiredWeeks ? "ok" : "warn",
      status: `${weeks}/${requiredWeeks} 周`,
      meta: `还差 ${Math.max(0, requiredWeeks - weeks)} 周；目标是连续 8-12 周。`,
      action: "保持每天同一套规则，不临时改口径。"
    },
    {
      title: "第10步：5/20/60日回看",
      ok: windowStatus.complete && dueCheckpoints.length === 0,
      level: dueCheckpoints.length ? "warn" : windowStatus.complete ? "ok" : "warn",
      status: `完成 ${doneCheckpoints} 个`,
      meta: `5日 ${windowStatus.done.day5}/${windowStatus.required}，20日 ${windowStatus.done.day20}/${windowStatus.required}，60日 ${windowStatus.done.day60}/${windowStatus.required}；待形成结果 ${pendingCheckpoints || nextCheckpoints.length} 个；${checkpointText}`,
      action: dueCheckpoints.length ? "先点“回看信号结果”。" : "未到期前不要提前判断准不准。"
    },
    {
      title: "第10步：可信结论",
      ok: canClaimCredible,
      level: canClaimCredible ? "ok" : "warn",
      status: canClaimCredible ? "可初评" : "不可下结论",
      meta: `平均超额 ${maybePct(validation.avgExcessPct)}，最差最大回撤 ${maybePct(validation.worstMaxDrawdownPct)}。`,
      action: canClaimCredible ? "可以写阶段复盘，但仍保持小资金验证。" : "未达 30 条、8 周、执行完整、5/20/60 三类回看各满 30 个结果前，不扩大资金。"
    }
  ];

  const unfinishedRows = rows.filter((item) => !item.ok);
  const unfinished = unfinishedRows.length;
  const unfinishedSummary = unfinishedRows
    .map((item) => item.title.replace(/^第\d+步：/, ""))
    .join("、");
  badge.textContent = canClaimCredible ? "可初评" : `还差 ${unfinished} 项`;
  badge.className = `badge ${canClaimCredible ? "ok" : "warn"}`;

  const rowHtml = rows.map((item) => `
    <article class="check-item">
      <header>
        <strong>${escapeHtml(item.title)}</strong>
        <span class="badge ${item.level}">${escapeHtml(item.status)}</span>
      </header>
      <div class="check-meta">${escapeHtml(item.meta)}</div>
      <div class="action-text">${escapeHtml(item.action)}</div>
    </article>
  `).join("");

  container.innerHTML = `
    <div class="step-tracker-summary">
      <strong>${canClaimCredible ? "第10步已达到初评门槛。" : `现在还差 ${unfinished} 个子项，不能说策略可信。`}</strong>
      <span>第9步已经进入正式记录，但仍有 ${execution.pending} 条执行结果待补；第10步还需要信号、时间和回看结果一起满足。</span>
      ${unfinished ? `<span>当前缺口：${escapeHtml(unfinishedSummary)}。</span>` : ""}
      <div class="step-meter">
        <header><span>正式信号</span><span>${signals.length}/${requiredSignals}</span></header>
        <div class="progress-track"><div class="progress-fill" style="width: ${progressWidth(signals.length, requiredSignals)}%"></div></div>
      </div>
      <div class="step-meter">
        <header><span>记录周期</span><span>${weeks}/${requiredWeeks} 周</span></header>
        <div class="progress-track"><div class="progress-fill" style="width: ${progressWidth(weeks, requiredWeeks)}%"></div></div>
      </div>
      <span>${unfinished} 个子项还没满足；这些是实验门槛，不是交易失败。</span>
    </div>
    ${rowHtml}
  `;
}

function fallbackNextActionReport() {
  const signals = state.signalHistory || [];
  const execution = executionSummary();
  const validation = state.signalValidation || {};
  const guard = state.sampleGuard || {};
  const dueCheckpoints = guard.dueCheckpoints || [];
  const nextCheckpoints = guard.nextCheckpoints || [];
  const gate = credibilityGate(signals, validation, execution);
  const actions = [];

  if (execution.pending > 0) {
    actions.push({
      priority: "high",
      title: "先补执行记录",
      detail: `还有 ${execution.pending} 条信号没记录你是否执行；没下单就标记为已观察。`,
      page: "signals",
      due: "现在"
    });
  }
  if (dueCheckpoints.length) {
    const item = dueCheckpoints[0];
    actions.push({
      priority: "high",
      title: "运行到期回看",
      detail: `${item.date || "-"} 的 ${checkpointWindowText(item)}结果已到期，点击“回看信号结果”。`,
      page: "signals",
      due: "现在"
    });
  }
  if (signals.length < 30) {
    actions.push({
      priority: "medium",
      title: "继续每日收盘运行",
      detail: `当前 ${signals.length}/30 条正式信号，失败或空仓样本也要保留。`,
      page: "dashboard",
      due: "每个交易日收盘后"
    });
  }
  if (nextCheckpoints.length) {
    const item = nextCheckpoints[0];
    actions.push({
      priority: "medium",
      title: "等待下一次回看",
      detail: `${item.date || "-"} 的 ${checkpointWindowText(item)}结果还差约 ${item.remainingTradingDays || 0} 个交易日${checkpointEstimateText(item) ? `，${checkpointEstimateText(item)}` : ""}。`,
      page: "signals",
      due: item.estimatedReviewDate || ""
    });
  }
  if (gate.canEvaluate) {
    actions.unshift({
      priority: "high",
      title: "可以写阶段复盘",
      detail: "样本、周期、执行和 5/20/60 回看都达到最低门槛，可以进入初步评估。",
      page: "review",
      due: "现在"
    });
  }

  const blockers = [];
  if (signals.length < 30) blockers.push(`正式信号不足，还差 ${30 - signals.length} 条`);
  if (gate.weeks < 8) blockers.push(`记录周期不足，还差 ${8 - gate.weeks} 周`);
  if (execution.pending > 0) blockers.push(`执行记录待补 ${execution.pending} 条`);
  if (!gate.windowStatus.complete) blockers.push("5/20/60 三类回看还没有各满 30 个结果");

  return {
    time: "",
    phase: gate.canEvaluate ? "可以初步评估" : "正式样本积累中",
    level: gate.canEvaluate ? "ok" : "warn",
    canClaimCredible: gate.canEvaluate,
    milestones: estimateCredibilityMilestones(signals, 30, 8),
    primaryAction: actions[0] || {
      priority: "medium",
      title: "等待下一批真实样本",
      detail: "没有新的执行待办或到期回看，继续按每日流程积累。",
      page: "dashboard",
      due: ""
    },
    actions,
    blockers
  };
}

function renderNextActionReport() {
  const container = document.getElementById("next-action-list");
  const badge = document.getElementById("next-action-badge");
  if (!container || !badge) return;

  const fallbackReport = fallbackNextActionReport();
  const savedReport = state.latestNextActionReport;
  const execution = executionSummary();
  const savedCurrent = savedReport?.current || {};
  const savedIsFresh = savedReport &&
    Number(savedCurrent.signalCount || 0) === (state.signalHistory || []).length &&
    Number(savedCurrent.executionPending || 0) === execution.pending;
  const report = savedIsFresh ? savedReport : fallbackReport;
  const primary = report.primaryAction || {};
  const actions = report.actions || [];
  const blockers = report.blockers || [];
  const milestones = report.milestones || estimateCredibilityMilestones(state.signalHistory || [], 30, 8);
  const level = report.canClaimCredible ? "ok" : primary.priority === "high" ? "warn" : (report.level || "warn");

  badge.textContent = primary.title || "待生成";
  badge.className = `badge ${level}`;
  container.innerHTML = `
    <article class="check-item">
      <header>
        <strong>${escapeHtml(primary.title || "等待报告")}</strong>
        <span class="badge ${level}">${escapeHtml(primary.due || report.phase || "-")}</span>
      </header>
      <div class="check-meta">${escapeHtml(primary.detail || "每日运行后会生成下一步行动。")}</div>
      <div class="action-text">位置：${escapeHtml(primary.page === "signals" ? "信号验证页" : primary.page === "review" ? "复盘报告页" : "仪表盘")}</div>
    </article>
    <article class="check-item">
      <header>
        <strong>为什么还不能说可信</strong>
        <span class="badge ${blockers.length ? "warn" : "ok"}">${blockers.length ? `${blockers.length} 项` : "已满足"}</span>
      </header>
      <div class="check-meta">${escapeHtml(blockers.length ? blockers.join("；") : "最低样本、周期、执行和回看门槛都已满足。")}</div>
    </article>
    <article class="check-item">
      <header>
        <strong>最早可信度初评参考日</strong>
        <span class="badge warn">${escapeHtml(milestones.earliestCredibleEvaluationDate || "-")}</span>
      </header>
      <div class="check-meta">${escapeHtml(`第30条信号预计 ${milestones.estimated30thSignalDate || "-"}；第8个记录周预计 ${milestones.estimated8thWeekDate || "-"}；第30条信号60日回看预计 ${milestones.estimated30thSignalDay60Date || "-"}。`)}</div>
      <div class="action-text">${escapeHtml(milestones.note || "这是保守排期参考，不是收益承诺。")}</div>
    </article>
    ${actions.slice(1, 4).map((item) => `
      <article class="check-item">
        <header>
          <strong>${escapeHtml(item.title || "-")}</strong>
          <span class="badge ${item.priority === "high" ? "warn" : "ok"}">${escapeHtml(item.due || item.priority || "-")}</span>
        </header>
        <div class="check-meta">${escapeHtml(item.detail || "")}</div>
      </article>
    `).join("")}
  `;
}

function renderDeliveryStatus() {
  const container = document.getElementById("delivery-status-list");
  const badge = document.getElementById("delivery-badge");
  if (!container || !badge) return;

  const delivery = deliverySummary();
  badge.textContent = delivery.label;
  badge.className = `badge ${delivery.level}`;
  container.innerHTML = delivery.items.map((item) => `
    <article class="check-item">
      <header>
        <strong>${item.title}</strong>
        <span class="badge ${item.level}">${item.status}</span>
      </header>
      <div class="check-meta">${escapeHtml(item.meta)}</div>
      ${item.subject ? `<div class="snapshot-meta">${escapeHtml(item.subject)}</div>` : ""}
    </article>
  `).join("");
}

function renderOperationPlan() {
  const container = document.getElementById("operation-plan-list");
  const badge = document.getElementById("operation-plan-badge");
  if (!container || !badge) return;

  const plan = buildOperationPlan();
  badge.textContent = plan.label;
  badge.className = `badge ${plan.level}`;
  container.innerHTML = plan.items.map((item) => `
    <article class="check-item">
      <header>
        <strong>${escapeHtml(item.title)}</strong>
        <span class="badge ${item.level}">${escapeHtml(item.status)}</span>
      </header>
      <div class="check-meta">${escapeHtml(item.meta)}</div>
    </article>
  `).join("");
}

function renderManualOrderChecklist() {
  const container = document.getElementById("manual-order-list");
  const badge = document.getElementById("manual-order-badge");
  if (!container || !badge) return;

  const checklist = buildOperationPlan().manualOrderChecklist || { items: [], label: "待计算", level: "warn" };
  badge.textContent = checklist.label || "待计算";
  badge.className = `badge ${checklist.level || "warn"}`;
  container.innerHTML = (checklist.items || []).map((item) => {
    const details = [
      item.code ? `代码 ${item.code}` : "",
      item.quantity ? `数量 ${item.quantity}` : "",
      item.referencePrice != null ? `参考价 ${number(item.referencePrice).toFixed(4)}` : "",
      item.estimatedAmount ? `预计 ${yuan(item.estimatedAmount)} 元` : "",
      item.stopPrice ? `止损 ${number(item.stopPrice).toFixed(3)}` : "",
      item.maxLossYuan ? `计划风险 ${yuan(item.maxLossYuan)} 元` : ""
    ].filter(Boolean).join("；");
    const confirmations = (item.confirmations || [])
      .map((text) => `<span class="snapshot-meta">${escapeHtml(text)}</span>`)
      .join("");
    return `
      <article class="check-item">
        <header>
          <strong>${escapeHtml(item.title || "-")}</strong>
          <span class="badge ${item.level || "warn"}">${escapeHtml(item.action || item.status || "-")}</span>
        </header>
        <div class="check-meta">${escapeHtml(item.meta || "")}</div>
        ${details ? `<div class="action-text">${escapeHtml(details)}</div>` : ""}
        ${confirmations}
      </article>
    `;
  }).join("");
}

function renderDailyRunStatus() {
  const container = document.getElementById("daily-run-list");
  const badge = document.getElementById("daily-run-badge");
  if (!container || !badge) return;

  const run = state.dailyExperimentRun;
  if (!run) {
    badge.textContent = "未运行";
    badge.className = "badge warn";
    container.innerHTML = `
      <article class="check-item">
        <header>
          <strong>等待首次运行</strong>
          <span class="badge warn">待处理</span>
        </header>
        <div class="check-meta">点击顶部“每日运行”，或等待工作日 15:50 自动任务。</div>
      </article>
    `;
    return;
  }

  const failures = (run.steps || []).filter((item) => !item.ok);
  const signalMode = run.summary?.signalMode === "record" ? "正式记录" : "预检";
  const runHealthy = run.ok && failures.length === 0;
  badge.textContent = runHealthy ? "成功" : `${failures.length || 1} 项待处理`;
  badge.className = `badge ${runHealthy ? "ok" : "warn"}`;
  container.innerHTML = `
    <article class="check-item">
      <header>
        <strong>最近运行</strong>
        <span class="badge ${runHealthy ? "ok" : "warn"}">${runHealthy ? "成功" : "需检查"}</span>
      </header>
      <div class="check-meta">${run.time || "-"}；信号：${run.summary?.recordStatus || "-"}；模式：${signalMode}；步骤 ${run.summary?.stepCount || (run.steps || []).length} 个。</div>
    </article>
    ${(run.steps || []).map((item) => {
      const summary = item.summary || {};
      const detail = [
        item.status ? `状态 ${item.status}` : "",
        summary.mode ? `模式 ${summary.mode === "record" ? "正式记录" : "预检"}` : "",
        summary.count !== undefined ? `数量 ${summary.count}` : "",
        summary.verifiedCount !== undefined ? `核对一致 ${summary.verifiedCount}` : "",
        summary.totalSignals !== undefined ? `信号 ${summary.totalSignals}` : "",
        summary.doneCheckpoints !== undefined ? `回看 ${summary.doneCheckpoints}` : "",
        summary.subject ? `邮件 ${summary.shouldSend ? "应发送" : "不发送"}` : "",
        summary.message || "",
        item.error ? friendlyErrorMessage(item.error) : ""
      ].filter(Boolean).join("；");
      return `
        <article class="check-item">
          <header>
            <strong>${escapeHtml(item.name || "-")}</strong>
            <span class="badge ${item.ok ? "ok" : "warn"}">${item.ok ? "正常" : "待处理"}</span>
          </header>
          <div class="check-meta">${escapeHtml(detail || "-")}</div>
        </article>
      `;
    }).join("")}
  `;
}

function renderCredibility() {
  const signals = state.signalHistory || [];
  const validation = state.signalValidation || {};
  const execution = executionSummary();
  const experimentStatus = formalExperimentStatus();
  const sampleTarget = 30;
  const progress = Math.min(100, signals.length / sampleTarget * 100);
  const validationMeta = validation.doneCheckpoints
    ? ` · 已回看 ${validation.doneCheckpoints} 个窗口 · 平均超额 ${maybePct(validation.avgExcessPct)} · 最大回撤 ${maybePct(validation.worstMaxDrawdownPct)}`
    : " · 尚未完成信号回看";
  const executionMeta = signals.length
    ? ` · 执行记录 ${execution.recorded}/${signals.length}`
    : "";
  document.getElementById("credibility-text").textContent =
    signals.length >= sampleTarget
      ? "样本数量已达到最低评估线，可以开始看胜率、回撤和相对基准收益。"
      : `当前只有 ${signals.length} 条已记录信号，少于 ${sampleTarget} 条，不能说预测可信，只能做实验记录。`;
  document.getElementById("signal-progress").innerHTML = `
    <div class="progress-track"><div class="progress-fill" style="width: ${progress}%"></div></div>
    <div class="snapshot-meta">${signals.length}/${sampleTarget} 条信号 · ${experimentStatus.status} · ${experimentStatus.meta}${validationMeta}${executionMeta}</div>
  `;
}

function topWatchlistCandidates() {
  return [...(state.watchlist || [])]
    .filter((item) => item.code)
    .sort((a, b) => number(b.totalScore) - number(a.totalScore))
    .slice(0, 5)
    .map((item) => ({
      code: item.code,
      name: item.name,
      type: item.type,
      price: number(item.price || item.close),
      totalScore: number(item.totalScore),
      grade: item.grade || "D",
      status: item.status || "未评分",
      recommendation: item.recommendation || "",
      trendScore: item.trendScore,
      liquidityScore: item.liquidityScore,
      qualityScore: item.qualityScore,
      riskScore: item.riskScore,
      capitalFitScore: item.capitalFitScore,
      scoreReasons: item.scoreReasons || [],
      riskFlags: item.riskFlags || [],
      return1mPct: item.return1mPct,
      return3mPct: item.return3mPct,
      lastMarketDate: item.lastMarketDate || ""
    }));
}

function currentExitPlans() {
  return [...(state.portfolio || [])]
    .filter((item) => number(item.target) > 0 || number(item.stop) > 0)
    .map((item) => ({
      code: item.code,
      name: item.name,
      type: item.type,
      current: number(item.current),
      cost: number(item.cost),
      quantity: number(item.quantity),
      target: number(item.target),
      stop: number(item.stop),
      navDate: item.navDate || "",
      action: positionAction(item)
    }));
}

function availableTrialBudget(summary = portfolioSummary()) {
  const totalCapital = number(state.settings.totalCapital);
  const trialCapital = number(state.settings.trialCapital) || 200;
  const remaining = Math.max(0, totalCapital - number(summary.marketValue));
  return Math.min(trialCapital, remaining || trialCapital);
}

function candidateScoreText(item) {
  const parts = [`${item.grade || "D"}级`, `${number(item.totalScore).toFixed(0)}分`];
  if (item.trendScore !== undefined) parts.push(`趋势 ${number(item.trendScore).toFixed(0)}`);
  if (item.liquidityScore !== undefined) parts.push(`流动性 ${number(item.liquidityScore).toFixed(0)}`);
  if (item.riskScore !== undefined) parts.push(`风险 ${number(item.riskScore).toFixed(0)}`);
  return parts.join("，");
}

function buildManualOrderChecklist(summary, budget, exitPlans, topCandidate, buyable, riskLocked, executionPending = 0) {
  const formalRecording = Boolean(state.settings.formalSignalRecording);
  const stopLossYuan = number(state.settings.stopLoss) || 20;
  const items = [];

  exitPlans.slice(0, 3).forEach((item) => {
    const current = number(item.current);
    const target = number(item.target);
    const stop = number(item.stop);
    const targetHit = target > 0 && current >= target;
    const stopHit = stop > 0 && current <= stop;
    items.push({
      title: `${item.code} 退出复核`,
      level: targetHit || stopHit ? "warn" : "ok",
      status: targetHit || stopHit ? "触发退出" : "等待",
      action: targetHit || stopHit ? "手动赎回/卖出" : "等待退出",
      side: targetHit ? "赎回" : stopHit ? "卖出" : "观察",
      code: item.code,
      name: item.name,
      referencePrice: Number(current.toFixed(4)),
      targetPrice: Number(target.toFixed(4)),
      stopPrice: Number(stop.toFixed(4)),
      quantity: number(item.quantity),
      estimatedAmount: null,
      maxLossYuan: null,
      meta: `${item.action} 当前 ${current.toFixed(4)}，目标 ${target.toFixed(4)}，不加仓。`,
      confirmations: ["先核对账户净值、赎回规则和到账时间。", "执行后回到信号页补执行记录。"]
    });
  });

  let label = "空仓等待";
  let level = "ok";

  if (riskLocked) {
    label = "今日不新增交易";
    level = summary.level === "danger" ? "danger" : "warn";
    items.push({
      title: "新开仓清单",
      level,
      status: "暂停",
      action: "不买入",
      side: "暂停",
      code: "",
      name: "",
      referencePrice: null,
      targetPrice: null,
      stopPrice: null,
      quantity: 0,
      estimatedAmount: 0,
      maxLossYuan: 0,
      meta: "账户处于风险、退出或暂停状态，先处理已有事项，不新增 ETF。",
      confirmations: ["暂停新开仓。", "先处理止损、退出或复盘事项。"]
    });
  } else if (executionPending > 0) {
    label = "先补执行记录";
    level = "warn";
    items.push({
      title: "新开仓清单",
      level: "warn",
      status: "暂停",
      action: "先补执行记录",
      side: "暂停",
      code: "",
      name: "",
      referencePrice: null,
      targetPrice: null,
      stopPrice: null,
      quantity: 0,
      estimatedAmount: 0,
      maxLossYuan: 0,
      meta: `还有 ${executionPending} 条正式信号没有补执行结果；先补已执行、未执行或延后和原因，今天不新增 ETF。`,
      confirmations: ["先在信号页补执行记录。", "补齐前不做新开仓，避免样本混乱。"]
    });
  } else if (!formalRecording) {
    label = "今日不下单";
    level = "warn";
    const candidateText = topCandidate
      ? `可观察 ${topCandidate.code} ${topCandidate.name || ""}，${candidateScoreText(topCandidate)}。`
      : "当前没有 A/B 级候选。";
    items.push({
      title: "新开仓清单",
      level: "warn",
      status: "预演模式",
      action: "不买入",
      side: "观察",
      code: topCandidate?.code || "",
      name: topCandidate?.name || "",
      referencePrice: topCandidate ? Number(number(topCandidate.price || topCandidate.close).toFixed(4)) : null,
      targetPrice: null,
      stopPrice: null,
      quantity: 0,
      estimatedAmount: 0,
      maxLossYuan: 0,
      meta: `${candidateText} 正式样本记录未开启，今天只预检和观察，不手动下单。`,
      confirmations: ["准备开始真实样本后，先在首页开启正式记录。", "开启前不把观察结果计入策略表现。"]
    });
  } else if (buyable) {
    const price = number(buyable.price || buyable.close);
    const quantity = 100;
    const amount = price * quantity;
    const stopPrice = Number((price * 0.92).toFixed(3));
    const maxLoss = Number(((price - stopPrice) * quantity).toFixed(2));
    label = "可手动复核买入";
    level = buyable.grade === "A" ? "ok" : "warn";
    items.push({
      title: "新开仓清单",
      level,
      status: "可复核买入",
      action: "可手动买入 100 份",
      side: "买入",
      code: buyable.code,
      name: buyable.name,
      referencePrice: Number(price.toFixed(4)),
      targetPrice: null,
      stopPrice,
      quantity,
      estimatedAmount: Number(amount.toFixed(2)),
      maxLossYuan: Math.min(maxLoss, stopLossYuan),
      meta: `${buyable.code} ${buyable.name || ""}，100 份约 ${yuan(amount)} 元，不超过 ${yuan(budget)} 元试验仓；计划止损价约 ${stopPrice.toFixed(3)}，单笔计划风险约 ${yuan(maxLoss)} 元。`,
      confirmations: [
        "买入前核对代码、价格、交易单位和涨跌幅。",
        "实际成交后在信号页记录成交价、金额和数量。",
        "若价格跌破止损价或等级恶化到 C/D，按规则手动卖出。"
      ]
    });
  } else if (topCandidate) {
    const price = number(topCandidate.price || topCandidate.close);
    const amount = price * 100;
    label = "资金不适配";
    level = "warn";
    items.push({
      title: "新开仓清单",
      level: "warn",
      status: "不买入",
      action: "空仓等待",
      side: "空仓",
      code: topCandidate.code,
      name: topCandidate.name,
      referencePrice: Number(price.toFixed(4)),
      targetPrice: null,
      stopPrice: null,
      quantity: 0,
      estimatedAmount: Number(amount.toFixed(2)),
      maxLossYuan: 0,
      meta: `${topCandidate.code} 100 份约 ${yuan(amount)} 元，超过当前 ${yuan(budget)} 元试验仓，不买入。`,
      confirmations: ["保持空仓等待，不为了买入而提高预算。"]
    });
  } else {
    items.push({
      title: "新开仓清单",
      level: "ok",
      status: "空仓等待",
      action: "不买入",
      side: "空仓",
      code: "",
      name: "",
      referencePrice: null,
      targetPrice: null,
      stopPrice: null,
      quantity: 0,
      estimatedAmount: 0,
      maxLossYuan: 0,
      meta: "没有 A/B 级且资金适配的候选 ETF，保持空仓。",
      confirmations: ["继续等待下一次每日评分。"]
    });
  }

  items.push({
    title: "执行纪律",
    level: "ok",
    status: "手动执行",
    action: "记录结果",
    side: "记录",
    code: "",
    name: "",
    referencePrice: null,
    targetPrice: null,
    stopPrice: null,
    quantity: 0,
    estimatedAmount: 0,
    maxLossYuan: 0,
    meta: "系统不自动交易；任何实际买入、卖出、赎回或不执行，都要在信号页补执行记录。",
    confirmations: ["执行和不执行都要记录原因。"]
  });

  return {
    label,
    level,
    budget: Number(budget.toFixed(2)),
    formalSignalRecording: formalRecording,
    executionPending,
    executionLocked: executionPending > 0,
    items
  };
}

function buildOperationPlan() {
  const summary = portfolioSummary();
  const budget = availableTrialBudget(summary);
  const exitPlans = currentExitPlans();
  const riskLocked = ["停止实验", "暂停交易", "止损执行", "达到退出目标"].includes(summary.status);
  const executionPending = executionSummary().pending;
  const candidates = [...(state.watchlist || [])]
    .filter((item) => item.code && ["A", "B"].includes(item.grade) && !["剔除", "数据缺失"].includes(item.status || ""))
    .sort((a, b) => number(b.totalScore) - number(a.totalScore));
  const buyable = candidates.find((item) => {
    const price = number(item.price || item.close);
    return price > 0 && price * 100 <= budget;
  });
  const topCandidate = buyable || candidates[0] || null;
  const manualOrderChecklist = buildManualOrderChecklist(summary, budget, exitPlans, topCandidate, buyable, riskLocked, executionPending);
  const items = [];

  items.push({
    title: "账户动作",
    level: summary.level,
    status: summary.status,
    meta: `${summary.recommendation} 当前市值 ${yuan(summary.marketValue)} 元，盈亏 ${yuan(summary.pnl)} 元。`
  });

  if (exitPlans.length) {
    exitPlans.slice(0, 3).forEach((item) => {
      const targetHit = number(item.target) > 0 && number(item.current) >= number(item.target);
      items.push({
        title: `${item.code} ${item.name || ""}`,
        level: targetHit ? "warn" : "ok",
        status: targetHit ? "执行退出" : "等待退出",
        meta: `${item.action} 当前 ${number(item.current).toFixed(4)}，目标 ${number(item.target).toFixed(4)}，不加仓。`
      });
    });
  } else {
    items.push({
      title: "退出计划",
      level: "ok",
      status: "无触发",
      meta: "当前没有达到止损或退出目标的持仓。"
    });
  }

  if (riskLocked) {
    items.push({
      title: "新开仓",
      level: summary.level === "danger" ? "danger" : "warn",
      status: "暂停",
      meta: "先处理风险、退出或复盘事项，不新增 ETF 交易。"
    });
  } else if (executionPending > 0) {
    items.push({
      title: "新开仓",
      level: "warn",
      status: "暂停",
      meta: `还有 ${executionPending} 条正式信号未补执行结果；先补执行记录，今天不新增 ETF 交易。`
    });
  } else if (topCandidate) {
    const price = number(topCandidate.price || topCandidate.close);
    const minAmount = price * 100;
    const fitText = minAmount <= budget
      ? `100 份约 ${yuan(minAmount)} 元，适配当前 ${yuan(budget)} 元试验预算`
      : `100 份约 ${yuan(minAmount)} 元，超过当前 ${yuan(budget)} 元试验预算`;
    const reasonText = joinPhrases((topCandidate.scoreReasons || []).slice(0, 2), "暂无明确正向解释");
    const riskText = joinPhrases((topCandidate.riskFlags || []).slice(0, 2), "暂无明显硬伤");
    items.push({
      title: `${topCandidate.code} ${topCandidate.name || ""}`,
      level: buyable && topCandidate.grade === "A" ? "ok" : "warn",
      status: buyable ? "重点观察" : "只观察",
      meta: `${fitText}；${candidateScoreText(topCandidate)}；理由：${reasonText}；风险：${riskText}；${topCandidate.recommendation || "买入前必须人工确认价格和止损。"}`
    });
  } else {
    items.push({
      title: "新开仓",
      level: "ok",
      status: "空仓等待",
      meta: "候选池没有 A/B 级且资金适配的 ETF，不新增交易。"
    });
  }

  items.push({
    title: "执行边界",
    level: "ok",
    status: "手动",
    meta: "系统只提醒和记录，不自动登录券商，不自动买入或卖出；每次实际操作后要回到信号页记录执行结果。"
  });

  return {
    level: summary.level,
    label: riskLocked ? "先处理风险" : executionPending > 0 ? "先补执行记录" : topCandidate ? "观察为主" : "空仓等待",
    budget,
    executionPending,
    executionLocked: executionPending > 0,
    items,
    manualOrderChecklist
  };
}

function suggestedExecutionAction(status, recommendation = "") {
  const text = `${status} ${recommendation}`;
  if (status === "持仓盈利" || status === "持仓亏损") return "观察";
  if (status === "达到退出目标") return "赎回";
  if (status === "止损执行") return "卖出";
  if (status === "暂停交易" || status === "停止实验") return "暂停";
  if (status === "空仓") return "空仓";
  if (text.includes("赎回")) return "赎回";
  if (text.includes("触发止损")) return "卖出";
  if (text.includes("暂停")) return "暂停";
  if (text.includes("空仓")) return "空仓";
  if (text.includes("买入")) return "买入";
  return "观察";
}

function defaultExecutionRecord(status, recommendation) {
  return {
    status: "未记录",
    action: suggestedExecutionAction(status, recommendation),
    date: "",
    code: "",
    price: "",
    amountYuan: "",
    quantity: "",
    notes: "",
    savedAt: ""
  };
}

function isExecutionRecorded(execution = {}) {
  return recordedExecutionStatuses.has(normalizeExecutionStatus(execution.status));
}

function pendingExecutionSignals() {
  return (state.signalHistory || []).filter((signal) => !isExecutionRecorded(signal.execution || {}));
}

function executionSummary() {
  const signals = state.signalHistory || [];
  const recorded = signals.filter((signal) => isExecutionRecorded(signal.execution || {}));
  const executed = recorded.filter((signal) => ["已执行", "部分执行"].includes(signal.execution.status)).length;
  const skipped = recorded.filter((signal) => signal.execution.status === "未执行").length;
  const delayed = recorded.filter((signal) => signal.execution.status === "延后").length;
  return {
    totalSignals: signals.length,
    recorded: recorded.length,
    pending: Math.max(0, signals.length - recorded.length),
    executed,
    skipped,
    delayed,
    coveragePct: signals.length ? recorded.length / signals.length * 100 : null
  };
}

function latestMarketSignalDate() {
  const dates = (state.watchlist || [])
    .map((item) => item.lastMarketDate)
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")))
    .sort();
  return dates.length ? dates[dates.length - 1] : today();
}

function simpleHash(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function actionFromPlanItem(item = {}) {
  if (item.side === "记录") return "观察";
  if (["买入", "卖出", "赎回", "空仓", "暂停", "观察"].includes(item.side)) return item.side;
  const status = item.status || "";
  if (status === "持仓盈利" || status === "持仓亏损" || status === "等待退出" || status === "重点观察" || status === "只观察" || status === "无触发" || status === "手动" || status === "手动执行") return "观察";
  if (item.title === "执行纪律") return "观察";
  if (status === "执行退出") return "赎回";
  if (status === "止损执行") return "卖出";
  if (status === "暂停") return "暂停";
  if (status === "空仓等待") return "空仓";
  const text = `${item.title || ""} ${item.status || ""} ${item.meta || ""}`;
  if (text.includes("执行退出") || text.includes("赎回")) return "赎回";
  if (text.includes("触发止损")) return "卖出";
  if (text.includes("暂停")) return "暂停";
  if (text.includes("空仓")) return "空仓";
  if (text.includes("重点观察") || text.includes("只观察") || text.includes("等待退出")) return "观察";
  if (text.includes("买入")) return "买入";
  return "观察";
}

function buildSuggestedActions(operationPlan) {
  const actions = (operationPlan.items || []).map((item) => ({
    title: item.title,
    status: item.status,
    action: actionFromPlanItem(item),
    level: item.level,
    meta: item.meta
  }));
  (operationPlan.manualOrderChecklist?.items || []).forEach((item) => {
    actions.push({
      title: item.title,
      status: item.status,
      action: actionFromPlanItem(item),
      level: item.level,
      meta: item.meta,
      code: item.code,
      quantity: item.quantity,
      referencePrice: item.referencePrice,
      estimatedAmount: item.estimatedAmount,
      stopPrice: item.stopPrice
    });
  });
  return actions;
}

function frontendDataQuality(signalDate) {
  const blockers = [];
  const warnings = [];
  const marketAge = daysSince(signalDate);
  const fundNavAge = daysSince(state.fundNavSync?.time);
  const crossCheckAge = daysSince(state.fundNavCrossCheck?.time);
  const fundPositions = (state.portfolio || []).filter((item) =>
    String(item.type || "").includes("场外") || String(item.type || "").includes("联接")
  );

  if (!(state.sourceWhitelist || []).length) blockers.push("信息源白名单尚未同步。");
  if (!(state.watchlist || []).length) blockers.push("ETF 候选池为空。");
  if (marketAge == null || marketAge > 7) blockers.push(`场内 ETF 行情日期过旧：${signalDate || "-"}。`);
  if (state.marketUpdates?.[0]?.errors?.length) warnings.push(`行情同步有 ${state.marketUpdates[0].errors.length} 条错误。`);
  if (fundPositions.length && (fundNavAge == null || fundNavAge > 7)) blockers.push("场外/联接基金净值未在 7 天内同步。");
  if (fundPositions.length && (crossCheckAge == null || crossCheckAge > 7)) blockers.push("易方达官网净值核对未在 7 天内完成。");
  if (state.fundNavCrossCheck?.mismatchCount || state.fundNavCrossCheck?.errors?.length) blockers.push("易方达官网净值核对存在差异或错误。");
  if (!(state.newsEvents || []).length) warnings.push("新闻事件为空，本次信号缺少事件背景。");
  if (!(state.financialEvents || []).length) warnings.push("财报事件为空，本次信号缺少金融巨头财报背景。");

  return {
    ok: !blockers.length,
    blockers,
    warnings,
    signalDate,
    marketAgeDays: marketAge,
    fundNavAgeDays: fundNavAge,
    crossCheckAgeDays: crossCheckAge,
    sourceWhitelistCount: (state.sourceWhitelist || []).length
  };
}

function buildSignalSnapshot(reason = "manual") {
  const summary = portfolioSummary();
  const candidates = topWatchlistCandidates();
  const exitPlans = currentExitPlans();
  const operationPlan = buildOperationPlan();
  const signalDate = latestMarketSignalDate();
  const actionHash = simpleHash({
    date: signalDate,
    status: summary.status,
    recommendation: summary.recommendation,
    operationPlan: (operationPlan.items || []).map((item) => [item.title, item.status]),
    manualOrderChecklist: (operationPlan.manualOrderChecklist?.items || []).map((item) => [
      item.title,
      item.status,
      item.side,
      item.code,
      item.quantity,
      item.referencePrice,
      item.stopPrice
    ]),
    candidates: candidates.map((item) => [item.code, item.grade, item.status]),
    exits: exitPlans.map((item) => [item.code, item.target, item.stop])
  });
  const positions = [...(state.portfolio || [])].map((item) => {
    const value = number(item.current) * number(item.quantity);
    const costValue = number(item.cost) * number(item.quantity);
    return {
      code: item.code,
      name: item.name,
      type: item.type,
      cost: number(item.cost),
      current: number(item.current),
      quantity: number(item.quantity),
      marketValue: Number(value.toFixed(2)),
      pnl: Number((value - costValue).toFixed(2)),
      target: number(item.target),
      stop: number(item.stop),
      navDate: item.navDate || "",
      action: positionAction(item)
    };
  });

  return {
    id: `signal-${signalDate}-${reason}-${actionHash}`,
    date: signalDate,
    time: new Date().toISOString(),
    reason,
    actionHash,
    status: summary.status,
    recommendation: summary.recommendation,
    execution: defaultExecutionRecord(summary.status, summary.recommendation),
    marketValue: Number(summary.marketValue.toFixed(2)),
    pnl: Number(summary.pnl.toFixed(2)),
    pnlPct: Number(summary.pnlPct.toFixed(2)),
    positions,
    exitPlans,
    candidates,
    operationPlan,
    manualOrderChecklist: operationPlan.manualOrderChecklist,
    suggestedActions: buildSuggestedActions(operationPlan),
    dataQuality: frontendDataQuality(signalDate),
    dataSnapshot: {
      marketUpdate: state.marketUpdates?.[0] || null,
      fundNavSync: state.fundNavSync || null,
      fundNavCrossCheck: state.fundNavCrossCheck || null,
      efundsSync: state.efundsSync || null,
      sourceWhitelistSync: state.sourceWhitelistSync || null,
      newsSync: state.newsSync || null,
      financialEventSync: state.financialEventSync || null
    },
    checkpoints: {
      day5: { status: "pending", returnPct: null, excessPct: null, maxDrawdownPct: null },
      day20: { status: "pending", returnPct: null, excessPct: null, maxDrawdownPct: null },
      day60: { status: "pending", returnPct: null, excessPct: null, maxDrawdownPct: null }
    }
  };
}

async function recordSignal(reason = "manual", options = {}) {
  if (isFileMode) {
    showRuntimeBanner('记录信号需要本地服务保存数据。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 后再点击。', "warn");
    return null;
  }

  const dryRun = options.dryRun ?? !state.settings.formalSignalRecording;
  const res = await fetch("/api/record-signal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason, dryRun })
  });
  const payload = await res.json();
  if (!res.ok || !payload.ok) {
    throw new Error(payload.message || payload.error || "记录信号失败");
  }
  await loadState();
  if (dryRun && payload.status === "preview") {
    showRuntimeBanner("正式样本记录未开启，本次只预检建议，不写入信号历史。到“提醒设置”开启后才会计入 30 条样本。", "warn");
  }
  if (payload.status === "duplicate") {
    showRuntimeBanner(payload.message || "同一交易日已经保存正式信号，本次不重复记录。", "warn");
  }
  if (payload.status === "execution_pending_blocked") {
    showRuntimeBanner(payload.message || "还有执行记录待补，本次不新增正式信号。", "warn");
  }
  return payload;
}

async function recordSignalFromButton(button, reason) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "记录中";

  try {
    const result = await recordSignal(reason);
    button.textContent = result?.status === "duplicate"
      ? "已存在"
      : result?.status === "execution_pending_blocked"
        ? "先补记录"
        : result?.status === "recorded"
          ? "已记录"
          : result?.status === "preview"
            ? "已预检"
            : "已处理";
  } catch (error) {
    button.textContent = "记录失败";
    alert(error.message);
  } finally {
    button.disabled = false;
    setTimeout(() => {
      button.textContent = originalText;
    }, 1400);
  }
}

function executionFieldValue(form, field) {
  return form.querySelector(`[data-execution-field="${field}"]`)?.value || "";
}

async function refreshExperimentChecks() {
  if (isFileMode) return;
  const endpoints = [
    "/api/sample-guard",
    "/api/build-performance-report",
    "/api/audit-goal",
    "/api/build-step9-10-tracker",
    "/api/build-next-action-report",
    "/api/build-maturity-schedule",
    "/api/build-review-todo",
    "/api/export-signal-history",
    "/api/audit-signal-integrity",
    "/api/build-credibility-report",
    "/api/backup-state",
    "/api/build-email-reminder"
  ];
  for (const endpoint of endpoints) {
    try {
      await fetch(endpoint, { method: "POST" });
    } catch (error) {
      console.warn(`refresh failed: ${endpoint}`, error);
    }
  }
  await loadState();
}

async function persistSignalExecution(signalId, execution) {
  const signal = (state.signalHistory || []).find((item) => item.id === signalId);
  if (!signal) {
    throw new Error("没有找到对应信号记录。");
  }

  const res = await fetch("/api/signal-execution", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signalId, execution })
  });
  const payload = await res.json();
  if (res.status === 404) {
    signal.execution = execution;
    state.executionLog = state.executionLog || [];
    state.executionLog.unshift({
      id: `exec-${Date.now()}`,
      signalId: signal.id,
      signalDate: signal.date,
      signalStatus: signal.status,
      signalRecommendation: signal.recommendation,
      savedAt: execution.savedAt,
      ...execution
    });
    state.executionLog = state.executionLog.slice(0, 500);
    await saveState();
  } else if (!res.ok || !payload.ok) {
    throw new Error(payload.error || "保存执行记录失败");
  }
  await refreshExperimentChecks();
  renderAll();
  return payload?.execution || execution;
}

async function saveSignalExecution(signalId, form) {
  if (isFileMode) {
    showRuntimeBanner('保存执行记录需要本地服务。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 后再点击。', "warn");
    return null;
  }

  const signal = (state.signalHistory || []).find((item) => item.id === signalId);
  if (!signal) {
    throw new Error("没有找到对应信号记录。");
  }

  const execution = {
    status: executionFieldValue(form, "status") || "未记录",
    action: executionFieldValue(form, "action") || suggestedExecutionAction(signal.status, signal.recommendation),
    date: executionFieldValue(form, "date") || today(),
    code: executionFieldValue(form, "code"),
    price: executionFieldValue(form, "price") ? number(executionFieldValue(form, "price")) : "",
    amountYuan: executionFieldValue(form, "amountYuan") ? number(executionFieldValue(form, "amountYuan")) : "",
    quantity: executionFieldValue(form, "quantity") ? number(executionFieldValue(form, "quantity")) : "",
    notes: executionFieldValue(form, "notes"),
    savedAt: new Date().toISOString()
  };

  const res = await fetch("/api/signal-execution", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signalId, execution })
  });
  const payload = await res.json();
  if (res.status === 404) {
    signal.execution = execution;
    state.executionLog = state.executionLog || [];
    state.executionLog.unshift({
      id: `exec-${Date.now()}`,
      signalId: signal.id,
      signalDate: signal.date,
      signalStatus: signal.status,
      signalRecommendation: signal.recommendation,
      savedAt: execution.savedAt,
      ...execution
    });
    state.executionLog = state.executionLog.slice(0, 500);
    await saveState();
  } else if (!res.ok || !payload.ok) {
    throw new Error(payload.error || "保存执行记录失败");
  }
  await refreshExperimentChecks();
  renderAll();
  return payload?.execution || execution;
}

function renderDashboard() {
  const summary = portfolioSummary();
  const pnlEl = document.getElementById("pnl-value");
  const badge = document.getElementById("risk-badge");

  document.getElementById("status-label").textContent = summary.status;
  document.getElementById("market-value").textContent = yuan(summary.marketValue);
  pnlEl.textContent = `${yuan(summary.pnl)} (${pct(summary.pnlPct)})`;
  pnlEl.className = summary.pnl >= 0 ? "positive" : "negative";
  document.getElementById("email-label").textContent = state.settings.email || "-";
  document.getElementById("recommendation-text").textContent = summary.recommendation;
  const latestUpdate = state.marketUpdates && state.marketUpdates[0];
  document.getElementById("market-update-text").textContent = latestUpdate
    ? `最近行情更新：${latestUpdate.time}，来源：${latestUpdate.source}，数量：${latestUpdate.count}`
    : "行情尚未更新。";
  badge.textContent = summary.level === "danger" ? "高风险" : summary.level === "warn" ? "需复盘" : "正常";
  badge.className = `badge ${summary.level}`;
  document.getElementById("email-reminder-status").textContent = emailReminderStatusText();
  document.getElementById("email-preview").textContent = emailText();
  renderFiveAnswers();
  renderPositionSnapshot();
  renderDataHealth();
  renderFormalStartGate();
  renderGoalAcceptance();
  renderStepTracker();
  renderNextActionReport();
  renderCredibility();
  renderDeliveryStatus();
  renderOperationPlan();
  renderManualOrderChecklist();
  renderDailyRunStatus();
}

function watchlistRow(item, index) {
  const tr = document.createElement("tr");
  const fields = [
    "code",
    "name",
    "type",
    "price",
    "turnoverYuan",
    "fundSizeYi",
    "bidAskSpreadPct",
    "ma20",
    "ma60",
    "ma20Slope",
    "return1mPct",
    "return3mPct",
    "benchmarkReturn1mPct",
    "benchmarkReturn3mPct"
  ];
  fields.forEach((field) => {
    const td = document.createElement("td");
    const input = document.createElement("input");
    input.value = item[field] ?? "";
    input.type = ["code", "name", "type"].includes(field) ? "text" : "number";
    input.step = "0.001";
    input.addEventListener("input", () => {
      item[field] = input.type === "number" ? number(input.value) : input.value;
      renderDashboard();
    });
    td.appendChild(input);
    tr.appendChild(td);
  });

  ["totalScore", "grade", "status", "recommendation"].forEach((field) => {
    const td = document.createElement("td");
    td.textContent = item[field] ?? "-";
    tr.appendChild(td);
  });

  return tr;
}

function renderWatchlist() {
  const body = document.getElementById("watchlist-table");
  body.innerHTML = "";
  const qualified = (state.watchlist || []).filter((item) => ["A", "B"].includes(item.grade) && item.status !== "剔除");
  qualified.forEach((item) => body.appendChild(watchlistRow(item, state.watchlist.indexOf(item))));
  if (!qualified.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="18" class="empty">今天没有符合 A/B 级条件的 ETF，保持空仓观察。</td>';
    body.appendChild(row);
  }
  renderCandidateExplanations();
  renderEfundsList();
}

function renderCandidateExplanations() {
  const container = document.getElementById("candidate-explain-list");
  if (!container) return;
  const candidates = [...(state.watchlist || [])]
    .filter((item) => item.code && ["A", "B"].includes(item.grade) && item.status !== "剔除")
    .sort((a, b) => number(b.totalScore) - number(a.totalScore))
    .slice(0, 5);

  if (!candidates.length) {
    container.innerHTML = `
      <section class="panel">
        <div class="panel-header">
          <h2>候选解释</h2>
          <span class="badge warn">无候选</span>
        </div>
        <p class="muted-line">更新行情后，这里会解释每只 ETF 为什么观察或剔除。</p>
      </section>
    `;
    return;
  }

  container.innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <h2>候选解释</h2>
        <span class="badge">前 ${candidates.length} 只</span>
      </div>
      <div class="dashboard-grid">
        ${candidates.map((item) => {
          const reasons = (item.scoreReasons || []).slice(0, 3);
          const risks = (item.riskFlags || []).slice(0, 3);
          const badgeClass = item.grade === "A" || item.grade === "B" ? "ok" : item.grade === "C" ? "warn" : "danger";
          return `
            <article class="check-item">
              <header>
                <strong>${escapeHtml(item.code || "-")} ${escapeHtml(item.name || "-")}</strong>
                <span class="badge ${badgeClass}">${escapeHtml(item.grade || "D")} ${number(item.totalScore).toFixed(0)}分</span>
              </header>
              <div class="check-meta">${escapeHtml(item.status || "-")}：${escapeHtml(item.recommendation || "-")}</div>
              <div class="official-list">
                ${reasons.length ? reasons.map((text) => `<span class="official-chip">${escapeHtml(text)}</span>`).join("") : '<span class="official-chip">暂无正向解释</span>'}
              </div>
              <div class="check-meta">${risks.length ? `风险：${risks.map(escapeHtml).join("；")}` : "风险：暂无明显硬伤，但仍需手动确认价格和止损。"}</div>
              <button class="market-open-button" data-market-code="${escapeHtml(item.code)}">打开专业 K 线 ↗</button>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderEfundsList() {
  const summary = document.getElementById("efunds-summary");
  const list = document.getElementById("efunds-list");
  const products = state.efundsEtfs || [];
  const sync = state.efundsSync;

  summary.textContent = products.length
    ? `已同步 ${products.length} 只官方 ETF，来源：${sync?.source || "易方达官网"}，时间：${sync?.time || "-"}`
    : "尚未同步。点击“同步易方达ETF”从官网抓取产品列表。";

  list.innerHTML = "";
  products.slice(0, 80).forEach((item) => {
    const chip = document.createElement("span");
    chip.className = "official-chip";
    chip.textContent = `${item.code} ${item.name}`;
    chip.title = item.type || "";
    list.appendChild(chip);
  });
}

function renderRecordList(kind, containerId, templateId) {
  const container = document.getElementById(containerId);
  const template = document.getElementById(templateId);
  const items = state[kind];
  container.innerHTML = "";

  if (!items.length) {
    container.innerHTML = '<div class="empty">暂无记录。</div>';
    return;
  }

  items.forEach((item, index) => {
    const node = template.content.cloneNode(true);
    node.querySelectorAll("[data-field]").forEach((input) => {
      const field = input.dataset.field;
      input.value = item[field] ?? "";
      input.addEventListener("input", () => {
        item[field] = input.type === "number" ? number(input.value) : input.value;
        renderDashboard();
      });
    });
    node.querySelector("[data-action='remove']").addEventListener("click", () => {
      items.splice(index, 1);
      renderAll();
    });
    container.appendChild(node);
  });
}

function renderSettings() {
  const gate = formalStartGate();
  const formalInput = document.getElementById("formal-recording-input");
  const formalHelp = document.getElementById("formal-recording-help");
  document.getElementById("email-input").value = state.settings.email || "";
  document.getElementById("total-capital-input").value = state.settings.totalCapital || 0;
  document.getElementById("trial-capital-input").value = state.settings.trialCapital || 0;
  document.getElementById("pause-loss-input").value = state.settings.pauseLoss || 0;
  document.getElementById("stop-loss-input").value = state.settings.stopLoss || 0;
  document.getElementById("close-time-input").value = state.settings.closeReminderTime || "15:45";
  document.getElementById("intraday-input").checked = Boolean(state.settings.intradayRiskCheck);
  document.getElementById("change-only-input").checked = Boolean(state.settings.onlyOnStatusChange);
  formalInput.checked = Boolean(state.settings.formalSignalRecording);
  formalInput.disabled = !state.settings.formalSignalRecording && !gate.ready;
  formalInput.title = gate.ready ? "更推荐从首页正式实验开始检查面板开启" : "开始检查未通过，暂不能开启正式记录";
  if (formalHelp) {
    formalHelp.textContent = state.settings.formalSignalRecording
      ? "正式样本记录已开启；后续建议会计入 30 条样本统计。"
      : gate.ready
        ? "开始检查已通过；开启后每日运行和生成今日评分会写入正式信号样本。"
        : `开始检查未通过：${gate.blockers.map((item) => item.title).join("、") || "仍有项目待处理"}。未开启时只做预检与邮件提醒。`;
  }
}

function renderWeeklyReview() {
  const container = document.getElementById("weekly-review-panel");
  if (!container) return;
  const review = state.weeklyReview;

  if (!review) {
    container.innerHTML = `
      <section class="panel">
        <div class="panel-header">
          <h2>执行偏差周报</h2>
          <span class="badge warn">未生成</span>
        </div>
        <p class="muted-line">点击“生成周报”后，系统会汇总信号、执行记录、回看窗口和当前盈亏。</p>
      </section>
    `;
    return;
  }

  const validation = review.validation || {};
  const execution = review.execution || {};
  const portfolio = review.portfolio || {};
  const actualPerformance = review.actualPerformance || state.actualPerformanceReport || {};
  const tradePerformance = actualPerformance.tradePerformance || {};
  const period = review.period || {};
  const lastWeeklyEmail = state.lastWeeklyReviewEmail;
  const weeklySendText = review.shouldSend ? "本次应发送" : "本次不重复发送";
  const weeklyLastText = lastWeeklyEmail?.time ? `上次发送：${lastWeeklyEmail.time}` : "尚无发送记录";
  const windowChips = Object.values(validation.byWindow || {}).map((item) => (
    `<span class="official-chip">${item.label}：已回看 ${item.done || 0}，胜率 ${maybePct(item.winRatePct)}，超额 ${maybePct(item.avgExcessPct)}，回撤 ${maybePct(item.worstMaxDrawdownPct)}</span>`
  )).join("");
  const notes = execution.deviationNotes?.length
    ? execution.deviationNotes.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>暂无未执行/延后/部分执行备注。</li>";

  container.innerHTML = `
    <section class="panel weekly-review-card">
      <div class="panel-header">
        <h2>执行偏差周报</h2>
        <span class="badge ${review.verdict === "样本不足" ? "warn" : "ok"}">${review.verdict || "-"}</span>
      </div>
      <p class="muted-line">周期：${period.start || "-"} 至 ${period.end || "-"} ｜ 生成：${review.time || "-"}</p>
      <p class="muted-line">邮件：${weeklySendText}，${review.sendReason || "-"}；${weeklyLastText}。</p>
      <div class="dashboard-grid weekly-grid">
        <article class="check-item">
          <header><strong>信号样本</strong><span class="badge">${review.signals?.total || 0}/30</span></header>
          <div class="check-meta">本周 ${review.signals?.weekly || 0} 条；少于 30 条前只做实验复盘。</div>
        </article>
        <article class="check-item">
          <header><strong>执行纪律</strong><span class="badge ${execution.pending ? "warn" : "ok"}">${execution.recorded || 0}/${execution.totalSignals || 0}</span></header>
          <div class="check-meta">覆盖率 ${maybePct(execution.coveragePct)}；未记录 ${execution.pending || 0} 条。</div>
        </article>
        <article class="check-item">
          <header><strong>回看结果</strong><span class="badge">${validation.doneCheckpoints || 0} 窗口</span></header>
          <div class="check-meta">胜率 ${maybePct(validation.overallWinRatePct)}；平均超额 ${maybePct(validation.avgExcessPct)}；最差回撤 ${maybePct(validation.worstMaxDrawdownPct)}。</div>
        </article>
        <article class="check-item">
          <header><strong>当前盈亏</strong><span class="${number(portfolio.pnl) >= 0 ? "positive" : "negative"}">${yuan(portfolio.pnl)}</span></header>
          <div class="check-meta">市值 ${yuan(portfolio.marketValue)} 元；盈亏率 ${maybePct(portfolio.pnlPct)}。</div>
        </article>
        <article class="check-item">
          <header><strong>实际成交</strong><span class="${number(tradePerformance.totalPnl) >= 0 ? "positive" : "negative"}">${yuan(tradePerformance.totalPnl)}</span></header>
          <div class="check-meta">成交 ${tradePerformance.tradeCount || 0} 条；结论 ${actualPerformance.verdict || "未生成"}；收益率 ${maybePct(tradePerformance.totalReturnPct)}。</div>
        </article>
      </div>
      <div class="official-list">${windowChips || '<span class="official-chip">暂无可回看窗口</span>'}</div>
      <details>
        <summary>执行偏差备注</summary>
        <ul class="review-notes">${notes}</ul>
      </details>
      <details>
        <summary>查看周报正文</summary>
        <pre class="email-preview">${escapeHtml(review.body || "")}</pre>
      </details>
    </section>
  `;
}

function renderPerformanceReport() {
  const container = document.getElementById("performance-report-panel");
  if (!container) return;
  const report = state.actualPerformanceReport;

  if (!report) {
    container.innerHTML = `
      <section class="panel">
        <div class="panel-header">
          <h2>实际执行表现</h2>
          <span class="badge warn">未生成</span>
        </div>
        <p class="muted-line">点击“执行表现”，系统会把持仓浮盈亏、成交日志盈亏、执行纪律和基准比较分开统计。</p>
      </section>
    `;
    return;
  }

  const portfolio = report.portfolioSnapshot || {};
  const trade = report.tradePerformance || {};
  const discipline = report.executionDiscipline || {};
  const benchmark = report.benchmarkComparison || {};
  const openRows = (trade.openPositions || []).map((item) => `
    <tr>
      <td>${escapeHtml(item.code || "-")}</td>
      <td>${escapeHtml(item.name || "-")}</td>
      <td>${number(item.quantity).toFixed(2)}</td>
      <td>${yuan(item.costBasis)}</td>
      <td>${item.currentPrice == null ? "-" : number(item.currentPrice).toFixed(4)}</td>
      <td>${item.marketValue == null ? "-" : yuan(item.marketValue)}</td>
      <td class="${number(item.unrealizedPnl) >= 0 ? "positive" : "negative"}">${item.unrealizedPnl == null ? "-" : yuan(item.unrealizedPnl)}</td>
    </tr>
  `).join("");
  const errors = (trade.errors || []).length
    ? `<div class="guide-panel"><strong>需复核</strong>${trade.errors.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`
    : "";

  container.innerHTML = `
    <section class="panel weekly-review-card">
      <div class="panel-header">
        <h2>实际执行表现</h2>
        <span class="badge ${trade.tradeCount ? "ok" : "warn"}">${escapeHtml(report.verdict || "-")}</span>
      </div>
      <p class="muted-line">生成：${escapeHtml(report.time || "-")}。这里统计真实成交和执行纪律，不评价预测神准。</p>
      <div class="dashboard-grid weekly-grid">
        <article class="check-item">
          <header><strong>持仓浮盈亏</strong><span class="${number(portfolio.pnl) >= 0 ? "positive" : "negative"}">${yuan(portfolio.pnl)}</span></header>
          <div class="check-meta">当前持仓市值 ${yuan(portfolio.marketValue)} 元；成本 ${yuan(portfolio.cost)} 元；浮盈亏率 ${maybePct(portfolio.pnlPct)}。</div>
        </article>
        <article class="check-item">
          <header><strong>真实成交盈亏</strong><span class="${number(trade.totalPnl) >= 0 ? "positive" : "negative"}">${yuan(trade.totalPnl)}</span></header>
          <div class="check-meta">成交 ${trade.tradeCount || 0} 条；收益率 ${maybePct(trade.totalReturnPct)}；手续费 ${yuan(trade.fees)} 元。</div>
        </article>
        <article class="check-item">
          <header><strong>执行覆盖</strong><span class="badge ${discipline.pending ? "warn" : "ok"}">${discipline.recorded || 0}/${discipline.signalCount || 0}</span></header>
          <div class="check-meta">执行日志 ${discipline.executionLogCount || 0} 条；未补执行 ${discipline.pending || 0} 条。</div>
        </article>
        <article class="check-item">
          <header><strong>基准比较</strong><span class="badge ${benchmark.canJudgeSignalEdge ? "ok" : "warn"}">${benchmark.canJudgeSignalEdge ? "可评估" : "样本不足"}</span></header>
          <div class="check-meta">信号 ${benchmark.signalCount || 0}/30；记录 ${benchmark.recordedWeeks || 0}/8 周；平均超额 ${maybePct(benchmark.avgExcessPct)}。</div>
        </article>
      </div>
      ${trade.note ? `<p class="muted-line">${escapeHtml(trade.note)}</p>` : ""}
      ${errors}
      <div class="table-wrap compact-table">
        <table>
          <thead><tr><th>代码</th><th>名称</th><th>数量</th><th>成本</th><th>现价</th><th>市值</th><th>未实现盈亏</th></tr></thead>
          <tbody>${openRows || '<tr><td colspan="7">暂无由成交日志计算出的开放持仓。</td></tr>'}</tbody>
        </table>
      </div>
      <details>
        <summary>查看报告正文</summary>
        <pre class="email-preview">${escapeHtml(report.body || "")}</pre>
      </details>
    </section>
  `;
}

function renderDaily() {
  renderPerformanceReport();
  renderWeeklyReview();
  const container = document.getElementById("daily-list");
  container.innerHTML = "";

  if (!state.dailyStatus.length) {
    container.innerHTML = '<div class="empty">暂无复盘记录。</div>';
    return;
  }

  state.dailyStatus.forEach((item) => {
    const article = document.createElement("article");
    article.className = "record";
    article.innerHTML = `<strong>${item.date} ${item.status}</strong><p>${item.recommendation}</p><pre>${item.email}</pre>`;
    container.appendChild(article);
  });
}

function renderNews() {
  renderSourceWhitelist();
  renderFinancialEvents();
  const container = document.getElementById("news-list");
  const events = state.newsEvents || [];
  container.innerHTML = "";

  if (!events.length) {
    container.innerHTML = '<div class="empty">暂无新闻事件。点击“同步新闻事件”后生成。</div>';
    return;
  }

  events.forEach((event) => {
    const article = document.createElement("article");
    article.className = "record";
    const rows = (event.results || []).map((item) => {
      const pre = item.pre5Pct == null ? "-" : `${item.pre5Pct}%`;
      const post5 = item.post5Pct == null ? "观察中" : `${item.post5Pct}%`;
      const post20 = item.post20Pct == null ? "观察中" : `${item.post20Pct}%`;
      return `<tr><td>${item.code}</td><td>${item.eventTradeDate}</td><td>${pre}</td><td>${post5}</td><td>${post20}</td></tr>`;
    }).join("");
    article.innerHTML = `
      <div class="panel-header">
        <h2>${event.title}</h2>
        <div class="top-actions">
          <span class="badge ${event.sourceGrade === "A" || event.sourceGrade === "B" ? "ok" : "warn"}">${event.sourceGrade || "未分级"}</span>
          <span class="badge">${event.conclusion || "观察中"}</span>
        </div>
      </div>
      <p class="recommendation">${event.economicLogic || "新闻只作为观察线索，最终仍要回到 ETF 评分和止损规则。"}</p>
      <p class="muted-line">日期：${event.date || "-"} ｜ 来源：${event.sourceName || "未分级"}（${event.sourceAllowedUse || "未设置"}）｜ 主题：${(event.themes || []).join("、") || "-"} ｜ 匹配代码：${(event.matchedCodes || []).join("、") || "-"}</p>
      <div class="table-wrap compact-table">
        <table>
          <thead><tr><th>ETF代码</th><th>事件交易日</th><th>前5日</th><th>后5日</th><th>后20日</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="5">暂无可计算数据</td></tr>'}</tbody>
        </table>
      </div>
      <p class="muted-line"><a href="${event.url}" target="_blank" rel="noreferrer">查看官网文章</a></p>
    `;
    container.appendChild(article);
  });
}

function renderFinancialEvents() {
  const container = document.getElementById("financial-events-list");
  const badge = document.getElementById("financial-events-badge");
  if (!container || !badge) return;

  const events = state.financialEvents || [];
  const sync = state.financialEventSync || null;
  badge.textContent = events.length ? `${events.length} 条` : "待同步";
  badge.className = `badge ${events.length ? "ok" : "warn"}`;

  if (!events.length) {
    container.innerHTML = '<div class="empty">暂无财报事件。点击顶部“同步财报事件”后生成。</div>';
    return;
  }

  container.innerHTML = events.map((event) => {
    const rows = (event.results || []).map((item) => {
      const pre = item.pre5Pct == null ? "-" : `${item.pre5Pct}%`;
      const post5 = item.post5Pct == null ? "观察中" : `${item.post5Pct}%`;
      const post20 = item.post20Pct == null ? "观察中" : `${item.post20Pct}%`;
      return `<tr><td>${escapeHtml(item.code || "-")}</td><td>${escapeHtml(item.eventTradeDate || "-")}</td><td>${escapeHtml(pre)}</td><td>${escapeHtml(post5)}</td><td>${escapeHtml(post20)}</td></tr>`;
    }).join("");
    const sourceBadge = event.sourceGrade === "A" || event.sourceGrade === "B" ? "ok" : "warn";
    return `
      <article class="record">
        <div class="panel-header">
          <h2>${escapeHtml(event.title || "-")}</h2>
          <div class="top-actions">
            <span class="badge ${sourceBadge}">${escapeHtml(event.sourceGrade || "未分级")}</span>
            <span class="badge">${escapeHtml(event.conclusion || "待行情回看")}</span>
          </div>
        </div>
        <p class="recommendation">${escapeHtml(event.economicLogic || "财报只作为事件验证材料，不单独触发交易。")}</p>
        <p class="muted-line">申报日：${escapeHtml(event.filingDate || event.date || "-")} ｜ 报告期：${escapeHtml(event.reportDate || "-")} ｜ 表单：${escapeHtml(event.form || "-")} ｜ 来源：${escapeHtml(event.sourceName || "未分级")}（${escapeHtml(event.sourceAllowedUse || "未设置")}）</p>
        <p class="muted-line">主题：${escapeHtml((event.themes || []).join("、") || "-")} ｜ 匹配代码：${escapeHtml((event.matchedCodes || []).join("、") || "-")}</p>
        <div class="table-wrap compact-table">
          <table>
            <thead><tr><th>ETF代码</th><th>事件交易日</th><th>前5日</th><th>后5日</th><th>后20日</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="5">暂无可计算数据</td></tr>'}</tbody>
          </table>
        </div>
        <p class="muted-line"><a href="${escapeHtml(event.url || "#")}" target="_blank" rel="noreferrer">查看 SEC 原文</a></p>
      </article>
    `;
  }).join("");

  if (sync?.errors?.length) {
    container.insertAdjacentHTML("beforeend", `
      <article class="check-item">
        <header>
          <strong>同步提示</strong>
          <span class="badge warn">${sync.errors.length} 条</span>
        </header>
        <div class="check-meta">${escapeHtml(sync.errors.slice(0, 5).join("；"))}</div>
      </article>
    `);
  }
}

function renderSourceWhitelist() {
  const container = document.getElementById("source-whitelist-panel");
  if (!container) return;
  const sources = state.sourceWhitelist || [];
  const sync = state.sourceWhitelistSync || null;
  const counts = sources.reduce((acc, item) => {
    const grade = item.grade || "D";
    acc[grade] = (acc[grade] || 0) + 1;
    return acc;
  }, {});

  if (!sources.length) {
    container.innerHTML = `
      <section class="panel">
        <div class="panel-header">
          <h2>信息源白名单</h2>
          <span class="badge warn">未同步</span>
        </div>
        <p class="muted-line">点击“同步信息源”，把官方、监管、交易所、财报原文和权威媒体导入软件。D 级来源默认过滤。</p>
      </section>
    `;
    return;
  }

  const chips = ["A", "B", "C", "D"]
    .map((grade) => `<span class="official-chip">${grade}级：${counts[grade] || 0}</span>`)
    .join("");
  const rows = sources.slice(0, 18).map((item) => `
    <tr>
      <td><span class="badge ${item.grade === "A" || item.grade === "B" ? "ok" : item.grade === "C" ? "warn" : "danger"}">${item.grade}</span></td>
      <td>${escapeHtml(item.name || "-")}</td>
      <td>${escapeHtml(item.category || "-")}</td>
      <td>${escapeHtml(item.useFor || "-")}</td>
      <td><a href="${escapeHtml(item.url || "#")}" target="_blank" rel="noreferrer">打开</a></td>
    </tr>
  `).join("");

  container.innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <h2>信息源白名单</h2>
        <span class="badge ok">${sources.length} 个来源</span>
      </div>
      <p class="muted-line">最近同步：${sync?.time || "-"}。A/B 可进入事件验证；C 只做背景；D 默认过滤。</p>
      <div class="official-list">${chips}</div>
      <div class="table-wrap compact-table">
        <table>
          <thead><tr><th>等级</th><th>来源</th><th>类型</th><th>用途</th><th>链接</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function checkpointBadge(key, item = {}) {
  const label = key === "day5" ? "5日" : key === "day20" ? "20日" : "60日";
  if (item.status === "done") {
    const badgeClass = number(item.excessPct) > 0 ? "ok" : "warn";
    return `<span class="badge ${badgeClass}">${label} ${maybePct(item.avgReturnPct ?? item.returnPct)} / 超额 ${maybePct(item.excessPct)}</span>`;
  }
  if (item.status === "not_applicable") {
    return `<span class="badge">${label} 无候选</span>`;
  }
  if (item.status === "error") {
    return `<span class="badge danger">${label} 待修正</span>`;
  }
  const suffix = item.latestTradingDays !== undefined ? `已过 ${item.latestTradingDays} 日` : "待回看";
  return `<span class="badge">${label} ${suffix}</span>`;
}

function renderSamplePlan() {
  const container = document.getElementById("sample-plan-panel");
  if (!container) return;

  const signals = state.signalHistory || [];
  const execution = executionSummary();
  const signalDate = latestMarketSignalDate();
  const weeks = recordedWeekCount(signals);
  const preview = buildSignalSnapshot("manual");
  const sameDaySignals = signals.filter((item) => item.date === signalDate);
  const duplicate = signals.find((item) =>
    item.date === preview.date &&
    item.reason === preview.reason &&
    item.actionHash === preview.actionHash
  );
  const formalRecording = Boolean(state.settings.formalSignalRecording);
  const experimentStatus = formalExperimentStatus();
  const remainingSignals = Math.max(0, 30 - signals.length);
  const remainingWeeks = Math.max(0, 8 - weeks);
  const quality = preview.dataQuality || {};
  const nextAction = !quality.ok
    ? "先同步数据"
    : !formalRecording
      ? "只预检"
      : duplicate
      ? "今天已记录"
      : "可以记录";
  const nextMeta = !quality.ok
    ? `阻塞：${(quality.blockers || []).join("；")}`
    : !formalRecording
      ? "正式样本记录未开启；每日运行和生成今日评分只生成预检，不写入信号历史。"
    : duplicate
      ? "同一天同一条建议已经保存，不要重复制造样本。"
      : "可以点击“记录当前信号”，保存最近交易日的建议快照。";

  container.innerHTML = `
    <strong>样本收集计划</strong>
    <span>最近交易日：${signalDate}；正式样本记录：${formalRecording ? "已开启" : "未开启"}；正式样本 ${signals.length}/30 条，还差 ${remainingSignals} 条；记录周数 ${weeks}/8 周，还差 ${remainingWeeks} 周。</span>
    <span>正式实验状态：${experimentStatus.status}。${experimentStatus.meta}</span>
    <span>今日状态：${nextAction}。${nextMeta}</span>
    <span>当天已保存 ${sameDaySignals.length} 条；执行记录待补 ${execution.pending} 条。记录后要在本页补“已执行/未执行/延后”，否则后面无法区分策略问题和执行问题。</span>
  `;
}

function renderSampleGuard() {
  const container = document.getElementById("sample-guard-panel");
  if (!container) return;

  const guard = state.sampleGuard;
  if (!guard || !Array.isArray(guard.checks)) {
    const formalRecording = Boolean(state.settings.formalSignalRecording);
    container.innerHTML = `
      <strong>样本采集守护</strong>
      <span>尚未运行守护检查。${formalRecording ? "点击“样本守护”，检查最近交易日是否漏记信号、是否漏补执行记录。" : "当前是预演模式，守护会先检查正式实验开始前的准备状态。"}</span>
    `;
    return;
  }

  const failed = guard.checks.filter((item) => !item.ok);
  const actions = (guard.nextActions || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  const dueCheckpoints = guard.dueCheckpoints || [];
  const nextCheckpoints = guard.nextCheckpoints || [];
  const checkpointSummary = dueCheckpoints.length
    ? `复盘提醒：${dueCheckpoints.length} 个回看窗口已到期，先回看 ${dueCheckpoints[0].date || "-"} 的 ${dueCheckpoints[0].targetTradingDays || "-"} 日结果${checkpointEstimateText(dueCheckpoints[0]) ? `，${checkpointEstimateText(dueCheckpoints[0])}` : ""}。`
    : nextCheckpoints.length
      ? `复盘提醒：下一次是 ${nextCheckpoints[0].date || "-"} 的 ${nextCheckpoints[0].targetTradingDays || "-"} 日回看，还差约 ${nextCheckpoints[0].remainingTradingDays || 0} 个交易日${checkpointEstimateText(nextCheckpoints[0]) ? `，${checkpointEstimateText(nextCheckpoints[0])}` : ""}。`
      : "复盘提醒：暂无到期回看窗口。";
  const rows = guard.checks.map((item) => `
    <article class="check-item">
      <header>
        <strong>${escapeHtml(item.title)}</strong>
        <span class="badge ${item.level || (item.ok ? "ok" : "warn")}">${escapeHtml(item.status || (item.ok ? "正常" : "待处理"))}</span>
      </header>
      <div class="check-meta">${escapeHtml(item.meta || "")}</div>
      ${item.action ? `<div class="action-text">${escapeHtml(item.action)}</div>` : ""}
    </article>
  `).join("");

  container.innerHTML = `
    <strong>样本采集守护</strong>
    <span>最近检查：${escapeHtml(guard.time || "-")}；阶段：${escapeHtml(guard.phase || "-")}；最近交易日：${escapeHtml(guard.latestTradingDate || "-")}；正式信号 ${Number(guard.signalCount || 0)}/${Number(guard.requiredSignals || 30)} 条，记录周数 ${Number(guard.recordedWeeks || 0)}/${Number(guard.requiredWeeks || 8)}。</span>
    <span>${escapeHtml(guard.conclusion || "")}</span>
    <span>${escapeHtml(checkpointSummary)}</span>
    ${actions ? `<span>下一步：${actions}</span>` : ""}
    <div class="check-list guard-check-list">${rows}</div>
    ${failed.length ? `<span>未通过检查 ${failed.length} 项；这些不是策略失败，而是样本采集纪律或数据完整性问题。</span>` : "<span>当前没有发现样本采集缺口。</span>"}
  `;
}

function renderSignalIntegrityPanel() {
  const container = document.getElementById("signal-integrity-panel");
  if (!container) return;

  const signals = state.signalHistory || [];
  const audit = state.signalIntegrityAudit;
  const knownCount = Object.keys(state.signalIntegrityKnownSignals || {}).length;

  if (!signals.length) {
    container.innerHTML = `
      <strong>信号样本完整性</strong>
      <span>暂无正式信号。开始记录后，这里会检查信号是否重复、是否缺字段、是否缺回看窗口，以及曾经出现过的样本有没有消失。</span>
    `;
    return;
  }

  if (!audit) {
    container.innerHTML = `
      <strong>信号样本完整性</strong>
      <span>还没有运行完整性审计。点击“样本完整性”，系统会记住已出现的正式信号，以后如果样本被误删会标红。</span>
    `;
    return;
  }

  const dangerCount = Number(audit.dangerCount || 0);
  const warningCount = Number(audit.warningCount || 0);
  const badgeClass = dangerCount ? "danger" : warningCount ? "warn" : "ok";
  const stale = Number(audit.signalCount || 0) !== signals.length;
  const issues = audit.issues || [];
  const issueRows = issues.slice(0, 6).map((item) => `
    <article class="check-item">
      <header>
        <strong>${escapeHtml(item.kind || "-")}</strong>
        <span class="badge ${escapeHtml(item.level || "warn")}">${escapeHtml(item.level || "warn")}</span>
      </header>
      <div class="check-meta">${escapeHtml(item.signalId || "-")}</div>
      <div class="action-text">${escapeHtml(item.message || "-")}</div>
    </article>
  `).join("");

  container.innerHTML = `
    <strong>信号样本完整性 <span class="badge ${badgeClass}">${escapeHtml(audit.phase || "-")}</span></strong>
    <span>最近审计：${escapeHtml(audit.time || "-")}；正式信号 ${Number(audit.signalCount || 0)} 条；已知信号 ${Number(audit.knownSignalCount || knownCount)} 条；警告 ${warningCount} 个；危险 ${dangerCount} 个。${stale ? " 当前信号数量已变化，建议重新审计。" : ""}</span>
    <div class="official-list">
      <span class="official-chip">重复 ID ${Number(audit.duplicateIdCount || 0)}</span>
      <span class="official-chip">重复交易日 ${Number(audit.duplicateTradingDayCount || 0)}</span>
      <span class="official-chip">已知样本消失 ${Number(audit.missingKnownSignalCount || 0)}</span>
      <span class="official-chip">执行/字段警告 ${warningCount}</span>
    </div>
    ${issueRows ? `<div class="check-list guard-check-list">${issueRows}</div>` : "<span>当前没有发现样本完整性问题。</span>"}
  `;
}

function renderStateBackupPanel() {
  const container = document.getElementById("state-backup-panel");
  if (!container) return;

  const backup = state.stateBackup;
  const runCount = (state.stateBackupRuns || []).length;
  if (!backup) {
    container.innerHTML = `
      <strong>实验状态备份</strong>
      <span>还没有生成备份。点击“备份状态”，或等每日流程自动备份，系统会把当前 state.json 复制到 data/backups。</span>
    `;
    return;
  }

  const execution = backup.execution || {};
  const digest = String(backup.sha256 || "");
  container.innerHTML = `
    <strong>实验状态备份 <span class="badge ok">已留底</span></strong>
    <span>最近备份：${escapeHtml(backup.time || "-")}；原因：${escapeHtml(backup.reason || "-")}；文件：${escapeHtml(backup.fileName || "-")}。</span>
    <div class="official-list">
      <span class="official-chip">正式信号 ${Number(backup.signalCount || 0)}</span>
      <span class="official-chip">已知信号 ${Number(backup.knownSignalCount || 0)}</span>
      <span class="official-chip">执行待补 ${Number(execution.pending || 0)}</span>
      <span class="official-chip">危险 ${Number(backup.integrityDangerCount || 0)}</span>
      <span class="official-chip">SHA ${escapeHtml(digest.slice(0, 12) || "-")}</span>
      <span class="official-chip">最近备份 ${runCount}</span>
    </div>
  `;
}

function signalPrimaryCode(signal) {
  return signal.execution?.code || signal.exitPlans?.[0]?.code || signal.candidates?.[0]?.code || "";
}

function checkpointWindowText(item) {
  const days = item?.targetTradingDays || item?.window?.replace("day", "") || "-";
  return `${days}日`;
}

function checkpointEstimateText(item) {
  return item?.estimatedReviewDate ? `预计 ${item.estimatedReviewDate}（按工作日估算）` : "";
}

function nextCheckpointText() {
  const guard = state.sampleGuard || {};
  const due = guard.dueCheckpoints || [];
  const next = guard.nextCheckpoints || [];
  if (due.length) {
    const item = due[0];
    return `已有 ${due.length} 个回看窗口到期，先点击“回看信号结果”，复核 ${item.date || "-"} 的 ${checkpointWindowText(item)}结果。`;
  }
  if (next.length) {
    const item = next[0];
    const estimate = checkpointEstimateText(item);
    return `下一次回看是 ${item.date || "-"} 的 ${checkpointWindowText(item)}结果，还差约 ${item.remainingTradingDays || 0} 个交易日${estimate ? `，${estimate}` : ""}。`;
  }
  return "暂无到期或待排队的回看窗口。";
}

function renderExecutionTodoPanel() {
  const container = document.getElementById("execution-todo-panel");
  if (!container) return;

  const signals = state.signalHistory || [];
  const pending = pendingExecutionSignals();
  container.classList.toggle("done", signals.length > 0 && pending.length === 0);

  if (!signals.length) {
    container.innerHTML = `
      <strong>执行记录待办</strong>
      <span>暂无正式信号。开启正式样本记录后，每条建议都会在这里提示你是否需要补执行结果。</span>
    `;
    return;
  }

  if (!pending.length) {
    container.innerHTML = `
      <strong>执行记录待办</strong>
      <span>当前 ${signals.length} 条正式信号都已经补过执行结果。${nextCheckpointText()}</span>
    `;
    return;
  }

  const rows = pending.slice(0, 8).map((signal) => {
    const action = suggestedExecutionAction(signal.status, signal.recommendation);
    const code = signalPrimaryCode(signal);
    const quickObserveButton = action === "观察"
      ? `<button class="secondary-button" data-quick-observe="${escapeHtml(signal.id || "")}">确认已观察</button>`
      : "";
    const executionHint = action === "观察"
      ? "待补：确认你是否按建议观察；没有下单也要点“确认已观察”，这只是记录，不会交易。"
      : `待补：选择“已执行 / 未执行 / 延后”，动作默认 ${action}${code ? `，代码 ${code}` : ""}。`;
    return `
      <article class="todo-row">
        <div>
          <strong>${escapeHtml(signal.date || "-")} · ${escapeHtml(signal.status || "未分类信号")}</strong>
          <span>建议：${escapeHtml(signal.recommendation || "-")}</span>
          <span>${escapeHtml(executionHint)}</span>
        </div>
        <div class="todo-actions">
          ${quickObserveButton}
          <button class="secondary-button" data-scroll-signal="${escapeHtml(signal.id || "")}">去补记录</button>
        </div>
      </article>
    `;
  }).join("");
  const hiddenCount = Math.max(0, pending.length - 8);

  container.innerHTML = `
    <strong>执行记录待办</strong>
    <span>还有 ${pending.length} 条信号没有补执行结果。先补这个，再谈准确率；否则后面无法判断是策略错了，还是你没有按计划执行。</span>
    <span>${nextCheckpointText()}</span>
    <div class="todo-list">${rows}</div>
    ${hiddenCount ? `<span>还有 ${hiddenCount} 条较早待办，补完上面几条后会继续显示。</span>` : ""}
  `;
}

function maturityPriorityLabel(value) {
  return {
    due_now: "已到期",
    waiting: "等待到期",
    done: "已回看",
    error: "数据异常",
    not_applicable: "不适用"
  }[value] || value || "-";
}

function maturityPriorityClass(value) {
  if (value === "due_now" || value === "error") return "warn";
  if (value === "done") return "ok";
  return "";
}

function maturityCell(value) {
  return value === null || value === undefined || value === "" ? "-" : escapeHtml(value);
}

function renderMaturitySchedule() {
  const container = document.getElementById("maturity-schedule-panel");
  if (!container) return;

  const signals = state.signalHistory || [];
  const schedule = state.signalMaturitySchedule;
  const summary = schedule?.summary || {};
  const rows = summary.topRows || [];
  const done = summary.doneByWindow || {};
  const nextDue = summary.nextDue || rows.find((row) => ["due_now", "waiting"].includes(row.priority));
  const stale = schedule && Number(summary.signalCount || 0) !== signals.length;

  if (!signals.length) {
    container.innerHTML = `
      <strong>信号回看到期表</strong>
      <span>暂无正式信号。开启正式样本记录并保存信号后，这里会显示每条信号的 5/20/60 日回看排期。</span>
    `;
    return;
  }

  if (!schedule) {
    container.innerHTML = `
      <strong>信号回看到期表</strong>
      <span>还没有生成排期。点击“回看到期表”后，会列出每条信号的 5日、20日、60日回看日期和当前状态。</span>
    `;
    return;
  }

  const rowHtml = rows.map((row) => {
    const candidate = row.candidate || {};
    const candidateText = [candidate.code, candidate.name, candidate.grade].filter(Boolean).join(" ") || "-";
    return `
      <tr>
        <td><span class="badge ${maturityPriorityClass(row.priority)}">${escapeHtml(maturityPriorityLabel(row.priority))}</span></td>
        <td>${maturityCell(row.signalDate)}</td>
        <td>${maturityCell(row.windowLabel)}</td>
        <td>${maturityCell(row.estimatedReviewDate)}</td>
        <td>${maturityCell(row.remainingTradingDays)}</td>
        <td>${maturityCell(row.executionStatus)}</td>
        <td>${maturityCell(candidateText)}</td>
        <td>${maybePct(row.excessPct)}</td>
      </tr>
    `;
  }).join("");

  const nextText = nextDue
    ? `${nextDue.signalDate || "-"} 的 ${nextDue.windowLabel || "-"}回看：${maturityPriorityLabel(nextDue.priority)}，预计 ${nextDue.estimatedReviewDate || "-"}，剩余 ${nextDue.remainingTradingDays ?? "-"} 个交易日。`
    : "当前没有待排期的回看窗口。";

  container.innerHTML = `
    <strong>信号回看到期表</strong>
    <span>${nextText}${stale ? " 排期可能不是最新，建议重新生成。" : ""}</span>
    <div class="official-list">
      <span class="official-chip">5日 ${done.day5 || 0}/30</span>
      <span class="official-chip">20日 ${done.day20 || 0}/30</span>
      <span class="official-chip">60日 ${done.day60 || 0}/30</span>
      <span class="official-chip">已到期 ${summary.dueCount || 0}</span>
      <span class="official-chip">执行待补 ${summary.executionPending || 0}</span>
    </div>
    <div class="table-wrap compact-table">
      <table>
        <thead><tr><th>优先级</th><th>信号</th><th>窗口</th><th>预计回看</th><th>剩余</th><th>执行</th><th>主要候选</th><th>超额</th></tr></thead>
        <tbody>${rowHtml || '<tr><td colspan="8">暂无排期明细</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

function renderReviewTodoPanel() {
  const container = document.getElementById("review-todo-panel");
  if (!container) return;

  const signals = state.signalHistory || [];
  const report = state.reviewTodoReport;
  const summary = report?.summary || {};
  const nextItem = summary.nextItem || null;

  if (!signals.length) {
    container.innerHTML = `
      <strong>回看待办</strong>
      <span>暂无正式信号。保存正式信号后，这里会提示 5/20/60 日回看何时到期。</span>
    `;
    return;
  }

  if (!report) {
    container.innerHTML = `
      <strong>回看待办</strong>
      <span>还没有生成待办。点击“回看待办”，系统会把已到期、快到期和等待中的回看窗口整理出来。</span>
    `;
    return;
  }

  const badgeClass = summary.dueCount ? "warn" : summary.soonCount ? "warn" : "ok";
  const actionText = nextItem
    ? `${nextItem.signalDate || "-"} 的 ${nextItem.windowLabel || "-"}回看，预计 ${nextItem.estimatedReviewDate || "-"}，剩余 ${nextItem.remainingTradingDays ?? "-"} 个交易日。${nextItem.todoAction || ""}`
    : "当前没有可排期的回看窗口，继续积累正式信号。";
  const rows = (report.items || []).slice(0, 5).map((item) => `
    <article class="check-item">
      <header>
        <strong>${escapeHtml(item.signalDate || "-")} · ${escapeHtml(item.windowLabel || "-")}</strong>
        <span class="badge ${item.todoPriority === "due_now" || item.todoPriority === "soon" ? "warn" : "ok"}">${escapeHtml(item.todoPriority || "-")}</span>
      </header>
      <div class="check-meta">预计 ${escapeHtml(item.estimatedReviewDate || "-")}；剩余 ${escapeHtml(item.remainingTradingDays ?? "-")} 个交易日；执行 ${escapeHtml(item.executionStatus || "-")}</div>
      <div class="action-text">${escapeHtml(item.todoAction || "-")}</div>
    </article>
  `).join("");

  container.innerHTML = `
    <strong>回看待办 <span class="badge ${badgeClass}">${escapeHtml(report.phase || "-")}</span></strong>
    <span>最近生成：${escapeHtml(report.time || "-")}；已到期 ${summary.dueCount || 0} 个，快到期 ${summary.soonCount || 0} 个，等待 ${summary.waitingCount || 0} 个，已回看 ${summary.doneCount || 0} 个。</span>
    <span>${escapeHtml(actionText)}</span>
    ${rows ? `<div class="check-list guard-check-list">${rows}</div>` : ""}
  `;
}

function renderCredibilityReportPanel() {
  const container = document.getElementById("credibility-report-panel");
  if (!container) return;

  const signals = state.signalHistory || [];
  const report = state.credibilityReport;
  if (!signals.length) {
    container.innerHTML = `
      <strong>可信度判定</strong>
      <span>暂无正式信号。先积累正式样本，后续这里会判断是否达到可评估门槛。</span>
    `;
    return;
  }

  if (!report) {
    container.innerHTML = `
      <strong>可信度判定</strong>
      <span>还没有生成判定报告。点击“可信度判定”，系统会检查信号数、记录周数、执行覆盖、5/20/60 回看、超额收益和回撤。</span>
    `;
    return;
  }

  const metrics = report.metrics || {};
  const execution = metrics.execution || {};
  const windows = metrics.reviewWindows || {};
  const done = windows.done || {};
  const badgeClass = report.level === "ok" ? "ok" : report.level === "danger" ? "danger" : "warn";
  const blockerRows = (report.blockers || []).slice(0, 5).map((item) => `
    <article class="check-item">
      <header>
        <strong>${escapeHtml(item.title || "-")}</strong>
        <span class="badge ${escapeHtml(item.level || "warn")}">${escapeHtml(item.status || "-")}</span>
      </header>
      <div class="action-text">${escapeHtml(item.detail || "-")}</div>
    </article>
  `).join("");

  container.innerHTML = `
    <strong>可信度判定 <span class="badge ${badgeClass}">${escapeHtml(report.verdict || "-")}</span></strong>
    <span>最近判定：${escapeHtml(report.time || "-")}；${escapeHtml(report.conclusion || "")}</span>
    <div class="official-list">
      <span class="official-chip">信号 ${Number(metrics.signalCount || 0)}/30</span>
      <span class="official-chip">周数 ${Number(metrics.recordedWeeks || 0)}/8</span>
      <span class="official-chip">执行 ${Number(execution.recorded || 0)}/${Number(execution.totalSignals || 0)}</span>
      <span class="official-chip">5日 ${Number(done.day5 || 0)}/30</span>
      <span class="official-chip">20日 ${Number(done.day20 || 0)}/30</span>
      <span class="official-chip">60日 ${Number(done.day60 || 0)}/30</span>
      <span class="official-chip">平均超额 ${maybePct(metrics.avgExcessPct)}</span>
      <span class="official-chip">最差回撤 ${maybePct(metrics.worstMaxDrawdownPct)}</span>
      <span class="official-chip">胜率下界 ${maybePct(metrics.wilsonLowerPct)}</span>
    </div>
    ${blockerRows ? `<div class="check-list guard-check-list">${blockerRows}</div>` : "<span>最低可评估门槛已满足，可以写阶段复盘，但仍保持小资金验证。</span>"}
  `;
}

function renderSignalExportPanel() {
  const container = document.getElementById("signal-export-panel");
  if (!container) return;

  const signals = state.signalHistory || [];
  const exportInfo = state.signalHistoryExport;
  const summary = exportInfo?.summary || {};
  const stale = exportInfo && Number(summary.signalCount || 0) !== signals.length;

  if (!signals.length) {
    container.innerHTML = `
      <strong>信号历史导出</strong>
      <span>暂无正式信号。保存正式信号后，可以把信号、执行记录和 5/20/60 日回看结果导出为 CSV/JSON/Markdown。</span>
    `;
    return;
  }

  if (!exportInfo) {
    container.innerHTML = `
      <strong>信号历史导出</strong>
      <span>还没有导出。点击“导出信号历史”后，会生成可复查的 CSV、JSON 和 Markdown 文件。</span>
    `;
    return;
  }

  container.innerHTML = `
    <strong>信号历史导出</strong>
    <span>上次导出：${escapeHtml(exportInfo.time || "-")}；导出 ${summary.exportedRowCount || 0} 条信号；执行待补 ${summary.executionPending || 0} 条。${stale ? " 当前信号数量已变化，建议重新导出。" : ""}</span>
    <div class="official-list">
      <span class="official-chip">5日 ${summary.doneByWindow?.day5 || 0}/30</span>
      <span class="official-chip">20日 ${summary.doneByWindow?.day20 || 0}/30</span>
      <span class="official-chip">60日 ${summary.doneByWindow?.day60 || 0}/30</span>
      <a class="secondary-button inline-download" href="/api/download-signal-history?format=csv" download>CSV</a>
      <a class="secondary-button inline-download" href="/api/download-signal-history?format=json" download>JSON</a>
      <a class="secondary-button inline-download" href="/api/download-signal-history?format=md" download>Markdown</a>
    </div>
  `;
}

function renderSignalValidationSummary() {
  const container = document.getElementById("signal-summary");
  if (!container) return;
  const validation = state.signalValidation;
  const signals = state.signalHistory || [];
  const execution = executionSummary();

  if (!signals.length) {
    container.innerHTML = `
      <strong>回看状态</strong>
      <span>暂无正式信号样本。先在“提醒设置”开启正式样本记录，再点击“生成今日评分”或“记录当前信号”，后面才能验证 5/20/60 日结果和手动执行纪律。</span>
    `;
    return;
  }

  if (!validation) {
    container.innerHTML = `
      <strong>回看状态</strong>
      <span>还没有运行过回看。点击“回看信号结果”后，系统会用真实日K线计算候选 ETF 相对 510300 的表现。</span>
      <span>执行记录：${execution.recorded}/${execution.totalSignals} 条；已执行 ${execution.executed}，未执行 ${execution.skipped}，延后 ${execution.delayed}。</span>
    `;
    return;
  }

  const windows = [
    ["day5", "5日"],
    ["day20", "20日"],
    ["day60", "60日"]
  ].map(([key, label]) => {
    const item = validation.byWindow?.[key] || {};
    return `<span class="official-chip">${label}：已回看 ${item.done || 0}/${item.total || signals.length}，胜率 ${maybePct(item.winRatePct)}，平均超额 ${maybePct(item.avgExcessPct)}，最大回撤 ${maybePct(item.worstMaxDrawdownPct)}</span>`;
  }).join("");

  container.innerHTML = `
    <strong>回看状态</strong>
    <span>最近回看：${validation.time || "-"}；基准：${validation.benchmark?.code || "510300"} ${validation.benchmark?.name || "沪深300ETF"}；总回看窗口：${validation.doneCheckpoints || 0}。</span>
    <span>执行记录：${execution.recorded}/${execution.totalSignals} 条；已执行 ${execution.executed}，未执行 ${execution.skipped}，延后 ${execution.delayed}。</span>
    <div class="official-list">${windows}</div>
  `;
}

function accuracyVerdict(signals, validation, execution) {
  const weeks = recordedWeekCount(signals);
  const windowStatus = validationWindowStatus(validation || {});
  if (!signals.length) {
    return {
      label: "等待样本",
      level: "warn",
      text: "还没有信号样本，先验证记录流程和数据同步是否稳定。"
    };
  }
  if (signals.length < 30) {
    return {
      label: "样本不足",
      level: "warn",
      text: `当前 ${signals.length}/30 条信号、${weeks}/8 周记录，只能做实验复盘。`
    };
  }
  if (weeks < 8) {
    return {
      label: "周期不足",
      level: "warn",
      text: `信号数量达到 30 条，但记录周期只有 ${weeks}/8 周，仍不能说策略可信。`
    };
  }
  if (!validation || !validation.doneCheckpoints) {
    return {
      label: "尚未回看",
      level: "warn",
      text: "样本已积累，但还没有运行 5/20/60 日回看。"
    };
  }
  if (!windowStatus.complete) {
    return {
      label: "回看不完整",
      level: "warn",
      text: `5/20/60 三类窗口还没各满 30 个结果：5日 ${windowStatus.done.day5}/30，20日 ${windowStatus.done.day20}/30，60日 ${windowStatus.done.day60}/30。`
    };
  }
  if (execution.pending > 0) {
    return {
      label: "执行待补",
      level: "warn",
      text: `还有 ${execution.pending} 条信号没有记录你是否执行，无法区分策略问题和执行问题。`
    };
  }
  if (number(validation.avgExcessPct) > 0) {
    return {
      label: "初步优于基准",
      level: "ok",
      text: "样本和周期达到最低门槛，且平均超额收益为正，可以继续小资金验证。"
    };
  }
  return {
    label: "需要调整",
    level: "danger",
    text: "样本和周期达到最低门槛，但平均超额收益不理想，应暂停扩大资金并复盘规则。"
  };
}

function renderAccuracyReport() {
  const container = document.getElementById("accuracy-report");
  if (!container) return;
  const signals = state.signalHistory || [];
  const validation = state.signalValidation || null;
  const execution = executionSummary();
  const weeks = recordedWeekCount(signals);
  const verdict = accuracyVerdict(signals, validation, execution);
  const byWindow = validation?.byWindow || {};
  const guard = state.sampleGuard || {};
  const dueCheckpoints = guard.dueCheckpoints || [];
  const nextCheckpoints = guard.nextCheckpoints || [];
  const checkpointStatus = dueCheckpoints.length
    ? `到期 ${dueCheckpoints.length} 个`
    : nextCheckpoints.length
      ? `还差 ${nextCheckpoints[0].remainingTradingDays || 0} 日`
      : "暂无";
  const checkpointMeta = dueCheckpoints.length
    ? `先回看 ${dueCheckpoints[0].date || "-"} 的 ${checkpointWindowText(dueCheckpoints[0])}结果${checkpointEstimateText(dueCheckpoints[0]) ? `，${checkpointEstimateText(dueCheckpoints[0])}` : ""}。`
    : nextCheckpoints.length
      ? `下一次是 ${nextCheckpoints[0].date || "-"} 的 ${checkpointWindowText(nextCheckpoints[0])}结果${checkpointEstimateText(nextCheckpoints[0]) ? `，${checkpointEstimateText(nextCheckpoints[0])}` : ""}；未到期前不要提前判定策略准不准。`
      : "没有可回看的历史信号，继续按每日流程积累样本。";
  const windowRows = [
    ["day5", "5日"],
    ["day20", "20日"],
    ["day60", "60日"]
  ].map(([key, label]) => {
    const item = byWindow[key] || {};
    return `
      <tr>
        <td>${label}</td>
        <td>${item.done || 0}/${item.total || signals.length}</td>
        <td>${maybePct(item.winRatePct)}</td>
        <td>${maybePct(item.avgReturnPct)}</td>
        <td>${maybePct(item.avgExcessPct)}</td>
        <td>${maybePct(item.worstMaxDrawdownPct)}</td>
      </tr>
    `;
  }).join("");

  container.innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <h2>准确性报告</h2>
        <span class="badge ${verdict.level}">${verdict.label}</span>
      </div>
      <p class="muted-line">${verdict.text}</p>
      <div class="dashboard-grid">
        <article class="check-item">
          <header><strong>信号样本</strong><span class="badge">${signals.length}/30</span></header>
          <div class="check-meta">记录周期 ${weeks}/8 周；少于 8-12 周不评价策略可信度。</div>
        </article>
        <article class="check-item">
          <header><strong>执行覆盖</strong><span class="badge ${execution.pending ? "warn" : "ok"}">${execution.recorded}/${execution.totalSignals}</span></header>
          <div class="check-meta">覆盖率 ${maybePct(execution.coveragePct)}；未记录 ${execution.pending} 条。</div>
        </article>
        <article class="check-item">
          <header><strong>回看排期</strong><span class="badge ${dueCheckpoints.length ? "warn" : "ok"}">${checkpointStatus}</span></header>
          <div class="check-meta">${checkpointMeta}</div>
        </article>
        <article class="check-item">
          <header><strong>平均超额</strong><span class="badge ${number(validation?.avgExcessPct) > 0 ? "ok" : "warn"}">${maybePct(validation?.avgExcessPct)}</span></header>
          <div class="check-meta">相对 ${validation?.benchmark?.code || "510300"}；平均收益 ${maybePct(validation?.avgReturnPct)}。</div>
        </article>
        <article class="check-item">
          <header><strong>最大回撤</strong><span class="badge ${number(validation?.worstMaxDrawdownPct) < -10 ? "danger" : "warn"}">${maybePct(validation?.worstMaxDrawdownPct)}</span></header>
          <div class="check-meta">平均窗口 ${maybePct(validation?.avgMaxDrawdownPct)}；统计窗口内从高点到低点的跌幅。</div>
        </article>
      </div>
      <div class="table-wrap compact-table">
        <table>
          <thead><tr><th>窗口</th><th>已回看</th><th>胜率</th><th>平均收益</th><th>平均超额</th><th>最大回撤</th></tr></thead>
          <tbody>${windowRows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function executionBadge(execution = {}) {
  const status = normalizeExecutionStatus(execution.status);
  const className = status === "已执行" || status === "部分执行"
    ? "ok"
    : status === "未执行" || status === "延后"
      ? "warn"
      : "";
  return `<span class="badge ${className}">执行：${status}</span>`;
}

function optionList(options, selected) {
  return options
    .map((item) => `<option${item === selected ? " selected" : ""}>${item}</option>`)
    .join("");
}

function executionFormHtml(signal) {
  const execution = signal.execution || defaultExecutionRecord(signal.status, signal.recommendation);
  const defaultCode = execution.code || signal.exitPlans?.[0]?.code || signal.candidates?.[0]?.code || "";
  return `
    <div class="execution-panel" data-execution-form>
      <div class="panel-header">
        <div>
          <strong>手动执行记录</strong>
          <p class="muted-line">记录你是否真的按这条建议操作。这里不自动交易，只保存复盘证据。</p>
        </div>
        ${executionBadge(execution)}
      </div>
      <div class="form-grid execution-grid">
        <label>执行状态
          <select data-execution-field="status">${optionList(["未记录", "已执行", "部分执行", "未执行", "延后"], execution.status || "未记录")}</select>
        </label>
        <label>执行动作
          <select data-execution-field="action">${optionList(["观察", "买入", "卖出", "赎回", "空仓", "暂停"], execution.action || suggestedExecutionAction(signal.status, signal.recommendation))}</select>
        </label>
        <label>执行日期<input data-execution-field="date" type="date" value="${escapeHtml(execution.date || "")}" /></label>
        <label>代码<input data-execution-field="code" value="${escapeHtml(defaultCode)}" /></label>
        <label>价格/净值<input data-execution-field="price" type="number" step="0.0001" value="${escapeHtml(execution.price || "")}" /></label>
        <label>金额<input data-execution-field="amountYuan" type="number" step="0.01" value="${escapeHtml(execution.amountYuan || "")}" /></label>
        <label>数量/份额<input data-execution-field="quantity" type="number" step="0.01" value="${escapeHtml(execution.quantity || "")}" /></label>
      </div>
      <textarea data-execution-field="notes" placeholder="例如：已按提醒赎回 / 没执行，因为净值未到目标 / 延后到明天复核">${escapeHtml(execution.notes || "")}</textarea>
      <button class="secondary-button" data-execution-save="${escapeHtml(signal.id)}">保存执行记录</button>
    </div>
  `;
}

function renderSignals() {
  renderSamplePlan();
  renderSampleGuard();
  renderSignalIntegrityPanel();
  renderStateBackupPanel();
  renderMaturitySchedule();
  renderReviewTodoPanel();
  renderCredibilityReportPanel();
  renderSignalExportPanel();
  renderExecutionTodoPanel();
  renderSignalValidationSummary();
  renderAccuracyReport();
  const container = document.getElementById("signal-list");
  const signals = state.signalHistory || [];
  container.innerHTML = "";

  if (!signals.length) {
    container.innerHTML = '<div class="empty">暂无信号记录。点击“记录当前信号”后，系统会保存当前建议和数据快照。</div>';
    return;
  }

  signals.forEach((signal) => {
    const article = document.createElement("article");
    article.className = "record signal-record";
    article.dataset.signalId = signal.id || "";
    const candidates = (signal.candidates || []).slice(0, 3)
      .map((item) => `<span class="official-chip">${item.code} ${item.grade}级 ${item.totalScore}分</span>`)
      .join("") || '<span class="official-chip">无候选</span>';
    const exits = (signal.exitPlans || [])
      .map((item) => `<span class="official-chip">${item.code} 目标 ${number(item.target).toFixed(4)}</span>`)
      .join("") || '<span class="official-chip">无退出目标</span>';
    const actions = (signal.suggestedActions || signal.operationPlan?.items || [])
      .map((item) => `<span class="official-chip">${escapeHtml(item.title || "-")}：${escapeHtml(item.action || item.status || "-")}</span>`)
      .join("") || '<span class="official-chip">无操作建议</span>';
    const manualOrders = (signal.manualOrderChecklist?.items || signal.operationPlan?.manualOrderChecklist?.items || [])
      .map((item) => `<span class="official-chip">${escapeHtml(item.title || "-")}：${escapeHtml(item.action || item.status || "-")}${item.code ? ` ${escapeHtml(item.code)}` : ""}${item.quantity ? ` ${escapeHtml(item.quantity)}份` : ""}</span>`)
      .join("") || '<span class="official-chip">无手动清单</span>';
    const checkpoints = ["day5", "day20", "day60"].map((key) => {
      const item = signal.checkpoints?.[key] || {};
      return checkpointBadge(key, item);
    }).join("");

    article.innerHTML = `
      <div class="panel-header">
        <h2>${signal.date} ${signal.status}</h2>
        <div class="official-list">
          <span class="badge ${signal.pnl >= 0 ? "ok" : "warn"}">样本 #${signals.length - signals.indexOf(signal)}</span>
          ${executionBadge(signal.execution)}
        </div>
      </div>
      <p class="recommendation">${signal.recommendation}</p>
      <p class="muted-line">记录时间：${signal.time || "-"} ｜ 持仓市值：${yuan(signal.marketValue)} ｜ 盈亏：${yuan(signal.pnl)} (${pct(signal.pnlPct)})</p>
      <div class="signal-groups">
        <div><strong>当时建议</strong><div class="official-list">${actions}</div></div>
        <div><strong>手动操作清单</strong><div class="official-list">${manualOrders}</div></div>
        <div><strong>候选 ETF</strong><div class="official-list">${candidates}</div></div>
        <div><strong>退出计划</strong><div class="official-list">${exits}</div></div>
        <div><strong>回看进度</strong><div class="official-list">${checkpoints}</div></div>
      </div>
      ${executionFormHtml(signal)}
      <details>
        <summary>查看当时数据快照</summary>
        <pre class="email-preview">${JSON.stringify(signal.dataSnapshot || {}, null, 2)}</pre>
      </details>
      <details>
        <summary>查看回看明细</summary>
        <pre class="email-preview">${JSON.stringify(signal.checkpoints || {}, null, 2)}</pre>
      </details>
    `;
    container.appendChild(article);
  });
}

function renderAll() {
  renderDashboard();
  renderWatchlist();
  renderRecordList("portfolio", "portfolio-list", "position-template");
  renderRecordList("trades", "trade-list", "trade-template");
  renderSimulation();
  renderSettings();
  renderDaily();
  renderNews();
  renderSignals();
}

function bindEvents() {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });
  document.querySelectorAll(".top-more-actions button").forEach((button) => button.addEventListener("click", () => {
    const details = button.closest(".top-more-actions");
    if (details) details.open = false;
  }));

  document.getElementById("market-symbol-select")?.addEventListener("change", (event) => loadMarketVisualization(event.target.value));
  document.getElementById("fund-symbol-select")?.addEventListener("change", (event) => loadFundVisualization(event.target.value));
  document.getElementById("exposure-fund-select")?.addEventListener("change", (event) => loadPortfolioExposure(event.target.value));
  document.getElementById("exposure-refresh-button")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "正在同步季度报告";
    try {
      const response = await fetch("/api/update-fund-exposure", { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "同步失败");
      await loadState();
      await loadPortfolioExposure(activeExposureCode);
      showRuntimeBanner(`持仓穿透已更新：${payload.fundCount || 0} 只基金；季度披露不会在周末产生实时变化。`);
    } catch (error) {
      showRuntimeBanner(`持仓穿透同步失败：${escapeHtml(friendlyErrorMessage(error.message))}`, "warn");
    } finally {
      button.disabled = false;
      button.textContent = "刷新季度持仓";
    }
  });

  const importDialog = document.getElementById("portfolio-import-dialog");
  const importInput = document.getElementById("portfolio-import-input");
  const screenshotPortfolio = [
    "510300 | 沪深300ETF（演示） | 10000.00 | 500.00",
    "511010 | 国债ETF（演示） | 5000.00 | -50.00",
    "518880 | 黄金ETF（演示） | 3000.00 | 120.00"
  ].join("\n");
  const openImportDialog = () => {
    if (typeof importDialog?.showModal === "function") importDialog.showModal();
  };
  document.getElementById("import-position-button")?.addEventListener("click", openImportDialog);
  document.getElementById("portfolio-import-entry-button")?.addEventListener("click", openImportDialog);
  document.getElementById("cancel-portfolio-import-button")?.addEventListener("click", () => importDialog?.close());
  importDialog?.addEventListener("click", (event) => { if (event.target === importDialog) importDialog.close(); });
  document.querySelectorAll("[data-import-mode]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll("[data-import-mode]").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll("[data-import-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.importPanel === button.dataset.importMode));
  }));
  document.getElementById("load-screenshot-portfolio-button")?.addEventListener("click", () => { importInput.value = screenshotPortfolio; });

  async function importPortfolioItems(items, button) {
    const status = document.getElementById("portfolio-import-status");
    try {
      button.disabled = true;
      const originalText = button.textContent;
      button.textContent = "正在保存";
      const response = await fetch("/api/portfolio/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "持仓导入失败");
      const hasFunds = items.some((item) => /基金|QDII|联接|债券|混合/.test(String(item.type || item.name || "")));
      status.textContent = `已保存 ${payload.imported.length} 只${hasFunds ? "，正在同步基金净值与季度持仓…" : "，正在生成持仓穿透…"}`;
      let navMessage = "";
      if (hasFunds) {
        const navResponse = await fetch("/api/update-fund-nav", { method: "POST" });
        const navPayload = await navResponse.json();
        navMessage = navResponse.ok ? `净值更新 ${navPayload.count ?? navPayload.updated ?? 0} 只` : `净值暂未更新：${friendlyErrorMessage(navPayload.error || "网络暂不可用")}`;
      }
      const exposureResponse = await fetch("/api/update-fund-exposure", { method: "POST" });
      const exposurePayload = await exposureResponse.json();
      await loadState();
      status.textContent = `导入完成：${payload.imported.length} 只；${navMessage ? `${navMessage}；` : ""}${exposureResponse.ok ? `穿透映射 ${exposurePayload.fundCount || 0} 只。` : `穿透暂未更新：${friendlyErrorMessage(exposurePayload.error || "网络暂不可用")}`}`;
      button.textContent = "已保存";
      setTimeout(() => { button.textContent = originalText; }, 1600);
      return true;
    } catch (error) {
      status.textContent = friendlyErrorMessage(error.message);
      button.textContent = "请修正后重试";
      return false;
    } finally {
      button.disabled = false;
    }
  }

  document.getElementById("confirm-single-import-button")?.addEventListener("click", async (event) => {
    const item = {
      code: document.getElementById("single-import-code").value.trim(),
      name: document.getElementById("single-import-name").value.trim(),
      type: document.getElementById("single-import-type").value,
      quantity: Number(document.getElementById("single-import-quantity").value),
      cost: Number(document.getElementById("single-import-cost").value),
      current: Number(document.getElementById("single-import-current").value),
      importSource: "软件内手动录入"
    };
    await importPortfolioItems([item], event.currentTarget);
  });

  document.getElementById("portfolio-import-file")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    importInput.value = await file.text();
    document.getElementById("portfolio-import-status").textContent = `已读取 ${file.name}，请核对后点击“确认批量导入”。`;
  });

  let imageOcrItems = [];
  const ocrTypes = ["场外基金", "场外基金·ETF联接", "场外基金·QDII", "场外基金·债券", "场外基金·混合", "场内ETF", "股票"];
  function renderImageOcrResults(payload) {
    imageOcrItems = payload.items || [];
    const tbody = document.getElementById("image-ocr-results");
    tbody.innerHTML = imageOcrItems.length ? imageOcrItems.map((item, index) => `<tr data-ocr-index="${index}">
      <td><input type="checkbox" data-ocr-field="selected" checked /></td>
      <td><input data-ocr-field="code" maxlength="12" value="${escapeHtml(item.code || "")}" placeholder="必填" /></td>
      <td><input data-ocr-field="name" value="${escapeHtml(item.name || "")}" /></td>
      <td><select data-ocr-field="type">${ocrTypes.map((type) => `<option${type === item.type ? " selected" : ""}>${escapeHtml(type)}</option>`).join("")}</select></td>
      <td><input data-ocr-field="marketValue" type="number" step="0.01" value="${item.marketValue ?? ""}" /></td>
      <td><input data-ocr-field="pnl" type="number" step="0.01" value="${item.pnl ?? ""}" /></td>
    </tr>`).join("") : '<tr><td colspan="6">没有识别到基金，请换用更清晰、完整的截图。</td></tr>';
    document.getElementById("image-ocr-summary").textContent = `识别 ${imageOcrItems.length} 只，OCR 置信度 ${payload.confidence || 0}%。基金代码通常不在持仓页显示，请补充并核对。${(payload.warnings || []).join(" ")}`;
    document.getElementById("image-ocr-raw-text").textContent = payload.text || "";
    document.getElementById("image-ocr-preview").classList.remove("hidden");
  }

  document.getElementById("portfolio-image-input")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const status = document.getElementById("portfolio-import-status");
    if (!/^image\/(png|jpeg|webp|bmp)$/.test(file.type) || file.size > 9_000_000) {
      status.textContent = "请选择不超过 9MB 的 PNG、JPG、WebP 或 BMP 图片。";
      return;
    }
    const progress = document.getElementById("image-ocr-progress");
    progress.classList.remove("hidden");
    document.getElementById("image-ocr-preview").classList.add("hidden");
    status.textContent = `正在本机识别 ${file.name}，图片不会上传…`;
    try {
      const imageDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("读取图片失败"));
        reader.readAsDataURL(file);
      });
      const response = await fetch("/api/portfolio/recognize-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageDataUrl, fileName: file.name }) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "图片识别失败");
      renderImageOcrResults(payload);
      status.textContent = `本地识别完成：找到 ${payload.items?.length || 0} 只基金。请逐项核对代码、名称、类型和金额。`;
    } catch (error) {
      status.textContent = friendlyErrorMessage(error.message);
    } finally {
      progress.classList.add("hidden");
      event.target.value = "";
    }
  });

  document.getElementById("confirm-image-import-button")?.addEventListener("click", async (event) => {
    const rows = [...document.querySelectorAll("#image-ocr-results tr[data-ocr-index]")];
    const items = rows.filter((row) => row.querySelector('[data-ocr-field="selected"]')?.checked).map((row) => ({
      code: row.querySelector('[data-ocr-field="code"]').value.trim(),
      name: row.querySelector('[data-ocr-field="name"]').value.trim(),
      type: row.querySelector('[data-ocr-field="type"]').value,
      marketValue: Number(row.querySelector('[data-ocr-field="marketValue"]').value),
      pnl: Number(row.querySelector('[data-ocr-field="pnl"]').value),
      importSource: "本地图片OCR识别（用户已核对）"
    }));
    if (!items.length) {
      document.getElementById("portfolio-import-status").textContent = "请至少勾选一项。";
      return;
    }
    if (items.some((item) => !item.code)) {
      document.getElementById("portfolio-import-status").textContent = "请先补充所有勾选基金的代码；代码是匹配净值和避免重名的必要字段。";
      return;
    }
    await importPortfolioItems(items, event.currentTarget);
  });

  document.getElementById("confirm-portfolio-import-button")?.addEventListener("click", async (event) => {
    try {
      const lines = importInput.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const items = lines.map((line, index) => {
        const parts = line.split(/\s*[|\t,，]\s*/).map((part) => part.trim());
        if (index === 0 && /代码/.test(parts[0]) && /名称/.test(parts[1] || "")) return null;
        if (parts.length < 4) throw new Error(`第 ${index + 1} 行必须包含4列：代码、名称、当前金额、持有收益。`);
        return { code: parts[0], name: parts[1], marketValue: Number(parts[2]), pnl: Number(parts[3]), type: "场外基金", importSource: "软件内批量导入" };
      }).filter(Boolean);
      await importPortfolioItems(items, event.currentTarget);
    } catch (error) {
      document.getElementById("portfolio-import-status").textContent = friendlyErrorMessage(error.message);
    }
  });
  document.querySelectorAll("[data-market-range]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll("[data-market-range]").forEach((item) => item.classList.toggle("active", item === button));
    window.MarketCharts?.setRange(button.dataset.marketRange);
  }));
  document.querySelectorAll("[data-fund-range]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll("[data-fund-range]").forEach((item) => item.classList.toggle("active", item === button));
    window.FundCharts?.setRange(button.dataset.fundRange);
  }));
  document.getElementById("candidate-explain-list")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-market-code]");
    if (!button) return;
    activeMarketCode = button.dataset.marketCode;
    switchView("market");
  });

  document.getElementById("simulate-weekly-buy-button")?.addEventListener("click", async () => {
    await runSimulatedWeeklyBuyFromButton(document.getElementById("simulate-weekly-buy-button"));
  });

  document.getElementById("simulate-refresh-button")?.addEventListener("click", async () => {
    const button = document.getElementById("simulate-refresh-button");
    button.textContent = "刷新中";
    button.disabled = true;
    try {
      await refreshSimulatedPortfolio();
      button.textContent = "已刷新";
    } catch (error) {
      button.textContent = "刷新失败";
      alert(error.message);
    } finally {
      button.disabled = false;
      setTimeout(() => {
        button.textContent = "刷新模拟盈亏";
      }, 1400);
    }
  });

  document.getElementById("score-button").addEventListener("click", async () => {
    const button = document.getElementById("score-button");
    state.watchlist = state.watchlist.map(scoreEtf);
    if (isFileMode) {
      renderAll();
      showRuntimeBanner('生成评分后保存信号需要本地服务。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 使用完整功能。', "warn");
      return;
    }

    button.disabled = true;
    button.textContent = "记录中";
    try {
      await saveState();
      const result = await recordSignal("score");
      button.textContent = result?.status === "duplicate"
        ? "评分已存在"
        : result?.status === "preview"
          ? "评分已预检"
          : "评分已记录";
    } catch (error) {
      renderAll();
      button.textContent = "保存失败";
      alert(error.message);
    } finally {
      button.disabled = false;
      setTimeout(() => {
        button.textContent = "生成今日评分";
      }, 1400);
    }
  });

  document.getElementById("formal-start-toggle").addEventListener("click", async () => {
    await setFormalRecording(!state.settings.formalSignalRecording);
  });

  document.getElementById("goal-audit-button").addEventListener("click", async () => {
    if (isFileMode) {
      showRuntimeBanner('目标审计需要本地服务。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 后再点击。', "warn");
      return;
    }

    const button = document.getElementById("goal-audit-button");
    button.textContent = "审计中";
    button.disabled = true;
    try {
      const res = await fetch("/api/audit-goal", { method: "POST" });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || "目标审计失败");
      }
      await loadState();
      button.textContent = "已审计";
    } catch (error) {
      button.textContent = "审计失败";
      alert(error.message);
    } finally {
      button.disabled = false;
      setTimeout(() => {
        button.textContent = "运行审计";
      }, 1600);
    }
  });

  document.getElementById("step-tracker-signal-link").addEventListener("click", () => {
    switchView("signals");
  });

  document.getElementById("signal-button").addEventListener("click", async () => {
    await recordSignalFromButton(document.getElementById("signal-button"), "manual");
  });

  document.getElementById("sample-guard-button").addEventListener("click", async () => {
    if (isFileMode) {
      showRuntimeBanner('样本守护需要本地服务。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 后再点击。', "warn");
      return;
    }

    const button = document.getElementById("sample-guard-button");
    button.textContent = "检查中";
    button.disabled = true;
    try {
      const res = await fetch("/api/sample-guard", { method: "POST" });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || "样本守护检查失败");
      }
      await loadState();
      button.textContent = "已检查";
    } catch (error) {
      button.textContent = "检查失败";
      alert(error.message);
    } finally {
      button.disabled = false;
      setTimeout(() => {
        button.textContent = "样本守护";
      }, 1600);
    }
  });

  document.getElementById("signal-integrity-button").addEventListener("click", async () => {
    if (isFileMode) {
      showRuntimeBanner('样本完整性审计需要本地服务。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 后再点击。', "warn");
      return;
    }

    const button = document.getElementById("signal-integrity-button");
    button.textContent = "审计中";
    button.disabled = true;
    try {
      const res = await fetch("/api/audit-signal-integrity", { method: "POST" });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "样本完整性审计失败");
      }
      await loadState();
      if (!payload.ok) {
        throw new Error("样本完整性审计发现危险问题，请先查看红色提示。");
      }
      button.textContent = "已审计";
    } catch (error) {
      button.textContent = "审计失败";
      alert(error.message);
    } finally {
      button.disabled = false;
      setTimeout(() => {
        button.textContent = "样本完整性";
      }, 1600);
    }
  });

  document.getElementById("state-backup-button").addEventListener("click", async () => {
    if (isFileMode) {
      showRuntimeBanner('状态备份需要本地服务。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 后再点击。', "warn");
      return;
    }

    const button = document.getElementById("state-backup-button");
    button.textContent = "备份中";
    button.disabled = true;
    try {
      const res = await fetch("/api/backup-state", { method: "POST" });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || "状态备份失败");
      }
      await loadState();
      button.textContent = "已备份";
    } catch (error) {
      button.textContent = "备份失败";
      alert(error.message);
    } finally {
      button.disabled = false;
      setTimeout(() => {
        button.textContent = "备份状态";
      }, 1600);
    }
  });

  document.getElementById("maturity-schedule-button").addEventListener("click", async () => {
    if (isFileMode) {
      showRuntimeBanner('回看到期表需要本地服务。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 后再点击。', "warn");
      return;
    }

    const button = document.getElementById("maturity-schedule-button");
    button.textContent = "生成中";
    button.disabled = true;
    try {
      const res = await fetch("/api/build-maturity-schedule", { method: "POST" });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || "回看到期表生成失败");
      }
      await loadState();
      button.textContent = "已生成";
    } catch (error) {
      button.textContent = "生成失败";
      alert(error.message);
    } finally {
      button.disabled = false;
      setTimeout(() => {
        button.textContent = "回看到期表";
      }, 1600);
    }
  });

  document.getElementById("review-todo-button").addEventListener("click", async () => {
    if (isFileMode) {
      showRuntimeBanner('回看待办需要本地服务。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 后再点击。', "warn");
      return;
    }

    const button = document.getElementById("review-todo-button");
    button.textContent = "生成中";
    button.disabled = true;
    try {
      const res = await fetch("/api/build-review-todo", { method: "POST" });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || "回看待办生成失败");
      }
      await loadState();
      button.textContent = "已生成";
    } catch (error) {
      button.textContent = "生成失败";
      alert(error.message);
    } finally {
      button.disabled = false;
      setTimeout(() => {
        button.textContent = "回看待办";
      }, 1600);
    }
  });

  document.getElementById("credibility-report-button").addEventListener("click", async () => {
    if (isFileMode) {
      showRuntimeBanner('可信度判定需要本地服务。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 后再点击。', "warn");
      return;
    }

    const button = document.getElementById("credibility-report-button");
    button.textContent = "判定中";
    button.disabled = true;
    try {
      const res = await fetch("/api/build-credibility-report", { method: "POST" });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || "可信度判定失败");
      }
      await loadState();
      button.textContent = "已判定";
    } catch (error) {
      button.textContent = "判定失败";
      alert(error.message);
    } finally {
      button.disabled = false;
      setTimeout(() => {
        button.textContent = "可信度判定";
      }, 1600);
    }
  });

  document.getElementById("export-signals-button").addEventListener("click", async () => {
    if (isFileMode) {
      showRuntimeBanner('导出信号历史需要本地服务。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 后再点击。', "warn");
      return;
    }

    const button = document.getElementById("export-signals-button");
    button.textContent = "导出中";
    button.disabled = true;
    try {
      const res = await fetch("/api/export-signal-history", { method: "POST" });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || "信号历史导出失败");
      }
      await loadState();
      button.textContent = "已导出";
    } catch (error) {
      button.textContent = "导出失败";
      alert(error.message);
    } finally {
      button.disabled = false;
      setTimeout(() => {
        button.textContent = "导出信号历史";
      }, 1600);
    }
  });

  document.getElementById("daily-run-button").addEventListener("click", async () => {
    if (isFileMode) {
      showRuntimeBanner('每日运行需要本地服务。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 后再点击。', "warn");
      return;
    }

    const button = document.getElementById("daily-run-button");
    button.textContent = "运行中";
    button.disabled = true;
    try {
      const res = await fetch("/api/run-daily-experiment", { method: "POST" });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || payload.signal?.message || "每日实验运行失败");
      }
      await loadState();
      button.textContent = "已运行";
    } catch (error) {
      button.textContent = "运行失败";
      alert(error.message);
    } finally {
      button.disabled = false;
      setTimeout(() => {
        button.textContent = "更新全部数据";
      }, 1600);
    }
  });

  document.getElementById("add-signal-button").addEventListener("click", async () => {
    await recordSignalFromButton(document.getElementById("add-signal-button"), "manual");
  });

  document.getElementById("validate-signals-button").addEventListener("click", async () => {
    if (isFileMode) {
      showRuntimeBanner('回看信号需要本地服务。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 后再点击。', "warn");
      return;
    }

    const button = document.getElementById("validate-signals-button");
    button.textContent = "回看中";
    button.disabled = true;
    try {
      const res = await fetch("/api/validate-signals", { method: "POST" });
      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error || "信号回看失败");
      }
      await loadState();
      button.textContent = "已回看";
    } catch (error) {
      button.textContent = "回看失败";
      alert(error.message);
    } finally {
      button.disabled = false;
      setTimeout(() => {
        button.textContent = "回看信号结果";
      }, 1600);
    }
  });

  document.getElementById("signal-list").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-execution-save]");
    if (!button) return;

    const form = button.closest("[data-execution-form]");
    const signalId = button.dataset.executionSave;
    button.textContent = "保存中";
    button.disabled = true;
    try {
      await saveSignalExecution(signalId, form);
      button.textContent = "已保存";
    } catch (error) {
      button.textContent = "保存失败";
      alert(error.message);
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("execution-todo-panel").addEventListener("click", async (event) => {
    const quickButton = event.target.closest("[data-quick-observe]");
    if (quickButton) {
      if (isFileMode) {
        showRuntimeBanner('保存执行记录需要本地服务。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 后再点击。', "warn");
        return;
      }

      const signalId = quickButton.dataset.quickObserve;
      const signal = (state.signalHistory || []).find((item) => item.id === signalId);
      if (!signal) return;

      quickButton.disabled = true;
      quickButton.textContent = "保存中";
      try {
        await persistSignalExecution(signalId, {
          status: "已执行",
          action: "观察",
          date: today(),
          code: signalPrimaryCode(signal),
          price: "",
          amountYuan: "",
          quantity: "",
          notes: "用户确认：本条建议为观察或继续持有，未下单，已按建议观察。",
          savedAt: new Date().toISOString()
        });
      } catch (error) {
        quickButton.textContent = "保存失败";
        alert(error.message);
      } finally {
        quickButton.disabled = false;
      }
      return;
    }

    const button = event.target.closest("[data-scroll-signal]");
    if (!button) return;
    const signalId = button.dataset.scrollSignal;
    const target = Array.from(document.querySelectorAll("[data-signal-id]"))
      .find((node) => node.dataset.signalId === signalId);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("attention");
    setTimeout(() => target.classList.remove("attention"), 2200);
  });

  document.getElementById("efunds-button").addEventListener("click", async () => {
    if (isFileMode) {
      showRuntimeBanner('同步官网列表需要本地服务。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 后再点击。', "warn");
      return;
    }

    const button = document.getElementById("efunds-button");
    button.textContent = "同步中";
    button.disabled = true;
    try {
      const res = await fetch("/api/sync-efunds", { method: "POST" });
      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error || "易方达ETF同步失败");
      }
      await loadState();
      button.textContent = "已同步";
    } catch (error) {
      button.textContent = "同步失败";
      alert(error.message);
    } finally {
      button.disabled = false;
      setTimeout(() => {
        button.textContent = "同步易方达ETF";
      }, 1600);
    }
  });

  document.getElementById("news-button").addEventListener("click", async () => {
    if (isFileMode) {
      showRuntimeBanner('同步新闻事件需要本地服务。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 后再点击。', "warn");
      return;
    }

    const button = document.getElementById("news-button");
    button.textContent = "同步中";
    button.disabled = true;
    try {
      const res = await fetch("/api/sync-news", { method: "POST" });
      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error || "新闻事件同步失败");
      }
      await loadState();
      button.textContent = "已同步";
    } catch (error) {
      button.textContent = "同步失败";
      alert(error.message);
    } finally {
      button.disabled = false;
      setTimeout(() => {
        button.textContent = "同步新闻事件";
      }, 1600);
    }
  });

  document.getElementById("financial-events-button").addEventListener("click", async () => {
    if (isFileMode) {
      showRuntimeBanner('同步财报事件需要本地服务。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 后再点击。', "warn");
      return;
    }

    const button = document.getElementById("financial-events-button");
    button.textContent = "同步中";
    button.disabled = true;
    try {
      const res = await fetch("/api/sync-financial-events", { method: "POST" });
      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error || "财报事件同步失败");
      }
      await loadState();
      button.textContent = "已同步";
    } catch (error) {
      button.textContent = "同步失败";
      alert(error.message);
    } finally {
      button.disabled = false;
      setTimeout(() => {
        button.textContent = "同步财报事件";
      }, 1600);
    }
  });

  document.getElementById("source-whitelist-button").addEventListener("click", async () => {
    if (isFileMode) {
      showRuntimeBanner('同步信息源需要本地服务。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 后再点击。', "warn");
      return;
    }

    const button = document.getElementById("source-whitelist-button");
    button.textContent = "同步中";
    button.disabled = true;
    try {
      const res = await fetch("/api/sync-source-whitelist", { method: "POST" });
      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error || "信息源同步失败");
      }
      await loadState();
      button.textContent = "已同步";
    } catch (error) {
      button.textContent = "同步失败";
      alert(error.message);
    } finally {
      button.disabled = false;
      setTimeout(() => {
        button.textContent = "同步信息源";
      }, 1600);
    }
  });

  document.getElementById("fund-nav-button").addEventListener("click", async () => {
    if (isFileMode) {
      showRuntimeBanner('更新净值需要本地服务。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 后再点击。', "warn");
      return;
    }

    const button = document.getElementById("fund-nav-button");
    button.textContent = "更新中";
    button.disabled = true;
    try {
      const res = await fetch("/api/update-fund-nav", { method: "POST" });
      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error || "净值更新失败");
      }
      await loadState();
      if (document.getElementById("fund-market-view")?.classList.contains("active")) await loadFundVisualization();
      button.textContent = "已更新";
    } catch (error) {
      button.textContent = "更新失败";
      alert(error.message);
    } finally {
      button.disabled = false;
      setTimeout(() => {
        button.textContent = "更新净值";
      }, 1600);
    }
  });

  document.getElementById("crosscheck-nav-button").addEventListener("click", async () => {
    if (isFileMode) {
      showRuntimeBanner('官网核对需要本地服务。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 后再点击。', "warn");
      return;
    }

    const button = document.getElementById("crosscheck-nav-button");
    button.textContent = "核对中";
    button.disabled = true;
    try {
      const res = await fetch("/api/crosscheck-fund-nav", { method: "POST" });
      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error || "官网核对失败");
      }
      await loadState();
      button.textContent = "已核对";
    } catch (error) {
      button.textContent = "核对失败";
      alert(error.message);
    } finally {
      button.disabled = false;
      setTimeout(() => {
        button.textContent = "官网核对";
      }, 1600);
    }
  });

  document.getElementById("market-button").addEventListener("click", async () => {
    if (isFileMode) {
      showRuntimeBanner('更新行情需要本地服务。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 后再点击。', "warn");
      return;
    }

    const button = document.getElementById("market-button");
    button.textContent = "更新中";
    button.disabled = true;
    try {
      const res = await fetch("/api/update-market", { method: "POST" });
      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error || "行情更新失败");
      }
      await loadState();
      button.textContent = "已更新";
    } catch (error) {
      button.textContent = "更新失败";
      alert(error.message);
    } finally {
      button.disabled = false;
      setTimeout(() => {
        button.textContent = "更新行情";
      }, 1600);
    }
  });

  document.getElementById("save-button").addEventListener("click", async () => {
    await saveState();
    document.getElementById("save-button").textContent = "已保存";
    setTimeout(() => {
      document.getElementById("save-button").textContent = "保存";
    }, 1200);
  });

  document.getElementById("copy-email-button").addEventListener("click", async () => {
    await navigator.clipboard.writeText(emailText());
  });

  document.getElementById("email-reminder-button").addEventListener("click", async () => {
    if (isFileMode) {
      showRuntimeBanner('生成邮件提醒需要本地服务。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 后再点击。', "warn");
      return;
    }

    const button = document.getElementById("email-reminder-button");
    button.textContent = "生成中";
    button.disabled = true;
    try {
      const res = await fetch("/api/build-email-reminder", { method: "POST" });
      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error || "邮件提醒生成失败");
      }
      await loadState();
      button.textContent = "已生成";
    } catch (error) {
      button.textContent = "生成失败";
      alert(error.message);
    } finally {
      button.disabled = false;
      setTimeout(() => {
        button.textContent = "生成提醒";
      }, 1600);
    }
  });

  document.getElementById("add-watch-button").addEventListener("click", () => {
    state.watchlist.push({
      id: crypto.randomUUID(),
      code: "",
      name: "",
      type: "ETF",
      price: 0,
      turnoverYuan: 0,
      fundSizeYi: 0,
      bidAskSpreadPct: 0,
      close: 0,
      ma20: 0,
      ma60: 0,
      ma20Slope: 0,
      return1mPct: 0,
      return3mPct: 0,
      benchmarkReturn1mPct: 0,
      benchmarkReturn3mPct: 0,
      notes: ""
    });
    renderWatchlist();
  });

  document.getElementById("add-position-button").addEventListener("click", () => {
    state.portfolio.push({ id: crypto.randomUUID(), code: "", name: "", type: "", cost: 0, current: 0, target: 0, quantity: 0, stop: 0, notes: "" });
    renderAll();
  });

  document.getElementById("add-trade-button").addEventListener("click", () => {
    state.trades.push({ id: crypto.randomUUID(), date: today(), code: "", name: "", side: "买入", price: 0, quantity: 0, fee: 0, notes: "" });
    renderAll();
  });

  document.getElementById("add-status-button").addEventListener("click", () => {
    const summary = portfolioSummary();
    state.dailyStatus.unshift({
      id: crypto.randomUUID(),
      date: today(),
      status: summary.status,
      recommendation: summary.recommendation,
      email: emailText()
    });
    renderAll();
  });

  document.getElementById("performance-report-button").addEventListener("click", async () => {
    if (isFileMode) {
      showRuntimeBanner('执行表现报告需要本地服务。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 后再点击。', "warn");
      return;
    }

    const button = document.getElementById("performance-report-button");
    button.textContent = "统计中";
    button.disabled = true;
    try {
      const res = await fetch("/api/build-performance-report", { method: "POST" });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || "执行表现报告生成失败");
      }
      await loadState();
      button.textContent = "已统计";
    } catch (error) {
      button.textContent = "统计失败";
      alert(error.message);
    } finally {
      button.disabled = false;
      setTimeout(() => {
        button.textContent = "执行表现";
      }, 1600);
    }
  });

  document.getElementById("weekly-review-button").addEventListener("click", async () => {
    if (isFileMode) {
      showRuntimeBanner('生成周报需要本地服务。请打开 <a href="http://localhost:4173">http://localhost:4173</a> 后再点击。', "warn");
      return;
    }

    const button = document.getElementById("weekly-review-button");
    button.textContent = "生成中";
    button.disabled = true;
    try {
      const res = await fetch("/api/build-weekly-review", { method: "POST" });
      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error || "周报生成失败");
      }
      await loadState();
      button.textContent = "已生成";
    } catch (error) {
      button.textContent = "生成失败";
      alert(error.message);
    } finally {
      button.disabled = false;
      setTimeout(() => {
        button.textContent = "生成周报";
      }, 1600);
    }
  });

  const settingBindings = [
    ["email-input", "email", "text"],
    ["total-capital-input", "totalCapital", "number"],
    ["trial-capital-input", "trialCapital", "number"],
    ["pause-loss-input", "pauseLoss", "number"],
    ["stop-loss-input", "stopLoss", "number"],
    ["close-time-input", "closeReminderTime", "text"]
  ];

  settingBindings.forEach(([id, key, type]) => {
    document.getElementById(id).addEventListener("input", (event) => {
      state.settings[key] = type === "number" ? number(event.target.value) : event.target.value;
      renderDashboard();
    });
  });

  document.getElementById("intraday-input").addEventListener("change", (event) => {
    state.settings.intradayRiskCheck = event.target.checked;
  });

  document.getElementById("change-only-input").addEventListener("change", (event) => {
    state.settings.onlyOnStatusChange = event.target.checked;
  });

  document.getElementById("formal-recording-input").addEventListener("change", async (event) => {
    await setFormalRecording(event.target.checked);
  });
}

bindEvents();
loadState();
