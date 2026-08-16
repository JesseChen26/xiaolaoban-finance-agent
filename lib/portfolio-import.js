const { randomUUID } = require("crypto");

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function inferFundType(name = "") {
  const text = String(name);
  if (/QDII|纳斯达克|标普/.test(text)) return "场外基金·QDII";
  if (/ETF.*联接|联接.*ETF|ETF联接/.test(text)) return "场外基金·ETF联接";
  if (/债/.test(text)) return "场外基金·债券";
  if (/混合/.test(text)) return "场外基金·混合";
  return "场外基金";
}

function normalizePortfolioImport(items, existing = [], now = new Date().toISOString()) {
  if (!Array.isArray(items) || !items.length) throw new Error("没有可导入的持仓记录。");
  const portfolio = Array.isArray(existing) ? existing.map((item) => ({ ...item })) : [];
  const errors = [];
  const imported = [];

  items.forEach((raw, index) => {
    const code = String(raw?.code || "").trim();
    const name = String(raw?.name || "").trim();
    const marketValue = finite(raw?.marketValue, NaN);
    const pnl = finite(raw?.pnl, NaN);
    const suppliedQuantity = finite(raw?.quantity, NaN);
    const suppliedCost = finite(raw?.cost, NaN);
    const suppliedCurrent = finite(raw?.current, NaN);
    const amountMode = Number.isFinite(marketValue) && marketValue > 0 && Number.isFinite(pnl);
    const unitMode = Number.isFinite(suppliedQuantity) && suppliedQuantity > 0 && Number.isFinite(suppliedCurrent) && suppliedCurrent > 0 && Number.isFinite(suppliedCost) && suppliedCost >= 0;
    const rowErrors = [];
    if (!/^[A-Za-z0-9.-]{1,12}$/.test(code)) rowErrors.push(`第 ${index + 1} 行代码格式不正确。`);
    if (!name) rowErrors.push(`第 ${index + 1} 行缺少名称。`);
    if (!amountMode && !unitMode) rowErrors.push(`第 ${index + 1} 行需填写“当前金额+持有收益”或“数量+成本价+当前价”。`);
    if (rowErrors.length) {
      errors.push(...rowErrors);
      return;
    }

    const foundIndex = portfolio.findIndex((item) => String(item.code) === code);
    const previous = foundIndex >= 0 ? portfolio[foundIndex] : {};
    const current = unitMode ? suppliedCurrent : finite(previous.current);
    const resolvedMarketValue = unitMode ? suppliedQuantity * suppliedCurrent : marketValue;
    const resolvedPnl = unitMode ? (suppliedCurrent - suppliedCost) * suppliedQuantity : pnl;
    const quantity = unitMode ? suppliedQuantity : current > 0 ? resolvedMarketValue / current : 0;
    const cost = unitMode ? suppliedCost : quantity > 0 ? Math.max(0, resolvedMarketValue - resolvedPnl) / quantity : 0;
    const position = {
      ...previous,
      id: previous.id || randomUUID(),
      code,
      name,
      type: raw.type || previous.type || inferFundType(name),
      cost: Number(cost.toFixed(6)),
      current,
      target: finite(previous.target),
      quantity: Number(quantity.toFixed(6)),
      stop: finite(previous.stop),
      reportedMarketValue: Number(resolvedMarketValue.toFixed(2)),
      reportedPnl: Number(resolvedPnl.toFixed(2)),
      marketValue: Number(resolvedMarketValue.toFixed(2)),
      pnl: Number(resolvedPnl.toFixed(2)),
      importSource: raw.importSource || (unitMode ? "软件内手动录入" : "持仓金额导入"),
      importedAt: now,
      notes: raw.notes || previous.notes || (unitMode ? "由用户在软件内按数量、成本价和当前价录入。" : "由当前金额与持有收益导入；首次同步净值后反推份额和成本净值。")
    };
    if (foundIndex >= 0) portfolio[foundIndex] = position;
    else portfolio.push(position);
    imported.push({ code, name, marketValue: position.reportedMarketValue, pnl: position.reportedPnl, updated: foundIndex >= 0 });
  });

  if (errors.length) throw new Error(errors.join(" "));
  return { portfolio, imported };
}

module.exports = { inferFundType, normalizePortfolioImport };
