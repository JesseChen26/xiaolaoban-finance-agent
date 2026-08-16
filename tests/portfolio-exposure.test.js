const assert = require("assert");
const { buildPortfolioExposure } = require("../lib/portfolio-exposure");

const state = {
  portfolio: [
    { code: "A", name: "基金A", marketValue: 100 },
    { code: "B", name: "基金B", quantity: 20, current: 10 }
  ],
  fundExposure: {
    updatedAt: "2026-08-16T10:00:00",
    items: {
      A: { code: "A", name: "基金A", asOfDate: "2026-06-30", knownStockPct: 30, unresolvedPct: 70, holdings: [{ code: "X", name: "股票X", weightPct: 30, sector: "科技", market: "美国" }], assetBuckets: [{ name: "已披露股票穿透", weightPct: 30 }, { name: "其他", weightPct: 70 }], errors: [], sources: [] },
      B: { code: "B", name: "基金B", asOfDate: "2026-06-30", knownStockPct: 20, unresolvedPct: 80, holdings: [{ code: "X", name: "股票X", weightPct: 20, sector: "科技", market: "美国" }], assetBuckets: [{ name: "已披露股票穿透", weightPct: 20 }, { name: "其他", weightPct: 80 }], errors: [], sources: [] }
    }
  }
};

const result = buildPortfolioExposure(state, "B");
assert.equal(result.totalValue, 300);
assert.equal(result.selected.code, "B");
assert.equal(result.stocks[0].amount, 70);
assert.equal(result.stocks[0].fundCount, 2);
assert.equal(result.stocks[0].repeated, true);
assert.equal(result.coverage.knownStockAmount, 70);
assert.equal(result.coverage.unresolvedAmount, 230);
assert.equal(result.sectors[0].name, "科技");
assert.equal(result.sectors[0].portfolioPct, 23.3333);
console.log("portfolio-exposure tests passed");
