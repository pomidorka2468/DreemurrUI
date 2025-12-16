const CHAR_STORAGE_KEY = "dreamui-characters";
const CHAR_ACTIVE_STORAGE_KEY = "dreamui-active-character";

(function () {
  const DEFAULT_ICON = "/static/icons/character_info.svg";
  const LOG_PREFIX = "[characters]";
  const LOCAL_KEY = "dreamui-characters-cache";

  async function loadFromFiles() {
    try {
      const res = await fetch("/characters", { cache: "no-cache" });
      if (!res.ok) {
        console.warn(LOG_PREFIX, "Failed to load from files", res.status);
        return null;
      }
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        console.info(LOG_PREFIX, "Fetched characters from files", data);
        return data;
      }
    } catch (err) {
      console.error("Character fetch failed", err);
    }
    return null;
  }

  async function saveToFile(payload) {
    try {
      const res = await fetch("/characters/file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      console.info(LOG_PREFIX, "Save response", res.status);
      if (!res.ok) {
        console.warn(LOG_PREFIX, "Save failed", res.statusText);
      }
      return res;
    } catch (err) {
      console.error("Failed to save character file", err);
    }
  }

  function loadLocalCache() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch (err) {
      console.warn(LOG_PREFIX, "Failed to read local cache", err);
    }
    return null;
  }

  function saveLocalCache(chars) {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(chars));
    } catch (err) {
      console.warn(LOG_PREFIX, "Failed to write local cache", err);
    }
  }

  const sample = [
    {
      id: 1,
      name: "Assistant",
      icon: DEFAULT_ICON,
      greeting: "Hello {username}",
      personality: "Professional, subtle, creative writing.",
      mode: "chat",
      gender: "he",
    },
  ];

  window.initCharactersMode = async function () {
    const selectEl = document.getElementById("charSelect");
    const nameEl = document.getElementById("charName");
    const greetEl = document.getElementById("charGreeting");
    const personalityEl = document.getElementById("charPersonality");
    const iconPreviewEl = document.getElementById("charIconPreview");
    const iconMenuEl = document.getElementById("charIconMenu");
    const iconMenuPreviewEl = document.getElementById("charIconMenuPreview");
    const iconDownloadEl = document.getElementById("charIconDownload");
    const iconUploadBtn = document.getElementById("charIconUploadBtn");
    const iconCloseBtn = document.getElementById("charIconClose");
    const iconFileInput = document.getElementById("charIconFile");
    const newBtn = document.getElementById("charNewBtn");
    const deleteBtn = document.getElementById("charDeleteBtn");
    const loadBtn = document.getElementById("charLoadBtn");
    const tokenCountEl = document.getElementById("charTokenCount");
    const saveBtn = document.getElementById("charSaveBtn");
    const modeToggleEl = document.getElementById("charModeToggle");
    const genderToggleEl = document.getElementById("charGenderToggle");
    const genderChoiceEls = Array.from(document.querySelectorAll(".char-gender-choice"));

    if (!selectEl || !nameEl || !greetEl || !personalityEl) return;

    let characters = sample.slice();
    let currentId = localStorage.getItem(CHAR_ACTIVE_STORAGE_KEY) || sample[0].id;

    function filenameFromPath(path) {
      if (typeof path !== "string") return "character-icon.png";
      const parts = path.split("/").filter(Boolean);
      const last = parts[parts.length - 1] || "character-icon.png";
      return last.includes(".") ? last : `${last}.png`;
    }

    async function loadInitial() {
      const files = await loadFromFiles();
      const localCache = loadLocalCache() || [];
      if (files?.length) {
        const merged = files.map((c) => {
          const icon =
            typeof c.icon === "string" && c.icon.length
              ? c.icon
              : typeof c.icon_path === "string" && c.icon_path.length
              ? c.icon_path
              : DEFAULT_ICON;
          const local = localCache.find((l) => String(l.id) === String(c.id));
          const mode =
            local?.mode === "roleplay" || c.mode === "roleplay" ? "roleplay" : "chat";
          const gender =
            local?.gender === "she" || c.gender === "she"
              ? "she"
              : local?.gender === "he" || c.gender === "he"
              ? "he"
              : "he";
          return { ...c, icon, mode, gender };
        });
        const localOnly = localCache.filter(
          (l) => !merged.some((c) => String(c.id) === String(l.id))
        );
        characters = merged.concat(localOnly);
      } else if (localCache.length) {
        characters = localCache.map((c) => ({
          ...c,
          icon: c.icon || c.icon_path || DEFAULT_ICON,
          icon_path: c.icon || c.icon_path || DEFAULT_ICON,
          mode: c.mode === "roleplay" ? "roleplay" : "chat",
          gender: c.gender === "she" ? "she" : "he",
        }));
      }
      if (!characters.length) {
        characters = sample.slice();
      }
      console.info(LOG_PREFIX, "Loaded characters", characters);
      currentId =
        localStorage.getItem(CHAR_ACTIVE_STORAGE_KEY) || characters[0]?.id || currentId;
      saveLocalCache(characters);
    }

    function setIconButton(iconPath) {
      // keep a preview next to the file input
      const preview = document.getElementById("charIconPreview");
      if (preview) {
        preview.innerHTML = "";
        const img = document.createElement("img");
        img.src = iconPath;
        img.alt = "icon";
        img.className = "char-icon-img";
        preview.appendChild(img);
      }
      if (iconFileInput) {
        iconFileInput.dataset.icon = iconPath;
      }
      if (iconMenuPreviewEl) {
        iconMenuPreviewEl.innerHTML = "";
        const img = document.createElement("img");
        img.src = iconPath;
        img.alt = "icon preview large";
        iconMenuPreviewEl.appendChild(img);
      }
      if (iconDownloadEl) {
        iconDownloadEl.href = iconPath;
        iconDownloadEl.download = filenameFromPath(iconPath);
      }
      console.debug(LOG_PREFIX, "Set icon", { iconPath });
    }

    function buildCurrentPayload() {
      const existing = characters.find((c) => String(c.id) === String(currentId));
      const iconPath =
        iconFileInput?.dataset.icon ||
        existing?.icon ||
        existing?.icon_path ||
        DEFAULT_ICON;
      const payload = {
        id: currentId,
        name: nameEl.value.trim() || "Unnamed",
        greeting: greetEl.value.trim(),
        personality: personalityEl.value.trim(),
        icon: iconPath,
        icon_path: iconPath,
        mode: getSelectedMode(),
        gender: getSelectedGender(),
      };
      console.debug(LOG_PREFIX, "Build payload", payload);
      return payload;
    }

    function getSelectedMode() {
      if (!modeToggleEl) return "chat";
      const mode = modeToggleEl.dataset.mode;
      return mode === "roleplay" ? "roleplay" : "chat";
    }

    function setSelectedMode(mode) {
      if (!modeToggleEl) return;
      const safe = mode === "roleplay" ? "roleplay" : "chat";
      modeToggleEl.dataset.mode = safe;
      const buttons = modeToggleEl.querySelectorAll(".char-mode-choice");
      buttons.forEach((btn) => {
        const active = btn.dataset.mode === safe;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-checked", active ? "true" : "false");
      });
      console.debug(LOG_PREFIX, "Selected mode", safe);
    }

    function getSelectedGender() {
      const val = genderToggleEl?.dataset.gender;
      return val === "she" ? "she" : "he";
    }

    function setSelectedGender(gender) {
      if (!genderToggleEl) return;
      const safe = gender === "she" ? "she" : "he";
      genderToggleEl.dataset.gender = safe;
      genderToggleEl.setAttribute("aria-label", safe === "he" ? "He" : "She");
      genderChoiceEls.forEach((btn) => {
        const active = btn.dataset.gender === safe;
        btn.setAttribute("aria-checked", active ? "true" : "false");
      });
      console.debug(LOG_PREFIX, "Selected gender", safe);
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
      if (!current) {
        console.warn(LOG_PREFIX, "No current character for", currentId);
        return;
      }
      nameEl.value = current.name || "";
      greetEl.value = current.greeting || "";
      personalityEl.value = current.personality || "";
      setIconButton(current.icon || current.icon_path || DEFAULT_ICON);
      if (iconMenuEl) {
        iconMenuEl.classList.remove("open");
      }
      setSelectedMode(current.mode || "chat");
      setSelectedGender(current.gender || "he");
      updateTokenCount();
      console.info(LOG_PREFIX, "Loaded character", current);
    }

    function persist() {
      // keep in-memory only; file save handled on explicit save
    }

    function upsertCurrent() {
      const idx = characters.findIndex((c) => String(c.id) === String(currentId));
      const payload = buildCurrentPayload();
      if (idx >= 0) {
        characters[idx] = payload;
      }
      console.debug(LOG_PREFIX, "Upsert current", payload);
      saveLocalCache(characters);
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

    if (modeToggleEl) {
      modeToggleEl.addEventListener("click", (e) => {
        const btn = e.target.closest(".char-mode-choice");
        if (!btn || !modeToggleEl.contains(btn)) return;
        setSelectedMode(btn.dataset.mode);
        upsertCurrent();
      });
    }

    if (genderToggleEl) {
      genderToggleEl.addEventListener("click", (e) => {
        const btn = e.target.closest(".char-gender-choice");
        if (!btn || !genderToggleEl.contains(btn)) return;
        setSelectedGender(btn.dataset.gender);
        upsertCurrent();
      });
    }

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
            closeIconMenu();
            console.info(LOG_PREFIX, "Uploaded icon", data.path);
          }
        } catch (err) {
          console.error("Icon upload failed", err);
        }
      });
    }

    function closeIconMenu() {
      iconMenuEl?.classList.remove("open");
    }

    if (iconPreviewEl && iconMenuEl) {
      iconPreviewEl.addEventListener("click", () => {
        iconMenuEl.classList.toggle("open");
      });
      iconCloseBtn?.addEventListener("click", () => {
        closeIconMenu();
      });
      iconUploadBtn?.addEventListener("click", () => {
        iconFileInput?.click();
      });
      document.addEventListener("click", (e) => {
        if (!iconMenuEl.classList.contains("open")) return;
        const inside =
          iconMenuEl.contains(e.target) || iconPreviewEl.contains(e.target);
        if (!inside) {
          closeIconMenu();
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
          mode: getSelectedMode(),
          gender: getSelectedGender(),
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
        const payload = buildCurrentPayload();
        const currentIdx = characters.findIndex((c) => String(c.id) === String(currentId));
        if (currentIdx >= 0) {
          characters[currentIdx] = payload;
        }
        console.info(LOG_PREFIX, "Saving character", payload);
        await saveToFile(payload);
        saveLocalCache(characters);
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
