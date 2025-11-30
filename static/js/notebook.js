const NB_API_BASE = "/notebook";

(function () {
  // Expose init function globally so main.js can call it
  window.initNotebookMode = function () {
    const layout = document.querySelector(".notebook-layout");
    if (!layout) return;

    const textEl = document.getElementById("nbText");
    const styleEl = document.getElementById("nbStyle");
    const tempEl = document.getElementById("nbTemp");
    const statusEl = document.getElementById("nbStatus");
    const tokenCountEl = document.getElementById("nbTokenCount");

    const contextEl = document.getElementById("nbContext");
    const guideEl = document.getElementById("nbGuide");

    const titleEl = document.getElementById("nbTitle");
    const saveBtn = document.getElementById("nbSaveBtn");
    const loadBtn = document.getElementById("nbLoadBtn");

    const revertBtn = document.getElementById("nbRevertBtn");
    const regenBtn = document.getElementById("nbRegenBtn");
    const contBtn = document.getElementById("nbContinueBtn");

    const tabs = layout.querySelectorAll(".nb-tab");
    const panels = layout.querySelectorAll(".nb-subpanel");

    let lastState = null;          // text before last AI change
    let lastAction = null;         // "continue"
    let lastPayload = null;        // payload used for last action

    function setStatus(msg) {
      if (statusEl) statusEl.textContent = msg;
    }

    function updateTokens() {
      if (!tokenCountEl || !textEl) return;
      const chars = textEl.value.length;
      const approxTokens = Math.max(0, Math.round(chars / 4)); // rough estimate
      tokenCountEl.textContent = `${approxTokens} tokens (≈)`;
    }

    // --- Tab switching ---

    function activateTab(tabName) {
      tabs.forEach((btn) => {
        const active = btn.dataset.tab === tabName;
        btn.classList.toggle("nb-tab-active", active);
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

    async function callContinue() {
      if (!textEl) return;
      const fullText = textEl.value;
      if (!fullText.trim()) return;

      setStatus("Continuing…");

      const style = styleEl?.value || "";
      const temp = parseFloat(tempEl?.value || "0.8") || 0.8;

      // Use optional context/guide if provided; otherwise whole text
      let baseText = fullText;
      if (contextEl && contextEl.value.trim()) {
        baseText = contextEl.value;
      }

      const payload = {
        text: baseText,
        style: style || null,
        temperature: temp,
        max_tokens: 512,
      };

      lastState = fullText;
      lastAction = "continue";
      lastPayload = payload;

      try {
        const res = await fetch(`${NB_API_BASE}/continue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error("HTTP " + res.status);

        const data = await res.json();
        const cont = data.text || "";
        textEl.value = fullText + cont;
        updateTokens();
        setStatus("Ready");
      } catch (err) {
        console.error(err);
        setStatus("Error: " + err.message);
      }
    }

    async function callRegen() {
      if (!lastPayload || !lastAction || lastAction !== "continue") {
        setStatus("Nothing to regenerate.");
        return;
      }
      if (!textEl || lastState == null) return;

      // revert to state before last AI call, then call continue again
      textEl.value = lastState;
      updateTokens();
      setStatus("Regenerating…");

      try {
        const res = await fetch(`${NB_API_BASE}/continue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(lastPayload),
        });

        if (!res.ok) throw new Error("HTTP " + res.status);

        const data = await res.json();
        const cont = data.text || "";
        textEl.value = lastState + cont;
        updateTokens();
        setStatus("Ready");
      } catch (err) {
        console.error(err);
        setStatus("Error: " + err.message);
      }
    }

    function revertLast() {
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

    regenBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      callRegen();
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
