const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { runAgent, agentStatus } = require("./lib/financial-agent");
const { refreshExternalResearch } = require("./lib/external-research");
const { buildMarketVisualization } = require("./lib/market-visualization");
const { buildFundVisualization } = require("./lib/fund-visualization");
const { normalizePortfolioImport } = require("./lib/portfolio-import");
const { buildPortfolioExposure } = require("./lib/portfolio-exposure");
const { recognizePortfolioImage } = require("./lib/portfolio-image-ocr");

const root = process.env.APP_ROOT_OVERRIDE
  ? path.resolve(process.env.APP_ROOT_OVERRIDE)
  : __dirname;
const publicDir = process.env.PUBLIC_DIR_OVERRIDE
  ? path.resolve(process.env.PUBLIC_DIR_OVERRIDE)
  : path.join(root, "public");
const dataDir = process.env.DATA_DIR_OVERRIDE
  ? path.resolve(process.env.DATA_DIR_OVERRIDE)
  : path.join(root, "data");
const statePath = process.env.STATE_PATH_OVERRIDE
  ? path.resolve(process.env.STATE_PATH_OVERRIDE)
  : path.join(dataDir, "state.json");
const stateDir = path.dirname(statePath);
const defaultPort = Number(process.env.PORT || 4173);

const defaultState = {
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
  watchlist: [],
  marketHistory: {},
  fundNavHistory: {},
  fundExposure: { version: 1, updatedAt: null, fundCount: 0, mappedCount: 0, items: {}, errors: [], methodology: "" },
  fundExposureUpdates: [],
  equityHistory: [],
  efundsEtfs: [],
  sourceWhitelist: [],
  sourceGradeRules: [],
  sourceBlacklistRules: [],
  sourceWhitelistSync: null,
  newsEvents: [],
  financialEvents: [],
  financialEventSync: null,
  financialEventUpdates: [],
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
  agentResearch: [],
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
  }
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

function ensureState() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }

  if (!fs.existsSync(statePath)) {
    writeJsonAtomic(statePath, defaultState);
  }
}

function readState() {
  ensureState();
  const raw = fs.readFileSync(statePath, "utf8");
  return JSON.parse(raw);
}

function writeState(state) {
  ensureState();
  writeJsonAtomic(statePath, state);
}

function writeJsonAtomic(targetPath, payload) {
  const tempPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  );
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tempPath, targetPath);
}

function pythonPath() {
  if (process.env.INVESTMENT_PYTHON_EXE) {
    return process.env.INVESTMENT_PYTHON_EXE;
  }

  const localVenvPython = path.join(root, ".venv", "Scripts", "python.exe");
  if (process.platform === "win32" && fs.existsSync(localVenvPython)) {
    return localVenvPython;
  }

  return process.platform === "win32" ? "python" : "python3";
}

function scriptEnv() {
  return {
    ...process.env,
    DATA_DIR_OVERRIDE: dataDir,
    STATE_PATH_OVERRIDE: statePath,
    PYTHONUTF8: "1",
    PYTHONIOENCODING: "utf-8"
  };
}

function friendlyErrorMessage(value) {
  let raw = String(value || "").trim();
  try {
    const parsed = JSON.parse(raw);
    raw = String(parsed.error || parsed.message || raw);
  } catch { /* stderr is not JSON */ }
  const lower = raw.toLowerCase();
  if (/winerror 10013|访问权限不允许|forbidden by its access permissions/.test(lower)) {
    return "外部数据连接被当前进程或 Windows 防火墙拦截。请重启小老板理财后重试；最近一次成功数据已保留。";
  }
  if (/failed to establish|无法连接到远程服务器|connectionerror|connection refused|name or service not known|getaddrinfo/.test(lower)) {
    return "暂时无法连接外部数据源。请检查网络后重试；最近一次成功数据已保留。";
  }
  if (/timed out|timeout|超时/.test(lower)) {
    return "外部数据源响应超时。请稍后重试；最近一次成功数据已保留。";
  }
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const last = lines.findLast((line) => /error|exception|失败|错误/i.test(line)) || lines.at(-1) || "操作失败";
  return last.replace(/^.*?(?:Error|Exception):\s*/i, "").slice(0, 260);
}

function sendJson(res, status, payload) {
  const safePayload = payload && payload.error
    ? { ...payload, error: friendlyErrorMessage(payload.error) }
    : payload;
  const body = JSON.stringify(safePayload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req, maxBytes = 2_000_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

const executionStatuses = new Set(["未记录", "已执行", "部分执行", "未执行", "延后"]);
const recordedExecutionStatuses = new Set(["已执行", "部分执行", "未执行", "延后"]);
const executionActions = new Set(["观察", "买入", "卖出", "赎回", "空仓", "暂停"]);

function textField(value, maxLength = 1000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function numberField(value) {
  if (value === "" || value === null || value === undefined) return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : "";
}

function dateField(value) {
  const text = textField(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : new Date().toISOString().slice(0, 10);
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function todayText(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function weekKey(now = new Date()) {
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86_400_000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function marketPrice(item) {
  return safeNumber(item.price || item.close || item.current || item.nav || item.latestNav, 0);
}

function normalizeSimulatedTrading(state) {
  const existing = state.simulatedTrading && typeof state.simulatedTrading === "object"
    ? state.simulatedTrading
    : {};
  state.simulatedTrading = {
    weeklyBudget: safeNumber(existing.weeklyBudget, 500) || 500,
    totalContributed: safeNumber(
      existing.totalContributed,
      safeNumber(existing.invested, 0) + safeNumber(existing.cash, 0) - safeNumber(existing.pnl, 0)
    ),
    cash: safeNumber(existing.cash, 0),
    invested: safeNumber(existing.invested, 0),
    marketValue: safeNumber(existing.marketValue, 0),
    totalAssets: safeNumber(existing.totalAssets, 0),
    realizedPnl: safeNumber(existing.realizedPnl, 0),
    unrealizedPnl: safeNumber(existing.unrealizedPnl, 0),
    pnl: safeNumber(existing.pnl, 0),
    pnlPct: safeNumber(existing.pnlPct, 0),
    lastContributionWeek: textField(existing.lastContributionWeek || "", 20),
    lastPricedAt: textField(existing.lastPricedAt || "", 40),
    positions: Array.isArray(existing.positions) ? existing.positions : [],
    orders: Array.isArray(existing.orders) ? existing.orders : [],
    runs: Array.isArray(existing.runs) ? existing.runs : []
  };
  return state.simulatedTrading;
}

function repriceSimulatedTrading(state, now = new Date()) {
  const sim = normalizeSimulatedTrading(state);
  const market = new Map();
  (Array.isArray(state.watchlist) ? state.watchlist : []).forEach((item) => {
    const code = textField(item.code, 20);
    if (code) market.set(code, item);
  });

  let invested = 0;
  let marketValue = 0;
  sim.positions = sim.positions.map((position) => {
    const code = textField(position.code, 20);
    const quote = market.get(code);
    const quantity = safeNumber(position.quantity, 0);
    const avgCost = safeNumber(position.avgCost, 0);
    const costAmount = safeNumber(position.costAmount, avgCost * quantity);
    const currentPrice = quote ? marketPrice(quote) : safeNumber(position.currentPrice, avgCost);
    const currentValue = currentPrice * quantity;
    const pnl = currentValue - costAmount;
    const pnlPct = costAmount > 0 ? (pnl / costAmount) * 100 : 0;
    invested += costAmount;
    marketValue += currentValue;
    return {
      ...position,
      code,
      quantity,
      avgCost,
      costAmount,
      currentPrice,
      currentValue,
      pnl,
      pnlPct,
      quoteTime: quote?.date || quote?.updatedAt || quote?.time || "",
      lastPricedAt: now.toISOString()
    };
  });

  sim.invested = invested;
  sim.marketValue = marketValue;
  sim.unrealizedPnl = marketValue - invested;
  sim.totalAssets = safeNumber(sim.cash, 0) + marketValue;
  sim.pnl = sim.totalAssets - safeNumber(sim.totalContributed, 0);
  sim.pnlPct = sim.totalContributed > 0 ? (sim.pnl / sim.totalContributed) * 100 : 0;
  sim.lastPricedAt = now.toISOString();
  return sim;
}

function recordEquitySnapshot(state, now = new Date()) {
  const sim = normalizeSimulatedTrading(state);
  const history = Array.isArray(state.equityHistory) ? state.equityHistory : [];
  const peak = Math.max(sim.totalAssets, ...history.map((row) => safeNumber(row.totalAssets, 0)), 0);
  const snapshot = {
    time: now.toISOString(),
    date: todayText(now),
    totalAssets: Number(safeNumber(sim.totalAssets, 0).toFixed(2)),
    cash: Number(safeNumber(sim.cash, 0).toFixed(2)),
    marketValue: Number(safeNumber(sim.marketValue, 0).toFixed(2)),
    pnl: Number(safeNumber(sim.pnl, 0).toFixed(2)),
    drawdown: peak > 0 ? Number(((safeNumber(sim.totalAssets, 0) / peak - 1) * 100).toFixed(3)) : 0
  };
  const previous = history[history.length - 1];
  if (previous && previous.date === snapshot.date) history[history.length - 1] = snapshot;
  else history.push(snapshot);
  state.equityHistory = history.slice(-500);
  return snapshot;
}

function scoredCandidates(state) {
  return (Array.isArray(state.watchlist) ? state.watchlist : [])
    .map((item) => {
      const price = marketPrice(item);
      const score = safeNumber(item.totalScore, 0);
      const grade = textField(item.grade || "", 5);
      const status = textField(item.status || "", 50);
      return { ...item, price, score, grade, status };
    })
    .filter((item) => item.code && item.price > 0 && item.status !== "剔除" && item.status !== "数据缺失")
    .filter((item) => ["A", "B"].includes(item.grade))
    .sort((a, b) => {
      if (safeNumber(b.score) !== safeNumber(a.score)) return safeNumber(b.score) - safeNumber(a.score);
      return safeNumber(b.turnoverYuan) - safeNumber(a.turnoverYuan);
    });
}

function allocationForCandidate(candidate, weeklyBudget) {
  const score = safeNumber(candidate.totalScore, 0);
  if (score >= 90) return weeklyBudget;
  if (score >= 85) return weeklyBudget * 0.8;
  if (score >= 80) return weeklyBudget * 0.6;
  if (candidate.grade === "B" && score >= 72) return weeklyBudget * 0.4;
  return 0;
}

function pickSimulatedCandidate(state, sim) {
  const candidates = scoredCandidates(state);
  const availableCash = safeNumber(sim.cash, 0);
  const weeklyBudget = safeNumber(sim.weeklyBudget, 500) || 500;
  const maxPositionValue = Math.max(weeklyBudget, safeNumber(sim.totalContributed, weeklyBudget) * 0.6);
  for (const candidate of candidates) {
    const existing = (sim.positions || []).find((item) => item.code === candidate.code);
    const existingValue = safeNumber(existing?.currentValue, 0);
    const positionRoom = Math.max(0, maxPositionValue - existingValue);
    const decisionBudget = Math.min(availableCash, allocationForCandidate(candidate, weeklyBudget), positionRoom || availableCash);
    const quantity = Math.floor(decisionBudget / candidate.price / 100) * 100;
    const amount = quantity * candidate.price;
    if (quantity >= 100 && amount > 0) {
      return { candidate, quantity, amount };
    }
  }
  return null;
}

function sellDecisionForPosition(state, position) {
  const quote = (Array.isArray(state.watchlist) ? state.watchlist : []).find((item) => item.code === position.code);
  const currentPrice = safeNumber(position.currentPrice || quote && marketPrice(quote), 0);
  const avgCost = safeNumber(position.avgCost, 0);
  const pnlPct = safeNumber(position.pnlPct, 0);
  const ma20 = safeNumber(quote?.ma20, 0);
  const ma60 = safeNumber(quote?.ma60, 0);
  const slope = safeNumber(quote?.ma20Slope, 0);
  const grade = textField(quote?.grade || "", 5);
  const status = textField(quote?.status || "", 50);

  if (currentPrice <= 0 || avgCost <= 0 || safeNumber(position.quantity, 0) <= 0) {
    return null;
  }
  if (currentPrice <= avgCost * 0.92) {
    return { reason: "模拟止损：现价较均价下跌超过 8%，卖出全部仓位。" };
  }
  if (ma60 > 0 && currentPrice < ma60 * 0.98 && pnlPct < 0) {
    return { reason: "模拟卖出：价格跌破 60 日线附近且持仓亏损，趋势假设失效。" };
  }
  if (pnlPct >= 10 && (ma20 > 0 && currentPrice < ma20 || slope < 0)) {
    return { reason: "模拟止盈：盈利超过 10%，且短期趋势走弱，卖出锁定收益。" };
  }
  if (quote && (!["A", "B"].includes(grade) || status === "剔除" || status === "数据缺失") && pnlPct <= 0) {
    return { reason: "模拟卖出：候选池评级跌出 A/B 或被剔除，且持仓没有盈利保护。" };
  }
  return null;
}

function applySimulatedBuy(state, pick, now = new Date()) {
  const sim = normalizeSimulatedTrading(state);
  const { candidate, quantity, amount } = pick;
  const date = todayText(now);
  const week = weekKey(now);
  const order = {
    id: `sim-order-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    date,
    week,
    side: "买入",
    code: textField(candidate.code, 20),
    name: textField(candidate.name, 100),
    type: textField(candidate.type || "ETF", 50),
    price: candidate.price,
    quantity,
    amount,
    score: safeNumber(candidate.totalScore, 0),
    grade: textField(candidate.grade || "", 5),
    reason: `模拟账户按候选池评分选择：${candidate.grade || "-"}级，${safeNumber(candidate.totalScore, 0).toFixed(0)}分；按100份一手买入。`,
    createdAt: now.toISOString()
  };

  const existing = sim.positions.find((item) => item.code === order.code);
  if (existing) {
    const oldQuantity = safeNumber(existing.quantity, 0);
    const oldCost = safeNumber(existing.costAmount, safeNumber(existing.avgCost, 0) * oldQuantity);
    const newQuantity = oldQuantity + quantity;
    const newCost = oldCost + amount;
    existing.quantity = newQuantity;
    existing.costAmount = newCost;
    existing.avgCost = newQuantity > 0 ? newCost / newQuantity : 0;
    existing.lastBuyDate = date;
    existing.lastBuyWeek = week;
    existing.type = order.type || existing.type;
    existing.name = order.name || existing.name;
  } else {
    sim.positions.unshift({
      id: `sim-pos-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      code: order.code,
      name: order.name,
      type: order.type,
      quantity,
      avgCost: order.price,
      costAmount: amount,
      firstBuyDate: date,
      lastBuyDate: date,
      lastBuyWeek: week
    });
  }

  sim.cash = Math.max(0, safeNumber(sim.cash, 0) - amount);
  sim.orders.unshift(order);
  sim.orders = sim.orders.slice(0, 500);
  return order;
}

function applySimulatedSell(state, position, decision, now = new Date()) {
  const sim = normalizeSimulatedTrading(state);
  const date = todayText(now);
  const week = weekKey(now);
  const quantity = safeNumber(position.quantity, 0);
  const price = safeNumber(position.currentPrice, safeNumber(position.avgCost, 0));
  const amount = quantity * price;
  const costAmount = safeNumber(position.costAmount, safeNumber(position.avgCost, 0) * quantity);
  const realizedPnl = amount - costAmount;
  const order = {
    id: `sim-order-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    date,
    week,
    side: "卖出",
    code: textField(position.code, 20),
    name: textField(position.name, 100),
    type: textField(position.type || "ETF", 50),
    price,
    quantity,
    amount,
    costAmount,
    realizedPnl,
    pnlPct: costAmount > 0 ? (realizedPnl / costAmount) * 100 : 0,
    reason: decision.reason || "模拟卖出：风险条件触发。",
    createdAt: now.toISOString()
  };

  sim.cash = safeNumber(sim.cash, 0) + amount;
  sim.realizedPnl = safeNumber(sim.realizedPnl, 0) + realizedPnl;
  sim.positions = sim.positions.filter((item) => item.id !== position.id && item.code !== position.code);
  sim.orders.unshift(order);
  sim.orders = sim.orders.slice(0, 500);
  return order;
}

function runSimulatedWeeklyBuy(state, now = new Date()) {
  const sim = normalizeSimulatedTrading(state);
  const week = weekKey(now);
  const date = todayText(now);
  const weeklyBudget = safeNumber(sim.weeklyBudget, 500) || 500;
  const contributed = sim.lastContributionWeek === week;

  if (!contributed) {
    sim.cash = safeNumber(sim.cash, 0) + weeklyBudget;
    sim.lastContributionWeek = week;
  }

  const alreadyBought = sim.orders.some((order) => order.week === week && order.side === "买入");
  let order = null;
  let status = alreadyBought ? "already_bought" : "no_candidate";
  let message = alreadyBought ? "本周模拟账户已经买入过，本次只刷新盈亏。" : "本周没有满足 A/B 级且能买满一手的 ETF，现金保留。";

  if (!alreadyBought) {
    const pick = pickSimulatedCandidate(state, safeNumber(sim.cash, 0));
    if (pick) {
      order = applySimulatedBuy(state, pick, now);
      status = "bought";
      message = `模拟买入 ${order.code} ${order.name}，${order.quantity} 份，成交额 ${order.amount.toFixed(2)} 元。`;
    }
  }

  repriceSimulatedTrading(state, now);
  const run = {
    id: `sim-run-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    date,
    week,
    status,
    contributed: !contributed,
    weeklyBudget: contributed ? 0 : weeklyBudget,
    orderId: order?.id || "",
    message,
    cash: sim.cash,
    marketValue: sim.marketValue,
    pnl: sim.pnl,
    pnlPct: sim.pnlPct,
    createdAt: now.toISOString()
  };
  sim.runs.unshift(run);
  sim.runs = sim.runs.slice(0, 120);
  return { sim, run, order };
}

function runSimulatedWeeklyBuy(state, now = new Date()) {
  const sim = normalizeSimulatedTrading(state);
  const week = weekKey(now);
  const date = todayText(now);
  const weeklyBudget = safeNumber(sim.weeklyBudget, 500) || 500;
  const contributed = sim.lastContributionWeek === week;

  if (!contributed) {
    sim.cash = safeNumber(sim.cash, 0) + weeklyBudget;
    sim.totalContributed = safeNumber(sim.totalContributed, 0) + weeklyBudget;
    sim.lastContributionWeek = week;
  }

  repriceSimulatedTrading(state, now);

  const orders = [];
  [...sim.positions].forEach((position) => {
    const decision = sellDecisionForPosition(state, position);
    if (decision) {
      orders.push(applySimulatedSell(state, position, decision, now));
    }
  });

  repriceSimulatedTrading(state, now);

  const alreadyBought = sim.orders.some((order) => order.week === week && order.side === "买入");
  let buyOrder = null;
  let status = orders.length ? "sold" : "hold_cash";
  let message = orders.length
    ? `本周模拟卖出 ${orders.length} 笔，先处理风险，再决定是否重新买入。`
    : "本周没有触发卖出条件。";

  if (!alreadyBought) {
    const pick = pickSimulatedCandidate(state, sim);
    if (pick) {
      buyOrder = applySimulatedBuy(state, pick, now);
      orders.push(buyOrder);
      status = orders.some((order) => order.side === "卖出") ? "sold_and_bought" : "bought";
      message = `${message} 模拟买入 ${buyOrder.code} ${buyOrder.name}，${buyOrder.quantity} 份，成交额 ${buyOrder.amount.toFixed(2)} 元。`;
    } else if (!orders.length) {
      status = "no_trade";
      message = "本周没有足够好的 A/B 级机会，或仓位上限/一手金额不合适，模拟账户持币不买。";
    } else {
      message = `${message} 卖出后没有足够好的新机会，保留现金。`;
    }
  } else {
    status = orders.length ? "sold_only" : "already_decided";
    message = orders.length
      ? `${message} 本周已经有过买入决策，不再重复买入。`
      : "本周已经做过买入决策，本次只刷新估值。";
  }

  repriceSimulatedTrading(state, now);
  const run = {
    id: `sim-run-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    date,
    week,
    status,
    contributed: !contributed,
    weeklyBudget: contributed ? 0 : weeklyBudget,
    orderId: buyOrder?.id || orders[0]?.id || "",
    orderIds: orders.map((order) => order.id),
    actionCount: orders.length,
    message,
    cash: sim.cash,
    marketValue: sim.marketValue,
    totalAssets: sim.totalAssets,
    pnl: sim.pnl,
    pnlPct: sim.pnlPct,
    createdAt: now.toISOString()
  };
  sim.runs.unshift(run);
  sim.runs = sim.runs.slice(0, 120);
  return { sim, run, order: buyOrder || orders[0] || null, orders, buyOrder };
}

function pickSimulatedCandidate(state, sim, excludedCodes = new Set()) {
  const candidates = scoredCandidates(state);
  const availableCash = safeNumber(sim.cash, 0);
  const weeklyBudget = safeNumber(sim.weeklyBudget, 500) || 500;
  const maxPositionValue = Math.max(weeklyBudget, safeNumber(sim.totalContributed, weeklyBudget) * 0.6);
  for (const candidate of candidates) {
    if (excludedCodes.has(candidate.code)) continue;
    const existing = (sim.positions || []).find((item) => item.code === candidate.code);
    const existingValue = safeNumber(existing?.currentValue, 0);
    const positionRoom = Math.max(0, maxPositionValue - existingValue);
    const decisionBudget = Math.min(availableCash, allocationForCandidate(candidate, weeklyBudget), positionRoom || availableCash);
    const quantity = Math.floor(decisionBudget / candidate.price / 100) * 100;
    const amount = quantity * candidate.price;
    if (quantity >= 100 && amount > 0) {
      return { candidate, quantity, amount };
    }
  }
  return null;
}

function runSimulatedWeeklyBuy(state, now = new Date()) {
  let sim = normalizeSimulatedTrading(state);
  const week = weekKey(now);
  const date = todayText(now);
  const weeklyBudget = safeNumber(sim.weeklyBudget, 500) || 500;
  const contributed = sim.lastContributionWeek === week;

  if (!contributed) {
    sim.cash = safeNumber(sim.cash, 0) + weeklyBudget;
    sim.totalContributed = safeNumber(sim.totalContributed, 0) + weeklyBudget;
    sim.lastContributionWeek = week;
  }

  sim = repriceSimulatedTrading(state, now);

  const orders = [];
  const soldCodes = new Set();
  [...sim.positions].forEach((position) => {
    const decision = sellDecisionForPosition(state, position);
    if (decision) {
      const sellOrder = applySimulatedSell(state, position, decision, now);
      orders.push(sellOrder);
      soldCodes.add(sellOrder.code);
    }
  });

  sim = repriceSimulatedTrading(state, now);

  const alreadyBought = sim.orders.some((order) => order.week === week && order.side === "买入");
  let buyOrder = null;
  let status = orders.length ? "sold" : "hold_cash";
  let message = orders.length
    ? `本周模拟卖出 ${orders.length} 笔，先处理风险，再决定是否重新买入。`
    : "本周没有触发卖出条件。";

  if (!alreadyBought) {
    const pick = pickSimulatedCandidate(state, sim, soldCodes);
    if (pick) {
      buyOrder = applySimulatedBuy(state, pick, now);
      orders.push(buyOrder);
      status = orders.some((order) => order.side === "卖出") ? "sold_and_bought" : "bought";
      message = `${message} 模拟买入 ${buyOrder.code} ${buyOrder.name}，${buyOrder.quantity} 份，成交额 ${buyOrder.amount.toFixed(2)} 元。`;
    } else if (!orders.length) {
      status = "no_trade";
      message = "本周没有足够好的 A/B 级机会，或仓位上限/一手金额不合适，模拟账户持币不买。";
    } else {
      message = `${message} 卖出后没有足够好的新机会，保留现金。`;
    }
  } else {
    status = orders.length ? "sold_only" : "already_decided";
    message = orders.length
      ? `${message} 本周已经有过买入决策，不再重复买入。`
      : "本周已经做过买入决策，本次只刷新估值。";
  }

  sim = repriceSimulatedTrading(state, now);
  const run = {
    id: `sim-run-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    date,
    week,
    status,
    contributed: !contributed,
    weeklyBudget: contributed ? 0 : weeklyBudget,
    orderId: buyOrder?.id || orders[0]?.id || "",
    orderIds: orders.map((order) => order.id),
    actionCount: orders.length,
    message,
    cash: sim.cash,
    marketValue: sim.marketValue,
    totalAssets: sim.totalAssets,
    pnl: sim.pnl,
    pnlPct: sim.pnlPct,
    createdAt: now.toISOString()
  };
  sim.runs.unshift(run);
  sim.runs = sim.runs.slice(0, 120);
  return { sim, run, order: buyOrder || orders[0] || null, orders, buyOrder };
}

function normalizeExecution(input) {
  const raw = input && typeof input === "object" ? input : {};
  const status = executionStatuses.has(raw.status) ? raw.status : "未记录";
  const action = executionActions.has(raw.action) ? raw.action : "观察";
  return {
    status,
    action,
    date: dateField(raw.date),
    code: textField(raw.code, 20),
    price: numberField(raw.price),
    amountYuan: numberField(raw.amountYuan),
    quantity: numberField(raw.quantity),
    notes: textField(raw.notes, 1500),
    savedAt: new Date().toISOString()
  };
}

function isRecordedExecution(execution) {
  return recordedExecutionStatuses.has(execution && execution.status);
}

function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const cleanPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(publicDir, cleanPath));

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream"
    });
    res.end(content);
  });
}

async function handleApi(req, res) {
  const apiUrl = new URL(req.url, "http://localhost");
  if (req.method === "GET" && req.url === "/api/health") {
    let state = null;
    try {
      state = readState();
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        service: "investment-console",
        error: error.message,
        time: new Date().toISOString()
      });
      return;
    }

    const signalHistory = Array.isArray(state.signalHistory) ? state.signalHistory : [];
    const executionRecordedSignalCount = signalHistory.filter((item) => isRecordedExecution(item.execution)).length;
    const executionPendingSignalCount = Math.max(0, signalHistory.length - executionRecordedSignalCount);

    sendJson(res, 200, {
      ok: true,
      service: "investment-console",
      capabilities: {
        financialAgent: true,
        signalExecution: true,
        stepTracker: true,
        nextActionReport: true,
        maturitySchedule: true,
        reviewTodo: true,
        signalHistoryExport: true,
        signalIntegrityAudit: true,
        stateBackup: true,
        credibilityReport: true,
        credibilityGate: true,
        simulatedTrading: true
      },
      time: new Date().toISOString(),
      dataDir,
      stateFile: statePath,
      portfolioCount: Array.isArray(state.portfolio) ? state.portfolio.length : 0,
      watchlistCount: Array.isArray(state.watchlist) ? state.watchlist.length : 0,
      sourceWhitelistCount: Array.isArray(state.sourceWhitelist) ? state.sourceWhitelist.length : 0,
      sourceWhitelistSync: state.sourceWhitelistSync || null,
      newsEventCount: Array.isArray(state.newsEvents) ? state.newsEvents.length : 0,
      financialEventCount: Array.isArray(state.financialEvents) ? state.financialEvents.length : 0,
      financialEventSync: state.financialEventSync || null,
      signalCount: signalHistory.length,
      formalSignalRecording: Boolean(state.settings && state.settings.formalSignalRecording),
      formalExperiment: state.formalExperiment || null,
      goalAudit: state.goalAudit
        ? {
            time: state.goalAudit.time || null,
            overall: state.goalAudit.overall || null
          }
        : null,
      sampleGuard: state.sampleGuard
        ? {
            time: state.sampleGuard.time || null,
            phase: state.sampleGuard.phase || null,
            level: state.sampleGuard.level || null,
            signalCount: state.sampleGuard.signalCount || 0,
            sameDaySignalCount: state.sampleGuard.sameDaySignalCount || 0
          }
        : null,
      executionCount: Array.isArray(state.executionLog) ? state.executionLog.length : 0,
      executionRecordedSignals: executionRecordedSignalCount,
      executionPendingSignals: executionPendingSignalCount,
      signalValidation: state.signalValidation || null,
      latestEmailReminder: state.latestEmailReminder || null,
      lastEmailReminder: state.lastEmailReminder || null,
      emailReminderCount: Array.isArray(state.emailReminderRuns) ? state.emailReminderRuns.length : 0,
      fundNavSync: state.fundNavSync || null,
      fundNavCrossCheck: state.fundNavCrossCheck || null,
      weeklyReview: state.weeklyReview || null,
      actualPerformanceReport: state.actualPerformanceReport
        ? {
            time: state.actualPerformanceReport.time || null,
            verdict: state.actualPerformanceReport.verdict || null,
            tradeCount: state.actualPerformanceReport.tradePerformance?.tradeCount || 0,
            totalPnl: state.actualPerformanceReport.tradePerformance?.totalPnl || 0,
            portfolioPnl: state.actualPerformanceReport.portfolioSnapshot?.pnl || 0
          }
        : null,
      credibilityReport: state.credibilityReport
        ? {
            time: state.credibilityReport.time || null,
            verdict: state.credibilityReport.verdict || null,
            phase: state.credibilityReport.phase || null,
            level: state.credibilityReport.level || null,
            canClaimCredible: Boolean(state.credibilityReport.canClaimCredible),
            canClaimPositiveEdge: Boolean(state.credibilityReport.canClaimPositiveEdge),
            blockerCount: state.credibilityReport.blockerCount || 0,
            signalCount: state.credibilityReport.metrics?.signalCount || 0,
            avgExcessPct: state.credibilityReport.metrics?.avgExcessPct ?? null,
            worstMaxDrawdownPct: state.credibilityReport.metrics?.worstMaxDrawdownPct ?? null
          }
        : null,
      credibilityRunCount: Array.isArray(state.credibilityRuns) ? state.credibilityRuns.length : 0,
      latestNextActionReport: state.latestNextActionReport
        ? {
            time: state.latestNextActionReport.time || null,
            phase: state.latestNextActionReport.phase || null,
            level: state.latestNextActionReport.level || null,
            canClaimCredible: Boolean(state.latestNextActionReport.canClaimCredible),
            primaryAction: state.latestNextActionReport.primaryAction || null
          }
        : null,
      nextActionRunCount: Array.isArray(state.nextActionRuns) ? state.nextActionRuns.length : 0,
      signalMaturitySchedule: state.signalMaturitySchedule
        ? {
            time: state.signalMaturitySchedule.time || null,
            signalCount: state.signalMaturitySchedule.summary?.signalCount || 0,
            rowCount: state.signalMaturitySchedule.summary?.rowCount || 0,
            dueCount: state.signalMaturitySchedule.summary?.dueCount || 0,
            waitingCount: state.signalMaturitySchedule.summary?.waitingCount || 0,
            executionPending: state.signalMaturitySchedule.summary?.executionPending || 0,
            nextDue: state.signalMaturitySchedule.summary?.nextDue || null
          }
        : null,
      signalMaturityScheduleRunCount: Array.isArray(state.signalMaturityScheduleRuns) ? state.signalMaturityScheduleRuns.length : 0,
      reviewTodoReport: state.reviewTodoReport
        ? {
            time: state.reviewTodoReport.time || null,
            phase: state.reviewTodoReport.phase || null,
            level: state.reviewTodoReport.level || null,
            dueCount: state.reviewTodoReport.summary?.dueCount || 0,
            soonCount: state.reviewTodoReport.summary?.soonCount || 0,
            waitingCount: state.reviewTodoReport.summary?.waitingCount || 0,
            doneCount: state.reviewTodoReport.summary?.doneCount || 0,
            nextItem: state.reviewTodoReport.summary?.nextItem || null
          }
        : null,
      reviewTodoRunCount: Array.isArray(state.reviewTodoRuns) ? state.reviewTodoRuns.length : 0,
      signalHistoryExport: state.signalHistoryExport || null,
      signalHistoryExportRunCount: Array.isArray(state.signalHistoryExportRuns) ? state.signalHistoryExportRuns.length : 0,
      signalIntegrityAudit: state.signalIntegrityAudit
        ? {
            time: state.signalIntegrityAudit.time || null,
            phase: state.signalIntegrityAudit.phase || null,
            level: state.signalIntegrityAudit.level || null,
            signalCount: state.signalIntegrityAudit.signalCount || 0,
            knownSignalCount: state.signalIntegrityAudit.knownSignalCount || 0,
            warningCount: state.signalIntegrityAudit.warningCount || 0,
            dangerCount: state.signalIntegrityAudit.dangerCount || 0,
            duplicateTradingDayCount: state.signalIntegrityAudit.duplicateTradingDayCount || 0,
            missingKnownSignalCount: state.signalIntegrityAudit.missingKnownSignalCount || 0
          }
        : null,
      signalIntegrityRunCount: Array.isArray(state.signalIntegrityRuns) ? state.signalIntegrityRuns.length : 0,
      stateBackup: state.stateBackup
        ? {
            time: state.stateBackup.time || null,
            reason: state.stateBackup.reason || null,
            fileName: state.stateBackup.fileName || null,
            sha256: state.stateBackup.sha256 || null,
            signalCount: state.stateBackup.signalCount || 0,
            knownSignalCount: state.stateBackup.knownSignalCount || 0,
            executionPending: state.stateBackup.execution?.pending || 0,
            integrityDangerCount: state.stateBackup.integrityDangerCount || 0
          }
        : null,
      stateBackupRunCount: Array.isArray(state.stateBackupRuns) ? state.stateBackupRuns.length : 0,
      lastWeeklyReviewEmail: state.lastWeeklyReviewEmail || null,
      weeklyReviewEmailCount: Array.isArray(state.weeklyReviewEmailRuns) ? state.weeklyReviewEmailRuns.length : 0,
      dailyExperimentRun: state.dailyExperimentRun || null,
      dailyExperimentRunCount: Array.isArray(state.dailyExperimentRuns) ? state.dailyExperimentRuns.length : 0,
      simulatedTrading: state.simulatedTrading
        ? {
            weeklyBudget: state.simulatedTrading.weeklyBudget || 500,
            totalContributed: state.simulatedTrading.totalContributed || 0,
            cash: state.simulatedTrading.cash || 0,
            marketValue: state.simulatedTrading.marketValue || 0,
            totalAssets: state.simulatedTrading.totalAssets || 0,
            pnl: state.simulatedTrading.pnl || 0,
            pnlPct: state.simulatedTrading.pnlPct || 0,
            positionCount: Array.isArray(state.simulatedTrading.positions) ? state.simulatedTrading.positions.length : 0,
            orderCount: Array.isArray(state.simulatedTrading.orders) ? state.simulatedTrading.orders.length : 0,
            lastPricedAt: state.simulatedTrading.lastPricedAt || null
          }
        : null,
      agent: agentStatus(),
      agentResearchCount: Array.isArray(state.agentResearch) ? state.agentResearch.length : 0
    });
    return;
  }

  if (req.method === "GET" && apiUrl.pathname === "/api/download-signal-history") {
    const format = apiUrl.searchParams.get("format") || "csv";
    const files = {
      csv: { path: path.join(stateDir, "signal_history_export.csv"), type: "text/csv; charset=utf-8", name: "signal_history_export.csv" },
      json: { path: path.join(stateDir, "signal_history_export.json"), type: "application/json; charset=utf-8", name: "signal_history_export.json" },
      md: { path: path.join(stateDir, "signal_history_export.md"), type: "text/markdown; charset=utf-8", name: "signal_history_export.md" }
    };
    const file = files[format];
    if (!file) {
      sendJson(res, 400, { ok: false, error: "unsupported format" });
      return;
    }
    if (!fs.existsSync(file.path)) {
      sendJson(res, 404, { ok: false, error: "signal history export has not been generated yet" });
      return;
    }
    const content = fs.readFileSync(file.path);
    res.writeHead(200, {
      "Content-Type": file.type,
      "Content-Disposition": `attachment; filename="${file.name}"`,
      "Content-Length": content.length
    });
    res.end(content);
    return;
  }

  if (req.method === "GET" && req.url === "/api/state") {
    const state = readState();
    repriceSimulatedTrading(state);
    sendJson(res, 200, state);
    return;
  }

  if (req.method === "GET" && apiUrl.pathname === "/api/market-visualization") {
    const state = readState();
    const payload = buildMarketVisualization(state, apiUrl.searchParams.get("code"));
    sendJson(res, payload.status || (payload.ok ? 200 : 400), payload);
    return;
  }

  if (req.method === "GET" && apiUrl.pathname === "/api/fund-visualization") {
    const state = readState();
    const payload = buildFundVisualization(state, apiUrl.searchParams.get("code"));
    sendJson(res, payload.status || (payload.ok ? 200 : 400), payload);
    return;
  }

  if (req.method === "GET" && apiUrl.pathname === "/api/portfolio-exposure") {
    const state = readState();
    sendJson(res, 200, buildPortfolioExposure(state, apiUrl.searchParams.get("code")));
    return;
  }

  if (req.method === "GET" && req.url === "/api/agent/status") {
    sendJson(res, 200, { ok: true, ...agentStatus() });
    return;
  }

  if (req.method === "GET" && req.url === "/api/agent/history") {
    const state = readState();
    sendJson(res, 200, { ok: true, items: Array.isArray(state.agentResearch) ? state.agentResearch.slice(0, 30) : [] });
    return;
  }

  if (req.method === "POST" && req.url === "/api/agent/research") {
    try {
      const body = await readBody(req);
      const payload = body ? JSON.parse(body) : {};
      const question = textField(payload.question, 1200);
      if (question.length < 4) {
        sendJson(res, 400, { ok: false, error: "请描述一个具体的ETF研究问题。" });
        return;
      }
      const initialState = readState();
      let latestRefresh = null;
      const externalRefresh = async ({ query }) => {
        const currentState = readState();
        latestRefresh = await refreshExternalResearch(query || question, currentState, {
          python: pythonPath(), root, env: scriptEnv(), timeoutMs: 75_000
        });
        return { refresh: latestRefresh, state: readState() };
      };
      const dossier = await runAgent(question, initialState, { externalRefresh });
      const latestState = readState();
      latestState.agentResearch = Array.isArray(latestState.agentResearch) ? latestState.agentResearch : [];
      latestState.agentResearch.unshift(dossier);
      latestState.agentResearch = latestState.agentResearch.slice(0, 100);
      latestState.agentExternalRefresh = dossier.refresh || latestRefresh;
      writeState(latestState);
      sendJson(res, 200, { ok: true, dossier, refresh: dossier.refresh || latestRefresh });
    } catch (error) {
      const message = error && error.name === "AbortError" ? "模型请求超时，请稍后重试。" : error.message;
      sendJson(res, 500, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/api/simulated-portfolio") {
    try {
      const state = readState();
      const simulatedTrading = repriceSimulatedTrading(state);
      recordEquitySnapshot(state);
      writeState(state);
      sendJson(res, 200, {
        ok: true,
        simulatedTrading
      });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/simulate-weekly-buy") {
    try {
      const state = readState();
      const result = runSimulatedWeeklyBuy(state);
      recordEquitySnapshot(state);
      writeState(state);
      sendJson(res, 200, {
        ok: true,
        simulatedTrading: result.sim,
        run: result.run,
        order: result.order,
        orders: result.orders || []
      });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/state") {
    try {
      const body = await readBody(req);
      const state = JSON.parse(body);
      writeState(state);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/portfolio/import") {
    try {
      const body = await readBody(req);
      const payload = body ? JSON.parse(body) : {};
      const state = readState();
      const result = normalizePortfolioImport(payload.items, state.portfolio || []);
      state.portfolio = result.portfolio;
      writeState(state);
      sendJson(res, 200, { ok: true, imported: result.imported, portfolioCount: state.portfolio.length });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/portfolio/recognize-image") {
    try {
      const body = await readBody(req, 12_500_000);
      const payload = body ? JSON.parse(body) : {};
      const match = String(payload.imageDataUrl || "").match(/^data:image\/(png|jpeg|jpg|webp|bmp);base64,([A-Za-z0-9+/=]+)$/i);
      if (!match) {
        sendJson(res, 400, { ok: false, error: "请选择 PNG、JPG、WebP 或 BMP 图片。" });
        return;
      }
      const image = Buffer.from(match[2], "base64");
      const result = await recognizePortfolioImage(image);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, /正在识别/.test(error.message) ? 409 : 400, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/signal-execution") {
    try {
      const body = await readBody(req);
      const payload = body ? JSON.parse(body) : {};
      const signalId = textField(payload.signalId, 200);
      const state = readState();
      const signals = Array.isArray(state.signalHistory) ? state.signalHistory : [];
      const signal = signals.find((item) => item.id === signalId);
      if (!signal) {
        sendJson(res, 404, { ok: false, error: "没有找到对应信号记录。" });
        return;
      }

      const previousExecution = signal.execution || null;
      const execution = normalizeExecution(payload.execution || {});
      signal.execution = execution;
      state.executionLog = Array.isArray(state.executionLog) ? state.executionLog : [];
      state.executionLog.unshift({
        id: `exec-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        signalId: signal.id,
        signalDate: signal.date,
        signalStatus: signal.status,
        signalRecommendation: signal.recommendation,
        previousStatus: previousExecution?.status || "未记录",
        savedAt: execution.savedAt,
        ...execution
      });
      state.executionLog = state.executionLog.slice(0, 500);
      writeState(state);
      sendJson(res, 200, {
        ok: true,
        signalId: signal.id,
        execution,
        previousStatus: previousExecution?.status || "未记录",
        executionLogCount: state.executionLog.length
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/update-market") {
    const script = path.join(root, "scripts", "update_market_data.py");
    const child = spawn(pythonPath(), [script, "12"], {
      cwd: root,
      env: scriptEnv(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        sendJson(res, 500, { ok: false, error: stderr || stdout || `exit ${code}` });
        return;
      }
      try {
        const payload = JSON.parse(stdout);
        try {
          const state = readState();
          payload.simulatedTrading = repriceSimulatedTrading(state);
          recordEquitySnapshot(state);
          writeState(state);
        } catch (error) {
          payload.simulationWarning = error.message;
        }
        sendJson(res, 200, payload);
      } catch {
        const payload = { ok: true, output: stdout };
        try {
          const state = readState();
          payload.simulatedTrading = repriceSimulatedTrading(state);
          recordEquitySnapshot(state);
          writeState(state);
        } catch (error) {
          payload.simulationWarning = error.message;
        }
        sendJson(res, 200, payload);
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/update-fund-nav") {
    const script = path.join(root, "scripts", "sync_fund_nav.py");
    const child = spawn(pythonPath(), [script], {
      cwd: root,
      env: scriptEnv(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        sendJson(res, 500, { ok: false, error: stderr || stdout || `exit ${code}` });
        return;
      }
      try {
        sendJson(res, 200, JSON.parse(stdout));
      } catch {
        sendJson(res, 200, { ok: true, output: stdout });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/update-fund-exposure") {
    const script = path.join(root, "scripts", "sync_fund_exposure.py");
    const child = spawn(pythonPath(), [script, "--force"], {
      cwd: root,
      env: scriptEnv(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("close", (code) => {
      if (code !== 0) {
        sendJson(res, 500, { ok: false, error: friendlyErrorMessage(stderr || stdout || `exit ${code}`) });
        return;
      }
      try { sendJson(res, 200, JSON.parse(stdout)); }
      catch { sendJson(res, 200, { ok: true, output: stdout }); }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/sync-efunds") {
    const script = path.join(root, "scripts", "sync_efunds_etfs.py");
    const child = spawn(pythonPath(), [script], {
      cwd: root,
      env: scriptEnv(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        sendJson(res, 500, { ok: false, error: stderr || stdout || `exit ${code}` });
        return;
      }
      try {
        sendJson(res, 200, JSON.parse(stdout));
      } catch {
        sendJson(res, 200, { ok: true, output: stdout });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/sync-news") {
    const script = path.join(root, "scripts", "sync_efunds_news.py");
    const child = spawn(pythonPath(), [script, "12"], {
      cwd: root,
      env: scriptEnv(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        sendJson(res, 500, { ok: false, error: stderr || stdout || `exit ${code}` });
        return;
      }
      try {
        sendJson(res, 200, JSON.parse(stdout));
      } catch {
        sendJson(res, 200, { ok: true, output: stdout });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/sync-financial-events") {
    const script = path.join(root, "scripts", "sync_financial_events.py");
    const child = spawn(pythonPath(), [script], {
      cwd: root,
      env: scriptEnv(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        sendJson(res, 500, { ok: false, error: stderr || stdout || `exit ${code}` });
        return;
      }
      try {
        sendJson(res, 200, JSON.parse(stdout));
      } catch {
        sendJson(res, 200, { ok: true, output: stdout });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/sync-source-whitelist") {
    const script = path.join(root, "scripts", "sync_source_whitelist.py");
    const child = spawn(pythonPath(), [script], {
      cwd: root,
      env: scriptEnv(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        sendJson(res, 500, { ok: false, error: stderr || stdout || `exit ${code}` });
        return;
      }
      try {
        sendJson(res, 200, JSON.parse(stdout));
      } catch {
        sendJson(res, 200, { ok: true, output: stdout });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/record-signal") {
    let payload = {};
    try {
      const body = await readBody(req);
      payload = body ? JSON.parse(body) : {};
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
      return;
    }

    const script = path.join(root, "scripts", "record_signal.py");
    let currentState = {};
    try {
      currentState = readState();
    } catch {
      currentState = {};
    }
    const formalRecording = Boolean(currentState.settings && currentState.settings.formalSignalRecording);
    const dryRun = payload.dryRun === undefined ? !formalRecording : Boolean(payload.dryRun);
    const args = [script, "--reason", String(payload.reason || "manual")];
    if (payload.allowStale) args.push("--allow-stale");
    if (payload.force) args.push("--force");
    if (dryRun) {
      args.push("--dry-run");
    } else {
      args.push("--enforce-start-gate");
    }
    const child = spawn(pythonPath(), args, {
      cwd: root,
      env: scriptEnv(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        sendJson(res, 500, { ok: false, error: stderr || stdout || `exit ${code}` });
        return;
      }
      try {
        sendJson(res, 200, JSON.parse(stdout));
      } catch {
        sendJson(res, 200, { ok: true, output: stdout });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/validate-signals") {
    const script = path.join(root, "scripts", "validate_signals.py");
    const child = spawn(pythonPath(), [script], {
      cwd: root,
      env: scriptEnv(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        sendJson(res, 500, { ok: false, error: stderr || stdout || `exit ${code}` });
        return;
      }
      try {
        sendJson(res, 200, JSON.parse(stdout));
      } catch {
        sendJson(res, 200, { ok: true, output: stdout });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/build-email-reminder") {
    const script = path.join(root, "scripts", "build_email_reminder.py");
    const child = spawn(pythonPath(), [script], {
      cwd: root,
      env: scriptEnv(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        sendJson(res, 500, { ok: false, error: stderr || stdout || `exit ${code}` });
        return;
      }
      try {
        sendJson(res, 200, JSON.parse(stdout));
      } catch {
        sendJson(res, 200, { ok: true, output: stdout });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/crosscheck-fund-nav") {
    const script = path.join(root, "scripts", "crosscheck_efunds_nav.py");
    const child = spawn(pythonPath(), [script], {
      cwd: root,
      env: scriptEnv(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        sendJson(res, 500, { ok: false, error: stderr || stdout || `exit ${code}` });
        return;
      }
      try {
        sendJson(res, 200, JSON.parse(stdout));
      } catch {
        sendJson(res, 200, { ok: true, output: stdout });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/build-weekly-review") {
    const script = path.join(root, "scripts", "build_weekly_review.py");
    const child = spawn(pythonPath(), [script], {
      cwd: root,
      env: scriptEnv(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        sendJson(res, 500, { ok: false, error: stderr || stdout || `exit ${code}` });
        return;
      }
      try {
        sendJson(res, 200, JSON.parse(stdout));
      } catch {
        sendJson(res, 200, { ok: true, output: stdout });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/build-performance-report") {
    const script = path.join(root, "scripts", "build_performance_report.py");
    const child = spawn(pythonPath(), [script], {
      cwd: root,
      env: scriptEnv(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        sendJson(res, 500, { ok: false, error: stderr || stdout || `exit ${code}` });
        return;
      }
      try {
        sendJson(res, 200, JSON.parse(stdout));
      } catch {
        sendJson(res, 200, { ok: true, output: stdout });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/build-step9-10-tracker") {
    const script = path.join(root, "scripts", "build_step9_10_tracker.py");
    const child = spawn(pythonPath(), [script], {
      cwd: root,
      env: scriptEnv(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        sendJson(res, 500, { ok: false, error: stderr || stdout || `exit ${code}` });
        return;
      }
      try {
        sendJson(res, 200, JSON.parse(stdout));
      } catch {
        sendJson(res, 200, { ok: true, output: stdout });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/build-next-action-report") {
    const script = path.join(root, "scripts", "build_next_action_report.py");
    const child = spawn(pythonPath(), [script], {
      cwd: root,
      env: scriptEnv(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        sendJson(res, 500, { ok: false, error: stderr || stdout || `exit ${code}` });
        return;
      }
      try {
        sendJson(res, 200, JSON.parse(stdout));
      } catch {
        sendJson(res, 200, { ok: true, output: stdout });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/build-maturity-schedule") {
    const script = path.join(root, "scripts", "build_maturity_schedule.py");
    const child = spawn(pythonPath(), [script], {
      cwd: root,
      env: scriptEnv(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        sendJson(res, 500, { ok: false, error: stderr || stdout || `exit ${code}` });
        return;
      }
      try {
        sendJson(res, 200, JSON.parse(stdout));
      } catch {
        sendJson(res, 200, { ok: true, output: stdout });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/build-review-todo") {
    const script = path.join(root, "scripts", "build_review_todo.py");
    const child = spawn(pythonPath(), [script], {
      cwd: root,
      env: scriptEnv(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        sendJson(res, 500, { ok: false, error: stderr || stdout || `exit ${code}` });
        return;
      }
      try {
        sendJson(res, 200, JSON.parse(stdout));
      } catch {
        sendJson(res, 200, { ok: true, output: stdout });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/build-credibility-report") {
    const script = path.join(root, "scripts", "build_credibility_report.py");
    const child = spawn(pythonPath(), [script], {
      cwd: root,
      env: scriptEnv(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        sendJson(res, 500, { ok: false, error: stderr || stdout || `exit ${code}` });
        return;
      }
      try {
        sendJson(res, 200, JSON.parse(stdout));
      } catch {
        sendJson(res, 200, { ok: true, output: stdout });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/export-signal-history") {
    const script = path.join(root, "scripts", "export_signal_history.py");
    const child = spawn(pythonPath(), [script], {
      cwd: root,
      env: scriptEnv(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        sendJson(res, 500, { ok: false, error: stderr || stdout || `exit ${code}` });
        return;
      }
      try {
        sendJson(res, 200, JSON.parse(stdout));
      } catch {
        sendJson(res, 200, { ok: true, output: stdout });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/audit-signal-integrity") {
    const script = path.join(root, "scripts", "audit_signal_integrity.py");
    const child = spawn(pythonPath(), [script], {
      cwd: root,
      env: scriptEnv(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        sendJson(res, 500, { ok: false, error: stderr || stdout || `exit ${code}` });
        return;
      }
      try {
        sendJson(res, 200, JSON.parse(stdout));
      } catch {
        sendJson(res, 200, { ok: true, output: stdout });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/backup-state") {
    const script = path.join(root, "scripts", "backup_experiment_state.py");
    const child = spawn(pythonPath(), [script, "--reason", "manual-ui"], {
      cwd: root,
      env: scriptEnv(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        sendJson(res, 500, { ok: false, error: stderr || stdout || `exit ${code}` });
        return;
      }
      try {
        sendJson(res, 200, JSON.parse(stdout));
      } catch {
        sendJson(res, 200, { ok: true, output: stdout });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/run-daily-experiment") {
    const script = path.join(root, "scripts", "daily_experiment_run.py");
    const child = spawn(pythonPath(), [script], {
      cwd: root,
      env: scriptEnv(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        sendJson(res, 500, { ok: false, error: stderr || stdout || `exit ${code}` });
        return;
      }
      try {
        const payload = JSON.parse(stdout);
        sendJson(res, payload.ok ? 200 : 500, payload);
      } catch {
        sendJson(res, 200, { ok: true, output: stdout });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/audit-goal") {
    const script = path.join(root, "scripts", "audit_experiment_goal.py");
    const child = spawn(pythonPath(), [script], {
      cwd: root,
      env: scriptEnv(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        sendJson(res, 500, { ok: false, error: stderr || stdout || `exit ${code}` });
        return;
      }
      try {
        sendJson(res, 200, JSON.parse(stdout));
      } catch {
        sendJson(res, 200, { ok: true, output: stdout });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/sample-guard") {
    const script = path.join(root, "scripts", "sample_guard.py");
    const child = spawn(pythonPath(), [script], {
      cwd: root,
      env: scriptEnv(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        sendJson(res, 500, { ok: false, error: stderr || stdout || `exit ${code}` });
        return;
      }
      try {
        sendJson(res, 200, JSON.parse(stdout));
      } catch {
        sendJson(res, 200, { ok: true, output: stdout });
      }
    });
    return;
  }

  sendJson(res, 404, { ok: false, error: "Unknown API route" });
}

function createInvestmentConsoleServer() {
  ensureState();
  return http.createServer((req, res) => {
    if (req.url.startsWith("/api/")) {
      handleApi(req, res);
      return;
    }

    serveStatic(req, res);
  });
}

function shanghaiClock(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short"
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday: parts.weekday };
}

function shouldAutoSyncFundNav(state, now = new Date()) {
  const hasFunds = (state.portfolio || []).some((item) => /^\d{6}$/.test(String(item.code || "")) && ((item.type || "").includes("场外") || (item.type || "").includes("联接")));
  if (!hasFunds) return false;
  const clock = shanghaiClock(now);
  if (["Sat", "Sun"].includes(clock.weekday)) return false;
  const sync = state.fundNavSync || {};
  const lastTime = String(sync.time || "");
  const lastDate = lastTime.slice(0, 10);
  const lastHour = Number(lastTime.slice(11, 13));
  if (lastDate !== clock.date) return true;
  if (clock.hour >= 21 && (!Number.isFinite(lastHour) || lastHour < 21)) return true;
  if (Array.isArray(sync.errors) && sync.errors.length) {
    const parsed = new Date(lastTime);
    return !Number.isFinite(parsed.getTime()) || now.getTime() - parsed.getTime() >= 60 * 60 * 1000;
  }
  return false;
}

let automaticFundSyncRunning = false;

function runAutomaticFundNavSync() {
  if (automaticFundSyncRunning) return;
  let state;
  try {
    state = readState();
  } catch {
    return;
  }
  if (!shouldAutoSyncFundNav(state)) return;
  automaticFundSyncRunning = true;
  const script = path.join(root, "scripts", "sync_fund_nav.py");
  const child = spawn(pythonPath(), [script], { cwd: root, env: scriptEnv(), windowsHide: true });
  const finish = () => { automaticFundSyncRunning = false; };
  child.once("error", finish);
  child.once("close", finish);
}

function startServer(options = {}) {
  const listenPort = Number(options.port ?? defaultPort);
  const host = options.host || "127.0.0.1";
  const server = createInvestmentConsoleServer();

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(listenPort, host, () => {
      server.off("error", reject);
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : listenPort;
      const urlHost = host === "0.0.0.0" ? "localhost" : host;
      const startupFundSync = setTimeout(runAutomaticFundNavSync, 4_000);
      const periodicFundSync = setInterval(runAutomaticFundNavSync, 30 * 60 * 1000);
      server.once("close", () => {
        clearTimeout(startupFundSync);
        clearInterval(periodicFundSync);
      });
      resolve({
        server,
        port: actualPort,
        host,
        url: `http://${urlHost}:${actualPort}`
      });
    });
  });
}

if (require.main === module) {
  startServer()
    .then(({ url }) => {
      console.log(`Investment console running at ${url}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  createInvestmentConsoleServer,
  startServer,
  shouldAutoSyncFundNav,
  friendlyErrorMessage,
  paths: {
    root,
    publicDir,
    dataDir,
    statePath
  }
};
