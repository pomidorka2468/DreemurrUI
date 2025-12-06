const API_URL = "/chat/stream"; // keep or change later

const appShell = document.getElementById("appShell");
const modeToggleBtn = document.getElementById("modeToggleBtn");
const modeListEl = document.getElementById("modeList");
const modeContainer = document.getElementById("modeContainer");
const modeTitleEl = document.getElementById("modeTitle");
const modeSubtitleEl = document.getElementById("modeSubtitle");
const themeToggleBtn = document.getElementById("themeToggleBtn");

const modesMeta = {
  chat: {
    title: "Chat Mode",
    subtitle: "Ask questions, write ideas, and experiment with the model.",
    file: "/static/inc/chat.html",
  },
  notebook: {
    title: "Notebook / Free Writing",
    subtitle: "Unstructured notes and drafts for later refinement.",
    file: "/static/inc/notebook.html",
  },
  "model-choice": {
    title: "Model Choice",
    subtitle: "Select models and tweak core parameters.",
    file: "/static/inc/model-choice.html",
  },
  world: {
    title: "World / Story Context",
    subtitle: "Keep lore and background context for your stories.",
    file: "/static/inc/world.html",
  },
  characters: {
    title: "Characters for Chat",
    subtitle: "Define personas and roles for conversations.",
    file: "/static/inc/characters.html",
  },
  stats: {
    title: "App Info / Stats",
    subtitle: "Diagnostics and usage information.",
    file: "/static/inc/stats.html",
  },
};

const ACTIVE_CHAR_KEY = "dreamui-active-character";
const THEME_KEY = "dreamui-theme";

// ----- navigation guard for swipe-back -----

function blockSwipeBack() {
  // keep the current page in history so swipe-back gestures don't exit the app
  history.replaceState({ blocked: true }, "");
  history.pushState({ blocked: true }, "");
  window.addEventListener("popstate", () => {
    console.debug("[nav] blocked back navigation");
    history.pushState({ blocked: true }, "");
  });
}

// ----- theme handling -----

function applyTheme(theme) {
  const target = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", target);
  if (themeToggleBtn) {
    themeToggleBtn.setAttribute(
      "aria-label",
      target === "dark" ? "Switch to light mode" : "Switch to dark mode"
    );
    themeToggleBtn.dataset.themeState = target;
  }
  localStorage.setItem(THEME_KEY, target);
}

function initTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(stored || (prefersDark ? "dark" : "light"));
}

themeToggleBtn?.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
});

// ----- layout controls -----

function setSidebar(open) {
  appShell.classList.toggle("sidebar-open", open);
  console.debug("[sidebar] setSidebar:", open);
  if (modeToggleBtn) {
    modeToggleBtn.title = open ? "Hide modes" : "Show modes";
  }
}

function toggleSidebar() {
  console.debug("[sidebar] toggleSidebar");
  setSidebar(!appShell.classList.contains("sidebar-open"));
}

modeToggleBtn?.addEventListener("click", () => {
  toggleSidebar();
});

// Touch swipe to open/close sidebar
let touchStartX = null;
let touchStartY = null;
const SWIPE_THRESHOLD = 60;
const EDGE_GUTTER = 1200;

function resetTouch() {
  touchStartX = null;
  touchStartY = null;
}

document.addEventListener(
  "touchstart",
  (e) => {
    const touch = e.touches[0];
    if (!touch) return;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    console.debug("[sidebar] touchstart", touchStartX, touchStartY);
  },
  { passive: true }
);

document.addEventListener(
  "touchmove",
  (e) => {
    if (touchStartX === null || touchStartY === null) return;
    const touch = e.touches[0];
    if (!touch) return;
    const dy = Math.abs(touch.clientY - touchStartY);
    // cancel if mostly vertical
    if (dy > 40) {
      console.debug("[sidebar] touchmove cancel vertical", dy);
      resetTouch();
    }
  },
  { passive: true }
);

document.addEventListener(
  "touchend",
  (e) => {
    if (touchStartX === null || touchStartY === null) return;
    const touch = e.changedTouches[0];
    if (!touch) {
      resetTouch();
      return;
    }
    const dx = touch.clientX - touchStartX;
    const sidebarOpen = appShell.classList.contains("sidebar-open");
    console.debug("[sidebar] touchend", { dx, start: touchStartX, open: sidebarOpen });

    if (!sidebarOpen && touchStartX <= EDGE_GUTTER && dx > SWIPE_THRESHOLD) {
      setSidebar(true);
    } else if (sidebarOpen && dx < -SWIPE_THRESHOLD) {
      setSidebar(false);
    }

    resetTouch();
  },
  { passive: true }
);

// Pointer swipe (touch-capable pointers, e.g., stylus)
let pointerStartX = null;
let pointerStartY = null;

function resetPointer() {
  pointerStartX = null;
  pointerStartY = null;
}

document.addEventListener(
  "pointerdown",
  (e) => {
    if (e.pointerType !== "touch") return;
    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
    console.debug("[sidebar] pointerdown", pointerStartX, pointerStartY);
  },
  { passive: true }
);

document.addEventListener(
  "pointermove",
  (e) => {
    if (pointerStartX === null || pointerStartY === null) return;
    if (e.pointerType !== "touch") return;
    const dy = Math.abs(e.clientY - pointerStartY);
    if (dy > 40) {
      console.debug("[sidebar] pointermove cancel vertical", dy);
      resetPointer();
    }
  },
  { passive: true }
);

document.addEventListener(
  "pointerup",
  (e) => {
    if (pointerStartX === null || pointerStartY === null) return;
    if (e.pointerType !== "touch") {
      resetPointer();
      return;
    }
    const dx = e.clientX - pointerStartX;
    const sidebarOpen = appShell.classList.contains("sidebar-open");
    console.debug("[sidebar] pointerup", { dx, start: pointerStartX, open: sidebarOpen });

    if (!sidebarOpen && pointerStartX <= EDGE_GUTTER && dx > SWIPE_THRESHOLD) {
      setSidebar(true);
    } else if (sidebarOpen && dx < -SWIPE_THRESHOLD) {
      setSidebar(false);
    }
    resetPointer();
  },
  { passive: true }
);

// click on mode icons
modeListEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".mode-icon-btn");
  if (!btn) return;
  const modeId = btn.dataset.modeId;
  if (!modeId) return;

  document
    .querySelectorAll(".mode-icon-btn")
    .forEach((el) => el.classList.remove("mode-icon-active"));
  btn.classList.add("mode-icon-active");

  loadMode(modeId);
});

// ----- mode loading -----

async function loadMode(modeId) {
  const meta = modesMeta[modeId];
  if (!meta) return;

  // update titles
  modeTitleEl.textContent = meta.title;
  modeSubtitleEl.textContent = meta.subtitle;

  try {
    const res = await fetch(meta.file, { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const html = await res.text();
    modeContainer.innerHTML = html;
  } catch (err) {
    console.error(err);
    modeContainer.innerHTML =
      '<div class="chat-layout"><div class="chat-history"><div class="msg system"><div class="msg-body">Failed to load mode: ' +
      err.message +
      "</div></div></div></div>";
    return;
  }

  // attach JS behavior for that mode
  if (modeId === "chat") {
    initChatMode();
  } else if (
    modeId === "notebook" &&
    typeof window.initNotebookMode === "function"
  ) {
    window.initNotebookMode();
  } else if (
    modeId === "characters" &&
    typeof window.initCharactersMode === "function"
  ) {
    window.initCharactersMode();
  }
}

// ----- chat mode JS -----

function initChatMode() {
  const chatHistory = document.getElementById("chatHistory");
  const chatForm = document.getElementById("chatForm");
  const promptEl = document.getElementById("prompt");
  const sendBtn = document.getElementById("sendBtn");
  const statusText = document.getElementById("status-text");
  let currentCharacter = {
    id: 1,
    name: "Assistant",
    icon: "/static/icons/chat.svg",
    greeting: "Welcome to DreamUI.",
    personality: "",
  };

  if (!chatForm) return;

  function addMessage(role, text) {
    const msg = document.createElement("div");
    msg.className = "msg " + role;

    if (role === "system") {
      const body = document.createElement("div");
      body.className = "msg-body";
      body.textContent = text;
      msg.appendChild(body);
    } else {
      const label = document.createElement("div");
      label.className = "msg-label";
      if (role === "user") {
        label.textContent = "You";
      } else {
        const name = currentCharacter.name || "Assistant";
        const iconVal = currentCharacter.icon;
        label.classList.add("msg-label-assistant");
        if (iconVal && iconVal.endsWith(".svg")) {
          const img = document.createElement("img");
          img.src = iconVal;
          img.alt = name;
          img.className = "msg-label-icon";
          label.appendChild(img);
        } else if (iconVal) {
          const spanIcon = document.createElement("span");
          spanIcon.textContent = iconVal;
          spanIcon.className = "msg-label-icon";
          label.appendChild(spanIcon);
        }
        const nameSpan = document.createElement("span");
        nameSpan.textContent = name;
        label.appendChild(nameSpan);
      }

      const body = document.createElement("div");
      body.className = "msg-body";
      body.textContent = text;

      msg.appendChild(label);
      msg.appendChild(body);
    }

    chatHistory.appendChild(msg);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    return msg;
  }

  async function sendMessage() {
    const prompt = promptEl.value.trim();
    if (!prompt) return;

    // user bubble
    addMessage("user", prompt);
    promptEl.value = "";
    promptEl.focus();

    sendBtn.disabled = true;
    statusText.textContent = "Thinking?";

    const payload = {
      prompt,
      character_id: parseInt(currentCharacter.id, 10) || 1,
    };

    // create assistant bubble now, fill it as tokens arrive
    const assistantMsg = addMessage("assistant", "");
    const bodyEl = assistantMsg.querySelector(".msg-body");

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("HTTP " + res.status);
      }

      // streaming reader
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // we yield one JSON per line from the backend
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep last partial line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const json = JSON.parse(trimmed);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              bodyEl.textContent += delta;
              chatHistory.scrollTop = chatHistory.scrollHeight;
            }
          } catch {
            // ignore partial/unparsable chunks
          }
        }
      }

      statusText.textContent = "Ready";
    } catch (err) {
      console.error(err);
      addMessage("system", "Stream error: " + err.message);
      statusText.textContent = "Error";
    } finally {
      sendBtn.disabled = false;
    }
  }

  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage();
  });

  promptEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  async function loadCharacterMeta() {
    const storedId = localStorage.getItem(ACTIVE_CHAR_KEY);
    const parsedId = parseInt(storedId || "1", 10);
    const targetId = Number.isFinite(parsedId) ? parsedId : 1;
    try {
      const res = await fetch(`/characters/${targetId}`, {
        cache: "no-cache",
      });
      if (res.ok) {
        const data = await res.json();
        currentCharacter = {
          id: data.id,
          name: data.name,
          icon: data.icon || "/static/icons/chat.svg",
          greeting: data.greeting || "Ready.",
          personality: data.personality || "",
        };
        addMessage(
          "system",
          `${currentCharacter.icon || ""} ${currentCharacter.name}: ${
            currentCharacter.greeting
          }`
        );
      }
    } catch (err) {
      console.error(err);
    }
  }

  loadCharacterMeta();
}

// initial load
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  blockSwipeBack();
  loadMode("chat");
});
