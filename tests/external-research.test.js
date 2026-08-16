const assert = require("assert");
const { buildRefreshPlan, isStale, questionNeedsNews, questionNeedsFinancials, briefWarning } = require("../lib/external-research");

const now = Date.parse("2026-08-14T12:00:00+08:00");
assert.equal(isStale("2026-08-14T11:00:00+08:00", 4 * 60 * 60 * 1000, now), false);
assert.equal(isStale("2026-08-13T11:00:00+08:00", 4 * 60 * 60 * 1000, now), true);
assert.equal(questionNeedsNews("今天的政策消息对ETF有什么影响？"), true);
assert.equal(questionNeedsFinancials("检查 BlackRock 最新财报"), true);
assert.ok(briefWarning("Traceback\nConnectionError: blocked").includes("blocked"));

const emptyPlan = buildRefreshPlan("为什么今天 510300 值得研究？", {}, now);
assert.deepEqual(emptyPlan.map((step) => step.id), ["source_policy", "official_products", "market", "official_news"]);

const freshState = {
  sourceWhitelist: [{}], efundsEtfs: [{}], watchlist: [{}], newsEvents: [{}], financialEvents: [{}],
  efundsSync: { time: "2026-08-14T10:00:00+08:00" },
  marketUpdates: [{ time: "2026-08-14T11:00:00+08:00" }],
  newsSync: { time: "2026-08-14T10:00:00+08:00" },
  financialEventSync: { time: "2026-08-14T10:00:00+08:00" }
};
assert.equal(buildRefreshPlan("比较 510300 和 512880", freshState, now).length, 0);
assert.equal(buildRefreshPlan("检查美股最新财报", freshState, now).length, 0);

console.log("external research tests passed");
