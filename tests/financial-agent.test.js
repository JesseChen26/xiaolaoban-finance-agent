const assert = require("assert");
const { runLocalAgent, runModelAgent, createTools, agentStatus, needsExternalRefresh } = require("../lib/financial-agent");

const state = {
  settings: { trialCapital: 200 },
  watchlist: [
    { code: "510300", name: "沪深300ETF", type: "ETF", price: 1.2, ma20: 1.1, ma60: 1.05, ma20Slope: 0.01, return1mPct: 4, return3mPct: 9, benchmarkReturn1mPct: 2, benchmarkReturn3mPct: 5, turnoverYuan: 100000000, fundSizeYi: 40, bidAskSpreadPct: 0.08 },
    { code: "512880", name: "证券ETF", type: "ETF", price: 1.1, ma20: 1.12, ma60: 1.08, ma20Slope: -0.01, return1mPct: -1, return3mPct: 3, benchmarkReturn1mPct: 2, benchmarkReturn3mPct: 5, turnoverYuan: 90000000, fundSizeYi: 30, bidAskSpreadPct: 0.1 }
  ],
  newsEvents: [{ title: "证券行业事件", summary: "示例", source: "交易所", sourceLevel: "A", date: "2026-08-14", code: "512880" }],
  financialEvents: [], efundsEtfs: [], portfolio: [], signalHistory: []
};

(async () => {
  const tools = createTools(state);
  const comparison = tools.compare_etfs({ codes: ["510300", "512880"] });
  assert.equal(comparison.status, "success");
  assert.equal(comparison.data.length, 2);
  assert.ok(comparison.data[0].score >= comparison.data[1].score);

  const dossier = await runLocalAgent("比较 510300 和 512880，哪只更值得继续观察？", state);
  assert.equal(dossier.mode, "local");
  assert.equal(dossier.plan.intent, "etf_compare");
  assert.ok(dossier.plan.tasks.some((task) => task.tool === "compare_etfs"));

  const focused = await runLocalAgent("为什么今天排名第一的ETF值得继续研究？", state);
  const focusedMarket = focused.sources.find((item) => item.tool === "get_etf_market");
  assert.ok(focusedMarket);
  assert.ok(dossier.sources.length >= 2);
  assert.ok(dossier.narrative.includes("不等于买入建议"));
  assert.equal(dossier.loop.adaptive, true);
  assert.equal(dossier.loop.stopReason.code, "complete");
  assert.ok(dossier.trace.some((item) => item.type === "observe"));
  assert.ok(dossier.trace.some((item) => item.type === "stop"));
  assert.equal(agentStatus().toolCount, 9);
  assert.equal(agentStatus().adaptiveLoop, true);

  const broadened = await runLocalAgent("为什么 510300 值得研究？", { ...state, newsEvents: [], financialEvents: [] });
  assert.equal(broadened.plan.tasks.filter((item) => item.tool === "get_verified_news").length, 2);
  assert.ok(broadened.trace.some((item) => item.type === "replan" && item.detail.includes("放宽代码")));

  let refreshCalls = 0;
  const refreshedState = { ...state, marketUpdates: [{ time: new Date().toISOString() }] };
  const refreshed = await runLocalAgent("为什么今天排名第一的ETF值得继续研究？", { ...state, marketUpdates: [] }, {
    externalRefresh: async () => {
      refreshCalls += 1;
      return { refresh: { attempted: true, status: "verified", refreshedAt: new Date().toISOString(), steps: [{ id: "market", source: "双源行情", level: "B", status: "verified", count: 2 }] }, state: refreshedState };
    }
  });
  assert.equal(refreshCalls, 1);
  assert.equal(refreshed.plan.tasks[0].tool, "refresh_external_data");
  assert.equal(refreshed.loop.stopReason.code, "complete");

  const responses = [
    { output: [{ type: "function_call", name: "get_etf_score", arguments: JSON.stringify({ codes: ["510300"] }), call_id: "c1" }] },
    { output: [{ type: "function_call", name: "get_etf_market", arguments: JSON.stringify({ codes: ["510300"] }), call_id: "c2" }] },
    { output_text: "模型根据评分和双源行情形成结论。", output: [{ type: "message", content: [{ type: "output_text", text: "模型根据评分和双源行情形成结论。" }] }] }
  ];
  const modeled = await runModelAgent("研究 510300", state, {}, { apiKey: "test", retryDelayMs: 0, callResponses: async () => responses.shift() });
  assert.equal(modeled.mode, "model");
  assert.equal(modeled.loop.engine, "model");
  assert.equal(modeled.loop.toolCalls, 2);
  assert.equal(modeled.loop.stopReason.code, "model_complete");
  assert.ok(modeled.narrative.includes("双源行情"));

  let attempts = 0;
  const retryResponses = [
    { output: [{ type: "function_call", name: "get_etf_score", arguments: "{}", call_id: "r1" }] },
    { output: [{ type: "function_call", name: "get_etf_market", arguments: JSON.stringify({ codes: ["510300"] }), call_id: "r2" }] },
    { output_text: "重试后完成。", output: [] }
  ];
  const retried = await runModelAgent("研究 510300", state, {}, { apiKey: "test", retryDelayMs: 0, callResponses: async () => {
    attempts += 1;
    if (attempts === 1) { const error = new Error("temporary upstream error"); error.retryable = true; throw error }
    return retryResponses.shift();
  } });
  assert.equal(retried.loop.retries, 1);
  assert.ok(retried.trace.some((item) => item.type === "retry"));

  const conflictState = JSON.parse(JSON.stringify(state));
  conflictState.watchlist[0].priceCrossCheck = { status: "conflict", sourceCount: 2 };
  const conflictResponses = [
    { output: [{ type: "function_call", name: "get_etf_score", arguments: JSON.stringify({ codes: ["510300"] }), call_id: "x1" }] },
    { output: [{ type: "function_call", name: "get_etf_market", arguments: JSON.stringify({ codes: ["510300"] }), call_id: "x2" }] },
    { output_text: "行情冲突，无法形成高置信判断。", output: [] }
  ];
  const conflicted = await runModelAgent("研究 510300", conflictState, {}, { apiKey: "test", retryDelayMs: 0, callResponses: async () => conflictResponses.shift() });
  assert.equal(conflicted.loop.stopReason.code, "source_conflict");
  assert.equal(conflicted.reliability.status, "来源冲突");

  const localConflict = await runLocalAgent("研究 510300", conflictState);
  assert.equal(localConflict.loop.stopReason.code, "source_conflict");
  assert.equal(localConflict.plan.tasks.at(-1).tool, "get_etf_market");

  const duplicateResponses = [
    { output: [{ type: "function_call", name: "get_etf_score", arguments: JSON.stringify({ codes: ["510300"] }), call_id: "d1" }] },
    { output: [{ type: "function_call", name: "get_etf_score", arguments: JSON.stringify({ codes: ["510300"] }), call_id: "d2" }] },
    { output: [{ type: "function_call", name: "get_etf_market", arguments: JSON.stringify({ codes: ["510300"] }), call_id: "d3" }] },
    { output_text: "缓存复用后完成。", output: [] }
  ];
  const deduplicated = await runModelAgent("研究 510300", state, {}, { apiKey: "test", retryDelayMs: 0, callResponses: async () => duplicateResponses.shift() });
  assert.equal(deduplicated.loop.toolCalls, 2);
  assert.ok(deduplicated.trace.some((item) => item.type === "reuse"));
  assert.equal(needsExternalRefresh("研究ETF", { ...state, marketUpdates: [] }), true);
  console.log("financial-agent.test.js: PASS");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
