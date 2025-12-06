const CHAR_STORAGE_KEY = "dreamui-characters";
const ACTIVE_CHAR_KEY = "dreamui-active-character";

(function () {
  const iconOptions = [
    "/static/icons/chat.svg",
    "/static/icons/character_info.svg",
    "/static/icons/pen.svg",
    "/static/icons/book.svg",
    "/static/icons/cube.svg",
    "/static/icons/info.svg",
  ];

  function loadStored() {
    try {
      const raw = localStorage.getItem(CHAR_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function saveStored(list) {
    try {
      localStorage.setItem(CHAR_STORAGE_KEY, JSON.stringify(list));
    } catch (err) {
      console.error("Failed to save characters", err);
    }
  }

  const sample = [
    {
      id: 1,
      name: "Assistant",
      icon: "/static/icons/character_info.svg",
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
    let currentId = localStorage.getItem(ACTIVE_CHAR_KEY) || sample[0].id;

    async function loadInitial() {
      const stored = loadStored();
      if (stored?.length) {
        characters = stored;
      }
      try {
        const res = await fetch("/characters", { cache: "no-cache" });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length) {
            characters = data.map((c) => {
              const icon =
                typeof c.icon === "string" && c.icon.endsWith(".svg")
                  ? c.icon
                  : iconOptions[0];
              return { ...c, icon };
            });
          }
        }
      } catch (err) {
        console.error("Character fetch failed", err);
      }
      if (!characters.length) {
        characters = sample.slice();
      }
      currentId =
        localStorage.getItem(ACTIVE_CHAR_KEY) || characters[0]?.id || currentId;
      saveStored(characters);
    }

    function setIconButton(iconPath) {
      if (!iconBtn) return;
      iconBtn.dataset.icon = iconPath;
      iconBtn.innerHTML = `<img src="${iconPath}" alt="icon" />`;
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
      setIconButton(current.icon || iconOptions[0]);
      updateTokenCount();
    }

    function persist() {
      saveStored(characters);
    }

    function upsertCurrent() {
      const idx = characters.findIndex((c) => String(c.id) === String(currentId));
      const payload = {
        id: currentId,
        name: nameEl.value.trim() || "Unnamed",
        greeting: greetEl.value.trim(),
        personality: personalityEl.value.trim(),
        icon: (iconBtn && iconBtn.dataset.icon) || iconOptions[0],
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

    iconBtn.addEventListener("click", () => {
      const current = iconBtn.dataset.icon || iconOptions[0];
      const idx = iconOptions.indexOf(current);
      const next = iconOptions[(idx + 1) % iconOptions.length];
      setIconButton(next);
      upsertCurrent();
    });

    if (newBtn) {
      newBtn.addEventListener("click", () => {
        const newId = Date.now();
        const newChar = {
          id: newId,
          name: "New Character",
          icon: iconOptions[1],
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
      deleteBtn.addEventListener("click", () => {
        if (!currentId) return;
        characters = characters.filter((c) => String(c.id) !== String(currentId));
        if (!characters.length) {
          characters = sample.slice();
        }
        currentId = characters[0].id;
        renderSelect();
        loadCurrent();
        persist();
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
        localStorage.setItem(ACTIVE_CHAR_KEY, String(numericId));
        loadBtn.textContent = "Loaded";
        setTimeout(() => (loadBtn.textContent = "Load"), 800);
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        upsertCurrent();
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
