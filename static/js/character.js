const CHAR_STORAGE_KEY = "dreamui-characters";
const CHAR_ACTIVE_STORAGE_KEY = "dreamui-active-character";

(function () {
  const DEFAULT_ICON = "/static/icons/character_info.svg";

  async function loadFromFiles() {
    try {
      const res = await fetch("/characters", { cache: "no-cache" });
      if (!res.ok) return null;
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        return data;
      }
    } catch (err) {
      console.error("Character fetch failed", err);
    }
    return null;
  }

  async function saveToFile(payload) {
    try {
      await fetch("/characters/file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error("Failed to save character file", err);
    }
  }

  const sample = [
    {
      id: 1,
      name: "Assistant",
      icon: DEFAULT_ICON,
      greeting: "Hello {username}",
      personality: "Professional, subtle, creative writing.",
    },
  ];

  window.initCharactersMode = async function () {
    const selectEl = document.getElementById("charSelect");
    const nameEl = document.getElementById("charName");
    const greetEl = document.getElementById("charGreeting");
    const personalityEl = document.getElementById("charPersonality");
    const iconBtn = document.getElementById("charIconBtn");
    const newBtn = document.getElementById("charNewBtn");
    const deleteBtn = document.getElementById("charDeleteBtn");
    const loadBtn = document.getElementById("charLoadBtn");
    const tokenCountEl = document.getElementById("charTokenCount");
    const saveBtn = document.getElementById("charSaveBtn");

    if (!selectEl || !nameEl || !greetEl || !personalityEl) return;

    let characters = sample.slice();
    let currentId = localStorage.getItem(CHAR_ACTIVE_STORAGE_KEY) || sample[0].id;

    async function loadInitial() {
      const files = await loadFromFiles();
      if (files?.length) {
        characters = files.map((c) => {
          const icon =
            typeof c.icon === "string" && c.icon.length
              ? c.icon
              : typeof c.icon_path === "string" && c.icon_path.length
              ? c.icon_path
              : DEFAULT_ICON;
          return { ...c, icon };
        });
      }
      if (!characters.length) {
        characters = sample.slice();
      }
      currentId =
        localStorage.getItem(CHAR_ACTIVE_STORAGE_KEY) || characters[0]?.id || currentId;
    }

    function setIconButton(iconPath) {
      // keep a preview next to the file input
      const fileInput = document.getElementById("charIconFile");
      const preview = document.getElementById("charIconPreview");
      if (preview) {
        preview.innerHTML = "";
        const img = document.createElement("img");
        img.src = iconPath;
        img.alt = "icon";
        img.className = "char-icon-img";
        preview.appendChild(img);
      }
      if (fileInput) {
        fileInput.dataset.icon = iconPath;
      }
    }

    function renderSelect() {
      selectEl.innerHTML = "";
      characters.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = String(c.id);
        opt.textContent = c.name;
        selectEl.appendChild(opt);
      });
      if (currentId) {
        selectEl.value = String(currentId);
      }
    }

    function updateTokenCount() {
      if (!tokenCountEl) return;
      const chars = (personalityEl.value || "").length;
      const tokens = Math.max(0, Math.round(chars / 4));
      tokenCountEl.textContent = `${tokens} tokens`;
    }

    function loadCurrent() {
      const current = characters.find((c) => String(c.id) === String(currentId));
      if (!current) return;
      nameEl.value = current.name || "";
      greetEl.value = current.greeting || "";
      personalityEl.value = current.personality || "";
      setIconButton(current.icon || current.icon_path || DEFAULT_ICON);
      updateTokenCount();
    }

    function persist() {
      // keep in-memory only; file save handled on explicit save
    }

    function upsertCurrent() {
      const idx = characters.findIndex((c) => String(c.id) === String(currentId));
      const current = characters.find((c) => String(c.id) === String(currentId));
      const iconPath = document.getElementById("charIconFile")?.dataset.icon || current?.icon || current?.icon_path || DEFAULT_ICON;
      const payload = {
        id: currentId,
        name: nameEl.value.trim() || "Unnamed",
        greeting: greetEl.value.trim(),
        personality: personalityEl.value.trim(),
        icon: iconPath,
        icon_path: iconPath,
      };
      if (idx >= 0) {
        characters[idx] = payload;
      }
      persist();
      renderSelect();
      selectEl.value = String(currentId);
    }

    selectEl.addEventListener("change", () => {
      currentId = selectEl.value;
      loadCurrent();
    });

    nameEl.addEventListener("input", upsertCurrent);
    greetEl.addEventListener("input", upsertCurrent);
    personalityEl.addEventListener("input", () => {
      upsertCurrent();
      updateTokenCount();
    });

    const iconFileInput = document.getElementById("charIconFile");
    if (iconFileInput) {
      iconFileInput.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const form = new FormData();
        form.append("file", file);
        try {
          const res = await fetch("/characters/file/upload_icon", {
            method: "POST",
            body: form,
          });
          if (!res.ok) throw new Error("Upload failed");
          const data = await res.json();
          if (data?.path) {
            setIconButton(data.path);
            upsertCurrent();
          }
        } catch (err) {
          console.error("Icon upload failed", err);
        }
      });
    }

    if (newBtn) {
      newBtn.addEventListener("click", () => {
        const newId = Date.now();
        const newChar = {
          id: newId,
          name: "New Character",
          icon: DEFAULT_ICON,
          greeting: "Hello {username}",
          personality: "",
        };
        characters.push(newChar);
        currentId = newId;
        renderSelect();
        loadCurrent();
        persist();
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener("click", async () => {
        if (!currentId) return;
        const targetId = String(currentId);
        try {
          await fetch(`/characters/file/${encodeURIComponent(targetId)}`, {
            method: "DELETE",
          });
        } catch (err) {
          console.error("Failed to delete character file", err);
        }
        characters = characters.filter((c) => String(c.id) !== targetId);
        if (!characters.length) {
          characters = sample.slice();
        }
        currentId = characters[0].id;
        renderSelect();
        loadCurrent();
      });
    }

    if (loadBtn) {
      loadBtn.addEventListener("click", () => {
        const numericId = parseInt(currentId, 10);
        if (!Number.isFinite(numericId)) {
          loadBtn.textContent = "DB only";
          setTimeout(() => (loadBtn.textContent = "Load"), 800);
          return;
        }
        localStorage.setItem(CHAR_ACTIVE_STORAGE_KEY, String(numericId));
        if (typeof window.savePreferences === "function") {
          window.savePreferences({ character_id: numericId });
        }
        loadBtn.textContent = "Loaded";
        setTimeout(() => (loadBtn.textContent = "Load"), 800);
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", async () => {
        upsertCurrent();
        const current = characters.find((c) => String(c.id) === String(currentId));
        if (current) {
          await saveToFile(current);
        }
        saveBtn.textContent = "Saved";
        setTimeout(() => (saveBtn.textContent = "Save"), 800);
      });
    }

    await loadInitial();
    if (!characters.length) {
      characters = sample.slice();
    }
    renderSelect();
    loadCurrent();
  };
})();
