(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const STORE_KEY = "songforge.history.v1";
  const PW_KEY = "songforge.password";
  const POLL_MS = 6000;
  const TIMEOUT_MS = 15 * 60 * 1000;
  const FAILED = new Set(["CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "CALLBACK_EXCEPTION", "SENSITIVE_WORD_ERROR"]);
  const STATUS_TEXT = {
    PENDING: "Queued",
    TEXT_SUCCESS: "Composing",
    FIRST_SUCCESS: "Finishing",
    SUCCESS: "Ready",
    CREATE_TASK_FAILED: "Failed",
    GENERATE_AUDIO_FAILED: "Failed",
    CALLBACK_EXCEPTION: "Failed",
    SENSITIVE_WORD_ERROR: "Blocked",
    TIMEOUT: "Timed out",
  };

  let mode = "simple";
  let history = load();
  const pollers = new Map();
  const cards = new Map();

  // ---------- storage ----------
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(history.slice(0, 100))); } catch {}
  }
  function getPw() { try { return localStorage.getItem(PW_KEY) || ""; } catch { return ""; } }
  function setPw(v) { try { localStorage.setItem(PW_KEY, v); } catch {} }

  // ---------- API ----------
  async function api(path, opts = {}, retried = false) {
    const res = await fetch(path, {
      ...opts,
      headers: { "content-type": "application/json", "x-app-password": getPw(), ...(opts.headers || {}) },
    });
    let data = {};
    try { data = await res.json(); } catch {}
    if (res.status === 401 && data.needPassword && !retried) {
      const ok = await askPassword();
      if (ok) return api(path, opts, true);
    }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function askPassword() {
    return new Promise((resolve) => {
      const dlg = $("#pwDialog");
      $("#pwInput").value = "";
      dlg.showModal();
      dlg.addEventListener("close", () => {
        const v = $("#pwInput").value.trim();
        if (v) setPw(v);
        resolve(!!v);
      }, { once: true });
    });
  }

  async function refreshCredits() {
    try {
      const { credits } = await api("/api/credits");
      $("#credits").textContent = `${Number(credits).toLocaleString()} credits`;
    } catch {
      $("#credits").textContent = "credits unavailable";
    }
  }

  // ---------- composer ----------
  const IDEAS = [
    "A lo-fi hip hop beat for late-night studying",
    "An epic cinematic orchestral piece for a movie trailer",
    "A country song about a small town Friday night",
    "A funky 80s synthwave track about neon city lights",
    "An acoustic love song with gentle guitar and warm vocals",
  ];
  const STYLES = ["pop", "hip hop", "lo-fi", "rock", "country", "R&B", "EDM", "jazz", "acoustic", "cinematic", "reggaeton", "synthwave"];

  function chips(container, items, onPick) {
    items.forEach((t) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = t;
      b.addEventListener("click", () => onPick(t));
      container.appendChild(b);
    });
  }
  chips($("#ideaChips"), IDEAS, (t) => { $("#prompt").value = t; updateCounts(); });
  chips($("#styleChips"), STYLES, (t) => {
    const el = $("#style");
    const parts = el.value.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.includes(t)) parts.push(t);
    el.value = parts.join(", ");
  });

  function setMode(m) {
    mode = m;
    document.querySelectorAll(".tab").forEach((t) => {
      const on = t.dataset.mode === m;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on);
    });
    $(".mode.simple").hidden = m !== "simple";
    $(".mode.custom").hidden = m !== "custom";
    syncInstrumental();
  }
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => setMode(t.dataset.mode)));

  function syncInstrumental() {
    const inst = $("#instrumental").checked;
    $(".lyrics-field").style.display = inst ? "none" : "";
    $("#vocalGender").disabled = inst;
  }
  $("#instrumental").addEventListener("change", syncInstrumental);

  function updateCounts() {
    document.querySelectorAll(".count").forEach((c) => {
      const el = document.getElementById(c.dataset.for);
      c.textContent = `${el.value.length} / ${el.maxLength}`;
    });
  }
  ["prompt", "lyrics"].forEach((id) => document.getElementById(id).addEventListener("input", updateCounts));

  $("#duration").addEventListener("input", (e) => {
    const v = Number(e.target.value);
    $("#durationLabel").textContent = v < 10 ? "auto" : `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
  });

  function showError(msg) {
    const el = $("#error");
    el.textContent = msg || "";
    el.hidden = !msg;
  }

  function collect() {
    const req = {
      customMode: mode === "custom",
      instrumental: $("#instrumental").checked,
      model: $("#model").value,
    };
    if (req.customMode) {
      req.title = $("#title").value.trim();
      req.style = $("#style").value.trim();
      req.lyrics = req.instrumental ? "" : $("#lyrics").value.trim();
      req.negativeTags = $("#negativeTags").value.trim();
      req.vocalGender = $("#vocalGender").value;
      const d = Number($("#duration").value);
      if (d >= 10) req.duration = d;
    } else {
      req.prompt = $("#prompt").value.trim();
    }
    return req;
  }

  function validate(req) {
    if (!req.customMode && !req.prompt) return "Describe the song you want.";
    if (req.customMode && !req.style && !req.lyrics && !req.negativeTags) return "Add a style or lyrics.";
    return null;
  }

  function busy(btn, on) {
    btn.disabled = on;
    btn.classList.toggle("loading", on);
  }

  $("#form").addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    const req = collect();
    const problem = validate(req);
    if (problem) return showError(problem);

    const btn = $("#createBtn");
    busy(btn, true);
    try {
      const { taskId } = await api("/api/generate", { method: "POST", body: JSON.stringify(req) });
      if (!taskId) throw new Error("No task ID returned.");
      const job = { taskId, createdAt: Date.now(), request: req, status: "PENDING", error: null, tracks: [] };
      history.unshift(job);
      save();
      render();
      poll(job);
      $(".library").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      showError(err.message);
    } finally {
      busy(btn, false);
    }
  });

  // ---------- AI lyrics ----------
  $("#writeLyrics").addEventListener("click", () => {
    $("#lyricsResults").innerHTML = "";
    $("#lyricsPrompt").value = $("#title").value || "";
    $("#lyricsDialog").showModal();
  });

  $("#lyricsGo").addEventListener("click", async () => {
    const prompt = $("#lyricsPrompt").value.trim();
    const out = $("#lyricsResults");
    if (!prompt) { $("#lyricsPrompt").focus(); return; }
    const btn = $("#lyricsGo");
    busy(btn, true);
    out.innerHTML = '<p class="muted small">Writing lyrics — usually 10–30 seconds…</p>';
    try {
      const { taskId } = await api("/api/lyrics", { method: "POST", body: JSON.stringify({ prompt }) });
      const start = Date.now();
      let result;
      while (Date.now() - start < 3 * 60 * 1000) {
        await sleep(4000);
        result = await api(`/api/lyrics?taskId=${encodeURIComponent(taskId)}`);
        if (result.status === "SUCCESS" || result.lyrics?.length) break;
        if (/FAIL|ERROR/.test(result.status)) throw new Error(result.errorMessage || "Lyrics generation failed.");
      }
      if (!result?.lyrics?.length) throw new Error("Lyrics took too long. Try again.");
      out.innerHTML = '<p class="muted small">Pick one to use:</p>';
      result.lyrics.forEach((l) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "lyric-option";
        const s = document.createElement("strong");
        s.textContent = l.title || "Option";
        b.append(s, document.createTextNode(l.text));
        b.addEventListener("click", () => {
          $("#lyrics").value = l.text;
          if (!$("#title").value && l.title) $("#title").value = l.title;
          updateCounts();
          $("#lyricsDialog").close();
        });
        out.appendChild(b);
      });
      refreshCredits();
    } catch (err) {
      out.innerHTML = "";
      const p = document.createElement("p");
      p.className = "error";
      p.textContent = err.message;
      out.appendChild(p);
    } finally {
      busy(btn, false);
    }
  });

  // ---------- polling ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function isDone(job) {
    return job.status === "SUCCESS" || job.status === "TIMEOUT" || FAILED.has(job.status);
  }

  function poll(job) {
    if (isDone(job) || pollers.has(job.taskId)) return;
    const tick = async () => {
      if (Date.now() - job.createdAt > TIMEOUT_MS) {
        job.status = "TIMEOUT";
        job.error = "Generation took too long. Check back later or try again.";
      } else {
        try {
          const r = await api(`/api/status?taskId=${encodeURIComponent(job.taskId)}`);
          job.status = r.status;
          job.error = r.errorMessage;
          if (r.tracks?.length) job.tracks = r.tracks;
          // Audio can be finished even if Suno's callback step reported an exception.
          if (job.status === "CALLBACK_EXCEPTION" && job.tracks.some((t) => t.audioUrl)) job.status = "SUCCESS";
        } catch (err) {
          job.lastError = err.message; // transient; keep polling
        }
      }
      save();
      render();
      if (isDone(job)) {
        pollers.delete(job.taskId);
        if (job.status === "SUCCESS") refreshCredits();
      } else {
        pollers.set(job.taskId, setTimeout(tick, POLL_MS));
      }
    };
    pollers.set(job.taskId, setTimeout(tick, 1500));
  }

  // ---------- rendering ----------
  function cardKeys(job) {
    const n = Math.max(job.tracks.length, 2);
    return Array.from({ length: n }, (_, i) => `${job.taskId}:${i}`);
  }

  function render() {
    const list = $("#songs");
    const wanted = new Set();

    history.forEach((job) => {
      cardKeys(job).forEach((key, i) => {
        // Hide placeholder #2 once a finished job only produced one track.
        if (isDone(job) && job.tracks.length && i >= job.tracks.length) return;
        wanted.add(key);
        let el = cards.get(key);
        if (!el) {
          el = createCard(job, i);
          cards.set(key, el);
        }
        updateCard(el, job, job.tracks[i]);
        list.appendChild(el); // keeps order; moves existing nodes without recreating them
      });
    });

    for (const [key, el] of cards) {
      if (!wanted.has(key)) { el.remove(); cards.delete(key); }
    }
    $("#empty").hidden = history.length > 0;
    $("#clearAll").hidden = history.length === 0;
  }

  function createCard(job, index) {
    const el = $("#songTpl").content.firstElementChild.cloneNode(true);
    el.querySelector(".show-lyrics").addEventListener("click", () => {
      const pre = el.querySelector(".s-lyrics");
      pre.hidden = !pre.hidden;
    });
    el.querySelector(".reuse").addEventListener("click", () => reuse(job.request));
    el.querySelector(".remove").addEventListener("click", () => {
      if (!confirm("Remove this song from your history?")) return;
      const j = history.find((h) => h.taskId === job.taskId);
      if (!j) return;
      if (j.tracks.length > 1) {
        j.tracks.splice(index, 1);
        // Re-key this job's cards since indexes shifted.
        cardKeys({ ...j, tracks: [...j.tracks, {}, {}] }).forEach((k) => { cards.get(k)?.remove(); cards.delete(k); });
      } else {
        history = history.filter((h) => h.taskId !== job.taskId);
        clearTimeout(pollers.get(job.taskId));
        pollers.delete(job.taskId);
      }
      save();
      render();
    });
    return el;
  }

  function updateCard(el, job, t) {
    const done = isDone(job);
    const failed = done && job.status !== "SUCCESS";
    el.classList.toggle("ready", job.status === "SUCCESS");
    el.classList.toggle("failed", failed);

    const req = job.request || {};
    const fallbackTitle = req.title || (req.prompt ? truncate(req.prompt, 60) : "New song");
    setText(el.querySelector(".s-title"), t?.title || fallbackTitle);
    setText(
      el.querySelector(".s-tags"),
      failed ? (job.error || STATUS_TEXT[job.status]) : [t?.tags, fmtDuration(t?.duration)].filter(Boolean).join(" · ") || "Generating…"
    );

    const badge = el.querySelector(".badge");
    setText(badge, STATUS_TEXT[job.status] || job.status);
    badge.className = `badge ${failed ? "failed" : job.status === "SUCCESS" ? "ready" : "working"}`;

    const img = el.querySelector(".cover img");
    if (t?.imageUrl && img.getAttribute("src") !== t.imageUrl) img.src = t.imageUrl;

    const audio = el.querySelector("audio");
    const src = t?.audioUrl || t?.streamUrl || "";
    if (src && audio.getAttribute("src") !== src && (audio.paused || !audio.getAttribute("src"))) {
      audio.src = src;
    }

    const dl = el.querySelector(".dl");
    if (t?.audioUrl) {
      dl.href = t.audioUrl;
      dl.download = `${(t.title || "song").replace(/[^\w\- ]+/g, "").trim() || "song"}.mp3`;
    }

    const lyricsBtn = el.querySelector(".show-lyrics");
    const lyr = t?.lyrics || req.lyrics || "";
    lyricsBtn.hidden = !lyr || req.instrumental;
    setText(el.querySelector(".s-lyrics"), lyr);
  }

  function reuse(req) {
    if (!req) return;
    setMode(req.customMode ? "custom" : "simple");
    $("#instrumental").checked = !!req.instrumental;
    $("#model").value = req.model || "V6";
    $("#prompt").value = req.prompt || "";
    $("#title").value = req.title || "";
    $("#style").value = req.style || "";
    $("#lyrics").value = req.lyrics || "";
    $("#negativeTags").value = req.negativeTags || "";
    $("#vocalGender").value = req.vocalGender || "";
    $("#duration").value = req.duration || 0;
    $("#duration").dispatchEvent(new Event("input"));
    syncInstrumental();
    updateCounts();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  $("#clearAll").addEventListener("click", () => {
    if (!confirm("Clear all songs from this browser?")) return;
    pollers.forEach((id) => clearTimeout(id));
    pollers.clear();
    history = [];
    save();
    render();
  });

  function setText(el, v) { if (el.textContent !== v) el.textContent = v; }
  function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function fmtDuration(sec) {
    if (!sec) return "";
    const s = Math.round(sec);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  // ---------- boot ----------
  updateCounts();
  syncInstrumental();
  render();
  history.forEach(poll);
  refreshCredits();
})();
