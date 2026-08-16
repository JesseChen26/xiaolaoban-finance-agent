const assert = require("assert");
const { friendlyErrorMessage } = require("../server");

const blocked = friendlyErrorMessage("Traceback\nConnectionError: [WinError 10013] 以一种访问权限不允许的方式做了一个访问套接字的尝试。");
assert.ok(blocked.includes("防火墙"));
assert.ok(blocked.includes("已保留"));
assert.ok(!blocked.includes("Traceback"));

const timeout = friendlyErrorMessage("requests.exceptions.ReadTimeout: request timed out");
assert.ok(timeout.includes("超时"));
assert.ok(timeout.length < 120);

const jsonError = friendlyErrorMessage(JSON.stringify({ ok: false, error: "普通同步失败" }));
assert.equal(jsonError, "普通同步失败");

console.log("error handling tests passed");
