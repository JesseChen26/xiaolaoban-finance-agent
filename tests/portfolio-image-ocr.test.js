const assert = require("assert");
const { parseRecognizedPortfolio, looksLikeFundName } = require("../lib/portfolio-image-ocr");

assert.equal(looksLikeFundName("示例海外指数ETF联接(QDII)A"), true);
assert.equal(looksLikeFundName("全部持有 收益明细 交易记录"), false);

const parsed = parseRecognizedPortfolio(`
全部持有 收益明细 交易记录
示例海外指数ETF联接(QDII)A
1000.00 +10.00 +100.00 +100.00
40.00% +10.00%
示例短债债券A
500.00 +0.50 +5.00 +5.00
20.00% +1.00%
` , 88);
assert.equal(parsed.items.length, 2);
assert.equal(parsed.items[0].marketValue, 1000);
assert.equal(parsed.items[0].pnl, 100);
assert.equal(parsed.items[0].type, "场外基金·QDII");
assert.equal(parsed.items[1].type, "场外基金·债券");
console.log("portfolio image OCR parser tests passed");
