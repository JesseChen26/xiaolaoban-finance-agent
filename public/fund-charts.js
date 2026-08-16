(() => {
  const charts = new Map();
  let currentPayload = null;
  const theme = {
    layout: { background: { type: "solid", color: "#0c1715" }, textColor: "#9fb0aa", fontFamily: "Inter, 'Microsoft YaHei', sans-serif" },
    grid: { vertLines: { color: "rgba(154,176,167,.08)" }, horzLines: { color: "rgba(154,176,167,.08)" } },
    rightPriceScale: { borderColor: "rgba(154,176,167,.22)", minimumWidth: 72 },
    timeScale: { borderColor: "rgba(154,176,167,.22)", rightOffset: 4, barSpacing: 6, minBarSpacing: 1.2 },
    crosshair: { mode: 0, vertLine: { color: "#d9f65a", width: 1, style: 2, labelBackgroundColor: "#284138" }, horzLine: { color: "#d9f65a", width: 1, style: 2, labelBackgroundColor: "#284138" } },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    kineticScroll: { mouse: true, touch: true }, localization: { locale: "zh-CN" }
  };

  function destroy(key) { const entry = charts.get(key); if (!entry) return; entry.observer.disconnect(); entry.chart.remove(); charts.delete(key); }
  function mount(key, id, height = 280) {
    destroy(key);
    const element = document.getElementById(id);
    if (!element || !window.LightweightCharts) return null;
    const chart = LightweightCharts.createChart(element, { ...theme, width: Math.max(element.clientWidth, 280), height: element.clientHeight || height });
    const observer = new ResizeObserver(() => chart.applyOptions({ width: Math.max(element.clientWidth, 280), height: element.clientHeight || height }));
    observer.observe(element); element.addEventListener("dblclick", () => chart.timeScale().fitContent()); charts.set(key, { chart, observer }); return chart;
  }
  function line(chart, data, color, title, options = {}) {
    const series = chart.addSeries(LightweightCharts.LineSeries, { color, lineWidth: options.width || 2, priceLineVisible: false, lastValueVisible: true, title, priceScaleId: options.scale || "right" });
    series.setData((data || []).map((row) => ({ time: row.time, value: Number(options.key ? row[options.key] : row.value) })).filter((row) => Number.isFinite(row.value)));
    return series;
  }
  function fmt(value, digits = 4) { const n = Number(value); return Number.isFinite(n) ? n.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "-"; }
  function setRange(days) {
    if (!currentPayload?.bars?.length) return;
    charts.forEach(({ chart }) => {
      if (days === "all") chart.timeScale().fitContent();
      else { const rows = currentPayload.bars; const count = Math.min(Number(days) || rows.length, rows.length); chart.timeScale().setVisibleRange({ from: rows[rows.length - count].time, to: rows.at(-1).time }); }
    });
  }
  function render(payload) {
    currentPayload = payload;
    const main = mount("fund-main", "fund-nav-chart", 470);
    if (!main) return;
    const nav = line(main, payload.bars, "#d9f65a", "单位净值", { key: "nav", width: 3 });
    if (Number(payload.holding.costNav) > 0) nav.createPriceLine({ price: Number(payload.holding.costNav), color: "#f2c14e", lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: "你的成本" });
    const readout = document.getElementById("fund-crosshair-readout");
    main.subscribeCrosshairMove((param) => {
      const point = param.seriesData?.get(nav); if (!readout) return;
      if (!point || !param.time) { readout.textContent = "移动鼠标查看日期、单位净值、日涨跌和相对成本"; return; }
      const row = payload.bars.find((item) => item.time === String(param.time));
      const vsCost = Number(payload.holding.costNav) > 0 ? (Number(point.value) / Number(payload.holding.costNav) - 1) * 100 : null;
      readout.innerHTML = `<strong>${String(param.time)}</strong><span>单位净值 ${fmt(point.value)} · 日涨跌 ${row?.dailyPct == null ? "-" : `${Number(row.dailyPct).toFixed(2)}%`} · 较成本 ${vsCost == null ? "-" : `${vsCost >= 0 ? "+" : ""}${vsCost.toFixed(2)}%`}</span>`;
    });
    const returns = mount("fund-return", "fund-return-chart"); if (returns) line(returns, payload.normalized, "#5dd6b2", "累计指数", { width: 3 });
    const dd = mount("fund-drawdown", "fund-drawdown-chart"); if (dd) { const series = dd.addSeries(LightweightCharts.AreaSeries, { lineColor: "#e76f51", topColor: "rgba(231,111,81,.35)", bottomColor: "rgba(231,111,81,.02)", lineWidth: 2, priceLineVisible: false }); series.setData(payload.drawdown); }
    setRange(250);
  }
  window.FundCharts = { render, setRange };
})();
