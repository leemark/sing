#!/usr/bin/env node
// Runs the singularity-researcher agent via `opencode run`, validates its
// JSON verdict, writes data.json + history.json, and patches index.html so
// the no-JS page shows the same verdict. Exits non-zero (without writing)
// on any failure so the last good verdict stays in place.
//
// RESEARCH_PATCH_ONLY=1 skips the agent run and just re-patches index.html
// from the existing data.json (useful while developing the UI).

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT_PATH = fileURLToPath(new URL("../data.json", import.meta.url));
const HIST_PATH = fileURLToPath(new URL("../history.json", import.meta.url));
const HTML_PATH = fileURLToPath(new URL("../index.html", import.meta.url));
const MODEL = process.env.RESEARCH_MODEL || "opencode-go/kimi-k3";
const TIMEOUT_MS = Number(process.env.RESEARCH_TIMEOUT_MS) || 10 * 60 * 1000;
const MAX_ENTRIES = 60;

const prompt = [
  "Research and answer now. Today's date is",
  new Date().toISOString().slice(0, 10) + ".",
  "Remember: your entire response must be a single JSON object, nothing else.",
].join(" ");

function runAgent() {
  return new Promise((resolve) => {
    const child = spawn(
      "opencode",
      ["run", "--agent", "singularity-researcher", "--model", MODEL, prompt],
      {
        env: { ...process.env, OPENCODE_ENABLE_EXA: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      console.error("opencode timed out after", TIMEOUT_MS, "ms");
    }, TIMEOUT_MS);

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ error: err, stdout, stderr });
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

// ---------- validation ----------

const VERDICT_TEXT = { no: "NO", not_yet: "NOT YET", yes: "YES" };
const STANCE_TEXT = { for: "leans yes", against: "leans no", mixed: "mixed" };
const VERDICTS = new Set(["no", "not_yet", "yes"]);
const STANCES = new Set(["for", "against", "mixed"]);

function deriveHeadline(rationale) {
  const first = String(rationale).split(/(?<=[.!?])\s+/)[0] || "";
  return first.length > 100 ? first.slice(0, 97).trimEnd() + "\u2026" : first;
}

function validate(data) {
  if (!VERDICTS.has(data.verdict)) {
    console.error("bad verdict:", data.verdict);
    process.exit(1);
  }
  if (typeof data.rationale !== "string" || !data.rationale.trim()) {
    console.error("missing rationale");
    process.exit(1);
  }
  return data;
}

function normalize(data) {
  const confidence = Math.round(Number(data.confidence));
  const headline =
    typeof data.headline === "string" && data.headline.trim()
      ? data.headline.trim().slice(0, 100)
      : deriveHeadline(data.rationale);

  const signals = (Array.isArray(data.signals) ? data.signals : [])
    .filter((s) => s && typeof s.label === "string" && s.label.trim())
    .slice(0, 5)
    .map((s) => ({
      label: s.label.trim().slice(0, 40),
      stance: STANCES.has(s.stance) ? s.stance : "mixed",
      note: typeof s.note === "string" ? s.note.trim().slice(0, 160) : "",
    }));

  const sources = (Array.isArray(data.sources) ? data.sources : [])
    .filter((s) => s && typeof s.title === "string" && /^https?:\/\//.test(s.url || ""))
    .slice(0, 5)
    .map((s) => {
      const src = { title: s.title.trim().slice(0, 200), url: s.url.trim() };
      if (typeof s.publisher === "string" && s.publisher.trim()) {
        src.publisher = s.publisher.trim().slice(0, 60);
      }
      if (typeof s.published === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.published.trim())) {
        src.published = s.published.trim();
      }
      if (typeof s.quote === "string" && s.quote.trim()) {
        src.quote = s.quote.trim().slice(0, 160);
      }
      return src;
    });

  return {
    verdict: data.verdict,
    confidence: Number.isFinite(confidence) ? Math.min(100, Math.max(0, confidence)) : null,
    headline,
    rationale: data.rationale.trim(),
    signals,
    sources,
    generated_at: new Date().toISOString(),
    definition_version: 1,
  };
}

// ---------- history ----------

function appendHistory(data) {
  let hist = { entries: [] };
  try {
    const parsed = JSON.parse(readFileSync(HIST_PATH, "utf8"));
    if (parsed && Array.isArray(parsed.entries)) hist = parsed;
  } catch {
    hist = { entries: [] };
  }
  const day = data.generated_at.slice(0, 10);
  const entry = {
    generated_at: data.generated_at,
    verdict: data.verdict,
    confidence: data.confidence,
    headline: data.headline,
  };
  const last = hist.entries[hist.entries.length - 1];
  if (
    last &&
    last.generated_at.slice(0, 10) === day &&
    last.verdict === data.verdict &&
    last.confidence === data.confidence
  ) {
    hist.entries[hist.entries.length - 1] = entry;
  } else {
    hist.entries.push(entry);
    if (hist.entries.length > MAX_ENTRIES) {
      hist.entries = hist.entries.slice(-MAX_ENTRIES);
    }
  }
  writeFileSync(HIST_PATH, JSON.stringify(hist, null, 2) + "\n");
}
// ---------- index.html patching ----------

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function replaceBetween(html, marker, content) {
  const re = new RegExp(`<!-- ${marker}:START -->[\\s\\S]*?<!-- ${marker}:END -->`);
  if (!re.test(html)) {
    throw new Error(`marker <!-- ${marker}:START --> ... <!-- ${marker}:END --> not found in index.html`);
  }
  return html.replace(re, `<!-- ${marker}:START -->\n${content}\n<!-- ${marker}:END -->`);
}

function validDate(iso) {
  const when = new Date(iso);
  return Number.isFinite(when.getTime()) ? when : null;
}

function fmtLong(iso) {
  const when = validDate(iso);
  return when
    ? when.toLocaleString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "checking the calendar\u2026";
}

function fmtShort(iso) {
  const when = validDate(iso);
  return when
    ? when.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "never";
}

function fmtDay(iso) {
  const when = validDate(iso);
  return when ? when.toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "Today";
}

function fmtArticleDate(published) {
  const when = validDate(`${published}T00:00:00`);
  return when
    ? when.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : published;
}

function confidenceHtml(conf) {
  const svg = `<svg viewBox="0 0 36 36" class="gauge-svg" aria-hidden="true">
        <circle class="gauge-track" cx="18" cy="18" r="15.9" />
        <circle class="gauge-fill" id="gauge-fill" cx="18" cy="18" r="15.9" />
      </svg>`;
  if (conf == null) {
    return `<span class="confidence-badge" id="confidence-badge" hidden role="meter" aria-label="Machine confidence" aria-valuemin="0" aria-valuemax="100">
        ${svg}
        <span class="confidence-num" id="confidence-num">\u2014</span>
      </span>`;
  }
  return `<span class="confidence-badge" id="confidence-badge" data-value="${conf}" role="meter" aria-label="Machine confidence" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${conf}" aria-valuetext="${conf} percent" style="--gauge-progress: ${conf}">
        ${svg}
        <span class="confidence-num" id="confidence-num">${conf}%</span>
      </span>`;
}

function verdictBlockHtml(data) {
  const text = VERDICT_TEXT[data.verdict] || "\u2014";
  const iso = validDate(data.generated_at) ? data.generated_at : "";
  return [
    `<p class="verdict-label">Official verdict, as of</p>`,
    `<time class="verdict-date" id="verdict-date" datetime="${iso}">${fmtLong(data.generated_at)}</time>`,
    `<div class="verdict-answer" id="answer" aria-live="polite">${text}</div>`,
    `<p class="confidence-line">Machine confidence ${confidenceHtml(data.confidence)}</p>`,
    `<p class="researched">`,
    `  <span class="freshness-badge" id="freshness-badge" data-tier="fresh" hidden>Fresh</span>`,
    `  <span id="researched-at">Researched ${fmtLong(data.generated_at)}.</span>`,
    `</p>`,
    `<div class="hero-actions">`,
    `  <button type="button" class="share-btn" id="share-btn"><span class="share-btn-label">Copy verdict</span></button>`,
    `  <button type="button" class="share-btn" id="share-native" hidden>Share&hellip;</button>`,
    `</div>`,
  ].join("\n");
}

function signalHtml(s) {
  const note = s.note ? `\n    <span class="signal-note">${escapeHtml(s.note)}</span>` : "";
  return `  <li class="signal-card" data-stance="${s.stance}">
    <strong class="signal-label">${escapeHtml(s.label)}</strong>${note}
    <span class="signal-stance">${STANCE_TEXT[s.stance]}</span>
  </li>`;
}

function sourceHtml(s) {
  let host = "";
  try {
    host = new URL(s.url).hostname.replace(/^www\./, "");
  } catch {
    host = s.url;
  }
  const meta = [];
  if (s.publisher && s.publisher !== host) meta.push(s.publisher);
  meta.push(host);
  if (s.published) meta.push(fmtArticleDate(s.published));
  const quote = s.quote ? `\n      <span class="source-quote">&ldquo;${escapeHtml(s.quote)}&rdquo;</span>` : "";
  return `  <li class="source-card">
    <a class="source-link" href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">
      <span class="source-favicon" aria-hidden="true">${escapeHtml((host[0] || "?").toUpperCase())}</span>
      <span class="source-body">
        <span class="source-title">${escapeHtml(s.title)}</span>
        <span class="source-meta">${escapeHtml(meta.join(" \u00b7 "))}</span>${quote}
      </span>
    </a>
  </li>`;
}

function patchHtml(data) {
  const html0 = readFileSync(HTML_PATH, "utf8");
  const text = VERDICT_TEXT[data.verdict] || "\u2014";

  let html = html0.replace(
    /(<html lang="en" data-verdict=")[^"]*(">)/,
    `$1${data.verdict}$2`,
  );

  html = replaceBetween(
    html,
    "DATA",
    `<script type="application/json" id="bootstrap-data">${JSON.stringify(data).replace(/<\//g, "<\\/")}</script>`,
  );

  html = replaceBetween(
    html,
    "OG",
    [
      `<meta property="og:title" content="Are We In The Singularity Yet? \u2014 ${escapeHtml(text)}" />`,
      `<meta property="og:description" content="${escapeHtml(data.headline)}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:url" content="https://leemark.github.io/sing/" />`,
      `<meta name="twitter:card" content="summary" />`,
      `<meta name="twitter:title" content="Are We In The Singularity Yet? \u2014 ${escapeHtml(text)}" />`,
      `<meta name="twitter:description" content="${escapeHtml(data.headline)}" />`,
    ].join("\n"),
  );

  html = replaceBetween(html, "VERDICT", verdictBlockHtml(data));
  html = replaceBetween(html, "HEADLINE", `<p class="headline" id="headline">${escapeHtml(data.headline)}</p>`);
  html = replaceBetween(
    html,
    "SIGNALS",
    data.signals.length
      ? `<ul class="signal-list" id="signal-list">\n${data.signals.map(signalHtml).join("\n")}\n</ul>`
      : `<ul class="signal-list" id="signal-list" hidden></ul>`,
  );
  html = replaceBetween(
    html,
    "RATIONALE",
    `<blockquote id="rationale" class="rationale">${escapeHtml(data.rationale)}</blockquote>`,
  );
  html = replaceBetween(html, "SOURCES", data.sources.map(sourceHtml).join("\n"));
  html = replaceBetween(
    html,
    "TODAY",
    `<time class="timeline-date" id="timeline-today-date">${fmtDay(data.generated_at)}</time>
<div class="timeline-body">
  <strong>The machine reports</strong>
  <p class="timeline-verdict" id="timeline-today-verdict">${text}</p>
</div>`,
  );
  html = replaceBetween(
    html,
    "META",
    `<p class="methodology-meta">
  Last research:
  <time id="updated" datetime="${validDate(data.generated_at) ? data.generated_at : ""}">${fmtShort(data.generated_at)}</time>
  &middot;
  <a href="https://github.com/leemark/sing" target="_blank" rel="noopener">source code</a>
</p>`,
  );

  writeFileSync(HTML_PATH, html);
}

// ---------- main ----------

if (process.env.RESEARCH_PATCH_ONLY === "1") {
  const existing = JSON.parse(readFileSync(OUT_PATH, "utf8"));
  validate(existing);
  const normalized = normalize(existing);
  normalized.generated_at = existing.generated_at;
  patchHtml(normalized);
  console.log("patched index.html from data.json (patch-only mode)");
  process.exit(0);
}

const result = await runAgent();

if (result.error) {
  console.error("failed to launch opencode:", result.error.message);
  process.exit(1);
}
if (result.code !== 0) {
  console.error("opencode exited with code", result.code, "signal", result.signal);
  if (result.stdout.trim()) console.error("stdout tail:\n" + result.stdout.slice(-3000));
  if (result.stderr.trim()) console.error("stderr tail:\n" + result.stderr.slice(-3000));
  process.exit(1);
}

const stdout = result.stdout.trim();

const start = stdout.indexOf("{");
const end = stdout.lastIndexOf("}");
if (start === -1 || end <= start) {
  console.error("no JSON object found in output:\n", stdout.slice(0, 4000));
  process.exit(1);
}

let data;
try {
  data = JSON.parse(stdout.slice(start, end + 1));
} catch (err) {
  console.error("invalid JSON:", err.message);
  console.error(stdout.slice(0, 4000));
  process.exit(1);
}

validate(data);

const output = normalize(data);

writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + "\n");
appendHistory(output);
patchHtml(output);

console.log("wrote", OUT_PATH);
console.log(JSON.stringify(output, null, 2));
