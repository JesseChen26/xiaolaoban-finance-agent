const assert = require("assert");
const { buildMarketVisualization, normalizeLine, strategySeries } = require("../lib/market-visualization");

const dates = Array.from({ length: 70 }, (_, index) => `2026-${String(5 + Math.floor(index / 28)).padStart(2, "0")}-${String(index % 28 + 1).padStart(2, "0")}`);
const bars = dates.map((time, index) => ({ time, open: 1 + index / 100, high: 1.02 + index / 100, low: .99 + index / 100, close: 1.01 + index / 100, volume: 1000 + index, ma20: index >= 19 ? 1 + index / 100 : null, ma60: index >= 59 ? .95 + index / 100 : null }));
const benchmarkBars = bars.map((row, index) => ({ ...row, close: 1 + index / 200 }));
const state = {
  marketHistory: {
    "512880": { code: "512880", name: "证券ETF", bars, lastMarketDate: bars.at(-1).time, crossCheck: { status: "verified" } },
    "510300": { code: "510300", name: "沪深300ETF基准", bars: benchmarkBars }
  },
  watchlist: [{ code: "512880", name: "证券ETF", grade: "B", totalScore: 78, status: "普通观察" }],
  newsEvents: [{ date: bars[65].time, title: "512880 相关事件", mentionedCodes: ["512880"] }],
  signalHistory: [{ date: bars[66].time, status: "观察", candidates: [{ code: "512880" }] }],
  equityHistory: [{ date: "2026-08-01", totalAssets: 500, pnl: 0 }, { date: "2026-08-02", totalAssets: 505, pnl: 5 }]
};

const payload = buildMarketVisualization(state, "512880");
assert.equal(payload.ok, true);
assert.equal(payload.bars.length, 70);
assert.equal(payload.relative.instrument[0].value, 100);
assert.equal(payload.relative.benchmark[0].value, 100);
assert.equal(payload.validation.length, 3);
assert.equal(payload.markers.length, 2);
assert.equal(payload.portfolio.length, 2);
assert.ok(payload.available.every((item) => ["A", "B"].includes(item.grade)));
assert.equal(strategySeries(bars).length, 70);
assert.deepEqual(normalizeLine([]), []);
assert.equal(buildMarketVisualization(state, "abc").status, 400);
assert.equal(buildMarketVisualization(state, "159999").status, 404);
console.log("market visualization tests passed");
