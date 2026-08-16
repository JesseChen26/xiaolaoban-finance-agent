function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeLine(bars = []) {
  const usable = bars.filter((row) => row && row.time && finite(row.close) > 0);
  if (!usable.length) return [];
  const base = finite(usable[0].close);
  return usable.map((row) => ({ time: row.time, value: Number((finite(row.close) / base * 100).toFixed(3)) }));
}

function strategySeries(bars = []) {
  let equity = 100;
  let peak = 100;
  let previous = null;
  return bars.filter((row) => row && row.time && finite(row.close) > 0).map((row) => {
    const close = finite(row.close);
    const invested = previous && finite(previous.ma20) > 0 && finite(previous.ma60) > 0 && finite(previous.close) > finite(previous.ma20) && finite(previous.ma20) >= finite(previous.ma60);
    if (previous && invested && finite(previous.close) > 0) equity *= close / finite(previous.close);
    peak = Math.max(peak, equity);
    const point = {
      time: row.time,
      value: Number(equity.toFixed(3)),
      drawdown: Number(((equity / peak - 1) * 100).toFixed(3)),
      invested: Boolean(invested)
    };
    previous = row;
    return point;
  });
}

function textContainsCode(value, code) {
  if (Array.isArray(value)) return value.some((item) => textContainsCode(item, code));
  if (value && typeof value === "object") return Object.values(value).some((item) => textContainsCode(item, code));
  return String(value || "").includes(code);
}

function markerDate(value) {
  const text = String(value || "");
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

function eventMarkers(state, code, validDates) {
  const markers = [];
  const news = [...(state.newsEvents || []), ...(state.financialEvents || [])];
  news.forEach((item) => {
    const date = markerDate(item.date || item.time || item.publishedAt || item.updatedAt);
    const explicitCodes = [item.code, ...(item.codes || []), ...(item.matchedCodes || []), ...(item.mentionedCodes || []), ...(item.relatedCodes || [])].map(String);
    const relevant = explicitCodes.includes(code) || String(item.title || "").includes(code);
    if (!date || !validDates.has(date) || !relevant) return;
    markers.push({ time: date, position: "aboveBar", color: "#2563eb", shape: "circle", text: "E", kind: "event", detail: String(item.title || item.name || "事件").slice(0, 80) });
  });
  (state.signalHistory || []).forEach((item) => {
    const date = markerDate(item.date || item.time || item.createdAt);
    if (!date || !validDates.has(date) || !textContainsCode(item.candidates || item.dataSnapshot || item, code)) return;
    const action = String(item.status || item.recommendation || "信号");
    const negative = /卖|退出|止损|剔除/.test(action);
    markers.push({ time: date, position: negative ? "aboveBar" : "belowBar", color: negative ? "#e24a3b" : "#169873", shape: negative ? "arrowDown" : "arrowUp", text: "S", kind: "signal", detail: action.slice(0, 80) });
  });
  const grouped = new Map();
  markers.sort((a, b) => a.time.localeCompare(b.time)).forEach((marker) => {
    const key = `${marker.time}:${marker.kind}`;
    const previous = grouped.get(key);
    if (!previous) grouped.set(key, marker);
    else previous.text = `${marker.kind === "event" ? "E" : "S"}×2`;
  });
  return [...grouped.values()].slice(-12);
}

function portfolioSeries(state) {
  const dedupe = (rows) => [...rows.reduce((map, row) => map.set(row.time, row), new Map()).values()].sort((a, b) => a.time.localeCompare(b.time));
  const points = (state.equityHistory || []).map((row) => ({
    time: markerDate(row.time || row.date),
    value: finite(row.totalAssets),
    pnl: finite(row.pnl),
    drawdown: finite(row.drawdown)
  })).filter((row) => row.time && row.value >= 0);
  if (points.length) return dedupe(points);
  return dedupe((state.simulatedTrading?.runs || []).map((row) => ({
    time: markerDate(row.date || row.createdAt),
    value: finite(row.totalAssets),
    pnl: finite(row.pnl),
    drawdown: 0
  })).filter((row) => row.time && row.value >= 0));
}

function latestMetrics(bars, benchmarkBars) {
  const windowReturn = (rows, days) => {
    if (rows.length <= days) return null;
    const base = finite(rows[rows.length - days - 1]?.close);
    const latest = finite(rows[rows.length - 1]?.close);
    return base > 0 ? Number(((latest / base - 1) * 100).toFixed(2)) : null;
  };
  return [5, 20, 60].map((days) => {
    const value = windowReturn(bars, days);
    const benchmark = windowReturn(benchmarkBars, days);
    return { days, value, benchmark, excess: value === null || benchmark === null ? null : Number((value - benchmark).toFixed(2)) };
  });
}

function buildMarketVisualization(state, requestedCode) {
  const history = state.marketHistory && typeof state.marketHistory === "object" ? state.marketHistory : {};
  const candidates = new Map((state.watchlist || []).map((item) => [String(item.code), item]));
  const isQualified = (item) => {
    const candidate = candidates.get(String(item?.code));
    return candidate && ["A", "B"].includes(candidate.grade) && candidate.status !== "剔除";
  };
  const available = Object.values(history).filter((item) => item && Array.isArray(item.bars) && item.bars.length && isQualified(item));
  const fallback = (state.watchlist || []).find((item) => isQualified(item) && history[item.code])?.code || available[0]?.code;
  const code = String(requestedCode || fallback || "");
  const instrument = history[code];
  if (!/^\d{6}$/.test(code)) return { ok: false, status: 400, error: "ETF 代码必须是 6 位数字。" };
  if (!instrument || !Array.isArray(instrument.bars) || !instrument.bars.length) return { ok: false, status: 404, error: `暂时没有 ${code} 的 K 线历史，请先点击“更新行情”。` };
  const bars = instrument.bars.filter((row) => row && row.time && finite(row.close) > 0);
  const benchmark = history["510300"] || { code: "510300", name: "沪深300ETF基准", bars: [] };
  const benchmarkBars = (benchmark.bars || []).filter((row) => row && row.time && finite(row.close) > 0);
  const strategy = strategySeries(bars);
  const candidate = (state.watchlist || []).find((item) => String(item.code) === code) || {};
  return {
    ok: true,
    instrument: { code, name: instrument.name || candidate.name || code, updatedAt: instrument.updatedAt, lastMarketDate: instrument.lastMarketDate, priceSource: instrument.priceSource, secondarySource: instrument.secondarySource, crossCheck: instrument.crossCheck || candidate.priceCrossCheck || {} },
    candidate: { grade: candidate.grade || "-", score: finite(candidate.totalScore, null), status: candidate.status || "未评分", recommendation: candidate.recommendation || "" },
    bars,
    relative: { instrument: normalizeLine(bars), benchmark: normalizeLine(benchmarkBars), benchmarkCode: benchmark.code, benchmarkName: benchmark.name },
    strategy: { equity: strategy.map(({ time, value }) => ({ time, value })), drawdown: strategy.map(({ time, drawdown }) => ({ time, value: drawdown })), methodology: "研究演示：前一日收盘价高于 MA20 且 MA20≥MA60 时持有，否则空仓；未计费率与滑点。" },
    markers: eventMarkers(state, code, new Set(bars.map((row) => row.time))),
    validation: latestMetrics(bars, benchmarkBars),
    portfolio: portfolioSeries(state),
    available: available.map((item) => {
      const row = candidates.get(String(item.code)) || {};
      return { code: String(item.code), name: item.name || String(item.code), grade: row.grade || "-", score: finite(row.totalScore, null), status: row.status || "未评分" };
    }).sort((a, b) => finite(b.score, -1) - finite(a.score, -1) || a.code.localeCompare(b.code))
  };
}

module.exports = { buildMarketVisualization, normalizeLine, strategySeries };
