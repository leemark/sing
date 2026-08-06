import { createSingularity } from "./singularity.js";

const VERDICT_TEXT = {
  no: "NO",
  not_yet: "NOT YET",
  yes: "YES",
};

const FALLBACK_NOTE = "Research pipeline resting \u2014 the machines are not currently answering.";

const $ = (id) => document.getElementById(id);

const answerEl = $("answer");
const dateEl = $("verdict-date");
const researchedEl = $("researched-at");
const badgeEl = $("confidence-badge");
const numEl = $("confidence-num");
const rationaleEl = $("rationale");
const sourcesMuted = $("sources-muted");
const sourceList = $("source-list");
const updatedEl = $("updated");
const todayDate = $("timeline-today-date");
const todayVerdict = $("timeline-today-verdict");

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.round(diff / 60000);
  if (mins < 60) return mins <= 1 ? "just now" : `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function renderVerdict(verdict) {
  const text = VERDICT_TEXT[verdict] || "\u2026";
  answerEl.classList.toggle("answer-pending", !VERDICT_TEXT[verdict]);
  answerEl.textContent = text;
  document.documentElement.dataset.verdict = verdict || "not_yet";
  todayVerdict.textContent = text;
}

function renderConfidence(confidence) {
  if (confidence == null || !Number.isFinite(confidence)) {
    badgeEl.hidden = true;
    return;
  }
  badgeEl.hidden = false;
  numEl.textContent = `${confidence}%`;
  badgeEl.style.setProperty("--gauge-progress", confidence);
}

function renderSources(sources) {
  if (!sources || !sources.length) {
    sourcesMuted.textContent = "When the daily agent has filed a report, its cited sources appear here.";
    return;
  }
  sourcesMuted.textContent = "Cited by today\u2019s research agent, in its own words:";
  sources.forEach((s, i) => {
    const li = document.createElement("li");
    li.className = "source-card";
    li.style.setProperty("--card-anchor", `--source-${i}`);

    const link = document.createElement("a");
    link.className = "source-link";
    link.href = s.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    let host = "";
    try {
      host = new URL(s.url).hostname.replace(/^www\./, "");
    } catch {
      host = s.url;
    }

    const favicon = document.createElement("span");
    favicon.className = "source-favicon";
    favicon.textContent = (host[0] || "?").toUpperCase();

    const title = document.createElement("span");
    title.className = "source-title";
    title.textContent = s.title;

    const domain = document.createElement("span");
    domain.className = "source-domain";
    domain.textContent = host;

    const preview = document.createElement("span");
    preview.className = "source-preview";
    preview.textContent = `${s.title} \u2014 ${host}`;

    link.append(favicon, title, domain);
    li.append(link, preview);
    sourceList.append(li);
  });
}

function renderFreshness(data, fresh) {
  const ago = timeAgo(data.generated_at);
  if (fresh) {
    researchedEl.textContent = ago ? `Researched ${ago} by an agent with web access.` : "Researched just now by an agent with web access.";
  } else {
    researchedEl.textContent = `This verdict is from ${ago || "an earlier run"} \u2014 the research pipeline is resting.`;
  }
}

async function loadData() {
  let data = null;
  try {
    const res = await fetch("data.json", { cache: "no-store" });
    if (res.ok) data = await res.json();
  } catch {
    data = null;
  }

  if (!data || typeof data.verdict !== "string") {
    researchedEl.textContent = FALLBACK_NOTE;
    return null;
  }

  const fresh =
    Number.isFinite(new Date(data.generated_at).getTime()) &&
    Date.now() - new Date(data.generated_at).getTime() < 48 * 3600 * 1000;

  renderVerdict(data.verdict);
  renderConfidence(data.confidence);
  renderSources(data.sources);

  const when = new Date(data.generated_at);
  if (Number.isFinite(when.getTime())) {
    dateEl.textContent = when.toLocaleString([], {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    dateEl.dateTime = data.generated_at;
    updatedEl.textContent = when.toLocaleString();
    updatedEl.dateTime = data.generated_at;
    todayDate.textContent = when.toLocaleDateString([], { month: "short", year: "numeric" });
  }

  if (typeof data.rationale === "string" && data.rationale.trim()) {
    rationaleEl.textContent = data.rationale;
  }

  renderFreshness(data, fresh);
  return data;
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
      canvas.style.opacity = String(Math.max(0, 1 - progress * 1.15));
      ticking = false;
    });
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  return shader;
}

const dataPromise = loadData();
let shader = null;

initShader();

dataPromise.then((data) => {
  if (data && shader) {
    shader.setVerdict(data.verdict);
    shader.setConfidence(data.confidence ?? 80);
  }
});
