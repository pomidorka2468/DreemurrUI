const ARCHIVE_TYPES = {
  chat: { labelKey: "archive.type.chat", icon: "/static/icons/chat.svg", className: "chat", tint: "#3b82f6" },
  story: { labelKey: "archive.type.story", icon: "/static/icons/feather.svg", className: "story", tint: "#22c55e" },
  roleplay: { labelKey: "archive.type.rp", icon: "/static/icons/roleplay.svg", className: "roleplay", tint: "#f59e0b" },
};

(function () {
  async function fetchArchiveList() {
    const res = await fetch("/archive", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function fetchArchiveDetail(id) {
    const res = await fetch(`/archive/${encodeURIComponent(id)}`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  window.initArchiveMode = function () {
    const listEl = document.getElementById("archiveList");
    const emptyEl = document.getElementById("archiveEmpty");
    const searchEl = document.getElementById("archiveSearch");
    const filterEl = document.getElementById("archiveTypeFilter");
    const refreshBtn = document.getElementById("archiveRefreshBtn");
    const restoreBtn = document.getElementById("archiveRestoreBtn");
    const deleteBtn = document.getElementById("archiveDeleteBtn");

    if (!listEl) return;

    const t = (key, fallback = "") =>
      typeof window.t === "function" ? window.t(key, fallback) : fallback || key;

    let items = [];
    let activeId = null;
    let activeEntry = null;
    let pendingRefresh = false;
    let editingId = null;

    async function renameEntry(target, newName) {
      if (!target) return;
      const trimmed = (newName || "").trim();
      if (!trimmed || trimmed === target.name) return;
      try {
        const res = await fetch("/archive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: target.id,
            type: target.type || "chat",
            name: trimmed,
            preview: target.preview || "",
            model: target.model || "",
            created_at: target.created_at,
            messages: target.messages || [],
            character_id: target.character_id,
          }),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        setStatus("archive.status.renamed", "Archive renamed.");
        editingId = null;
        await refresh();
      } catch (err) {
        console.error("Failed to rename archive", err);
        setStatus("archive.status.rename_error", "Rename failed.");
      }
    }

    function renderList() {
      listEl.innerHTML = "";
      const query = (searchEl?.value || "").toLowerCase().trim();
      const typeFilter = filterEl?.value || "all";

      const filtered = items.filter((item) => {
        const matchesType = typeFilter === "all" || item.type === typeFilter;
        const matchesQuery =
          !query ||
          (item.name && item.name.toLowerCase().includes(query)) ||
          (item.preview && item.preview.toLowerCase().includes(query));
        return matchesType && matchesQuery;
      });

      if (emptyEl) emptyEl.hidden = filtered.length > 0;

      filtered.forEach((item) => {
        const typeMeta = ARCHIVE_TYPES[item.type] || ARCHIVE_TYPES.chat;
        const row = document.createElement("div");
        row.className = "archive-item" + (item.id === activeId ? " archive-item-active" : "");
        row.setAttribute("role", "listitem");

        const body = document.createElement("div");
        body.className = "archive-item-body";

        const title = document.createElement("div");
        title.className = "archive-item-title";
        const isEditing = item.id === activeId && editingId === item.id;
        if (isEditing) {
          const input = document.createElement("input");
          input.type = "text";
          input.className = "archive-rename-input";
          input.value = item.name || t("archive.untitled", "Untitled");
          input.addEventListener("click", (ev) => ev.stopPropagation());

          const actions = document.createElement("div");
          actions.className = "archive-rename-actions";

          const saveBtn = document.createElement("button");
          saveBtn.type = "button";
          saveBtn.className = "archive-rename-btn primary";
          saveBtn.textContent = t("archive.rename_save", "Save");
          saveBtn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            renameEntry(activeEntry || item, input.value);
          });

          const cancelBtn = document.createElement("button");
          cancelBtn.type = "button";
          cancelBtn.className = "archive-rename-btn ghost";
          cancelBtn.textContent = t("archive.rename_cancel", "Cancel");
          cancelBtn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            editingId = null;
            renderList();
          });

          actions.appendChild(saveBtn);
          actions.appendChild(cancelBtn);
          title.appendChild(input);
          title.appendChild(actions);

          setTimeout(() => input.focus(), 0);
        } else {
          const nameSpan = document.createElement("span");
          nameSpan.textContent = item.name || t("archive.untitled", "Untitled");
          title.appendChild(nameSpan);
          if (item.id === activeId) {
            const renameInline = document.createElement("button");
            renameInline.type = "button";
            renameInline.className = "archive-rename-btn";
            renameInline.textContent = t("archive.rename", "Rename");
            renameInline.addEventListener("click", (ev) => {
              ev.stopPropagation();
              editingId = item.id;
              renderList();
            });
            title.appendChild(renameInline);
          }
        }

        const meta = document.createElement("div");
        meta.className = "archive-item-meta";
        const pill = document.createElement("span");
        pill.className = `archive-pill ${typeMeta.className}`;
        const pillIcon = document.createElement("img");
        pillIcon.src = typeMeta.icon;
        pillIcon.alt = item.type;
        pill.appendChild(pillIcon);
        const pillText = document.createElement("span");
        pillText.textContent = t(typeMeta.labelKey, item.type);
        pill.appendChild(pillText);

        const time = document.createElement("span");
        const d = new Date(item.updated_at || Date.now());
        time.textContent = d.toLocaleString();

        meta.appendChild(pill);
        meta.appendChild(time);

        const preview = document.createElement("div");
        preview.className = "archive-preview";
        preview.textContent = item.preview || t("archive.no_preview", "No preview yet.");

        body.appendChild(title);
        body.appendChild(meta);
        body.appendChild(preview);

        row.appendChild(body);

        row.addEventListener("click", () => {
          activeId = item.id;
          renderList();
          fetchArchiveDetail(item.id)
            .then((entry) => {
              activeEntry = entry;
            })
            .catch(() => {
              activeEntry = item;
            });
        });

        listEl.appendChild(row);
      });
    }

    async function refresh() {
      if (pendingRefresh) return;
      pendingRefresh = true;
      try {
        items = await fetchArchiveList();
      } catch (err) {
        console.error("Failed to load archive", err);
        items = [];
      }
      if (!items.find((i) => i.id === activeId)) {
        activeId = items[0]?.id || null;
      }
      renderList();
      const active = items.find((i) => i.id === activeId);
      activeEntry = active || null;
      pendingRefresh = false;
    }

    refreshBtn?.addEventListener("click", () => refresh());

    restoreBtn?.addEventListener("click", () => {
      if (!activeEntry) return;
      try {
        const payload = {
          model: activeEntry.model,
          character_id: activeEntry.character_id,
          messages: activeEntry.messages || [],
          archive_id: activeEntry.id,
        };
        localStorage.setItem("dreamui-restore-chat", JSON.stringify(payload));
        if (activeEntry.model) {
          localStorage.setItem("dreamui-active-model", activeEntry.model);
        }
        if (activeEntry.character_id) {
          localStorage.setItem("dreamui-active-character", String(activeEntry.character_id));
        }
        setStatus("archive.status.restored", "Ready to restore in chat mode.");
        const chatBtn = document.querySelector('.mode-icon-btn[data-mode-id="chat"]');
        chatBtn?.click();
      } catch (err) {
        console.error("Failed to queue restore", err);
      }
    });

    deleteBtn?.addEventListener("click", async () => {
      if (!activeEntry) return;
      const ok = window.confirm(t("archive.delete_confirm", "Delete this archived chat?"));
      if (!ok) return;
      try {
        const res = await fetch(`/archive/${encodeURIComponent(activeEntry.id)}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        activeEntry = null;
        activeId = null;
        await refresh();
        setStatus("archive.status.deleted", "Archive deleted.");
      } catch (err) {
        console.error("Failed to delete archive", err);
        setStatus("archive.status.delete_error", "Delete failed.");
      }
    });

    window.addEventListener("storage", (e) => {
      if (e.key === "dreamui-archive-refresh") {
        refresh();
      }
    });
    window.addEventListener("dreamui-archive-refresh", () => refresh());

    function setStatus(key, fallback) {
      console.debug("[archive]", fallback || key);
    }

    searchEl?.addEventListener("input", () => renderList());
    filterEl?.addEventListener("change", () => renderList());

    refresh();
  };
})();
