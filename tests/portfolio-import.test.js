const assert = require("assert");
const { inferFundType, normalizePortfolioImport } = require("../lib/portfolio-import");

assert.equal(inferFundType("示例海外指数ETF联接(QDII)A"), "场外基金·QDII");
assert.equal(inferFundType("示例短债债券A"), "场外基金·债券");
assert.equal(inferFundType("示例黄金ETF联接A"), "场外基金·ETF联接");

const result = normalizePortfolioImport([
  { code: "000001", name: "示例海外指数ETF联接(QDII)A", marketValue: 1000, pnl: 100 }
], [], "2026-08-15T18:00:00.000Z");
assert.equal(result.portfolio.length, 1);
assert.equal(result.portfolio[0].reportedMarketValue, 1000);
assert.equal(result.portfolio[0].reportedPnl, 100);
assert.equal(result.portfolio[0].quantity, 0);

const updated = normalizePortfolioImport([
  { code: "000001", name: "示例海外指数ETF联接(QDII)A", marketValue: 1200, pnl: 120 }
], [{ ...result.portfolio[0], current: 2 }]);
assert.equal(updated.portfolio.length, 1);
assert.equal(updated.portfolio[0].quantity, 600);
assert.equal(updated.portfolio[0].cost, 1.8);
assert.equal(updated.imported[0].updated, true);

const stock = normalizePortfolioImport([
  { code: "600519", name: "贵州茅台", type: "股票", quantity: 10, cost: 1400, current: 1500 }
]);
assert.equal(stock.portfolio[0].marketValue, 15000);
assert.equal(stock.portfolio[0].pnl, 1000);
assert.equal(stock.portfolio[0].quantity, 10);

assert.throws(() => normalizePortfolioImport([{ code: "代码错误!", name: "错误", marketValue: 10, pnl: 0 }]), /代码格式/);
console.log("portfolio import tests passed");
