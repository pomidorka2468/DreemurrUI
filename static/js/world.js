const WORLD_API_BASE = "/world";

(function () {
  const NEW_ENTRY_PREFIX = "world-";

  function estimateTokens(text) {
    if (!text) return 0;
    return Math.max(0, Math.round(text.length / 4));
  }

  async function apiFetch(url, options = {}) {
    const res = await fetch(url, { cache: "no-cache", ...options });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
    }
    return res.json();
  }

  window.initWorldMode = async function () {
    const listEl = document.getElementById("worldList");
    const emptyEl = document.getElementById("worldEmpty");
    const showDisabledEl = document.getElementById("worldShowDisabled");
    const nameEl = document.getElementById("worldName");
    const descEl = document.getElementById("worldDescription");
    const enabledEl = document.getElementById("worldEnabled");
    const addBtn = document.getElementById("worldAddBtn");
    const saveBtn = document.getElementById("worldSaveBtn");
    const deleteBtn = document.getElementById("worldDeleteBtn");
    const copyBtn = document.getElementById("worldCopyBtn");
    const statusEl = document.getElementById("worldStatus");
    const enabledCountEl = document.getElementById("worldEnabledCount");
    const charCountEl = document.getElementById("worldCharCount");
    const tokenCountEl = document.getElementById("worldTokenCount");

    if (!listEl || !nameEl || !descEl || !enabledEl) return;

    const translate = (key, fallback = "") =>
      typeof window.t === "function" ? window.t(key, fallback) : fallback || key;

    let notes = [];
    let currentSlug = null;
    let saveTimer = null;

    function setStatus(textKey, fallback) {
      if (!statusEl) return;
      const text =
        typeof textKey === "string"
          ? translate(textKey, typeof fallback === "string" ? fallback : textKey)
          : "";
      statusEl.textContent = text;
    }

    function enabledCountLabel() {
      const enabledCount = notes.filter((n) => n.enabled).length;
      const label = translate("world.enabled_count", "{count} enabled");
      return label.replace("{count}", enabledCount);
    }

    function updateEnabledCount() {
      if (enabledCountEl) {
        enabledCountEl.textContent = enabledCountLabel();
      }
    }

    function updateCounters() {
      const chars = descEl.value.length;
      const tokens = estimateTokens(descEl.value);
      if (charCountEl) {
        const label = translate("world.char_count", "{count} chars");
        charCountEl.textContent = label.replace("{count}", chars);
      }
      if (tokenCountEl) {
        const label = translate("world.tokens_count", "{count} tokens");
        tokenCountEl.textContent = label.replace("{count}", tokens);
      }
    }

    function applyNoteToForm(note) {
      if (!note) {
        nameEl.value = "";
        descEl.value = "";
        enabledEl.checked = false;
        updateCounters();
        return;
      }
      currentSlug = note.slug || null;
      nameEl.value = note.name || "";
      descEl.value = note.description || "";
      enabledEl.checked = Boolean(note.enabled);
      updateCounters();
    }

    async function loadNotes() {
      try {
        notes = await apiFetch(WORLD_API_BASE);
      } catch (err) {
        console.error("Failed to load world entries", err);
        notes = [];
        setStatus("world.status.load_error", err.message);
      }
      updateEnabledCount();
      renderList();
      if (!currentSlug && notes.length) {
        selectNote(notes[0].slug);
      } else {
        selectNote(currentSlug);
      }
    }

    function findNote(slug) {
      return notes.find((n) => n.slug === slug);
    }

    function renderList() {
      listEl.innerHTML = "";
      const showDisabled = showDisabledEl ? showDisabledEl.checked : true;
      const visible = notes.filter((n) => (showDisabled ? true : n.enabled));

      if (emptyEl) {
        emptyEl.hidden = visible.length > 0;
      }

      visible.forEach((note) => {
          const item = document.createElement("div");
          item.className =
            "world-item" + (note.slug === currentSlug ? " world-item-active" : "");
          item.setAttribute("role", "listitem");
          item.tabIndex = 0;

          const body = document.createElement("div");
          body.className = "world-item-body";

          const title = document.createElement("div");
          title.className = "world-item-title";
          title.textContent = note.name || translate("world.untitled", "Untitled entry");

          const desc = document.createElement("p");
          desc.className = "world-item-desc";
          desc.textContent =
            note.description || translate("world.no_description", "No description yet.");

          const meta = document.createElement("div");
          meta.className = "world-item-meta";
          const tokenLabel = translate("world.tokens_count", "{count} tokens").replace(
            "{count}",
            note.tokens ?? estimateTokens(note.description || "")
          );
          meta.textContent = tokenLabel;

          body.appendChild(title);
          body.appendChild(desc);
          body.appendChild(meta);

          const toggleLabel = document.createElement("label");
          toggleLabel.className = "world-toggle world-item-toggle";
          const toggle = document.createElement("input");
          toggle.type = "checkbox";
          toggle.checked = Boolean(note.enabled);
          const deco = document.createElement("span");
          deco.className = "world-toggle-deco";
          toggleLabel.appendChild(toggle);
          toggleLabel.appendChild(deco);

          toggle.addEventListener("change", async (e) => {
            e.stopPropagation();
            note.enabled = toggle.checked;
            await saveNote(note, true, true);
            if (note.slug === currentSlug) {
              enabledEl.checked = toggle.checked;
            }
            renderList();
            updateEnabledCount();
          });
          toggleLabel.addEventListener("click", (e) => e.stopPropagation());
          toggleLabel.addEventListener("pointerdown", (e) => e.stopPropagation());

          item.addEventListener("click", () => {
            selectNote(note.slug);
          });
          item.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              selectNote(note.slug);
            }
          });

          item.appendChild(body);
          item.appendChild(toggleLabel);
          listEl.appendChild(item);
        });
    }

    async function saveNote(partial, quiet = false, keepSelection = false) {
      const previousSlug = partial.previous_slug || partial.slug || currentSlug || undefined;
      const insertIndex =
        previousSlug != null
          ? notes.findIndex((n) => n.slug === previousSlug)
          : notes.findIndex((n) => n.slug === partial.slug);

      const payload = {
        name: partial.name,
        description: partial.description || "",
        enabled: Boolean(partial.enabled),
        tokens:
          typeof partial.tokens === "number"
            ? partial.tokens
            : estimateTokens(partial.description || ""),
        slug: partial.slug || undefined,
        previous_slug: previousSlug,
      };

      const saved = await apiFetch(WORLD_API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // drop old entry if slug changed
      if (payload.previous_slug && payload.previous_slug !== saved.slug) {
        notes = notes.filter((n) => n.slug !== payload.previous_slug);
      }
      const idx = notes.findIndex((n) => n.slug === saved.slug);
      if (idx >= 0) {
        notes[idx] = saved;
      } else {
        if (insertIndex >= 0) {
          notes.splice(insertIndex, 0, saved);
        } else {
          notes.push(saved);
        }
      }
      if (!keepSelection) {
        currentSlug = saved.slug;
      }
      if (!quiet) {
        setStatus("world.status.saved", "Saved.");
      }
      return saved;
    }

    async function saveCurrent(quiet = false) {
      const name = nameEl.value.trim() || translate("world.untitled", "Untitled entry");
      const description = descEl.value;
      const enabled = Boolean(enabledEl.checked);
      const tokens = estimateTokens(description);
      const payload = {
        name,
        description,
        enabled,
        tokens,
        slug: currentSlug || undefined,
        previous_slug: currentSlug || undefined,
      };
      const saved = await saveNote(payload, quiet);
      renderList();
      updateEnabledCount();
    }

    function queueSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveCurrent(true).catch((err) => {
          console.error(err);
          setStatus(err.message);
        });
      }, 240);
    }

    async function selectNote(slug) {
      const target = slug ? findNote(slug) : null;
      applyNoteToForm(target);
      renderList();
    }

    async function addNote() {
      const now = Date.now();
      nameEl.value = translate("world.new_entry_name", "New entry");
      descEl.value = "";
      enabledEl.checked = true;
      currentSlug = `${NEW_ENTRY_PREFIX}${now}`;
      updateCounters();
      await saveCurrent(false);
      setStatus("world.status.created", "New entry created.");
    }

    async function deleteCurrent() {
      if (!currentSlug) return;
      try {
        await apiFetch(`${WORLD_API_BASE}/${encodeURIComponent(currentSlug)}`, {
          method: "DELETE",
        });
      } catch (err) {
        console.error("Delete failed", err);
      }
      notes = notes.filter((n) => n.slug !== currentSlug);
      currentSlug = null;
      renderList();
      if (notes.length) {
        selectNote(notes[0].slug);
      } else {
        applyNoteToForm(null);
      }
      updateEnabledCount();
      setStatus("world.status.deleted", "Entry deleted.");
    }

    async function copyEnabled() {
      const enabledNotes = notes.filter((n) => n.enabled);
      if (!enabledNotes.length) {
        setStatus("world.status.nothing_to_copy", "No enabled entries to copy.");
        return;
      }
      const text = enabledNotes
        .map((n) => `${n.name}\nTokens: ${n.tokens ?? estimateTokens(n.description || "")}\n${n.description}`)
        .join("\n\n");
      try {
        await navigator.clipboard.writeText(text);
        setStatus("world.status.copied", "Copied enabled entries.");
      } catch (err) {
        console.error("Clipboard copy failed", err);
        setStatus("world.status.copy_failed", "Copy failed. Check clipboard permissions.");
      }
    }

    // event bindings
    addBtn?.addEventListener("click", () => {
      addNote().catch((err) => setStatus(err.message));
    });
    saveBtn?.addEventListener("click", () => {
      saveCurrent(false).catch((err) => setStatus(err.message));
    });
    deleteBtn?.addEventListener("click", () => {
      deleteCurrent().catch((err) => setStatus(err.message));
    });
    copyBtn?.addEventListener("click", () => {
      copyEnabled().catch((err) => setStatus(err.message));
    });
    showDisabledEl?.addEventListener("change", () => renderList());

    nameEl.addEventListener("input", () => {
      queueSave();
    });
    descEl.addEventListener("input", () => {
      updateCounters();
      queueSave();
    });
    enabledEl.addEventListener("change", () => {
      saveCurrent(true).catch((err) => setStatus(err.message));
    });

    // initial load
    updateCounters();
    await loadNotes();
    setStatus("world.status.ready", "Ready");
  };
})();
