/* =========================================================
   Content script for the MCI landing page.
   Hooks the chat widget built by assets/js/chat.js:
     .chat__fab  → floating button that opens the panel
     .chat__log  → messages (.chat__msg--user / .chat__msg--bot)
     .chat__form → textarea + submit button
   When the visitor opens the chat, DeepSeek plays a prospective
   student: it writes a question, "types" it into the box, sends it,
   waits for the landing page's assistant to finish answering, and
   repeats for the configured number of turns.
   ========================================================= */
(() => {
  "use strict";

  const ANSWER_TIMEOUT_MS = 120000;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let widget = null; // DOM handles of the landing page chat
  let run = null; // { id, stopped } of the demo in progress
  let hud = null; // on-page status pill
  let status = { running: false, text: "Chưa chạy" };

  /* ---------- Find the chat widget (chat.js may build it late) ---------- */
  function findWidget() {
    const root = document.querySelector(".chat");
    const fab = root?.querySelector(".chat__fab");
    const panel = root?.querySelector(".chat__panel");
    const log = root?.querySelector(".chat__log");
    const form = root?.querySelector(".chat__form");
    const input = form?.querySelector("textarea");
    const sendBtn = form?.querySelector("button[type=submit]");
    if (!fab || !panel || !log || !form || !input || !sendBtn) return null;
    return { root, fab, panel, log, form, input, sendBtn, newBtn: root.querySelector('[data-act="new"]') };
  }

  function whenWidgetReady() {
    return new Promise((resolve) => {
      const found = findWidget();
      if (found) return resolve(found);
      const obs = new MutationObserver(() => {
        const w = findWidget();
        if (w) {
          obs.disconnect();
          resolve(w);
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    });
  }

  whenWidgetReady().then((w) => {
    widget = w;
    // Our listener is added after chat.js's, so the panel is already toggled when it runs.
    const onUserOpen = (e) => {
      if (!e.isTrusted) return; // ignore clicks we trigger ourselves
      setTimeout(() => {
        if (!widget.panel.hidden && !run) maybeAutoStart();
      }, 0);
    };
    w.fab.addEventListener("click", onUserOpen);
    w.root.querySelector(".chat__teaser")?.addEventListener("click", onUserOpen);

    // Closing the panel (button, Esc, or the bubble) stops the demo.
    new MutationObserver(() => {
      if (widget.panel.hidden && run) stopDemo("Đã dừng vì khung chat bị đóng.");
    }).observe(w.panel, { attributes: true, attributeFilter: ["hidden"] });
  });

  async function maybeAutoStart() {
    const s = await getSettings();
    if (s.autoStart) startDemo();
  }

  /* ---------- Messages from the popup ---------- */
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "demo-start") {
      if (!widget) {
        sendResponse({ ok: false, error: "Không tìm thấy khung chat trên trang này (chat có thể đang tắt)." });
        return false;
      }
      if (widget.panel.hidden) widget.fab.click();
      startDemo();
      sendResponse({ ok: true });
    } else if (msg?.type === "demo-stop") {
      stopDemo("Đã dừng.");
      sendResponse({ ok: true });
    } else if (msg?.type === "demo-status") {
      sendResponse({ ok: true, found: !!widget, ...status });
    }
    return false;
  });

  /* ---------- Settings ---------- */
  async function getSettings() {
    const saved = await chrome.storage.local.get(Object.keys(DEMO_DEFAULTS));
    return { ...DEMO_DEFAULTS, ...saved };
  }

  function resolvePersona(s) {
    if (s.persona === "custom" && s.customPersona.trim()) return s.customPersona.trim();
    if (s.persona === "random") {
      const keys = Object.keys(DEMO_PERSONAS);
      return DEMO_PERSONAS[keys[Math.floor(Math.random() * keys.length)]];
    }
    return DEMO_PERSONAS[s.persona] || DEMO_PERSONAS.office;
  }

  /* ---------- Read the page ---------- */
  function readHistory() {
    return [...widget.log.querySelectorAll(".chat__msg")]
      .filter((el) => !el.classList.contains("is-pending") && !el.classList.contains("is-error"))
      .map((el) => ({
        role: el.classList.contains("chat__msg--user") ? "user" : "assistant",
        text: el.innerText.trim(),
      }))
      .filter((m) => m.text)
      .slice(-16);
  }

  let pageContextCache = "";
  function readPageContext() {
    if (pageContextCache) return pageContextCache;
    const parts = [];
    document.querySelectorAll("main h1, main h2, main h3, section h1, section h2, section h3").forEach((el) => {
      if (el.closest(".chat")) return;
      const t = el.innerText.replace(/\s+/g, " ").trim();
      if (t && !parts.includes(t)) parts.push(t);
    });
    pageContextCache = parts.join(" | ").slice(0, 3000);
    return pageContextCache;
  }

  /* ---------- Drive the chat ---------- */
  async function typeQuestion(text, typingMs, current) {
    const { input } = widget;
    input.focus();
    input.value = "";
    for (const ch of text) {
      if (current.stopped) {
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return false;
      }
      input.value += ch;
      input.dispatchEvent(new Event("input", { bubbles: true })); // lets chat.js auto-grow the box
      if (typingMs > 0) await sleep(typingMs * (0.5 + Math.random()));
    }
    return true;
  }

  async function waitUntilIdle(current, timeoutMs = ANSWER_TIMEOUT_MS) {
    const start = Date.now();
    while (widget.sendBtn.disabled || widget.log.querySelector(".chat__msg.is-pending")) {
      if (current.stopped) return false;
      if (Date.now() - start > timeoutMs) throw new Error("Trợ lý của trang trả lời quá lâu.");
      await sleep(250);
    }
    return true;
  }

  async function startDemo() {
    if (run) return;
    const current = { stopped: false };
    run = current;
    const s = await getSettings();
    const persona = resolvePersona(s);
    const total = Math.max(1, Math.min(10, Number(s.turns) || DEMO_DEFAULTS.turns));
    const usingAI = !!s.deepseekKey.trim();
    showHud();

    try {
      await sleep(600); // let the panel finish opening
      await waitUntilIdle(current);
      if (s.freshConversation && widget.newBtn && readHistory().some((m) => m.role === "user")) {
        widget.newBtn.click();
        await sleep(300);
      }

      for (let turn = 1; turn <= total && !current.stopped; turn++) {
        setStatus(`Câu ${turn}/${total} · ${usingAI ? "DeepSeek đang nghĩ câu hỏi…" : "Đang chọn câu hỏi…"}`);
        const reply = await chrome.runtime.sendMessage({
          type: "generate-question",
          history: readHistory(),
          pageContext: readPageContext(),
          persona,
          turn,
          total,
        });
        if (current.stopped) break;
        if (!reply?.ok) throw new Error(reply?.error || "Không tạo được câu hỏi.");

        setStatus(`Câu ${turn}/${total} · đang gõ…`);
        if (!(await typeQuestion(reply.question, Number(s.typingMs), current))) break;
        await sleep(250);
        widget.form.requestSubmit();

        setStatus(`Câu ${turn}/${total} · trợ lý MCI đang trả lời…`);
        await sleep(400);
        if (!(await waitUntilIdle(current))) break;
        if (widget.log.lastElementChild?.classList.contains("is-error")) {
          throw new Error("Trợ lý của trang báo lỗi (có thể đã chạm giới hạn số câu hỏi).");
        }
        if (turn < total) await sleep(Number(s.pauseMs));
      }
      if (!current.stopped) finish(`Xong ${total} câu hỏi ✓`);
    } catch (err) {
      if (!current.stopped) finish(`Lỗi: ${err.message}`, true);
    }
  }

  function stopDemo(text) {
    if (!run) return;
    run.stopped = true;
    finish(text);
  }

  function finish(text, isError = false) {
    run = null;
    status = { running: false, text };
    if (!hud) return;
    hud.classList.toggle("is-error", isError);
    hud.querySelector(".mci-demo-hud__text").textContent = text;
    hud.querySelector("button").textContent = "Đóng";
    clearTimeout(hud._hideTimer);
    hud._hideTimer = setTimeout(hideHud, isError ? 8000 : 4000);
  }

  /* ---------- On-page status pill ---------- */
  function showHud() {
    if (!hud) {
      hud = document.createElement("div");
      hud.className = "mci-demo-hud";
      hud.innerHTML = `
        <span class="mci-demo-hud__badge">AI</span>
        <span class="mci-demo-hud__text"></span>
        <button type="button"></button>`;
      hud.querySelector("button").addEventListener("click", () => (run ? stopDemo("Đã dừng.") : hideHud()));
      document.body.append(hud);
    }
    clearTimeout(hud._hideTimer);
    hud.classList.remove("is-error");
    hud.hidden = false;
    hud.querySelector("button").textContent = "Dừng";
    setStatus("Đang chuẩn bị…");
  }

  function hideHud() {
    if (hud) hud.hidden = true;
  }

  function setStatus(text) {
    status = { running: true, text };
    if (hud) hud.querySelector(".mci-demo-hud__text").textContent = text;
  }
})();
