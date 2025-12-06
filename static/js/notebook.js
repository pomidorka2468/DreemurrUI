const NB_API_BASE = "/notebook";

(function () {
  // Expose init function globally so main.js can call it
  window.initNotebookMode = function () {
    const layout = document.querySelector(".notebook-layout");
    if (!layout) return;

    const textEl = document.getElementById("nbText");
    const styleEl = document.getElementById("nbStyle");
    const statusEl = document.getElementById("nbStatus");
    const tokenCountEl = document.getElementById("nbTokenCount");

    const contextEl = document.getElementById("nbContext");
    const guideEl = document.getElementById("nbGuide");

    const titleEl = document.getElementById("nbTitle");
    const saveBtn = document.getElementById("nbSaveBtn");
    const loadBtn = document.getElementById("nbLoadBtn");

    const revertBtn = document.getElementById("nbRevertBtn");
    const stopBtn = document.getElementById("nbStopBtn");
    const contBtn = document.getElementById("nbContinueBtn");

    const tabs = layout.querySelectorAll(".nb-tab");
    const panels = layout.querySelectorAll(".nb-subpanel");

    let lastState = null; // text before last AI change
    let lastAction = null; // "continue"
    let lastPayload = null; // payload used for last action
    let currentStreamController = null;
    let streaming = false;

    function setStatus(msg) {
      if (statusEl) statusEl.textContent = msg;
    }

    function updateTokens() {
      if (!tokenCountEl || !textEl) return;
      const chars = textEl.value.length;
      const approxTokens = Math.max(0, Math.round(chars / 4)); // rough estimate
      tokenCountEl.textContent = `${approxTokens} tokens`;
    }

    // --- Tab switching ---

    function activateTab(tabName) {
      tabs.forEach((btn) => {
        const active = btn.dataset.tab === tabName;
        btn.classList.toggle("nb-tab-active", active);
        btn.setAttribute("aria-selected", active ? "true" : "false");
      });
      panels.forEach((panel) => {
        const active = panel.dataset.tab === tabName;
        panel.classList.toggle("nb-subpanel-active", active);
      });
    }

    tabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        const tabName = btn.dataset.tab;
        if (!tabName) return;
        activateTab(tabName);
      });
    });

    // --- AI actions ---

    function abortActiveStream() {
      if (currentStreamController) {
        currentStreamController.abort();
        currentStreamController = null;
        streaming = false;
      }
    }

    async function streamContinue(payload, baseText) {
      abortActiveStream();
      currentStreamController = new AbortController();
      streaming = true;

      const res = await fetch(`${NB_API_BASE}/continue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: currentStreamController.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error("HTTP " + res.status);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      // start from existing text
      textEl.value = baseText;

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const json = JSON.parse(trimmed);
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) {
                textEl.value += delta;
                updateTokens();
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      } finally {
        streaming = false;
        currentStreamController = null;
      }
    }

    async function callContinue() {
      if (!textEl) return;
      const fullText = textEl.value;
      if (!fullText.trim()) return;

      setStatus("Continuing...");

      const style = styleEl?.value || "";

      // Use optional context/guide if provided; otherwise whole text
      let baseText = fullText;
      if (contextEl && contextEl.value.trim()) {
        baseText = contextEl.value;
      }

      const payload = {
        text: baseText,
        style: style || null,
      };

      lastState = fullText;
      lastAction = "continue";
      lastPayload = payload;

      try {
        await streamContinue(payload, fullText);
        setStatus("Ready");
      } catch (err) {
        if (err.name === "AbortError") {
          setStatus("Cancelled");
        } else {
          console.error(err);
          setStatus("Error: " + err.message);
        }
      }
    }

    function stopStreaming() {
      abortActiveStream();
      setStatus("Cancelled");
    }

    function revertLast() {
      abortActiveStream();
      if (!textEl || lastState == null) {
        setStatus("Nothing to revert.");
        return;
      }
      textEl.value = lastState;
      updateTokens();
      lastState = null;
      lastAction = null;
      lastPayload = null;
      setStatus("Reverted last AI action.");
    }

    // --- Save / Load (localStorage) ---

    const STORAGE_PREFIX = "dreamui-notebook-";

    function getStorageKey() {
      const title = (titleEl?.value || "").trim() || "default";
      return STORAGE_PREFIX + title;
    }

    function saveNotebook() {
      if (!textEl) return;
      const key = getStorageKey();
      const payload = {
        text: textEl.value,
        style: styleEl?.value || "",
        context: contextEl?.value || "",
        guide: guideEl?.value || "",
      };
      try {
        localStorage.setItem(key, JSON.stringify(payload));
        setStatus(`Saved as "${key}".`);
      } catch (err) {
        console.error(err);
        setStatus("Save failed: " + err.message);
      }
    }

    function loadNotebook() {
      const key = getStorageKey();
      try {
        const raw = localStorage.getItem(key);
        if (!raw) {
          setStatus(`No save found for "${key}".`);
          return;
        }
        const data = JSON.parse(raw);
        if (textEl) textEl.value = data.text || "";
        if (styleEl) styleEl.value = data.style || "";
        if (contextEl) contextEl.value = data.context || "";
        if (guideEl) guideEl.value = data.guide || "";
        updateTokens();
        setStatus(`Loaded "${key}".`);
      } catch (err) {
        console.error(err);
        setStatus("Load failed: " + err.message);
      }
    }

    // --- Bind events ---

    textEl?.addEventListener("input", updateTokens);

    contBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      callContinue();
    });

    stopBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      stopStreaming();
    });

    revertBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      revertLast();
    });

    saveBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      saveNotebook();
    });

    loadBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      loadNotebook();
    });

    // initial
    updateTokens();
    activateTab("generate");
    setStatus("Ready");
  };
})();

