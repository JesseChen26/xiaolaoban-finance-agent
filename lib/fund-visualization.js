function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function validBars(rows = []) {
  const byDate = new Map();
  rows.forEach((row) => {
    const nav = finite(row?.nav);
    const time = String(row?.time || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(time) && nav > 0) {
      byDate.set(time, { time, nav, dailyPct: row.dailyPct === null || row.dailyPct === undefined ? null : finite(row.dailyPct) });
    }
  });
  return [...byDate.values()].sort((a, b) => a.time.localeCompare(b.time));
}

function normalizedSeries(bars = []) {
  if (!bars.length) return [];
  const base = finite(bars[0].nav);
  return bars.map((row) => ({ time: row.time, value: Number((finite(row.nav) / base * 100).toFixed(3)) }));
}

function drawdownSeries(bars = []) {
  let peak = 0;
  return bars.map((row) => {
    peak = Math.max(peak, finite(row.nav));
    return { time: row.time, value: peak > 0 ? Number(((finite(row.nav) / peak - 1) * 100).toFixed(3)) : 0 };
  });
}

function periodMetrics(bars = []) {
  const latest = bars.at(-1);
  return [
    { label: "1月", days: 22 },
    { label: "3月", days: 66 },
    { label: "1年", days: 250 }
  ].map(({ label, days }) => {
    if (!latest || bars.length <= days) return { label, days, value: null };
    const base = finite(bars[bars.length - days - 1]?.nav);
    return { label, days, value: base > 0 ? Number(((finite(latest.nav) / base - 1) * 100).toFixed(2)) : null };
  });
}

function buildFundVisualization(state, requestedCode) {
  const history = state.fundNavHistory && typeof state.fundNavHistory === "object" ? state.fundNavHistory : {};
  const positions = (state.portfolio || []).filter((item) => /^\d{6}$/.test(String(item.code || "")));
  const available = positions.map((item) => {
    const entry = history[String(item.code)] || {};
    const bars = validBars(entry.bars);
    return { code: String(item.code), name: item.name || entry.name || String(item.code), points: bars.length, lastNavDate: bars.at(-1)?.time || item.navDate || "" };
  }).filter((item) => item.points > 0);
  const code = String(requestedCode || available[0]?.code || "");
  if (!/^\d{6}$/.test(code)) return { ok: false, status: 400, error: "基金代码必须是 6 位数字。" };
  const position = positions.find((item) => String(item.code) === code);
  const entry = history[code];
  const bars = validBars(entry?.bars);
  if (!position || !entry || !bars.length) return { ok: false, status: 404, error: `暂时没有 ${code} 的历史净值，请先点击“更新净值”。` };

  const latest = bars.at(-1);
  const quantity = finite(position.quantity);
  const costNav = finite(position.cost);
  const marketValue = quantity * finite(latest.nav);
  const costValue = quantity * costNav;
  const pnl = marketValue - costValue;
  const drawdown = drawdownSeries(bars);
  return {
    ok: true,
    instrument: {
      code,
      name: position.name || entry.name || code,
      source: entry.source || position.navSource || "基金净值来源",
      sourceUrl: entry.sourceUrl || position.navSourceUrl || "",
      updatedAt: entry.updatedAt || position.updatedAt || "",
      firstNavDate: bars[0].time,
      lastNavDate: latest.time,
      validation: entry.validation || {}
    },
    holding: {
      quantity,
      costNav,
      currentNav: finite(latest.nav),
      marketValue: Number(marketValue.toFixed(2)),
      costValue: Number(costValue.toFixed(2)),
      pnl: Number(pnl.toFixed(2)),
      pnlPct: costValue > 0 ? Number((pnl / costValue * 100).toFixed(2)) : null,
      importSource: position.importSource || "手动录入"
    },
    bars,
    normalized: normalizedSeries(bars),
    drawdown,
    metrics: periodMetrics(bars),
    maxDrawdown: drawdown.length ? Number(Math.min(...drawdown.map((row) => row.value)).toFixed(2)) : null,
    available
  };
}

module.exports = { buildFundVisualization, validBars, normalizedSeries, drawdownSeries, periodMetrics };
