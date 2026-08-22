import { createSingularity } from "./singularity.js";

const VERDICT_TEXT = {
  no: "NO",
  not_yet: "NOT YET",
  yes: "YES",
};

const STANCE_TEXT = {
  for: "leans yes",
  against: "leans no",
  mixed: "mixed",
};

const TIER_TEXT = {
  fresh: "Fresh",
  aging: "Aging",
  resting: "Resting",
};

const $ = (id) => document.getElementById(id);

const state = {
  verdict: null,
  confidence: null,
  dateText: "",
  lastData: null,
};

let shader = null;

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.round(diff / 60000);
  if (mins < 60) return mins <= 1 ? "just now" : `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.round(days / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
}

function freshnessTier(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "resting";
  const age = Date.now() - then;
  if (age < 24 * 3600 * 1000) return "fresh";
  if (age < 7 * 24 * 3600 * 1000) return "aging";
  return "resting";
}

function isValidData(data) {
  return (
    data &&
    typeof data === "object" &&
    typeof data.verdict === "string" &&
    (data.verdict === "no" || data.verdict === "not_yet" || data.verdict === "yes")
  );
}

function renderVerdict(verdict) {
  const answerEl = $("answer");
  const todayVerdict = $("timeline-today-verdict");
  const text = VERDICT_TEXT[verdict] || "\u2026";
  answerEl.classList.toggle("answer-pending", !VERDICT_TEXT[verdict]);
  splitVerdictLetters(answerEl, text);
  document.documentElement.dataset.verdict = VERDICT_TEXT[verdict] ? verdict : "unknown";
  state.verdict = verdict;
  if (todayVerdict) todayVerdict.textContent = text;
}

function splitVerdictLetters(el, text) {
  el.setAttribute("aria-label", text);
  el.innerHTML = "";
  const hidden = document.createElement("span");
  hidden.className = "sr-only";
  hidden.textContent = text;
  const wrap = document.createElement("span");
  wrap.setAttribute("aria-hidden", "true");
  let i = 0;
  for (const word of text.split(" ")) {
    if (!word) continue;
    const w = document.createElement("span");
    w.className = "vw";
    for (const ch of word) {
      const b = document.createElement("b");
      b.className = "vl";
      b.style.setProperty("--i", i++);
      b.textContent = ch;
      w.append(b);
    }
    wrap.append(w);
    wrap.append(document.createTextNode(" "));
  }
  el.append(hidden, wrap);
}

function renderConfidence(confidence) {
  const badgeEl = $("confidence-badge");
  const numEl = $("confidence-num");
  if (!badgeEl || !numEl) return;
  const value = Number.isFinite(confidence) ? Math.round(confidence) : null;
  if (value == null) {
    badgeEl.hidden = true;
    state.confidence = null;
    return;
  }
  badgeEl.hidden = false;
  badgeEl.setAttribute("aria-valuenow", String(value));
  badgeEl.setAttribute("aria-valuetext", `${value} percent`);
  badgeEl.style.setProperty("--gauge-progress", value);
  numEl.textContent = `${value}%`;
  state.confidence = value;
}

function renderHeadline(data) {
  const el = $("headline");
  if (!el) return;
  if (typeof data.headline === "string" && data.headline.trim()) {
    el.textContent = data.headline.trim();
    return;
  }
  const rationale = typeof data.rationale === "string" ? data.rationale : "";
  const first = rationale.split(/(?<=[.!?])\s+/)[0] || "";
  el.textContent = first.length > 100 ? `${first.slice(0, 97).trimEnd()}\u2026` : first;
}

function renderSignals(signals) {
  const list = $("signal-list");
  if (!list) return;
  list.innerHTML = "";
  const items = Array.isArray(signals) ? signals.slice(0, 5) : [];
  if (!items.length) {
    list.hidden = true;
    return;
  }
  list.hidden = false;
  for (const s of items) {
    const li = document.createElement("li");
    li.className = "signal-card";
    li.dataset.stance = ["for", "against", "mixed"].includes(s.stance) ? s.stance : "mixed";

    const label = document.createElement("strong");
    label.className = "signal-label";
    label.textContent = typeof s.label === "string" ? s.label : "";

    const note = document.createElement("span");
    note.className = "signal-note";
    note.textContent = typeof s.note === "string" ? s.note : "";

    const stance = document.createElement("span");
    stance.className = "signal-stance";
    stance.textContent = STANCE_TEXT[li.dataset.stance];

    li.append(label, note, stance);
    list.append(li);
  }
}

function renderRationale(text) {
  const el = $("rationale");
  if (!el) return;
  if (typeof text === "string" && text.trim()) {
    el.textContent = text.trim();
  }
}

function renderSources(sources) {
  const list = $("source-list");
  const muted = $("sources-muted");
  if (!list) return;
  list.innerHTML = "";
  const items = (Array.isArray(sources) ? sources : []).slice(0, 5);
  if (!items.length) {
    if (muted) muted.textContent = "No sources on file yet.";
    return;
  }
  if (muted) muted.textContent = "Cited by the research agent, in its own words:";
  for (const s of items) {
    let host = "";
    try {
      host = new URL(s.url).hostname.replace(/^www\./, "");
    } catch {
      host = s.url;
    }

    const li = document.createElement("li");
    li.className = "source-card";

    const link = document.createElement("a");
    link.className = "source-link";
    link.href = s.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    const favicon = document.createElement("span");
    favicon.className = "source-favicon";
    favicon.setAttribute("aria-hidden", "true");
    favicon.textContent = (host[0] || "?").toUpperCase();

    const body = document.createElement("span");
    body.className = "source-body";

    const title = document.createElement("span");
    title.className = "source-title";
    title.textContent = s.title;

    const meta = document.createElement("span");
    meta.className = "source-meta";
    const parts = [];
    if (typeof s.publisher === "string" && s.publisher.trim() && s.publisher.trim() !== host) {
      parts.push(s.publisher.trim());
    }
    parts.push(host);
    if (typeof s.published === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.published)) {
      parts.push(
        new Date(`${s.published}T00:00:00`).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      );
    }
    meta.textContent = parts.join(" \u00b7 ");

    body.append(title, meta);

    if (typeof s.quote === "string" && s.quote.trim()) {
      const quote = document.createElement("span");
      quote.className = "source-quote";
      quote.textContent = `\u201c${s.quote.trim()}\u201d`;
      body.append(quote);
    }

    link.append(favicon, body);
    li.append(link);
    list.append(li);
  }
}

function renderDates(generatedAt) {
  const when = new Date(generatedAt);
  if (!Number.isFinite(when.getTime())) return;
  const dateEl = $("verdict-date");
  const updatedEl = $("updated");
  const todayDate = $("timeline-today-date");
  if (dateEl) {
    dateEl.textContent = when.toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    dateEl.dateTime = generatedAt;
  }
  if (updatedEl) {
    updatedEl.textContent = when.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    updatedEl.dateTime = generatedAt;
  }
  if (todayDate) {
    todayDate.textContent = when.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }
  state.dateText = when.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function renderFreshness(data) {
  const badge = $("freshness-badge");
  const text = $("researched-at");
  if (!badge || !text) return;
  const tier = freshnessTier(data.generated_at);
  const ago = timeAgo(data.generated_at);
  if (!ago) {
    badge.hidden = true;
    text.textContent = "No research timestamp \u2014 treat this as unverified.";
    return;
  }
  badge.hidden = false;
  badge.dataset.tier = tier;
  badge.textContent = TIER_TEXT[tier];
  if (tier === "fresh") {
    text.textContent = `Researched ${ago} by an agent with web access.`;
  } else if (tier === "aging") {
    text.textContent = `Researched ${ago} \u2014 not from today.`;
  } else {
    text.textContent = `Researched ${ago} \u2014 the research pipeline is resting.`;
  }
}

function renderAll(data) {
  renderVerdict(data.verdict);
  renderConfidence(data.confidence);
  renderHeadline(data);
  renderSignals(data.signals);
  renderRationale(data.rationale);
  renderSources(data.sources);
  renderDates(data.generated_at);
  renderFreshness(data);
  updateTicker();
  const answerEl = $("answer");
  if (answerEl && !reduceMotion) {
    answerEl.classList.remove("charge");
    void answerEl.offsetWidth;
    answerEl.classList.add("charge");
  }
}

function renderError() {
  renderVerdict(null);
  renderConfidence(null);
  const headline = $("headline");
  if (headline) headline.textContent = "The machines have not filed a report.";
  renderSignals([]);
  const rationale = $("rationale");
  if (rationale) {
    rationale.textContent =
      "The research agent has not produced a valid verdict. When it does, its answer, confidence, and sources will appear here.";
  }
  renderSources([]);
  const badge = $("freshness-badge");
  const text = $("researched-at");
  if (badge) badge.hidden = true;
  if (text) text.textContent = "No research yet \u2014 the machines are resting.";
  const dateEl = $("verdict-date");
  if (dateEl) dateEl.textContent = "checking the calendar\u2026";
}

function parseBootstrap() {
  const el = $("bootstrap-data");
  if (!el) return null;
  try {
    return JSON.parse(el.textContent);
  } catch {
    return null;
  }
}

async function loadData() {
  const bootstrap = parseBootstrap();
  let data = isValidData(bootstrap) ? bootstrap : null;
  if (data) {
    renderAll(data);
  }
  try {
    const res = await fetch("data.json", { cache: "no-store" });
    if (res.ok) {
      const fetched = await res.json();
      if (isValidData(fetched)) {
        const same = data && JSON.stringify(fetched) === JSON.stringify(data);
        if (!same) {
          data = fetched;
          renderAll(fetched);
        }
      }
    }
  } catch {
    data = isValidData(data) ? data : null;
  }
  if (!data) renderError();
  state.lastData = data;
  return data;
}

let shareTimer = 0;
function setupShare() {
  const btn = $("share-btn");
  const nativeBtn = $("share-native");
  const live = $("share-status");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const verdict = VERDICT_TEXT[state.verdict] || "\u2026";
    const parts = [verdict];
    if (state.confidence != null) parts.push(`${state.confidence}% confidence`);
    if (state.dateText) parts.push(state.dateText);
    const text = `${parts.join(" \u00b7 ")}\nAre we in the singularity yet?\nhttps://leemark.github.io/sing/`;
    copyText(text).then((ok) => {
      const label = btn.querySelector(".share-btn-label");
      btn.classList.toggle("share-ok", ok);
      if (label) label.textContent = ok ? "Copied" : "Copy failed";
      if (live) live.textContent = ok ? "Verdict copied to clipboard." : "Copy failed \u2014 your browser blocked it.";
      clearTimeout(shareTimer);
      shareTimer = setTimeout(() => {
        btn.classList.remove("share-ok");
        if (label) label.textContent = "Copy verdict";
        if (live) live.textContent = "";
      }, 2400);
    });
  });

  if (nativeBtn && typeof navigator.share === "function") {
    nativeBtn.hidden = false;
    nativeBtn.addEventListener("click", () => {
      const verdict = VERDICT_TEXT[state.verdict] || "\u2026";
      navigator
        .share({
          title: "Are we in the singularity yet?",
          text: `Official verdict: ${verdict}. Are we in the singularity yet?`,
          url: "https://leemark.github.io/sing/",
        })
        .catch(() => {});
    });
  }
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    return fallbackCopy(text);
  }
  return fallbackCopy(text);
}

function fallbackCopy(text) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

async function loadHistory() {
  const wrap = $("history");
  const dots = $("history-dots");
  const caption = $("history-caption");
  if (!wrap || !dots || !caption) return;
  try {
    const res = await fetch("history.json", { cache: "no-store" });
    if (!res.ok) return;
    const hist = await res.json();
    const entries = Array.isArray(hist.entries) ? hist.entries : [];
    if (!entries.length) return;
    wrap.hidden = false;
    const last = entries.slice(-30);
    for (const e of last) {
      const dot = document.createElement("span");
      dot.className = "history-dot";
      dot.dataset.verdict = ["no", "not_yet", "yes"].includes(e.verdict) ? e.verdict : "unknown";
      const when = e.generated_at ? new Date(e.generated_at) : null;
      const dateStr = Number.isFinite(when?.getTime())
        ? when.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : "unknown date";
      const conf = Number.isFinite(e.confidence) ? ` \u00b7 ${e.confidence}%` : "";
      dot.title = `${dateStr} \u2014 ${VERDICT_TEXT[e.verdict] || "?"}${conf}`;
      dots.append(dot);
    }
    const latest = entries[entries.length - 1];
    dots.setAttribute(
      "aria-label",
      `Verdict history: ${entries.length} research runs, latest ${VERDICT_TEXT[latest.verdict] || "?"}`
    );
    caption.textContent = `Verdict history \u00b7 ${entries.length} research run${entries.length === 1 ? "" : "s"}`;
    fillStats(entries);
  } catch {
    wrap.hidden = true;
  }
}

function initShader() {
  const canvas = $("bg");
  if (!canvas) return null;

  shader = createSingularity(canvas, {
    onUnsupported() {
      document.body.classList.add("hero-fallback");
    },
  });

  if (!shader) {
    document.body.classList.add("hero-fallback");
    return null;
  }

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const progress = Math.min(1, window.scrollY / window.innerHeight);
      shader.setScroll(progress);
      const fade = Math.min(1, Math.max(0, (progress - 0.18) / 0.55));
      canvas.style.opacity = String(1 - fade);
      if (!CSS.supports("animation-timeline: scroll()")) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        document.documentElement.style.setProperty(
          "--progress",
          max > 0 ? String(window.scrollY / max) : "0"
        );
      }
      ticking = false;
    });
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  return shader;
}

document.documentElement.classList.add("js");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(pointer: fine)").matches;

function setupPreloader(dataReady) {
  const pre = $("preloader");
  const countEl = $("preloader-count");
  if (!pre || !countEl) {
    document.documentElement.classList.remove("booting");
    return;
  }
  if (reduceMotion) {
    document.documentElement.classList.remove("booting");
    return;
  }
  const DURATION = 950;
  const start = performance.now();
  let finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    countEl.textContent = "100";
    Promise.resolve(dataReady).then(() => {
      setTimeout(() => {
        document.documentElement.classList.remove("booting");
        pre.classList.add("done");
        setTimeout(() => pre.classList.add("hide"), 750);
      }, 150);
    });
  }
  requestAnimationFrame(function tick(now) {
    const p = Math.min(1, (now - start) / DURATION);
    countEl.textContent = String(Math.round(p * 100));
    if (p < 1) requestAnimationFrame(tick);
    else finish();
  });
}

function setupCursor() {
  if (reduceMotion || !finePointer) return;
  const ring = $("cursor-ring");
  if (!ring) return;
  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;
  let tx = x;
  let ty = y;
  let raf = 0;
  let idleFrames = 0;
  function loop() {
    const dx = tx - x;
    const dy = ty - y;
    x += dx * 0.16;
    y += dy * 0.16;
    ring.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && ++idleFrames > 30) {
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(loop);
  }
  window.addEventListener(
    "pointermove",
    (e) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!ring.classList.contains("is-on")) {
        x = tx;
        y = ty;
        ring.classList.add("is-on");
      }
      const hot = e.target.closest && e.target.closest("a, button, summary, .source-card, .signal-card");
      ring.classList.toggle("is-hot", !!hot);
      idleFrames = 0;
      if (!raf) raf = requestAnimationFrame(loop);
    },
    { passive: true },
  );
}

function setupMagnetic() {
  if (reduceMotion || !finePointer) return;
  document.querySelectorAll(".share-btn").forEach((btn) => {
    btn.addEventListener("pointermove", (e) => {
      const r = btn.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      btn.style.transform = `translate(${dx * 0.18}px, ${dy * 0.24}px)`;
    });
    btn.addEventListener("pointerleave", () => {
      btn.style.transform = "";
    });
  });
}

function bindTilt(listId, cardSel) {
  const list = $(listId);
  if (!list) return;
  list.addEventListener("pointermove", (e) => {
    const card = e.target.closest(cardSel);
    if (!card) return;
    for (const other of list.querySelectorAll(cardSel)) {
      if (other !== card) {
        other.style.setProperty("--rx", "0deg");
        other.style.setProperty("--ry", "0deg");
      }
    }
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    card.style.setProperty("--ry", `${(px * 7).toFixed(2)}deg`);
    card.style.setProperty("--rx", `${(-py * 6).toFixed(2)}deg`);
  });
  list.addEventListener("pointerleave", () => {
    for (const c of list.querySelectorAll(cardSel)) {
      c.style.setProperty("--rx", "0deg");
      c.style.setProperty("--ry", "0deg");
    }
  });
}

function updateTicker() {
  const track = $("ticker-track");
  if (!track || !state.verdict) return;
  track.innerHTML = "";
  const v = VERDICT_TEXT[state.verdict] || "\u2026";
  const texts = [
    { label: "Are we in the singularity yet?" },
    { verdict: v },
    { label: state.confidence != null ? `${state.confidence}% machine confidence` : "confidence pending" },
    { label: state.dateText ? `researched ${state.dateText}` : "awaiting research" },
    { label: "honest \u00b7 vibes-free \u00b7 occasionally wrong" },
  ];
  for (let g = 0; g < 2; g++) {
    const group = document.createElement("div");
    group.className = "ticker-group";
    for (const item of texts) {
      const span = document.createElement("span");
      span.className = "ticker-item";
      if (item.verdict) {
        const strong = document.createElement("strong");
        strong.textContent = item.verdict;
        span.append(strong);
      } else {
        span.textContent = item.label;
      }
      group.append(span);
      const sep = document.createElement("span");
      sep.className = "ticker-item ticker-sep";
      sep.textContent = "\u2726";
      group.append(sep);
    }
    track.append(group);
  }
}

function fillStats(entries) {
  const days = $("stat-days");
  const runs = $("stat-runs");
  const flips = $("stat-flips");
  if (!days || !runs || !flips || !entries.length) return;
  const first = new Date(entries[0].generated_at).getTime();
  if (Number.isFinite(first)) {
    days.textContent = String(Math.max(1, Math.ceil((Date.now() - first) / 86400000)));
  }
  runs.textContent = String(entries.length);
  let flipCount = 0;
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].verdict !== entries[i - 1].verdict) flipCount++;
  }
  flips.textContent = String(flipCount);
}

const dataPromise = loadData();

initShader();

setupShare();
setupCursor();
setupMagnetic();
bindTilt("source-list", ".source-card");
bindTilt("signal-list", ".signal-card");
setupPreloader(dataPromise);
loadHistory();

dataPromise.then((data) => {
  if (data && shader) {
    shader.setVerdict(data.verdict);
    shader.setConfidence(data.confidence ?? 80);
  }
});

if (reduceMotion) {
  document.documentElement.classList.add("hero-ready");
} else {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.classList.add("hero-ready");
    });
  });
}
