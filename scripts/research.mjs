#!/usr/bin/env node
// Runs the singularity-researcher agent via `opencode run`, validates its
// JSON verdict, and writes data.json. Exits non-zero (without writing) on
// any failure so the last good verdict stays in place.

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT_PATH = fileURLToPath(new URL("../data.json", import.meta.url));
const MODEL = process.env.RESEARCH_MODEL || "opencode-go/kimi-k3";
const TIMEOUT_MS = 5 * 60 * 1000;

const prompt = [
  "Research and answer now. Today's date is",
  new Date().toISOString().slice(0, 10) + ".",
  "Remember: your entire response must be a single JSON object, nothing else.",
].join(" ");

const result = spawnSync(
  "opencode",
  ["run", "--agent", "singularity-researcher", "--model", MODEL, prompt],
  {
    env: { ...process.env, OPENCODE_ENABLE_EXA: "1" },
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
  },
);

if (result.error) {
  console.error("failed to launch opencode:", result.error.message);
  process.exit(1);
}
if (result.status !== 0) {
  console.error("opencode exited with status", result.status);
  console.error(result.stderr?.slice(0, 4000));
  process.exit(1);
}

const stdout = result.stdout.trim();

// Extract the JSON object even if the model wrapped it in stray text.
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

const VERDICTS = new Set(["no", "not_yet", "yes"]);
if (!VERDICTS.has(data.verdict)) {
  console.error("bad verdict:", data.verdict);
  process.exit(1);
}
if (typeof data.rationale !== "string" || !data.rationale.trim()) {
  console.error("missing rationale");
  process.exit(1);
}

const confidence = Math.round(Number(data.confidence));
const sources = (Array.isArray(data.sources) ? data.sources : [])
  .filter((s) => s && typeof s.title === "string" && /^https?:\/\//.test(s.url || ""))
  .map((s) => ({ title: s.title.trim(), url: s.url.trim() }))
  .slice(0, 5);

const output = {
  verdict: data.verdict,
  confidence: Number.isFinite(confidence) ? Math.min(100, Math.max(0, confidence)) : null,
  rationale: data.rationale.trim(),
  sources,
  generated_at: new Date().toISOString(),
};

writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + "\n");
console.log("wrote", OUT_PATH);
console.log(JSON.stringify(output, null, 2));
