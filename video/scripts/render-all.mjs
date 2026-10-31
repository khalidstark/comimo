#!/usr/bin/env node
/**
 * Bundles the walkthrough once, then renders what is asked for:
 *
 *   node scripts/render-all.mjs --out <dir> [--stills] [--video] [--scenes] [--web]
 *
 *   --stills  key frames of every scene, wide and tall, into <out>/stills
 *   --video   the full walkthrough as H.264 MP4, 1920x1080 and 1080x1920,
 *             plus the English captions as WebVTT next to them
 *   --scenes  each scene on its own (wide) for the demo cut, into <out>/scenes
 *   --web     a 720p copy, poster and captions for the home page (public/video)
 *
 * Rendering downloads Chrome Headless Shell on first use.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { FPS, SCENES, sceneStarts } from "../src/timing.ts";

const args = process.argv.slice(2);
const has = (flag) => args.includes(`--${flag}`);
const value = (flag) => (args.includes(`--${flag}`) ? args[args.indexOf(`--${flag}`) + 1] : undefined);
const VIDEO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.resolve(value("out") ?? path.join(VIDEO, "out"));
mkdirSync(OUT, { recursive: true });

/** Frames worth looking at in each scene (scene-relative). */
const STILLS = {
  Hook: [60, 120],
  Record: [30, 120, 200, 240],
  Storyteller: [40, 140],
  NewFaces: [30, 116, 200, 250, 320, 420],
  Photos: [90, 200],
  PageBuild: [140, 200, 260, 330],
  CheckIn: [70, 190],
  Finale: [120, 250, 330, 440],
};

/** Brings the mix to -16 LUFS (web/social loudness) without touching the picture. */
function loudnorm(file) {
  const tmp = file.replace(/\.mp4$/, ".norm.mp4");
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", file, "-c:v", "copy", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", tmp], { stdio: "inherit" });
  renameSync(tmp, file);
}

console.log("Bundling…");
const serveUrl = await bundle({ entryPoint: path.join(VIDEO, "src/index.ts"), publicDir: path.join(VIDEO, "public") });

if (has("stills")) {
  const dir = path.join(OUT, "stills");
  mkdirSync(dir, { recursive: true });
  for (const [suffix, tag] of [["", "wide"], ["-V", "tall"]]) {
    for (const [i, scene] of SCENES.entries()) {
      const id = `S${i + 1}-${scene.id}${suffix}`;
      const composition = await selectComposition({ serveUrl, id, inputProps: { id: scene.id } });
      for (const frame of STILLS[scene.id] ?? []) {
        const output = path.join(dir, `${tag}-${i + 1}-${scene.id}-${String(frame).padStart(3, "0")}.jpg`);
        await renderStill({ serveUrl, composition, frame, output, imageFormat: "jpeg", jpegQuality: 85, inputProps: { id: scene.id } });
        console.log(path.basename(output));
      }
    }
  }
  // Transition moments in the full cut.
  const starts = sceneStarts();
  const full = await selectComposition({ serveUrl, id: "Walkthrough", inputProps: { music: true } });
  for (const [i, scene] of SCENES.entries()) {
    if (scene.out === "none") continue;
    const frame = starts[i] + scene.duration - 9;
    const output = path.join(dir, `wide-transition-${i + 1}-${scene.out}.jpg`);
    await renderStill({ serveUrl, composition: full, frame, output, imageFormat: "jpeg", jpegQuality: 85, inputProps: { music: true } });
    console.log(path.basename(output));
  }
}

function vtt() {
  const starts = sceneStarts();
  const stamp = (frame) => {
    const ms = Math.round((frame / FPS) * 1000);
    const h = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
    const m = String(Math.floor(ms / 60_000) % 60).padStart(2, "0");
    const s = String(Math.floor(ms / 1000) % 60).padStart(2, "0");
    return `${h}:${m}:${s}.${String(ms % 1000).padStart(3, "0")}`;
  };
  const cues = SCENES.flatMap((scene, i) => scene.captions.map((c) => `${stamp(starts[i] + c.from)} --> ${stamp(starts[i] + c.to)}\n${c.text}`));
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

if (has("video")) {
  for (const [id, name] of [
    ["Walkthrough", "comimo-walkthrough-1920x1080.mp4"],
    ["WalkthroughVertical", "comimo-walkthrough-1080x1920.mp4"],
  ]) {
    const composition = await selectComposition({ serveUrl, id, inputProps: { music: true } });
    const output = path.join(OUT, name);
    let last = -1;
    await renderMedia({
      serveUrl,
      composition,
      codec: "h264",
      crf: 18,
      pixelFormat: "yuv420p",
      audioCodec: "aac",
      audioBitrate: "192k",
      imageFormat: "jpeg",
      jpegQuality: 92,
      concurrency: 6,
      outputLocation: output,
      inputProps: { music: true },
      onProgress: ({ progress }) => {
        const pct = Math.floor(progress * 10) * 10;
        if (pct !== last) console.log(`${name}: ${pct}%`), (last = pct);
      },
    });
    loudnorm(output);
    console.log(`Wrote ${output}`);
  }
  writeFileSync(path.join(OUT, "comimo-walkthrough.en.vtt"), vtt());
}

if (has("scenes")) {
  const dir = path.join(OUT, "scenes");
  mkdirSync(dir, { recursive: true });
  for (const [i, scene] of SCENES.entries()) {
    const id = `S${i + 1}-${scene.id}`;
    const composition = await selectComposition({ serveUrl, id, inputProps: { id: scene.id } });
    const output = path.join(dir, `${id}.mp4`);
    await renderMedia({ serveUrl, composition, codec: "h264", crf: 18, pixelFormat: "yuv420p", concurrency: 6, outputLocation: output, inputProps: { id: scene.id } });
    loudnorm(output);
    console.log(`Wrote ${output}`);
  }
}

if (value("vtt")) writeFileSync(path.resolve(value("vtt")), vtt());

/**
 * --web: the small copy the home page plays (public/video): 720p H.264 with
 * fast start, a poster frame and the captions. Needs ffmpeg and a prior --video.
 */
if (has("web")) {
  const web = path.join(VIDEO, "../public/video");
  mkdirSync(web, { recursive: true });
  const master = path.join(OUT, "comimo-walkthrough-1920x1080.mp4");
  const run = (...ffmpegArgs) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...ffmpegArgs], { stdio: "inherit" });
  run("-i", master, "-vf", "scale=1280:720:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-profile:v", "high", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", path.join(web, "comimo-walkthrough.mp4"));
  // Poster: the hook's headline, fully in.
  run("-ss", "3.2", "-i", master, "-frames:v", "1", "-vf", "scale=1280:720:flags=lanczos", "-q:v", "4", path.join(web, "comimo-walkthrough-poster.jpg"));
  writeFileSync(path.join(web, "comimo-walkthrough.en.vtt"), vtt());
  console.log(`Wrote the web copy to ${web}`);
}
