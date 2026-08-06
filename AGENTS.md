# sing — agent instructions

## Multimodal delegation

The default coding model, DeepSeek V4 Flash, is text-only.

Whenever a task depends on interpreting a screenshot, image, diagram, UI
mockup, visual browser output, rendered PDF page, or video frame:

1. Do not guess about the visual content.
2. Invoke the `vision` agent using the Task tool.
3. Give the vision agent:
   - the exact project-relative path to each visual file,
   - the user's visual question,
   - the specific information needed to continue the task.
4. Wait for the vision agent's report.
5. Use that report to continue the coding, debugging, or analysis work.
6. If no readable local file path is available, ask for the visual to be
   saved under `context/visuals/`.

The vision agent analyzes visuals. The main agent remains responsible for
examining source code, editing files, running commands, testing changes, and
reporting the completed work.

## Visual verification without a browser UI

The `singularity.js` WebGL2 shader is verified headlessly with Playwright +
SwiftShader. Reference harness kept in `/tmp/opencode/sing-test/` (ephemeral,
rebuild as needed):

- Launch Chromium from `~/.cache/ms-playwright/chromium-<rev>/chrome-linux64/chrome`
  with `--enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader`.
- Serve the page over HTTP (module imports are blocked on `file://`).
- WebGL canvases clear their buffer after compositing unless
  `preserveDrawingBuffer: true`; when probing with `gl.readPixels`, read inside
  a `requestAnimationFrame` callback or `readPixels` returns all zeros.
- To "see" a render without image input, dump an ASCII luminance heatmap
  (48×20 grid of ` .+*#@`) from the framebuffer, or probe specific pixels for
  RGB values.

## Research pipeline

- `scripts/research.mjs` runs the `singularity-researcher` agent via
  `opencode run` and writes `data.json`. Requires `OPENCODE_ENABLE_EXA=1`.
- The scheduled workflow `.github/workflows/research.yml` restores auth from the
  `OPENCODE_AUTH_JSON` secret and commits `data.json` when it changes.
