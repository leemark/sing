# PLAN-UX — Implementation handoff

**For:** coding agent (DeepSeek V4 Flash or equivalent)  
**Repo:** https://github.com/leemark/sing  
**Live:** https://leemark.github.io/sing/  
**Date of plan:** 2026-08-22  
**Supersedes for UX work:** treat this doc as the implementation source of truth for the redesign. Keep `PLAN.md` for historical context and hard constraints; where they conflict on *product* decisions, **this file wins**. Engineering constraints in §0 still apply.

Read this entire document before writing code. Implement phases in order. Do not skip acceptance criteria.

---

## 0. Non-negotiable constraints

1. **Zero build step, zero runtime npm dependencies** for the site. No React, Vue, Svelte, three.js, bundlers, CDNs, or webfonts that block render. System font stack only (already in `styles.css`).
2. **Static files only:** `index.html`, `styles.css`, `app.js`, `singularity.js`, `data.json`, optional `history.json`. Serve with `python3 -m http.server` or any static host.
3. **Progressive enhancement:** content readable with JS disabled (critical verdict data must be **inlined in HTML** at research time — see Phase 1). WebGL optional. `prefers-reduced-motion` respected.
4. **Performance budget:** total initial payload ≤ 150 KB (stretch ≤ 80 KB for core HTML/CSS/JS). Shader steady 60 fps on mid-range laptop; pause when tab hidden or canvas offscreen; clamp `devicePixelRatio` ≤ 2. Adaptive resolution already exists in `singularity.js` — keep it.
5. **Accessibility:** semantic landmarks, text verdict not canvas-only, keyboard sources, visible `:focus-visible`, AA contrast on all text over the animated hero (scrims required), skip link, proper live regions / meter roles where specified.
6. **No light mode.** Dark only.
7. **No analytics, cookies, tracking, backend, WebGPU.**
8. **Do not commit secrets.** Research auth stays local (`~/.local/share/opencode/auth.json`).
9. **Do not add comments** unless the existing file already uses them for section headers; match existing style. Prefer no new comment noise.
10. **Do not rewrite the particle engine from scratch** unless a task explicitly says so. Enhance in place.

### Voice / copy tone

Serious-but-wry. Honest. Vibes-free. Occasionally wrong. Short sentences. No corporate AI hype. No emoji spam (favicon 🕳️ is fine).

### Definition of “the singularity” (product copy — keep consistent)

> A point where AI systems recursively self-improve beyond human ability to understand or control, causing runaway, irreversible change to civilization.

---

## 1. Current codebase map

| File | Lines (approx) | Role |
|------|----------------|------|
| `index.html` | 139 | Single-page shell: hero, evidence, sources, forecast, methodology |
| `styles.css` | 622 | OKLCH tokens, verdict palettes, layout, scroll-driven anims |
| `app.js` | 198 | `fetch(data.json)`, DOM bind, shader scroll wiring |
| `singularity.js` | 496 | WebGL2 instanced particle accretion disk |
| `data.json` | — | Live research payload (committed) |
| `scripts/research.mjs` | 111 | Runs agent → validates → writes `data.json` |
| `scripts/update.sh` | 18 | Research + commit + push if changed |
| `.opencode/agent/singularity-researcher.md` | 39 | Agent prompt + JSON schema |
| `.github/workflows/pages.yml` | 34 | Deploy entire repo root to GitHub Pages |
| `AGENTS.md` | — | Vision agent + headless WebGL test notes + pipeline |
| `PLAN.md` | 186 | Original redesign plan (partially implemented) |

**There is no root `package.json` for the site.** Do not add one for the frontend.

**Ops reality (important):** Research is **on-demand** via `scripts/update.sh`, not a daily GitHub Actions cron. Footer copy currently lies (“Every day at 06:00 UTC”). Fix that in Phase 1.

**Shader reality:** Shipped code is a **particle accretion disk**, not a raymarched black hole. Own that in copy (“data-reactive accretion field” / “real-time singularity artwork”). Do not promise raymarching unless you implement it (out of scope).

### data.json today

```json
{
  "verdict": "no" | "not_yet" | "yes",
  "confidence": 0-100,
  "rationale": "string",
  "sources": [{ "title": "...", "url": "https://..." }],
  "generated_at": "ISO-8601"
}
```

### Public API of `singularity.js` (keep stable)

```js
createSingularity(canvas, { onUnsupported }) → {
  setVerdict(v),   // "no" | "not_yet" | "yes"
  setConfidence(c), // 0-100
  setScroll(s),     // 0-1
  destroy()
} | null
```

### How to verify locally

```bash
# From repo root
python3 -m http.server 8080
# Open http://127.0.0.1:8080/

# Research (needs local opencode auth + network) — only when testing pipeline
# OPENCODE_ENABLE_EXA=1 node scripts/research.mjs
```

Headless WebGL notes: see `AGENTS.md` (Playwright + SwiftShader). Use if changing the shader; optional for pure HTML/CSS work.

Visual QA: if screenshots exist under `context/visuals/`, use the vision subagent; do not guess pixels.

---

## 2. Product north star

> A **ceremonial status page** for one question: *Are we in the singularity yet?*  
> Open → feel the gravity well → read a clear answer → understand *why* in ~30 seconds → leave knowing when it was checked and how to verify.  
> The black hole is not decoration; it is the **mood of the answer**.

### Scroll story (target IA)

```
HERO       Question · definition chip · giant verdict · confidence · freshness · share · scroll cue
WHY        One-line headline · for/against signals · full rationale
SOURCES    Briefing cards (publisher, date, quote)
CONTEXT    Forecast timeline (curated history → machine today)
METHOD     Honest pipeline · last run · history sparkline · repo link
```

### Success metrics (acceptance bar for “done”)

| Metric | Target |
|--------|--------|
| Time-to-verdict readable | &lt; 2s, including no-JS |
| Why understandable on mobile | &lt; 15s scan |
| Lighthouse Performance | ≥ 95 |
| Lighthouse Accessibility | 100 |
| Lighthouse Best Practices | ≥ 95 |
| Payload (HTML+CSS+JS+JSON gzipped if measurable, else raw) | ≤ 150 KB |
| Contrast | WCAG AA for all text over hero |
| Trust | User can state last research time + definition after one visit |

---

## 3. Phased implementation

Do phases **1 → 2 → 3 → 4 → 5 → 6** in order. Each phase ends with a checklist. Commit-worthy units are per phase (human will commit; **do not commit unless asked**).

---

### Phase 1 — Trust & truth

**Goal:** Stop lying; make the answer correct without JS; freshness obvious.

#### 1.1 Fix methodology copy (`index.html`)

Replace the “Every day at 06:00 UTC / scheduled workflow” paragraph with honest copy, e.g.:

> An OpenCode agent with web search researches the question on demand and writes a JSON verdict — `no`, `not_yet`, or `yes` — with confidence, rationale, and sources. When the verdict file changes, this page updates. The artwork above is a real-time singularity field whose colors follow the verdict. This is honest, vibes-free, and occasionally wrong.

Link repo + keep “Last research: `<time>`”.

Also fix meta description if it says “researched daily”:

```html
<meta name="description" content="Are we in the singularity yet? A machine-researched status report with a data-reactive singularity visualization." />
```

Fix agent-note in evidence section similarly (no “each day” unless scheduling returns).

#### 1.2 Freshness tiers (`app.js` + CSS)

Replace binary 48h fresh/stale with three tiers based on `generated_at`:

| Tier | Age | UI |
|------|-----|-----|
| `fresh` | &lt; 24 hours | “Researched N ago…” neutral/positive |
| `aging` | 1–7 days | Badge “Aging” + “Researched N ago — not from today” |
| `resting` | &gt; 7 days or invalid date | Badge “Pipeline resting” + stronger muted treatment |

Add a visible badge element in the hero, e.g. `#freshness-badge`, with `data-tier="fresh|aging|resting"`. Style with OKLCH; resting should not look like an error panic, just honest.

Keep rendering the last known verdict even when resting (do not blank the answer).

#### 1.3 Inline critical data for no-JS

**Problem:** Defaults in HTML say NOT YET / 80% even when `data.json` differs or JS is off.

**Solution:** Extend `scripts/research.mjs` so after writing `data.json` it also **patches `index.html`** (or writes a tiny inline block) with the critical fields.

Recommended approach — **SSR-lite markers in `index.html`:**

```html
<!-- DATA:START -->
<script type="application/json" id="bootstrap-data">
  …exact contents of data.json…
</script>
<!-- DATA:END -->
```

Place `#bootstrap-data` in `<head>` or end of `<body>` before `app.js`.

Also mirror into visible DOM defaults so no-JS users see truth:

- `#answer` text from verdict map
- `#confidence-num` and gauge progress
- `#rationale` text
- `#verdict-date` / `datetime`
- `html[data-verdict]`
- Optional: static source list as real `<li><a>` in HTML inside `#source-list` (research script regenerates that block between markers `<!-- SOURCES:START -->` … `<!-- SOURCES:END -->`)

**`app.js` load order:**

1. Try parse `#bootstrap-data` immediately (sync) → render (no flash of wrong defaults).
2. `fetch('data.json', { cache: 'no-store' })` → if newer/different, re-render.
3. If both fail, show explicit pipeline error state (see 1.4) — **do not** pretend confidence 80.

Research script must update markers with careful string replace (regex on `<!-- DATA:START -->[\s\S]*?<!-- DATA:END -->`). Fail the script if markers missing.

#### 1.4 Error / invalid state

If no valid verdict:

- `#answer` → “UNKNOWN” or “—”  
- Badge: “No verdict”  
- Rationale: short honest message  
- Do **not** leave joke copy that looks like a real research result  
- `data-verdict="not_yet"` only as neutral theme fallback, or introduce `data-verdict="unknown"` with muted grey tokens (preferred)

#### 1.5 Definition chip

In hero, under the H1 (or under eyebrow), add:

```html
<p class="definition" id="definition">
  <span class="definition-label">Working definition</span>
  …
</p>
```

Keep definition text short enough for mobile (2 lines ideal). Link “full definition” is optional — if used, anchor to methodology subsection that restates it.

#### 1.6 Open Graph / social meta

Add to `<head>`:

- `og:title`, `og:description`, `og:type`, `og:url` (`https://leemark.github.io/sing/`)
- `twitter:card` = `summary_large_image` if you add an image, else `summary`
- Optional static `og:image` — if no image asset exists, skip image rather than inventing a broken URL. Prefer adding a simple committed `og.png` only if you can generate one without new deps (otherwise skip image this phase).

Research script may update `og:title` / description to include current verdict string when patching HTML.

#### Phase 1 acceptance

- [ ] Methodology matches on-demand ops  
- [ ] Meta description not claiming daily research  
- [ ] Freshness badge shows correct tier for ages 1h / 3d / 14d (test by temporarily editing `generated_at` in bootstrap)  
- [ ] With JS disabled, verdict/confidence/rationale match last `data.json`  
- [ ] `node scripts/research.mjs` still validates and writes `data.json` + patches HTML markers  
- [ ] Invalid/missing data shows non-fake error state  

---

### Phase 2 — Hero ceremony & legibility

**Goal:** Award-screenshot first screen; AA contrast; controlled motion.

#### 2.1 Scrim panels (critical)

Wrap hero text blocks that sit over the canvas in scrim containers:

```html
<header class="hero">
  <div class="hero-scrim hero-scrim--main">
    … eyebrow, h1, definition …
  </div>
  <div class="hero-scrim hero-scrim--verdict">
    … label, date, answer, confidence, freshness, share …
  </div>
  …
</header>
```

CSS requirements:

- Background: `color-mix` / solid `var(--scrim)` fallback **and** `@supports (backdrop-filter: blur(12px))` enhanced glass  
- Padding sufficient that text never touches particle brightness unprotected  
- Max-width readable (~36–40rem for prose bits; verdict can be wider)  
- Border subtle: `color-mix(in oklch, var(--v-mid) 25%, transparent)`  
- Border-radius using `--radius`  
- Ensure muted text (`--muted`) still passes AA on scrim (darken scrim if needed)

#### 2.2 Heading hierarchy & a11y

- Giant verdict: use `<p class="verdict-answer" id="answer" role="status" aria-live="polite">` or keep div but ensure an accessible name; prefer **not** stealing `h1` (question stays `h1`).  
- Confidence: wrap as a meter:

```html
<div class="confidence-badge" id="confidence-badge"
     role="meter"
     aria-label="Machine confidence"
     aria-valuemin="0"
     aria-valuemax="100"
     aria-valuenow="85"
     aria-valuetext="85 percent">
```

Update `aria-valuenow` / `aria-valuetext` in `renderConfidence`.

- Add skip link as first focusable in body:

```html
<a class="skip-link" href="#evidence">Skip to evidence</a>
```

Style: visually hidden until `:focus`.

#### 2.3 Load choreography

Respect `prefers-reduced-motion: reduce` → show final state immediately, no staged delays.

Otherwise (CSS-first preferred):

1. Hero content starts `opacity: 0` / slight translate (via class on `html` or `.hero`)  
2. Canvas may already animate  
3. After short delay (~400–900ms) or `requestAnimationFrame` double-tick, add `.hero-ready` to reveal scrims and verdict  
4. Optional subtle scale on `#answer` using CSS transition only  

Do **not** block content rendering on WebGL init. Bootstrap data must paint first; ceremony is enhancement.

Use `@starting-style` where helpful for dynamic nodes; always provide non-supporting path (default visible).

#### 2.4 Scroll behavior fix

Current code fades canvas with scroll and may fade hero content via scroll-driven animation. Change:

- Canvas opacity/zoom: keep, but start fade only after ~0.15–0.25 scroll progress so the hero stays solid while still in view  
- **Do not** fade hero text opacity to unreadable while the verdict is still on screen. Prefer sticky hero content until it scrolls off, or fade only the canvas  
- Inspect `styles.css` for `animation-timeline: scroll` on `.hero` — remove or soften any rule that drops hero text below readable opacity mid-viewport  

#### 2.5 Copy: own the particle aesthetic

Replace “real-time black hole” wording with accurate language, e.g. “data-reactive singularity artwork” or “accretion field.”

#### 2.6 Shader polish (incremental — stay in `singularity.js`)

Do **not** rewrite architecture. Allowed improvements:

1. Slightly stronger photon-ring contrast  
2. On `setVerdict`, brief chaos/brightness pulse (~0.8s lerp) then settle  
3. Ensure reduced-motion still renders **one** handsome static frame (not black)  
4. Optional: very subtle background starfield if cost stays negligible and FPS holds  

Do **not** add sound. Do **not** add deviceOrientation without permission UX — skip touch gyro this phase; pointer parallax stays.

Keep public API unchanged.

#### Phase 2 acceptance

- [ ] All hero text AA against scrim (manual check + aim Lighthouse a11y 100)  
- [ ] Skip link works  
- [ ] Meter roles update with data  
- [ ] Reduced-motion: no bobbing, no staged delay, static shader frame  
- [ ] Hero text remains readable until scrolled away  
- [ ] Payload still under budget  

---

### Phase 3 — Information architecture & schema v2

**Goal:** Why-in-15-seconds; sources feel like a briefing.

#### 3.1 Schema v2 (`data.json`)

Backward compatible: old fields required; new fields optional with UI fallbacks.

```json
{
  "verdict": "no" | "not_yet" | "yes",
  "confidence": 0-100,
  "headline": "≤80 chars, one-line summary",
  "rationale": "2-5 sentences",
  "signals": [
    {
      "label": "≤40 chars",
      "stance": "for" | "against" | "mixed",
      "note": "≤160 chars"
    }
  ],
  "sources": [
    {
      "title": "string",
      "url": "https://...",
      "publisher": "optional string",
      "published": "optional ISO date YYYY-MM-DD",
      "quote": "optional ≤160 chars"
    }
  ],
  "generated_at": "ISO-8601",
  "definition_version": 1
}
```

**Limits to enforce in `research.mjs`:**

- `headline`: string, trim, max 100 chars; if missing, derive first sentence of rationale truncated  
- `signals`: array max 5, min 0; each stance enum; if missing, UI hides signals block  
- `sources`: max 5; require title+url; optional fields stripped if invalid  
- `quote` max 160; `publisher` max 60  

#### 3.2 Update researcher agent

Edit `.opencode/agent/singularity-researcher.md` output schema to request `headline`, `signals` (3–5 items balancing for/against when possible), and richer `sources` with `publisher`, `published` when known, and `quote` (short factual excerpt, not invented).

Keep entire response JSON-only rule.

#### 3.3 Evidence section structure (`index.html` + `app.js`)

```
section#evidence
  h2 Why this verdict
  p#headline.headline
  ul#signal-list.signal-list   (empty if no signals)
  div#rationale.rationale      (full prose; not necessarily blockquote)
  p.agent-note
```

**Signals UI:** each item a card/chip with stance color:

- `for` → leans toward “we’re in it” (use warm/alarm-tinged accent carefully — or left border)  
- `against` → leans toward not in it (cooler)  
- `mixed` → neutral border  

Mobile: stack vertically. Desktop: simple grid `auto-fit minmax(16rem, 1fr)`.

#### 3.4 Sources redesign

Each source card shows:

1. Letter favicon (keep — no external favicon network dependency preferred for privacy/perf) **or** publisher initial  
2. Title  
3. Publisher · domain · published date (if present)  
4. Quote in muted italic if present  
5. Entire card is still one `<a>` or card with clear link (prefer one main link for simplicity)

Hover preview (anchor positioning if supported): show **quote** or title+publisher — not duplicate of the same three lines only.

`renderSources` must clear previous children before re-render (bug risk if called twice — fix if not already).

#### 3.5 Forecast timeline

Keep Vinge 1993 and Kurzweil 2005.

Replace vague “Forecasters today” body with tighter curated copy that cites real public numbers **with an “as of” year in the static HTML** (you may use LEAP / Metaculus-style ranges from current knowledge but **do not fabricate precise live API numbers**). Example shape:

> **2024–2026 forecasting**  
> Community and expert aggregates still place full automation of AI research years out; median AGI estimates vary widely. The threshold used here has not been crossed.

Machine row stays dynamic from data.

Optional fourth historical row only if it earns space — don’t bloat.

#### 3.6 Desktop section dots (optional, keep minimal)

A fixed right-edge or left-edge dot nav linking `#top`, `#evidence`, `#sources`, `#forecast`, methodology — only `min-width: 60rem`, `aria-label="Sections"`, keyboard accessible. Hide on mobile. Skip if time-boxed; not required for phase pass.

#### Phase 3 acceptance

- [ ] v1 `data.json` without new fields still renders cleanly  
- [ ] v2 with signals/headline/quotes renders briefing layout  
- [ ] Researcher prompt + `research.mjs` validation agree  
- [ ] Sources list re-render safe  
- [ ] Mobile: signals readable without horizontal scroll  

---

### Phase 4 — Share, history, return visits

**Goal:** Ritual + reason to come back. Still static.

#### 4.1 Share control

In hero scrim (near freshness):

```html
<button type="button" class="share-btn" id="share-btn">Copy verdict</button>
```

On click, copy text like:

```
NOT YET · 85% confidence · 8 Aug 2026
Are we in the singularity yet?
https://leemark.github.io/sing/
```

- Prefer `navigator.clipboard.writeText`  
- Fallback: `execCommand('copy')` or temporary textarea  
- If `navigator.share` exists **and** user is on coarse pointer, optional share sheet — still offer copy  
- Button feedback: “Copied” for 2s via `aria-live` polite polite region or button text swap  
- Not a form; no network  

#### 4.2 Verdict history

**File:** `history.json`

```json
{
  "entries": [
    {
      "generated_at": "ISO-8601",
      "verdict": "not_yet",
      "confidence": 85,
      "headline": "optional"
    }
  ]
}
```

**`research.mjs`:** after successful research:

1. Read existing `history.json` or `{ entries: [] }`  
2. Append new entry  
3. Deduplicate if same calendar day UTC and same verdict+confidence (update in place)  
4. Cap at last **60** entries  
5. Write pretty JSON  

**UI:** In methodology footer, a compact row of dots or a tiny sparkline (pure CSS/SVG, no chart lib):

- Each entry = segment colored by verdict token  
- `aria-label` summarizing last N verdicts  
- On hover/focus title tooltip: date + verdict + confidence  

`app.js` fetches `history.json` optionally; failure → hide history widget.

#### 4.3 “What would YES mean?”

Collapsible in methodology or evidence bottom:

```html
<details class="criteria">
  <summary>What would a YES require?</summary>
  <ul>…editorial criteria matching the definition…</ul>
</details>
```

Static editorial content (not from agent). 3–5 bullets. No jokes that undermine seriousness.

#### 4.4 Deep links

Ensure section ids stable: `#top`, `#evidence`, `#sources`, `#forecast`, and add `#method` on footer. No router.

#### Phase 4 acceptance

- [ ] Copy verdict works on Chromium + Firefox  
- [ ] History grows on research script run; capped  
- [ ] History UI hidden gracefully if file missing  
- [ ] Details/summary keyboard accessible  

---

### Phase 5 — Craft, a11y finish, deploy hygiene

#### 5.1 CSS craft checklist

- [ ] `text-wrap: balance` headings; `pretty` on rationale  
- [ ] `@supports` guards for anchor positioning, backdrop-filter, scroll-driven animations  
- [ ] Default state without scroll-driven anims = content visible (not opacity 0 forever)  
- [ ] `:focus-visible` uses verdict accent  
- [ ] Selection color: subtle `var(--v-mid)`  
- [ ] Print stylesheet: hide canvas, show verdict + headline + rationale + sources + date in black on white  
- [ ] Container queries on source list if not already solid  

#### 5.2 Pages deploy artifact

Update `.github/workflows/pages.yml` to upload **only public site files**, not `.opencode/`, `scripts/`, `context/`, etc.

Options:

A. **Preferred:** add a `site/` directory — **only if** you also update all paths and research script outputs. Larger move.  

B. **Simpler:** build a staging folder in the workflow:

```yaml
- name: Prepare site bundle
  run: |
    mkdir -p _site
    cp index.html styles.css app.js singularity.js data.json _site/
    cp history.json _site/ 2>/dev/null || true
    cp og.png _site/ 2>/dev/null || true
- uses: actions/upload-pages-artifact@v3
  with:
    path: _site
```

Use B unless user asked for `site/` move.

#### 5.3 README

Add root `README.md` (user-facing, short):

- One-paragraph concept  
- Live URL  
- Local serve command  
- How to refresh research (`./scripts/update.sh`)  
- Constraints blurb (static, no build)  
- Link to this plan optional  

#### 5.4 Lighthouse pass

Run against local server; fix issues you introduce. Targets in §2.

#### Phase 5 acceptance

- [ ] Deploy artifact is lean  
- [ ] README exists  
- [ ] Print preview usable  
- [ ] Lighthouse targets met or document blockers  

---

### Phase 6 — Final QA matrix

Test manually:

| Case | Expected |
|------|----------|
| Cold load | Bootstrap data paints correct verdict before/without waiting fetch |
| JS disabled | Correct verdict, rationale, sources visible |
| WebGL disabled | CSS artist singularity; scrims still legible |
| `prefers-reduced-motion` | No continuous motion; no entrance delay traps |
| 360px width | No horizontal scroll; verdict wraps; signals stack |
| Keyboard only | Skip link, sources, share, details, section dots |
| Stale `generated_at` 14d | Resting badge; verdict still shown |
| Corrupt JSON in fetch | Bootstrap remains; no crash |
| Missing `history.json` | No console hard failure; widget hidden |
| Verdict `yes` / `no` / `not_yet` | Palette + shader + copy all coherent (toggle bootstrap for test) |

Do not leave test-only edits in committed `data.json`.

---

## 4. File-level task checklist (quick index)

| File | Phases | Changes |
|------|--------|---------|
| `index.html` | 1–5 | Scrims, definition, badges, share, signals markup, markers, meta, skip link, criteria, ids, bootstrap |
| `styles.css` | 1–5 | Scrims, tiers, signals, share btn, history, print, skip-link, hero motion, remove bad fades |
| `app.js` | 1–4 | Bootstrap parse, freshness tiers, schema v2 render, share, history fetch, a11y attrs, scroll fade tweak |
| `singularity.js` | 2 | Pulse on verdict, ring polish, static frame quality |
| `data.json` | 3 | May gain fields after next research; hand-edit sample for UI dev OK |
| `history.json` | 4 | Created by script |
| `scripts/research.mjs` | 1,3,4 | Validate v2; patch HTML; append history |
| `.opencode/agent/singularity-researcher.md` | 3 | New JSON fields |
| `.github/workflows/pages.yml` | 5 | Lean artifact |
| `README.md` | 5 | New |
| `PLAN.md` | — | Do not delete; optional note at top pointing to PLAN-UX.md |

---

## 5. Explicit non-goals (do not implement)

- Framework migration or bundler  
- WebGPU / three.js / external shader libs  
- Light mode  
- Sound  
- User accounts, comments, newsletter  
- Live Metaculus API pulls  
- Multi-page app  
- Fake “live visitor” or stock tickers  
- Replacing particle disk with full raymarcher (unless separate explicit project)  
- Scheduled GitHub research workflow (unless user provides `OPENCODE_AUTH_JSON` secret and asks) — copy must stay honest either way  
- Analytics  

---

## 6. Implementation style guide

Match existing code:

- ES modules, `const`, no jQuery  
- `$ = (id) => document.getElementById(id)` pattern OK  
- OKLCH + `color-mix` for color  
- Verdict tokens via `html[data-verdict]`  
- Sparse comments; section banners in CSS like existing `/* ============ */`  
- No unnecessary abstractions  
- Prefer CSS for animation; JS for data and shader  

---

## 7. Suggested agent work order (copy-paste sprint plan)

### Sprint 1 — Phase 1

1. Read all files in §1 fully.  
2. Add HTML markers + bootstrap script tag with current `data.json` contents.  
3. Change `app.js` to hydrate from bootstrap then fetch.  
4. Freshness tiers + badge.  
5. Honest methodology + meta.  
6. Definition chip.  
7. Update `research.mjs` to patch markers.  
8. Manual test no-JS and stale dates.  

### Sprint 2 — Phase 2

1. Scrim markup + CSS.  
2. Skip link, meter a11y.  
3. Fix hero scroll fade.  
4. Load choreography with reduced-motion escape.  
5. Minor shader pulse.  
6. Copy accuracy (no false “raymarched/daily”).  

### Sprint 3 — Phase 3

1. Expand agent prompt schema.  
2. Expand `research.mjs` validation.  
3. Hand-author a sample v2 `data.json` (and bootstrap) for UI work if research not run.  
4. Headline + signals + sources UI.  
5. Forecast copy tighten.  

### Sprint 4 — Phases 4–6

1. Share button.  
2. History file + UI + script.  
3. YES criteria `<details>`.  
4. Pages artifact + README.  
5. Print CSS + Lighthouse fixes.  
6. Full QA matrix.  

---

## 8. Sample v2 data (for UI development)

Use when building Phase 3 before a live research run. Keep realistic; do not invent source URLs — reuse existing ones from current `data.json`.

```json
{
  "verdict": "not_yet",
  "confidence": 85,
  "headline": "Tactical RSI is here; runaway self-improvement is not.",
  "rationale": "AI is now meaningfully accelerating its own development — labs report models writing large fractions of code and assisting successor training — but humans remain in the loop, contained incidents were caught by review, and independent experts reject claims that the threshold has been crossed.",
  "signals": [
    {
      "label": "Lab RSI claims",
      "stance": "for",
      "note": "Frontier labs say models materially speed their own research and coding."
    },
    {
      "label": "Human-in-the-loop",
      "stance": "against",
      "note": "Capability gains still route through human researchers and release processes."
    },
    {
      "label": "Expert disagreement",
      "stance": "mixed",
      "note": "Some founders say it’s here; most independent experts and chief scientists say not."
    }
  ],
  "sources": [
    {
      "title": "Inside the Race to Make AI Build Itself",
      "url": "https://time.com/article/2026/08/07/ai-recursive-self-improvement-anthropic-openai/",
      "publisher": "TIME",
      "published": "2026-08-07",
      "quote": "Recursive self-improvement has moved from thought experiment to lab practice — with humans still holding the reins."
    }
  ],
  "generated_at": "2026-08-08T20:27:32.628Z",
  "definition_version": 1
}
```

(Extend sources from current file when pasting into real `data.json`.)

---

## 9. Definition of done (whole project)

The redesign is done when:

1. All Phase 1–5 acceptance checkboxes are complete.  
2. Phase 6 QA matrix passes.  
3. Constraints in §0 hold.  
4. A stranger can open the site, state the verdict, the definition, the “why” in one sentence, and the research age — without scrolling past sources.  
5. View-source still shows a human-scale static site someone could learn from.

---

## 10. Handoff note to the implementing agent

You are implementing a **polish and information-design upgrade**, not a greenfield rewrite. Prefer surgical edits. After each phase, stop and self-check the acceptance list. If something is ambiguous, choose the option that increases **trust** and **legibility** over spectacle.

When finished, summarize: files touched, phases completed, any acceptance items deferred and why.

**Do not commit or push unless the user explicitly asks.**

---

*(End of PLAN-UX.md)*
