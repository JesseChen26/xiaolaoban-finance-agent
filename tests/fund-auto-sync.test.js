const assert = require("assert");
const { shouldAutoSyncFundNav } = require("../server");

const fund = { code: "000001", type: "场外基金·QDII" };
assert.equal(shouldAutoSyncFundNav({ portfolio: [] }, new Date("2026-08-16T13:00:00Z")), false);
assert.equal(shouldAutoSyncFundNav({ portfolio: [fund], fundNavSync: { time: "2026-08-15T21:10:00", errors: [] } }, new Date("2026-08-16T01:00:00Z")), false);
assert.equal(shouldAutoSyncFundNav({ portfolio: [fund], fundNavSync: { time: "2026-08-16T09:00:00", errors: [] } }, new Date("2026-08-17T12:30:00Z")), true);
assert.equal(shouldAutoSyncFundNav({ portfolio: [fund], fundNavSync: { time: "2026-08-17T09:00:00", errors: [] } }, new Date("2026-08-17T12:30:00Z")), false);
assert.equal(shouldAutoSyncFundNav({ portfolio: [fund], fundNavSync: { time: "2026-08-17T09:00:00", errors: [] } }, new Date("2026-08-17T13:30:00Z")), true);
assert.equal(shouldAutoSyncFundNav({ portfolio: [fund], fundNavSync: { time: "2026-08-17T21:05:00", errors: [] } }, new Date("2026-08-17T13:30:00Z")), false);
console.log("fund auto-sync tests passed");
