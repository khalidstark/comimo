#!/usr/bin/env node
/**
 * Smoke test for the Meta Model API key: GET /v1/models (free) and list the
 * model ids this key can use. Prints ids only, never the key.
 *
 *   node scripts/meta-smoke.mjs
 *
 * Reads MODEL_API_KEY from the environment, or from .env.local if unset.
 */
import { existsSync } from "node:fs";
import path from "node:path";

const EXPECTED = ["muse-spark-1.3", "muse-image-1.0", "muse-voice-transcribe-1.0", "sam-3.1"];

const envFile = path.resolve(process.cwd(), ".env.local");
if (!process.env.MODEL_API_KEY && existsSync(envFile)) process.loadEnvFile(envFile);

const key = process.env.MODEL_API_KEY?.trim();
if (!key) {
  console.error("MODEL_API_KEY is not set (environment or .env.local).");
  process.exit(1);
}

let response;
try {
  response = await fetch("https://api.meta.ai/v1/models", {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
} catch (error) {
  console.error(`Couldn't reach api.meta.ai: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

if (!response.ok) {
  const hint = response.status === 401 ? " (the key was rejected)" : "";
  console.error(`GET /v1/models failed: HTTP ${response.status}${hint}`);
  process.exit(1);
}

const body = await response.json();
const ids = (body.data ?? []).map((model) => model.id).filter((id) => typeof id === "string").sort();
console.log(`Models for this key (${ids.length}):`);
for (const id of ids) console.log(`  ${id}`);

const missing = EXPECTED.filter((id) => !ids.includes(id));
if (missing.length > 0) {
  console.error(`Missing: ${missing.join(", ")}`);
  process.exit(1);
}
console.log("All Comimo models are available.");
