const API_URL = "/chat/stream"; // keep or change later

const appShell = document.getElementById("appShell");
const modeToggleBtn = document.getElementById("modeToggleBtn");
const modeListEl = document.getElementById("modeList");
const modeContainer = document.getElementById("modeContainer");
const modeTitleEl = document.getElementById("modeTitle");
const modeSubtitleEl = document.getElementById("modeSubtitle");

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

// ----- layout controls -----

modeToggleBtn.addEventListener("click", () => {
  const open = appShell.classList.toggle("sidebar-open");
  modeToggleBtn.textContent = open ? "✕ Modes" : "☰ Modes";
  modeToggleBtn.title = open ? "Hide modes" : "Show modes";
});

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
  }
}

// ----- chat mode JS -----

function initChatMode() {
  const chatHistory = document.getElementById("chatHistory");
  const chatForm = document.getElementById("chatForm");
  const promptEl = document.getElementById("prompt");
  const sendBtn = document.getElementById("sendBtn");
  const tempEl = document.getElementById("temperature");
  const maxTokensEl = document.getElementById("maxTokens");
  const statusText = document.getElementById("status-text");

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
      label.textContent = role === "user" ? "You" : "Assistant";

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

  if (modeId === "notebook" && typeof window.initNotebookMode === "function") {
  window.initNotebookMode();
}

  async function sendMessage() {
    const prompt = promptEl.value.trim();
    if (!prompt) return;

    // user bubble
    addMessage("user", prompt);
    promptEl.value = "";
    promptEl.focus();

    sendBtn.disabled = true;
    statusText.textContent = "Thinking…";

    const payload = {
      prompt: prompt,
      temperature: parseFloat(tempEl.value) || 0.7,
      max_tokens: parseInt(maxTokensEl.value, 10) || 512,
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
}

// initial load
document.addEventListener("DOMContentLoaded", () => {
  loadMode("chat");
});
