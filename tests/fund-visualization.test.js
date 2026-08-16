const assert = require("assert");
const { buildFundVisualization, validBars, normalizedSeries, drawdownSeries } = require("../lib/fund-visualization");

const bars = Array.from({ length: 300 }, (_, index) => ({
  time: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10),
  nav: 1 + index / 1000,
  dailyPct: index ? 0.1 : null
}));
const state = {
  portfolio: [{ code: "000001", name: "测试联接基金", quantity: 100, cost: 1.1, importSource: "图片识别测试" }],
  fundNavHistory: {
    "000001": { code: "000001", name: "测试联接基金", bars, source: "测试源", sourceUrl: "https://example.com", validation: { status: "verified" } }
  }
};

const payload = buildFundVisualization(state, "000001");
assert.equal(payload.ok, true);
assert.equal(payload.bars.length, 300);
assert.equal(payload.normalized[0].value, 100);
assert.equal(payload.holding.marketValue, 129.9);
assert.equal(payload.holding.costValue, 110);
assert.equal(payload.holding.pnl, 19.9);
assert.equal(payload.available.length, 1);
assert.equal(payload.metrics[2].value, 23.83);
assert.equal(validBars([{ time: "2026-01-01", nav: 1 }, { time: "2026-01-01", nav: 2 }]).length, 1);
assert.equal(normalizedSeries([]).length, 0);
assert.equal(drawdownSeries([{ time: "a", nav: 2 }, { time: "b", nav: 1 }])[1].value, -50);
assert.equal(buildFundVisualization(state, "abc").status, 400);
assert.equal(buildFundVisualization(state, "000002").status, 404);
console.log("fund visualization tests passed");
