/* Popup: settings + start/stop for the demo in the current tab. */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const FIELDS = ["deepseekKey", "model", "persona", "customPersona", "turns", "typingMs", "pauseMs", "autoStart", "freshConversation"];
  const statusEl = $("status");

  /* ---------- Settings ---------- */
  DEMO_MODELS.forEach((m) => $("model").append(new Option(m.label, m.id)));
  Object.entries(DEMO_PERSONA_LABELS).forEach(([key, label]) => $("persona").append(new Option(label, key)));

  chrome.storage.local.get(FIELDS).then((saved) => {
    const s = { ...DEMO_DEFAULTS, ...saved };
    if (!DEMO_MODELS.some((m) => m.id === s.model)) s.model = DEMO_DEFAULTS.model;
    for (const f of FIELDS) {
      const el = $(f);
      if (el.type === "checkbox") el.checked = !!s[f];
      else el.value = s[f];
    }
    $("customWrap").hidden = s.persona !== "custom";
  });

  let savedTimer;
  async function save() {
    const data = {};
    for (const f of FIELDS) {
      const el = $(f);
      if (el.type === "checkbox") data[f] = el.checked;
      else if (el.type === "number") data[f] = clamp(Number(el.value), Number(el.min), Number(el.max), DEMO_DEFAULTS[f]);
      else data[f] = el.value;
    }
    await chrome.storage.local.set(data);
    $("customWrap").hidden = data.persona !== "custom";
    $("saved").hidden = false;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => ($("saved").hidden = true), 1200);
  }
  const clamp = (n, min, max, fallback) => (Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback);

  $("settings").addEventListener("change", save);
  $("settings").addEventListener("submit", (e) => e.preventDefault());

  /* ---------- Talk to the landing page tab ---------- */
  async function activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function sendToTab(message) {
    const tab = await activeTab();
    if (!tab?.id) return null;
    try {
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (_) {
      return null; // no content script here: not the landing page
    }
  }

  async function refreshStatus() {
    const res = await sendToTab({ type: "demo-status" });
    statusEl.classList.remove("is-on");
    if (!res) {
      statusEl.textContent = "Hãy mở landing page MCI trong tab này để chạy demo.";
      $("start").disabled = $("stop").disabled = true;
      return;
    }
    if (!res.found) {
      statusEl.textContent = "Chưa thấy khung chat trên trang (chat có thể đang tắt).";
      $("start").disabled = $("stop").disabled = true;
      return;
    }
    statusEl.textContent = res.running ? res.text : `Sẵn sàng · lần trước: ${res.text}`;
    statusEl.classList.toggle("is-on", res.running);
    $("start").disabled = res.running;
    $("stop").disabled = !res.running;
  }

  $("start").addEventListener("click", async () => {
    await save();
    const res = await sendToTab({ type: "demo-start" });
    if (res && !res.ok) statusEl.textContent = res.error;
    setTimeout(refreshStatus, 300);
  });
  $("stop").addEventListener("click", async () => {
    await sendToTab({ type: "demo-stop" });
    refreshStatus();
  });

  refreshStatus();
  setInterval(refreshStatus, 1000);

  /* ---------- Try one question without touching the page ---------- */
  $("test").addEventListener("click", async () => {
    await save();
    const out = $("testOut");
    out.hidden = false;
    out.classList.remove("is-error");
    out.textContent = "Đang hỏi DeepSeek…";
    $("test").disabled = true;
    const s = { ...DEMO_DEFAULTS, ...(await chrome.storage.local.get(FIELDS)) };
    const personaKey = s.persona === "random" ? "office" : s.persona;
    const persona = personaKey === "custom" ? s.customPersona.trim() || DEMO_PERSONAS.office : DEMO_PERSONAS[personaKey];
    const res = await chrome.runtime.sendMessage({ type: "generate-question", history: [], persona, turn: 1, total: s.turns });
    $("test").disabled = false;
    if (res?.ok) {
      out.textContent = `${res.question}  —  (${res.source === "offline" ? "câu soạn sẵn" : res.source})`;
    } else {
      out.classList.add("is-error");
      out.textContent = res?.error || "Không tạo được câu hỏi.";
    }
  });
})();
