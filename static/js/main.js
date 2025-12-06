const API_URL = "/chat/stream"; // keep or change later

const appShell = document.getElementById("appShell");
const modeToggleBtn = document.getElementById("modeToggleBtn");
const modeListEl = document.getElementById("modeList");
const modeContainer = document.getElementById("modeContainer");
const modeTitleEl = document.getElementById("modeTitle");
const modeSubtitleEl = document.getElementById("modeSubtitle");
const themeLinkEl = document.getElementById("themeStylesheet");

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
    title: "Model control",
    subtitle:
      "LM Studio Model Manager — Pick which model DreamUI should use, then load or eject it from LM Studio.",
    file: "/static/inc/model.html",
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
const AVAILABLE_THEMES = ["stardust", "cream", "inkwell", "void"];
const ACTIVE_MODEL_KEY = "dreamui-active-model";
const LANGUAGE_KEY = "dreamui-language";
const AVAILABLE_LANGUAGES = [
  { id: "en", labelKey: "lang.en", fallback: "English" },
  { id: "de", labelKey: "lang.de", fallback: "Deutsch" },
  { id: "ua", labelKey: "lang.ua", fallback: "Українська" },
];

let translations = {};
let currentLanguage = "en";
let loadedPreferences = {};

async function fetchPreferences() {
  try {
    const res = await fetch("/preferences", { cache: "no-cache" });
    if (!res.ok) {
      return;
    }
    loadedPreferences = await res.json();
    if (loadedPreferences.theme) {
      localStorage.setItem(THEME_KEY, loadedPreferences.theme);
    }
    if (loadedPreferences.language) {
      localStorage.setItem(LANGUAGE_KEY, loadedPreferences.language);
    }
    if (loadedPreferences.character_id) {
      localStorage.setItem(ACTIVE_CHAR_KEY, String(loadedPreferences.character_id));
    }
  } catch (err) {
    console.warn("Failed to fetch preferences, using local defaults.", err);
  }
}

async function savePreferences(partial) {
  try {
    await fetch("/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });
  } catch (err) {
    console.warn("Failed to save preferences", err);
  }
}
window.savePreferences = savePreferences;

function t(key, fallback = "") {
  return Object.prototype.hasOwnProperty.call(translations, key)
    ? translations[key]
    : fallback || key;
}
window.t = t;

function normalizeLanguageCode(code) {
  if (code === "uk") return "ua"; // legacy stored value
  return code || "en";
}

function detectLanguageFromText(text) {
  if (!text) return null;
  const sample = text.toLowerCase();
  const hasCyrillic = /[а-яёєіїґ]/i.test(sample);
  if (hasCyrillic) return "ua";
  const hasGermanChars = /[äöüß]/i.test(sample);
  if (hasGermanChars) return "de";
  return "en";
}

async function loadTranslations(lang) {
  async function fetchLang(target) {
    const res = await fetch(`/static/lang/${target}.json`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  try {
    translations = await fetchLang(lang);
    currentLanguage = lang;
  } catch (err) {
    console.warn(`Failed to load language "${lang}", falling back to English.`, err);
    translations = await fetchLang("en");
    currentLanguage = "en";
  }
}

function applyTranslationsToDom(root) {
  if (!root) return;
  root.querySelectorAll("[data-lang]").forEach((el) => {
    const key = el.getAttribute("data-lang");
    if (key) el.textContent = t(key, el.textContent || "");
  });
  root.querySelectorAll("[data-lang-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-lang-placeholder");
    if (key && "placeholder" in el) {
      el.placeholder = t(key, el.placeholder || "");
    }
  });
  root.querySelectorAll("[data-lang-title]").forEach((el) => {
    const key = el.getAttribute("data-lang-title");
    if (key) {
      el.title = t(key, el.title || "");
    }
  });
  root.querySelectorAll("[data-lang-aria-label]").forEach((el) => {
    const key = el.getAttribute("data-lang-aria-label");
    if (key) {
      el.setAttribute("aria-label", t(key, el.getAttribute("aria-label") || ""));
    }
  });
}

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

function setTheme(themeId) {
  const safeTheme = AVAILABLE_THEMES.includes(themeId) ? themeId : AVAILABLE_THEMES[0];
  if (themeLinkEl) {
    themeLinkEl.href = `/static/css/themes/${safeTheme}.css`;
  }
  localStorage.setItem(THEME_KEY, safeTheme);
  return safeTheme;
}

function initTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  const preferred = loadedPreferences.theme || stored || AVAILABLE_THEMES[0];
  setTheme(preferred);
}

function applyModeTranslations() {
  modesMeta.chat.title = t("mode.chat.title", modesMeta.chat.title);
  modesMeta.chat.subtitle = t("mode.chat.subtitle", modesMeta.chat.subtitle);
  modesMeta.notebook.title = t("mode.notebook.title", modesMeta.notebook.title);
  modesMeta.notebook.subtitle = t("mode.notebook.subtitle", modesMeta.notebook.subtitle);
  modesMeta["model-choice"].title = t("mode.model.title", modesMeta["model-choice"].title);
  modesMeta["model-choice"].subtitle = t(
    "mode.model.subtitle",
    modesMeta["model-choice"].subtitle
  );
  modesMeta.world.title = t("mode.world.title", modesMeta.world.title);
  modesMeta.world.subtitle = t("mode.world.subtitle", modesMeta.world.subtitle);
  modesMeta.characters.title = t("mode.characters.title", modesMeta.characters.title);
  modesMeta.characters.subtitle = t(
    "mode.characters.subtitle",
    modesMeta.characters.subtitle
  );
  modesMeta.stats.title = t("mode.stats.title", modesMeta.stats.title);
  modesMeta.stats.subtitle = t("mode.stats.subtitle", modesMeta.stats.subtitle);
}

async function initI18n() {
  const storedLang = normalizeLanguageCode(
    loadedPreferences.language || localStorage.getItem(LANGUAGE_KEY) || "en"
  );
  await loadTranslations(storedLang);
  document.documentElement.lang = currentLanguage;
  window.currentLanguage = currentLanguage;
  applyModeTranslations();
  const navTitles = {
    chat: "nav.chat",
    notebook: "nav.notebook",
    "model-choice": "nav.model",
    world: "nav.world",
    characters: "nav.characters",
    stats: "nav.stats",
  };
  Object.entries(navTitles).forEach(([modeId, key]) => {
    const btn = document.querySelector(`.mode-icon-btn[data-mode-id="${modeId}"]`);
    if (btn) btn.title = t(key, btn.title || "");
  });
}

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
    applyTranslationsToDom(modeContainer);
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
    modeId === "model-choice" &&
    typeof window.initModelMode === "function"
  ) {
    window.initModelMode();
  } else if (
    modeId === "characters" &&
    typeof window.initCharactersMode === "function"
  ) {
    window.initCharactersMode();
  } else if (
    modeId === "stats" &&
    typeof window.initStatsMode === "function"
  ) {
    window.initStatsMode();
  }
}

// ----- settings / stats -----

window.initStatsMode = function () {
  const selectEl = document.getElementById("themeSelect");
  const statusEl = document.getElementById("themeStatus");
  const langSelectEl = document.getElementById("languageSelect");
  const langStatusEl = document.getElementById("languageStatus");
  const themeLabel = document.querySelector('label[for="themeSelect"]');
  const langLabel = document.querySelector('label[for="languageSelect"]');
  if (!selectEl) return;

  if (themeLabel) themeLabel.textContent = t("prefs.theme", "Theme");
  if (langLabel) langLabel.textContent = t("prefs.language", "Language");

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  // populate
  selectEl.innerHTML = "";
  AVAILABLE_THEMES.forEach((themeId) => {
    const opt = document.createElement("option");
    opt.value = themeId;
    opt.textContent = themeId;
    selectEl.appendChild(opt);
  });

  const current = loadedPreferences.theme || localStorage.getItem(THEME_KEY) || AVAILABLE_THEMES[0];
  selectEl.value = current;

  selectEl.addEventListener("change", () => {
    const picked = selectEl.value;
    const applied = setTheme(picked);
    savePreferences({ theme: applied });
    setStatus(t("prefs.theme.pick", `Applied "${applied}" theme.`));
  });

  setStatus(t("prefs.theme.pick", `Current theme: ${current}.`));

  // language handling
  if (langSelectEl) {
    langSelectEl.innerHTML = "";
    AVAILABLE_LANGUAGES.forEach((lang) => {
      const opt = document.createElement("option");
      opt.value = lang.id;
      opt.textContent = t(lang.labelKey || "", lang.fallback || lang.id);
      langSelectEl.appendChild(opt);
    });
    const storedLang = normalizeLanguageCode(
      loadedPreferences.language || localStorage.getItem(LANGUAGE_KEY) || "en"
    );
    langSelectEl.value = storedLang;
    if (langStatusEl) {
      langStatusEl.textContent = `${t("prefs.language.pick", "Choose your preferred language.")} (${storedLang})`;
    }
    langSelectEl.addEventListener("change", () => {
      const chosen = langSelectEl.value;
      localStorage.setItem(LANGUAGE_KEY, chosen);
      savePreferences({ language: chosen });
      // reload to apply translations everywhere
      location.reload();
    });
  }
};

// ----- chat mode JS -----

function initChatMode() {
  const chatHistory = document.getElementById("chatHistory");
  const chatForm = document.getElementById("chatForm");
  const promptEl = document.getElementById("prompt");
  const sendBtn = document.getElementById("sendBtn");
  const statusText = document.getElementById("status-text");
  const conversation = [];
  let currentCharacter = {
    id: 1,
    name: "Assistant",
    icon: "/static/icons/chat.svg",
    greeting: "Welcome to DreamUI.",
    personality: "",
  };

  if (!chatForm) return;

  if (promptEl) {
    promptEl.placeholder = t("chat.placeholder", promptEl.placeholder || "");
  }
  if (sendBtn) {
    sendBtn.textContent = t("chat.send", sendBtn.textContent || "Send");
  }
  if (statusText) {
    statusText.textContent = t("chat.status.ready", statusText.textContent || "Ready");
  }

  function buildIconElement(iconVal, name) {
    const source = iconVal || "/static/icons/chat.svg";
    const isImageSource =
      typeof source === "string" &&
      (source.startsWith("data:image") ||
        /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(source));

    if (isImageSource) {
      const img = document.createElement("img");
      img.src = source;
      img.alt = name;
      img.className = "msg-label-icon";
      return img;
    }

    const spanIcon = document.createElement("span");
    spanIcon.textContent = source;
    spanIcon.className = "msg-label-icon";
    return spanIcon;
  }

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
        label.appendChild(buildIconElement(iconVal, name));
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
    statusText.textContent = t("chat.status.thinking", "Thinking…");

    const payload = {
      prompt,
      character_id: parseInt(currentCharacter.id, 10) || 1,
      history: conversation.slice(),
    };
    const detectedLang =
      detectLanguageFromText(prompt) ||
      window.currentLanguage ||
      localStorage.getItem(LANGUAGE_KEY) ||
      "en";
    payload.language = detectedLang;
    const storedModel = localStorage.getItem(ACTIVE_MODEL_KEY);
    if (storedModel) {
      payload.model = storedModel;
    }

    // create assistant bubble now, fill it as tokens arrive
    const assistantMsg = addMessage("assistant", "");
    const bodyEl = assistantMsg.querySelector(".msg-body");
    conversation.push({ role: "user", content: prompt });

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

      statusText.textContent = t("chat.status.ready", "Ready");
      conversation.push({ role: "assistant", content: bodyEl.textContent });
    } catch (err) {
      console.error(err);
      addMessage("system", "Stream error: " + err.message);
      statusText.textContent = t("chat.status.error", "Error");
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
          icon: data.icon_path || data.icon || "/static/icons/chat.svg",
          greeting: data.greeting || "Ready.",
          personality: data.personality || "",
        };
        if (currentCharacter.greeting) {
          const greetingText = currentCharacter.greeting;
          addMessage("assistant", greetingText);
          conversation.push({ role: "assistant", content: greetingText });
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  loadCharacterMeta();
}

async function startApp() {
  console.log("[prefs] init start");
  await fetchPreferences();
  initTheme();
  await initI18n();
  blockSwipeBack();
  const shouldOpenSidebar = window.matchMedia("(min-width: 960px)").matches;
  setSidebar(shouldOpenSidebar);
  loadMode("chat");
}

// initial load (works even if scripts are injected after DOMContentLoaded)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApp, { once: true });
} else {
  startApp();
}
