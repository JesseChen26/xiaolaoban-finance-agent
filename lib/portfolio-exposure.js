function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((number(value) + Number.EPSILON) * factor) / factor;
}

function positionValue(position) {
  const explicit = number(position.marketValue || position.reportedMarketValue);
  return explicit > 0 ? explicit : number(position.quantity) * number(position.current);
}

function addGroup(map, key, amount) {
  const label = key || "未分类";
  map.set(label, number(map.get(label)) + number(amount));
}

function rowsFromGroup(map, totalValue) {
  return [...map.entries()].map(([name, amount]) => ({
    name,
    amount: round(amount),
    portfolioPct: totalValue > 0 ? round(amount / totalValue * 100, 4) : 0
  })).sort((a, b) => b.amount - a.amount);
}

function buildPortfolioExposure(state, selectedCode = "") {
  const positions = Array.isArray(state.portfolio) ? state.portfolio : [];
  const snapshot = state.fundExposure || {};
  const items = snapshot.items || {};
  const totalValue = positions.reduce((sum, item) => sum + positionValue(item), 0);
  const funds = [];
  const stocks = new Map();
  const sectors = new Map();
  const markets = new Map();
  const assetClasses = new Map();
  let knownStockAmount = 0;
  let goldAmount = 0;

  for (const position of positions) {
    const code = String(position.code || "");
    const exposure = items[code];
    const value = positionValue(position);
    if (!exposure) {
      funds.push({ code, name: position.name || code, value: round(value), status: "missing", holdings: [], knownStockPct: 0, unresolvedPct: 100, errors: ["尚未同步穿透数据"] });
      addGroup(assetClasses, "未解析资产", value);
      continue;
    }

    const holdings = (exposure.holdings || []).map((holding) => {
      const amount = value * number(holding.weightPct) / 100;
      knownStockAmount += amount;
      addGroup(sectors, holding.sector, amount);
      addGroup(markets, holding.market, amount);
      const key = String(holding.code || holding.name);
      if (!stocks.has(key)) stocks.set(key, { code: holding.code, name: holding.name, sector: holding.sector, market: holding.market, amount: 0, funds: [] });
      const stock = stocks.get(key);
      stock.amount += amount;
      stock.funds.push({ code, name: position.name || code, amount: round(amount), fundWeightPct: number(holding.weightPct) });
      return { ...holding, amount: round(amount), portfolioPct: totalValue > 0 ? round(amount / totalValue * 100, 4) : 0 };
    });

    for (const bucket of exposure.assetBuckets || []) {
      const amount = value * number(bucket.weightPct) / 100;
      if (bucket.name === "黄金") goldAmount += amount;
      addGroup(assetClasses, bucket.name, amount);
    }
    funds.push({
      ...exposure,
      value: round(value),
      portfolioPct: totalValue > 0 ? round(value / totalValue * 100, 4) : 0,
      holdings,
      status: exposure.errors?.length ? "warning" : "ok"
    });
  }

  const aggregateStocks = [...stocks.values()].map((stock) => ({
    ...stock,
    amount: round(stock.amount),
    portfolioPct: totalValue > 0 ? round(stock.amount / totalValue * 100, 4) : 0,
    fundCount: stock.funds.length,
    repeated: stock.funds.length > 1
  })).sort((a, b) => b.amount - a.amount);
  const selected = funds.find((item) => item.code === String(selectedCode || "")) || funds.find((item) => item.holdings?.length) || funds[0] || null;

  return {
    ok: true,
    updatedAt: snapshot.updatedAt || null,
    methodology: snapshot.methodology || "尚未同步持仓穿透数据",
    totalValue: round(totalValue),
    coverage: {
      mappedFunds: funds.filter((item) => item.status !== "missing").length,
      totalFunds: funds.length,
      knownStockAmount: round(knownStockAmount),
      knownStockPct: totalValue > 0 ? round(knownStockAmount / totalValue * 100, 4) : 0,
      goldAmount: round(goldAmount),
      unresolvedAmount: round(Math.max(0, totalValue - knownStockAmount - goldAmount))
    },
    available: funds.map((item) => ({ code: item.code, name: item.name, asOfDate: item.asOfDate || "", knownStockPct: number(item.knownStockPct), status: item.status })),
    selected,
    funds,
    stocks: aggregateStocks,
    sectors: rowsFromGroup(sectors, totalValue),
    markets: rowsFromGroup(markets, totalValue),
    assetClasses: rowsFromGroup(assetClasses, totalValue),
    warnings: [
      "基金定期报告通常只披露前十大股票，未披露部分不会被系统猜测。",
      "穿透比例不是实时仓位；报告期后基金经理可能已经调仓。",
      "联接基金按目标ETF季度持仓乘以95%基准配置估算，属于代理口径。"
    ]
  };
}

module.exports = { buildPortfolioExposure, positionValue };
