(() => {
  const charts = new Map();
  let currentPayload = null;

  const theme = {
    layout: { background: { type: "solid", color: "#0c1715" }, textColor: "#9fb0aa", fontFamily: "Inter, 'Microsoft YaHei', sans-serif" },
    grid: { vertLines: { color: "rgba(154, 176, 167, .08)" }, horzLines: { color: "rgba(154, 176, 167, .08)" } },
    rightPriceScale: { borderColor: "rgba(154, 176, 167, .22)", minimumWidth: 66 },
    timeScale: { borderColor: "rgba(154, 176, 167, .22)", timeVisible: false, rightOffset: 4, barSpacing: 7, minBarSpacing: 1.5 },
    crosshair: { mode: 0, vertLine: { color: "#d9f65a", width: 1, style: 2, labelBackgroundColor: "#284138" }, horzLine: { color: "#d9f65a", width: 1, style: 2, labelBackgroundColor: "#284138" } },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    kineticScroll: { mouse: true, touch: true },
    localization: { locale: "zh-CN" }
  };

  function destroy(key) {
    const entry = charts.get(key);
    if (!entry) return;
    entry.observer?.disconnect();
    entry.chart.remove();
    charts.delete(key);
  }

  function mount(key, element, options = {}) {
    destroy(key);
    if (!element || !window.LightweightCharts) return null;
    const chart = LightweightCharts.createChart(element, { ...theme, width: Math.max(element.clientWidth, 280), height: element.clientHeight || options.height || 300, ...options });
    const observer = new ResizeObserver(() => chart.applyOptions({ width: Math.max(element.clientWidth, 280), height: element.clientHeight || options.height || 300 }));
    observer.observe(element);
    element.addEventListener("dblclick", () => chart.timeScale().fitContent());
    charts.set(key, { chart, observer });
    return chart;
  }

  function validLine(rows, key = "value") {
    return (rows || []).filter((row) => row && row.time && Number.isFinite(Number(row[key]))).map((row) => ({ time: row.time, value: Number(row[key]) }));
  }

  function formatNumber(value, digits = 3) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "-";
  }

  function setRange(days) {
    const entry = charts.get("main");
    if (!entry || !currentPayload?.bars?.length) return;
    if (days === "all") entry.chart.timeScale().fitContent();
    else {
      const bars = currentPayload.bars;
      const count = Math.min(Number(days) || bars.length, bars.length);
      entry.chart.timeScale().setVisibleRange({ from: bars[bars.length - count].time, to: bars[bars.length - 1].time });
    }
  }

  function renderMain(payload) {
    const element = document.getElementById("market-kline-chart");
    const chart = mount("main", element, { timeScale: { ...theme.timeScale, barSpacing: 8 } });
    if (!chart) return;
    const candles = chart.addSeries(LightweightCharts.CandlestickSeries, { upColor: "#ef5350", downColor: "#26a69a", borderUpColor: "#ef5350", borderDownColor: "#26a69a", wickUpColor: "#ef5350", wickDownColor: "#26a69a", priceLineVisible: true, lastValueVisible: true });
    const ma20 = chart.addSeries(LightweightCharts.LineSeries, { color: "#f2c14e", lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    const ma60 = chart.addSeries(LightweightCharts.LineSeries, { color: "#7aa2f7", lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    const volume = chart.addSeries(LightweightCharts.HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume", priceLineVisible: false, lastValueVisible: false });
    chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.08, bottom: 0.28 } });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    candles.setData(payload.bars.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
    ma20.setData(payload.bars.filter((row) => row.ma20 !== null && row.ma20 !== undefined && Number.isFinite(Number(row.ma20))).map(({ time, ma20: value }) => ({ time, value: Number(value) })));
    ma60.setData(payload.bars.filter((row) => row.ma60 !== null && row.ma60 !== undefined && Number.isFinite(Number(row.ma60))).map(({ time, ma60: value }) => ({ time, value: Number(value) })));
    volume.setData(payload.bars.map((row) => ({ time: row.time, value: Number(row.volume || 0), color: Number(row.close) >= Number(row.open) ? "rgba(239,83,80,.38)" : "rgba(38,166,154,.38)" })));
    if (payload.markers?.length && LightweightCharts.createSeriesMarkers) LightweightCharts.createSeriesMarkers(candles, payload.markers);
    const readout = document.getElementById("market-crosshair-readout");
    chart.subscribeCrosshairMove((param) => {
      const bar = param.seriesData?.get(candles);
      if (!readout) return;
      if (!bar || !param.time) { readout.textContent = "移动鼠标查看开高低收、成交量和均线"; return; }
      const ma20Point = param.seriesData.get(ma20);
      const ma60Point = param.seriesData.get(ma60);
      const volumePoint = param.seriesData.get(volume);
      readout.innerHTML = `<strong>${String(param.time)}</strong><span>开 ${formatNumber(bar.open)} · 高 ${formatNumber(bar.high)} · 低 ${formatNumber(bar.low)} · 收 ${formatNumber(bar.close)}</span><span>量 ${formatNumber(volumePoint?.value, 0)} · MA20 ${formatNumber(ma20Point?.value)} · MA60 ${formatNumber(ma60Point?.value)}</span>`;
    });
    chart.timeScale().fitContent();
    setRange(120);
  }

  function lineChart(key, elementId, series, options = {}) {
    const chart = mount(key, document.getElementById(elementId));
    if (!chart) return;
    series.forEach((item) => {
      const line = chart.addSeries(LightweightCharts.LineSeries, { color: item.color, lineWidth: item.width || 2, lineStyle: item.style || 0, priceLineVisible: false, lastValueVisible: true, priceScaleId: item.scale || "right", title: item.title || "" });
      line.setData(validLine(item.data));
    });
    if (options.zeroLine) {
      const zero = chart.addSeries(LightweightCharts.LineSeries, { color: "rgba(255,255,255,.2)", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
      const source = series[0]?.data || [];
      zero.setData(source.map((row) => ({ time: row.time, value: 0 })));
    }
    chart.timeScale().fitContent();
  }

  function render(payload) {
    currentPayload = payload;
    renderMain(payload);
    lineChart("relative", "market-relative-chart", [
      { data: payload.relative.instrument, color: "#d9f65a", width: 3, title: payload.instrument.code },
      { data: payload.relative.benchmark, color: "#7aa2f7", width: 2, title: "沪深300" }
    ]);
    lineChart("strategy", "market-strategy-chart", [
      { data: payload.strategy.equity, color: "#d9f65a", width: 3, title: "规则净值" },
      { data: payload.strategy.drawdown, color: "#e76f51", width: 2, title: "回撤", scale: "left" }
    ], { zeroLine: true });
    const portfolio = payload.portfolio || [];
    if (portfolio.length) lineChart("portfolio", "market-portfolio-chart", [{ data: portfolio, color: "#5dd6b2", width: 3, title: "模拟总资产" }]);
    else { destroy("portfolio"); const el = document.getElementById("market-portfolio-chart"); if (el) el.innerHTML = '<div class="chart-empty">产生模拟交易/资产快照后，这里会形成组合净值与回撤曲线。</div>'; }
  }

  function renderAgent(element, readout, bars, markers = []) {
    if (!element || !bars?.length) return;
    const chart = mount("agent", element, { height: 230, timeScale: { ...theme.timeScale, barSpacing: 6 } });
    const candles = chart.addSeries(LightweightCharts.CandlestickSeries, { upColor: "#ef5350", downColor: "#26a69a", borderVisible: false, wickUpColor: "#ef5350", wickDownColor: "#26a69a" });
    const ma20 = chart.addSeries(LightweightCharts.LineSeries, { color: "#f2c14e", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    const ma60 = chart.addSeries(LightweightCharts.LineSeries, { color: "#7aa2f7", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    candles.setData(bars.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
    ma20.setData(bars.filter((row) => row.ma20 !== null).map((row) => ({ time: row.time, value: Number(row.ma20) })));
    ma60.setData(bars.filter((row) => row.ma60 !== null).map((row) => ({ time: row.time, value: Number(row.ma60) })));
    if (markers.length && LightweightCharts.createSeriesMarkers) LightweightCharts.createSeriesMarkers(candles, markers);
    chart.subscribeCrosshairMove((param) => { const bar = param.seriesData?.get(candles); if (bar && readout) readout.textContent = `${String(param.time)} · O ${formatNumber(bar.open)} H ${formatNumber(bar.high)} L ${formatNumber(bar.low)} C ${formatNumber(bar.close)}`; });
    chart.timeScale().fitContent();
  }

  window.MarketCharts = { render, renderAgent, setRange, resize: () => charts.forEach(({ chart }) => chart.timeScale().fitContent()) };
})();
