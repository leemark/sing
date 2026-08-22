# Are We In The Singularity Yet?

A single-page status report that answers one question with an AI-researched verdict and paints it as a data-reactive singularity.

Live: https://leemark.github.io/sing/

## How it works

An OpenCode agent (`singularity-researcher`) searches the web on demand and writes a strict JSON verdict to `data.json` — `no`, `not_yet`, or `yes` — with confidence, a rationale, and cited sources. The page renders that verdict and drives a WebGL2 particle accretion disk from the same file: the artwork's colors, speed, and chaos literally follow the latest research.

The definition used: a point where AI systems recursively self-improve beyond human ability to understand or control, causing runaway, irreversible change to civilization.

## Local development

```bash
python3 -m http.server 8080
# open http://127.0.0.1:8080/
```

No build step, no dependencies. Everything is static files: `index.html`, `styles.css`, `app.js`, `singularity.js`, `data.json`, `history.json`.

## Refreshing the research

```bash
./scripts/update.sh
```

Requires a local OpenCode install with auth (`~/.local/share/opencode/auth.json`) and web search enabled. The script validates the agent output, writes `data.json` and `history.json`, patches the no-JS verdict into `index.html`, and commits + pushes if the verdict changed. The push redeploys the site via GitHub Pages.

## Design constraints

- Zero build step, zero runtime dependencies, no frameworks, no tracking
- Verdict readable with JavaScript disabled (the research script inlines it into the HTML)
- `prefers-reduced-motion` and non-WebGL fallbacks are first-class
- Dark only. Honest, vibes-free, and occasionally wrong.

## Longer plans

- `PLAN-UX.md` — the UX redesign implementation plan (phases, acceptance criteria)
- `PLAN.md` — the original design north star and hard constraints
