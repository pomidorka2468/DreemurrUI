(function () {
  const MODEL_KEY = "dreamui-active-model";
  const LM_STUDIO_BASE = "http://127.0.0.1:1234";
  const LM_STUDIO_MODELS_URL = `${LM_STUDIO_BASE}/v1/models`;

  function normalizeModel(raw) {
    if (!raw) return null;
    const details = raw.details || raw.metadata || {};
    const id = raw.id || raw.name;
    if (!id) return null;
    return {
      id,
      name: raw.name || raw.id || "Unnamed model",
      loaded: Boolean(
        raw.loaded ??
          raw.isLoaded ??
          raw.is_loaded ??
          raw.active ??
          raw.current ??
          raw.attached ??
          raw.loaded_at
      ),
      size:
        raw.parameter_size ||
        raw.parameters ||
        details.parameter_size ||
        details.parameters ||
        null,
      context:
        raw.context_length ||
        raw.max_context_length ||
        details.context_length ||
        details.max_context_length ||
        null,
      format:
        raw.format ||
        raw.quantization ||
        raw.quantization_level ||
        details.format ||
        details.quantization ||
        null,
      family:
        raw.architecture ||
        raw.family ||
        raw.model_family ||
        details.architecture ||
        details.family ||
        null,
      raw,
    };
  }

  function fallbackModels() {
    return [
      {
        id: "dolphin3.0-llama3.1-8b",
        name: "Dolphin 3.0 · Llama 3.1 8B",
        size: "8B",
        context: 8192,
        format: "Q4_K_M",
        family: "LLama 3.1",
        loaded: true,
      },
    ];
  }

  async function requestModelAction(modelId, action) {
    const endpoint = `${LM_STUDIO_BASE}/v1/models/${encodeURIComponent(modelId)}/${action}`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    // response body may be empty; ignore JSON errors
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  window.initModelMode = function () {
    const listEl = document.getElementById("modelList");
    const activeCard = document.getElementById("activeModelCard");
    const statusEl = document.getElementById("modelStatus");
    const refreshBtn = document.getElementById("modelRefreshBtn");
    const ejectBtn = document.getElementById("modelEjectBtn");
    const sourceTag = document.getElementById("modelSourceTag");
    const countTag = document.getElementById("modelCountTag");
    const translate = (key, fallback = "") =>
      typeof window.t === "function" ? window.t(key, fallback) : fallback || key;

    if (!listEl || !activeCard) return;

    let models = [];
    let sourceLive = false;
    let activeModelId = localStorage.getItem(MODEL_KEY) || "";

    function setStatus(text) {
      if (statusEl) statusEl.textContent = text;
    }

    function updateSourceTag() {
      if (!sourceTag) return;
      sourceTag.textContent = sourceLive
        ? translate("model.live", "Live")
        : translate("model.offline", "Offline list");
      sourceTag.classList.toggle("offline", !sourceLive);
    }

    function updateCountTag() {
      if (!countTag) return;
      const raw = translate("model.count", `${models.length} model${models.length === 1 ? "" : "s"}`);
      countTag.textContent = raw.replace("{count}", models.length);
    }

    function rememberModel(id) {
      activeModelId = id || "";
      if (activeModelId) {
        localStorage.setItem(MODEL_KEY, activeModelId);
      } else {
        localStorage.removeItem(MODEL_KEY);
      }
      renderActive();
    }

    function renderActive() {
      if (!activeModelId) {
        activeCard.innerHTML = translate(
          "model.current_none",
          "No model selected yet. Pick one from the list to make it the default."
        );
        return;
      }

      const model = models.find((m) => m.id === activeModelId);
      activeCard.innerHTML = "";

      const title = document.createElement("div");
      title.className = "model-active-title";
      title.textContent = model?.name || activeModelId;

      const status = document.createElement("span");
      status.className =
        "model-status-pill " + (model?.loaded ? "loaded" : "idle");
      status.textContent = model?.loaded
        ? translate("model.loaded_label", "Loaded")
        : translate("model.idle_label", "Idle / not confirmed");

      const meta = document.createElement("div");
      meta.className = "model-meta";
      const metaBits = [];
      if (model?.size) metaBits.push(model.size);
      if (model?.format) metaBits.push(model.format);
      if (model?.context) metaBits.push(`${model.context} ctx`);
      if (model?.family) metaBits.push(model.family);
      meta.textContent = metaBits.length
        ? metaBits.join(" · ")
        : translate("model.meta_none", "No metadata yet.");

      activeCard.appendChild(title);
      activeCard.appendChild(status);
      activeCard.appendChild(meta);
    }

    function buildModelCard(model) {
      const card = document.createElement("article");
      card.className = "model-card";
      if (model.id === activeModelId) card.classList.add("model-card-active");

      const header = document.createElement("div");
      header.className = "model-card-header";

      const name = document.createElement("div");
      name.className = "model-name";
      name.textContent = model.name;
      header.appendChild(name);

      const badgeWrap = document.createElement("div");
      badgeWrap.className = "model-badges";

      const status = document.createElement("span");
      status.className =
        "model-status-pill " + (model.loaded ? "loaded" : "idle");
      status.textContent = model.loaded
        ? translate("model.loaded_label", "Loaded")
        : translate("model.idle_label", "Idle");
      badgeWrap.appendChild(status);

      if (model.format) {
        const fmt = document.createElement("span");
        fmt.className = "model-tag";
        fmt.textContent = model.format;
        badgeWrap.appendChild(fmt);
      }
      header.appendChild(badgeWrap);

      const meta = document.createElement("div");
      meta.className = "model-meta";
      const metaParts = [];
      if (model.size) metaParts.push(model.size);
      if (model.context) metaParts.push(`${model.context} ctx`);
      if (model.family) metaParts.push(model.family);
      meta.textContent = metaParts.join(" · ") || "No metadata yet.";

      const actions = document.createElement("div");
      actions.className = "model-card-actions";

      const useBtn = document.createElement("button");
      useBtn.className = "model-btn model-btn-primary";
      useBtn.textContent =
        model.id === activeModelId
          ? translate("model.active_label", "Active")
          : translate("model.use_for_chat", "Use for chat");
      useBtn.disabled = model.id === activeModelId;
      useBtn.addEventListener("click", () => {
        rememberModel(model.id);
        setStatus(
          translate(
            "model.status.will_use",
            `"${model.name}" will be used for chat and notebook calls.`
          ).replace("{name}", model.name)
        );
        renderList();
      });

      const loadBtn = document.createElement("button");
      loadBtn.className = "model-btn";
      loadBtn.textContent = model.loaded
        ? translate("model.eject", "Eject from LM Studio")
        : translate("model.load", "Load into LM Studio");
      loadBtn.addEventListener("click", async () => {
        try {
          if (model.loaded) {
            setStatus(
              translate("model.status.ejecting", `Ejecting ${model.name}...`).replace(
                "{name}",
                model.name
              )
            );
            await requestModelAction(model.id, "unload");
            model.loaded = false;
            setStatus(
              translate("model.status.ejected", `Ejected ${model.name}.`).replace(
                "{name}",
                model.name
              )
            );
          } else {
            setStatus(
              translate("model.status.loading_single", `Loading ${model.name}...`).replace(
                "{name}",
                model.name
              )
            );
            await requestModelAction(model.id, "load");
            model.loaded = true;
            rememberModel(model.id);
            setStatus(
              translate("model.status.loaded_single", `Loaded ${model.name}.`).replace(
                "{name}",
                model.name
              )
            );
          }
        } catch (err) {
          console.error(err);
          model.loaded = !model.loaded;
          rememberModel(model.id);
          setStatus(
            translate(
              "model.status.toggle_warn",
              `Toggled "${model.name}" locally. LM Studio control may not be reachable.`
            )
          );
        } finally {
          renderList();
        }
      });

      actions.appendChild(useBtn);
      actions.appendChild(loadBtn);

      card.appendChild(header);
      card.appendChild(meta);
      card.appendChild(actions);
      return card;
    }

    function renderList() {
      listEl.innerHTML = "";
      if (!models.length) {
        const empty = document.createElement("div");
        empty.className = "panel-subtitle";
        empty.textContent = translate(
          "model.no_models",
          "No models found. Start LM Studio, then refresh."
        );
        listEl.appendChild(empty);
        updateCountTag();
        return;
      }

      models.forEach((m) => {
        listEl.appendChild(buildModelCard(m));
      });
      updateCountTag();
    }

    async function refreshModels() {
      setStatus(translate("model.status.loading", "Loading models from LM Studio..."));
      sourceLive = false;
      try {
        const res = await fetch(LM_STUDIO_MODELS_URL, { cache: "no-cache" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const normalized = Array.isArray(data?.data)
          ? data.data
              .map(normalizeModel)
              .filter(
                (m) =>
                  m &&
                  !/embed/i.test(m.id || "") &&
                  !/embedding/i.test(m.name || "")
              )
          : [];
        if (!normalized.length) throw new Error("No models returned");
        models = normalized;
        sourceLive = true;
        setStatus(
          translate("model.status.loaded", `Loaded ${models.length} model(s) from LM Studio.`).replace(
            "{count}",
            models.length
          )
        );
      } catch (err) {
        console.error(err);
        models = fallbackModels();
        sourceLive = false;
        setStatus(translate("model.status.fallback", "Using fallback list (could not reach LM Studio)."));
      }
      updateSourceTag();
      updateCountTag();
      renderList();
      renderActive();
    }

    async function ejectActive() {
      if (!activeModelId) {
        setStatus(translate("model.status.no_active", "No active model to eject."));
        return;
      }
      const model = models.find((m) => m.id === activeModelId);
      try {
        setStatus(
          translate("model.status.ejecting", `Ejecting ${model?.name || activeModelId}...`).replace(
            "{name}",
            model?.name || activeModelId
          )
        );
        await requestModelAction(activeModelId, "unload");
        if (model) model.loaded = false;
        setStatus(
          translate("model.status.ejected", `Ejected ${model?.name || activeModelId}.`).replace(
            "{name}",
            model?.name || activeModelId
          )
        );
      } catch (err) {
        console.error(err);
        setStatus(
          translate(
            "model.status.eject_error",
            `Cleared selection; LM Studio unload may have failed (${err.message}).`
          )
        );
      } finally {
        rememberModel("");
        renderList();
      }
    }

    refreshBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      refreshModels();
    });

    ejectBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      ejectActive();
    });

    refreshModels();
  };
})();
