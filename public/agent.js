(() => {
  const $ = (id) => document.getElementById(id);
  let history = [];

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function formatTime(value) {
    if (!value) return "时间未知";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("zh-CN", { hour12: false });
  }

  function safeUrl(value) {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch { return ""; }
  }

  function setRunning(running) {
    const button = $("agent-run-button");
    button.disabled = running;
    button.classList.toggle("running", running);
    button.querySelector("span").textContent = running ? "正在建立证据链" : "启动研究";
    if (running) {
      if ($("agent-loop-summary")) $("agent-loop-summary").textContent = "正在动态规划与观察";
      $("agent-trace").innerHTML = ["检查数据新鲜度", "主动获取外部信息", "多源核验并建立证据链"].map((label, index) => `
        <div class="trace-step active"><span>${String(index + 1).padStart(2, "0")}</span><div><strong>${label}</strong><small>${index === 0 ? "进行中" : "等待上一步"}</small></div></div>`).join("");
    }
  }

  function renderHistory() {
    $("agent-history-count").textContent = `${history.length} 份`;
    $("agent-history").innerHTML = history.length ? history.slice(0, 12).map((item, index) => `
      <button class="history-item" data-history-index="${index}">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <div><strong>${esc(item.question)}</strong><small>${esc(item.verdict?.level || "数据不足")} · ${esc(formatTime(item.createdAt))}</small></div>
      </button>`).join("") : '<p class="trace-placeholder">还没有研究档案。</p>';
    document.querySelectorAll("[data-history-index]").forEach((button) => button.addEventListener("click", () => renderDossier(history[Number(button.dataset.historyIndex)])));
  }

  function renderTrace(dossier) {
    const trace = dossier.trace || [];
    const loop = dossier.loop || {};
    const summary = $("agent-loop-summary");
    if (summary) summary.textContent = loop.adaptive
      ? `${loop.iterations || 0} 轮 · ${loop.toolCalls || 0} 工具 · ${loop.retries || 0} 重试`
      : "PLAN → TOOL → EVIDENCE";
    if (trace.length) {
      const glyphs = { plan: "P", reason: "R", replan: "↻", tool: "T", observe: "O", retry: "!", reuse: "↺", stop: "✓", error: "×", fallback: "F" };
      $("agent-trace").innerHTML = trace.map((item) => `
        <div class="trace-step ${item.type === "stop" ? "synthesis" : item.type === "tool" || item.type === "observe" ? "complete" : `trace-${esc(item.type)}`}">
          <span>${glyphs[item.type] || "·"}</span>
          <div><strong>${esc(item.label || item.type)}</strong><small>${esc(item.detail || "")}${item.durationMs !== undefined ? ` · ${Number(item.durationMs)} ms` : ""}</small></div>
        </div>`).join("");
      return;
    }
    const tasks = dossier.plan?.tasks || [];
    $("agent-trace").innerHTML = tasks.map((task, index) => `
      <div class="trace-step complete">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <div><strong>${esc(task.name)}</strong><small>${esc(task.tool)} · 已完成</small></div>
      </div>`).join("") + `<div class="trace-step synthesis"><span>✓</span><div><strong>形成研究结论</strong><small>${esc(dossier.plan?.generatedFrom || "研究引擎")}</small></div></div>`;
  }

  function renderSources(sources = []) {
    $("agent-source-ledger").innerHTML = sources.length ? sources.map((source) => `
      <div class="source-entry" data-status="${esc(source.verificationStatus || source.status || "unknown")}">
        <span class="source-grade">${esc(source.level || "B")}</span>
        <div><strong>${safeUrl(source.url) ? `<a href="${esc(safeUrl(source.url))}" target="_blank" rel="noreferrer">${esc(source.name || source.tool)}</a>` : esc(source.name || source.tool)}</strong><small>${esc(source.tool)} · ${esc(source.verificationStatus || source.status || "待核验")} · ${esc(formatTime(source.updatedAt))}</small></div>
      </div>`).join("") : '<p class="trace-placeholder">本次没有获得可用来源。</p>';
  }

  function renderCards(items, emptyText) {
    return items.length ? items.map((item, index) => `
      <div class="evidence-card"><span>${String(index + 1).padStart(2, "0")}</span><div><strong>${esc(item.title)}</strong><p>${esc(item.detail)}</p>${item.kind ? `<small>${esc(item.kind === "rule" ? "确定性规则" : item.kind)}</small>` : ""}</div></div>`).join("") : `<div class="evidence-empty">${esc(emptyText)}</div>`;
  }

  async function renderAgentMarket(code) {
    const panel = $("agent-market-brief");
    if (!panel) return;
    if (!/^\d{6}$/.test(String(code || "")) || window.location.protocol === "file:") { panel.classList.add("hidden"); return; }
    try {
      const response = await fetch(`/api/market-visualization?code=${encodeURIComponent(code)}`);
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "行情不可用");
      panel.classList.remove("hidden");
      requestAnimationFrame(() => window.MarketCharts?.renderAgent($("agent-market-chart"), $("agent-market-readout"), payload.bars, payload.markers));
    } catch { panel.classList.add("hidden") }
  }

  function renderDossier(dossier) {
    if (!dossier) return;
    $("agent-empty-state").classList.add("hidden");
    $("agent-dossier").classList.remove("hidden");
    $("dossier-number").textContent = `RESEARCH / ${String(Math.max(1, history.indexOf(dossier) + 1)).padStart(3, "0")}`;
    $("dossier-time").textContent = formatTime(dossier.createdAt);
    $("dossier-mode").textContent = dossier.mode === "model" ? "LLM 自主研究循环" : "本地自适应循环";
    $("dossier-question").textContent = dossier.question;
    $("dossier-verdict").textContent = dossier.verdict?.level || "数据不足";
    $("dossier-verdict").dataset.tone = dossier.verdict?.tone || "insufficient";
    $("dossier-score").textContent = dossier.verdict?.score === null || dossier.verdict?.score === undefined ? "—" : `${Number(dossier.verdict.score).toFixed(0)} / 100`;
    $("dossier-source-count").textContent = `${dossier.sources?.length || 0} 项`;
    const reliability = dossier.reliability || { level: "低", status: "待核验", tone: "low" };
    $("dossier-reliability").textContent = `${reliability.level} · ${reliability.status}`;
    $("dossier-reliability").dataset.tone = reliability.tone || "low";
    $("dossier-narrative").textContent = dossier.narrative;
    $("dossier-evidence").innerHTML = renderCards(dossier.evidence || [], "暂无足够的正向证据。");
    $("dossier-risks").innerHTML = renderCards(dossier.risks || [], "当前工具没有识别到明确硬伤，但不代表没有风险。");
    $("dossier-disclosure").textContent = dossier.disclosure;
    renderTrace(dossier);
    renderSources(dossier.sources || []);
    renderAgentMarket(dossier.focusCode || dossier.plan?.codes?.[0]);
  }

  async function loadAgent() {
    if (window.location.protocol === "file:") {
      $("agent-mode-label").textContent = "文件预览模式";
      $("agent-model-label").textContent = "请通过 localhost:4173 使用 Agent";
      return;
    }
    try {
      const [statusResponse, historyResponse] = await Promise.all([fetch("/api/agent/status"), fetch("/api/agent/history")]);
      const status = await statusResponse.json();
      const archive = await historyResponse.json();
      $("agent-mode-label").textContent = status.mode === "model" ? "LLM 自主研究循环" : "本地自适应循环";
      $("agent-model-label").textContent = `${status.model} · ${status.toolCount} 个工具 · 最多 ${status.maxTurns || 10} 轮`;
      history = archive.items || [];
      renderHistory();
    } catch (error) {
      $("agent-mode-label").textContent = "研究引擎离线";
      $("agent-model-label").textContent = error.message;
    }
  }

  async function runResearch() {
    const question = $("agent-question").value.trim();
    if (question.length < 4) {
      $("agent-question").focus();
      return;
    }
    if (window.location.protocol === "file:") {
      alert("Agent 需要本地服务。请打开 http://localhost:4173 使用。");
      return;
    }
    setRunning(true);
    try {
      const response = await fetch("/api/agent/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "研究任务执行失败");
      history.unshift(payload.dossier);
      renderHistory();
      renderDossier(payload.dossier);
    } catch (error) {
      $("agent-trace").innerHTML = `<div class="trace-error"><strong>研究中断</strong><p>${esc(error.message)}</p></div>`;
    } finally { setRunning(false) }
  }

  $("agent-run-button")?.addEventListener("click", runResearch);
  $("agent-question")?.addEventListener("keydown", (event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") runResearch() });
  document.querySelectorAll("[data-agent-question]").forEach((button) => button.addEventListener("click", () => { $("agent-question").value = button.dataset.agentQuestion; $("agent-question").focus() }));
  loadAgent();
})();
