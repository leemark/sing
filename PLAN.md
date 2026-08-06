# PLAN — "Are We In The Singularity Yet?"

Handoff document for the next coding agent. Read fully before writing code.

---

## 1. Project context

**Repo:** https://github.com/leemark/sing — **Live:** https://leemark.github.io/sing/
**Hosting:** GitHub Pages, deployed from `main` via `.github/workflows/pages.yml` (GitHub Actions source). No build step. Everything must remain plain static files — no bundlers, no frameworks, no npm install required to serve.

**Concept:** A single-page site that answers "Are we in the singularity yet?" A scheduled AI agent (OpenCode + Exa websearch) researches the question daily and commits its findings as `data.json`; the page renders the verdict.

### Current state (already in the repo)

| File | Purpose |
|---|---|
| `index.html` / `styles.css` / `app.js` | v1 joke-mode page (big "NO", whimsical signal list, re-roll button). **Will be replaced by the redesign.** |
| `opencode.json` | Project config: `permission.websearch: allow` |
| `.opencode/agent/singularity-researcher.md` | Primary-mode research agent. Websearch/webfetch allowed, everything else denied. Outputs strict JSON: `{verdict: "no"\|"not_yet"\|"yes", confidence: 0-100, rationale, sources: [{title,url}]}` |
| `scripts/research.mjs` | Node ≥20, zero deps. Runs the agent via `opencode run`, validates JSON, writes `data.json`. Exit 1 without writing on any failure. **Verified working locally.** Env overrides: `RESEARCH_MODEL` (default `opencode-go/kimi-k3`). |
| `data.json` | Real generated output (verdict `not_yet`, confidence 80). **Exists locally, not yet committed.** |
| `.github/workflows/pages.yml` | Deploys repo root to Pages on push to `main`. Keep as-is. |

### data.json schema (contract the frontend must honor)

```json
{
  "verdict": "no | not_yet | yes",
  "confidence": 80,
  "rationale": "2-3 sentences",
  "sources": [{ "title": "...", "url": "https://..." }],
  "generated_at": "ISO-8601"
}
```

---

## 2. Phase 0 — Finish the research pipeline (do first, it's small)

### 2.1 Create `.github/workflows/research.yml`

Daily cron (06:00 UTC) + manual dispatch. Installs OpenCode, restores auth, runs the script, commits `data.json` only when changed:

```yaml
name: Daily singularity research

on:
  schedule:
    - cron: "0 6 * * *"
  workflow_dispatch:

permissions:
  contents: write

jobs:
  research:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Install opencode
        run: |
          curl -fsSL https://opencode.ai/install | bash
          echo "$HOME/.opencode/bin" >> $GITHUB_PATH
      - name: Restore opencode auth
        run: |
          mkdir -p ~/.local/share/opencode
          printf '%s' "${{ secrets.OPENCODE_AUTH_JSON }}" > ~/.local/share/opencode/auth.json
          chmod 600 ~/.local/share/opencode/auth.json
      - name: Run research
        run: node scripts/research.mjs
      - name: Commit data.json if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add data.json
          git diff --cached --quiet || git commit -m "Research update: $(date -u +%Y-%m-%d)"
          git push
```

### 2.2 Manual step for the user (agent cannot do this)

Create repo secret **Settings → Secrets and variables → Actions → `OPENCODE_AUTH_JSON`** with the contents of `~/.local/share/opencode/auth.json` (shape: `{"opencode-go": {"type": "api", "key": "sk-..."}}`). Then trigger the workflow once via **Actions → Daily singularity research → Run workflow** and confirm the run is green and `data.json` updates.

### 2.3 Commit current state

Commit `data.json`, `opencode.json`, `.opencode/`, `scripts/`, `research.yml`, and this plan before starting the redesign.

---

## 3. Phase 1 — The redesign: north star

Rebuild `index.html`/`styles.css`/`app.js` into **the most impressive, informational single-page experience possible with the July-2026 web platform** — while staying a zero-build static site.

**Creative direction:** The page's centerpiece *is* a singularity. A real-time, raymarched black hole with an accretion disk and gravitational lensing fills the hero. **The shader is data-driven**: uniforms come from `data.json`, so the artwork literally reflects the latest research verdict.

| data.json | Shader effect |
|---|---|
| `verdict: no` | Calm, cool palette (teal/indigo), slow stable disk |
| `verdict: not_yet` | Restless palette (violet/amber), faster turbulent disk |
| `verdict: yes` | Alarm palette (red/white), chaotic disk, screen-space distortion |
| `confidence` (0–100) | Disk brightness/turbulence intensity |
| `generated_at` | "Researched N hours ago" label in hero |

**Verified platform support (caniuse, June 2026 stats):**
- WebGPU ≈ 84% globally — Chrome/Edge/Opera full, Safari 26 partial, **Firefox still disabled by default** → WebGPU must never be required.
- WebGL2 ≈ 99%+ → the shader path is raw **WebGL2** (no dependencies, ~1 file).
- CSS anchor positioning ≈ 82% — **now cross-browser** (Chrome 125+, Safari 26+, Firefox 147+): safe to use for tooltips/popovers with graceful degradation.
- Scroll-driven animations, `:has()`, `@scope`, container queries, `@starting-style`, `transition-behavior: allow-discrete`, OKLCH/`color-mix()`, `@property` — all baseline or near-baseline; still layer with `@supports`.

### Hard constraints

1. **Zero build step, zero runtime dependencies.** No three.js, no CDN scripts, no fonts that block render (system font stack or one self-hosted variable font with `font-display: swap`).
2. **Progressive enhancement is non-negotiable.** No WebGL2 → static CSS-art hero. `prefers-reduced-motion` → static frame + no scroll animation. Content must be fully readable with JS disabled (server-rendered-equivalent semantic HTML; JS only enhances).
3. **Performance budget:** initial payload ≤ 150 KB total; shader compile ≤ 50 ms; steady-state 60 fps on a 2021 mid-range laptop; pause rendering when hero is offscreen (`IntersectionObserver`) or tab hidden (`visibilitychange`); clamp `devicePixelRatio` at 2.
4. **Accessibility:** semantic landmarks, the verdict readable as text before any canvas exists, keyboard-navigable sources, visible focus styles, AA contrast against the animated background (put text on scrim panels).

---

## 4. Phase 2 — The raymarched singularity hero

**File:** `singularity.js` (ES module, ~300 lines) + shaders as template literals inside it (no separate fetch).

- Full-viewport `<canvas>` behind the hero content, `position: fixed` with `z-index: -1` or a hero-contained absolute canvas — pick whichever simplifies the scroll fade.
- **Fragment-shader raymarcher** (well-known technique, write from scratch): sphere-traced black hole — event horizon, photon-ring glow, accretion disk with fbm noise turbulence, background star field bent by 2nd-order gravitational-lensing approximation, subtle film grain + vignette. Uniforms: `u_time`, `u_res`, `u_verdict` (int), `u_confidence` (float), `u_scroll` (hero scroll progress 0–1 → camera drift/pull-back).
- Pointer parallax (lerped, disabled with reduced-motion).
- **Fallback ladder:** WebGL2 → static CSS radial-gradient "artist's singularity" (pure CSS, still looks intentional). Detection: try context creation inside try/catch; on failure swap in a `.hero-fallback` class.
- Render loop via `requestAnimationFrame`; pause offscreen/hidden; recompile-safe resize handler with debounce.
- The verdict text itself sits on a scrim (backdrop-filter blur panel) so it's always legible.

---

## 5. Phase 3 — Scroll narrative & information design

Single-page scroll story, in order:

1. **Hero** — the shader, the question, the giant verdict word, confidence badge, "last researched" timestamp. Smooth-scroll cue.
2. **The evidence** — `rationale` rendered as a pull-quote; confidence shown as an animated radial gauge (SVG stroke-dashoffset or conic-gradient, driven by `--confidence` custom property + `@property` for animatable transitions).
3. **Sources** — cards from `data.json.sources` with favicons, domain labels, and **anchor-positioned hover previews** (title + domain tooltip via `anchor-name`/`position-anchor`; degrade to plain links where unsupported).
4. **The forecast** — a static, curated timeline of singularity predictions (Vinge 1993 → Kurzweil's 2045 → Metaculus community AGI median → the agent's own daily verdicts). Rendered as a vertical timeline with **scroll-driven reveal** (`animation-timeline: view()`).
5. **Methodology** — honest footer: "A scheduled AI agent searches the web daily and writes its verdict to `data.json`. The artwork above responds to it." Link to repo.

**Data flow:** on load, `fetch('data.json')` → on success, populate verdict/gauge/rationale/sources and set shader uniforms; on failure or stale JSON (>48 h), fall back to the existing whimsical content (keep the joke signal list as the fallback — it's charming) and add a "research pipeline resting" note. No layout shift: reserve space with `min-height`/aspect-ratio containers.

---

## 6. Phase 4 — The modern-CSS showcase layer

Use the 2026 toolkit deliberately, always behind `@supports` where it's not baseline:

- **Scroll-driven animations** (`animation-timeline: scroll()`/`view()`) for section reveals, the timeline, and the hero fade-out — with a JS/IntersectionObserver fallback path only if trivial, else static-visible default.
- **Container queries** for source cards and the gauge (component-local responsiveness).
- **`@scope`** to keep section styles encapsulated without BEM sprawl.
- **`:has()`** for genuine logic (e.g., card grid restyles when a card is hovered/focused-within).
- **Anchor positioning** for source hover-cards (see §5.3).
- **`@property`** typed custom properties for animating hue/angle/length values (gauge sweep, gradient rotation).
- **OKLCH palette + `color-mix()`** as the entire color system; verdict palettes defined as three token sets toggled by a `data-verdict` attribute on `<html>`.
- **`@starting-style` + `transition-behavior: allow-discrete`** for entry animations of dynamically inserted sources.
- **`text-wrap: balance`** on headings, **`text-wrap: pretty`** on paragraphs.
- Optional, only if free: View Transitions for the verdict flip when fresh data arrives with a different verdict than displayed.

---

## 7. Phase 5 — Verify

- [ ] `node scripts/research.mjs` still exits 0 and writes valid `data.json`.
- [ ] Serve locally (`python3 -m http.server`) and test: WebGL path, forced-fallback path (disable WebGL via DevTools), reduced-motion emulation, 360 px-wide viewport, keyboard-only navigation.
- [ ] JSON stale/missing → fallback content renders, no console errors.
- [ ] Lighthouse: Performance ≥ 90, Accessibility = 100, Best Practices ≥ 95.
- [ ] Push to `main` → pages.yml deploy green → hard-refresh https://leemark.github.io/sing/ and confirm the live verdict matches `data.json`.

## 8. Non-goals

No framework migration, no build tooling, no analytics/tracking, no backend, no WebGPU (revisit only if Firefox ships it on-by-default), no light mode (dark is the aesthetic), no multi-page split.

## 9. Suggested execution order

1. Phase 0 (pipeline + commit) → confirm one green scheduled run.
2. `singularity.js` shader in isolation on a test page — get the black hole beautiful first, wire data second.
3. Semantic HTML for all five sections, unstyled (JS-disabled readability check).
4. CSS system: tokens → layout → components → scroll/entry animations → @supports layers.
5. Fallback ladder + reduced-motion + perf pass.
6. Verify (§7), deploy, hand back to the user for the manual secret step if not already done.
