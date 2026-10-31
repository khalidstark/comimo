#!/usr/bin/env node
/**
 * The video reads the site's own Muse art straight from ../public/art. Remotion
 * serves one public folder, so the files are copied into video/public/art
 * (git-ignored) before the studio or a render starts. Also makes sure the
 * synthesized music bed exists (it is generated, not committed).
 */
import { cpSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const VIDEO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
cpSync(path.join(VIDEO, "../public/art"), path.join(VIDEO, "public/art"), { recursive: true });
console.log("Copied the site art into video/public/art");

if (!existsSync(path.join(VIDEO, "public/own/sfx/bed.wav"))) {
  execFileSync(process.execPath, [path.join(VIDEO, "scripts/synth-sfx.mjs")], { stdio: "inherit" });
}
