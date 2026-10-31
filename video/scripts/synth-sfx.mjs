#!/usr/bin/env node
/**
 * Every sound in the walkthrough, synthesized here from sine waves and
 * seeded noise, so the video carries no third-party audio at all.
 * Writes 48 kHz mono 16-bit WAVs into public/own/sfx.
 *
 *   node scripts/synth-sfx.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const RATE = 48_000;
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../public/own/sfx");
mkdirSync(OUT, { recursive: true });

/* ---------- Building blocks ---------- */

let seed = 7;
function noise() {
  // Mulberry32: the same sounds on every run.
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
}

const buffer = (seconds) => new Float32Array(Math.round(seconds * RATE));

/** A resonant band-pass (RBJ biquad) whose centre can move per sample. */
function bandpass(input, centreAt, q = 1.2) {
  const out = new Float32Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const f = Math.min(centreAt(i / RATE), RATE * 0.45);
    const w = (2 * Math.PI * f) / RATE;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    const b0 = alpha / a0, b2 = -alpha / a0, a1 = (-2 * Math.cos(w)) / a0, a2 = (1 - alpha) / a0;
    const y = b0 * input[i] + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = input[i]; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

function lowpass(input, cutoff) {
  const out = new Float32Array(input.length);
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / RATE);
  let y = 0;
  for (let i = 0; i < input.length; i++) out[i] = y += a * (input[i] - y);
  return out;
}

function highpass(input, cutoff) {
  const low = lowpass(input, cutoff);
  return input.map((v, i) => v - low[i]);
}

/** Adds `source` into `target` at `atSeconds`, scaled. */
function mix(target, source, atSeconds = 0, gain = 1) {
  const start = Math.round(atSeconds * RATE);
  for (let i = 0; i < source.length && start + i < target.length; i++) target[start + i] += source[i] * gain;
  return target;
}

function sine(seconds, freqAt, envAt, phase = 0) {
  const out = buffer(seconds);
  let p = phase;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    p += (2 * Math.PI * freqAt(t)) / RATE;
    out[i] = Math.sin(p) * envAt(t);
  }
  return out;
}

function noiseBurst(seconds, envAt) {
  const out = buffer(seconds);
  for (let i = 0; i < out.length; i++) out[i] = noise() * envAt(i / RATE);
  return out;
}

const decay = (tau) => (t) => Math.exp(-t / tau);
const attackDecay = (attack, tau) => (t) => (t < attack ? t / attack : Math.exp(-(t - attack) / tau));

function normalise(samples, peak = 0.9) {
  let max = 0;
  for (const v of samples) max = Math.max(max, Math.abs(v));
  return max ? samples.map((v) => (v / max) * peak) : samples;
}

/** Short fades so nothing clicks at the edges. */
function fadeEdges(samples, seconds = 0.004) {
  const n = Math.min(Math.round(seconds * RATE), samples.length / 2);
  for (let i = 0; i < n; i++) {
    samples[i] *= i / n;
    samples[samples.length - 1 - i] *= i / n;
  }
  return samples;
}

function writeWav(name, samples, peak = 0.9) {
  const data = fadeEdges(normalise(samples, peak));
  const bytes = Buffer.alloc(44 + data.length * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(36 + data.length * 2, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); // PCM
  bytes.writeUInt16LE(1, 22); // mono
  bytes.writeUInt32LE(RATE, 24);
  bytes.writeUInt32LE(RATE * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(data.length * 2, 40);
  data.forEach((v, i) => bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2));
  writeFileSync(path.join(OUT, `${name}.wav`), bytes);
  console.log(`${name}.wav ${(data.length / RATE).toFixed(2)} s`);
}

/* ---------- The sounds ---------- */

// UI click: a tiny noise snap over a quick high ping.
{
  const s = buffer(0.09);
  mix(s, highpass(noiseBurst(0.01, decay(0.0015)), 2000), 0, 0.8);
  mix(s, sine(0.09, () => 2600, decay(0.012)), 0, 0.5);
  mix(s, sine(0.09, () => 1300, decay(0.02)), 0, 0.25);
  writeWav("click", s, 0.7);
}

// Typing ticks: three slightly different keys.
[3200, 2700, 3700].forEach((f, k) => {
  const s = buffer(0.05);
  mix(s, bandpass(noiseBurst(0.03, decay(0.004)), () => f, 2.5), 0, 1);
  mix(s, sine(0.05, () => f / 3, decay(0.006)), 0, 0.2);
  writeWav(`tick${k + 1}`, s, 0.5);
});

// Whoosh: band-passed noise that swells and sweeps up, then falls away.
function whoosh(seconds, from, to) {
  const env = (t) => Math.sin(Math.PI * Math.min(1, t / seconds)) ** 1.6;
  const n = noiseBurst(seconds, env);
  return bandpass(n, (t) => from * (to / from) ** (t / seconds), 0.9);
}
writeWav("whoosh", whoosh(0.7, 300, 2400), 0.75);
writeWav("whoosh-short", whoosh(0.28, 600, 3600), 0.6);

// Page flip: a papery rush with a flutter, and a soft slap at the end.
{
  const s = buffer(0.55);
  const flutter = (t) => (0.6 + 0.4 * Math.sin(2 * Math.PI * 38 * t)) * Math.sin(Math.PI * Math.min(1, t / 0.42)) ** 1.2;
  mix(s, highpass(bandpass(noiseBurst(0.42, flutter), (t) => 1800 + 2600 * t, 0.7), 500), 0, 1);
  mix(s, lowpass(noiseBurst(0.08, decay(0.015)), 900), 0.4, 0.9);
  writeWav("flip", s, 0.7);
}

// Pop: a bubble or a sticker landing.
writeWav("pop", (() => {
  const s = sine(0.14, (t) => 900 * Math.exp(-t * 18) + 260, attackDecay(0.002, 0.04));
  return mix(s, highpass(noiseBurst(0.01, decay(0.002)), 3000), 0, 0.3);
})(), 0.65);

// Camera shutter: two mechanical clicks.
{
  const s = buffer(0.2);
  const clack = () => mix(bandpass(noiseBurst(0.04, decay(0.006)), () => 2200, 1.4), sine(0.04, () => 180, decay(0.01)), 0, 0.5);
  mix(s, clack(), 0, 1);
  mix(s, clack(), 0.09, 0.8);
  writeWav("shutter", s, 0.6);
}

// Sparkle: a soft three-note chime for "fixed" and "added".
{
  const s = buffer(1.2);
  [1318.5, 1760, 2637].forEach((f, i) => mix(s, sine(1.1, () => f, attackDecay(0.003, 0.35)), i * 0.07, 0.4));
  writeWav("sparkle", s, 0.5);
}

// Soft thud: a card settling onto the desk.
{
  const s = buffer(0.3);
  mix(s, sine(0.3, (t) => 110 - 40 * t, attackDecay(0.004, 0.06)), 0, 1);
  mix(s, lowpass(noiseBurst(0.06, decay(0.012)), 1200), 0, 0.5);
  writeWav("thud", s, 0.7);
}

// Pencil scratch while the sheet is drawn.
{
  const s = buffer(1.6);
  const strokes = (t) => Math.max(0, Math.sin(2 * Math.PI * 3.2 * t)) ** 2 * (1 - t / 1.6);
  mix(s, bandpass(noiseBurst(1.6, strokes), (t) => 3000 + 900 * Math.sin(2 * Math.PI * 3.2 * t), 1.1), 0, 1);
  writeWav("scratch", s, 0.35);
}

// Riser into the finale: noise and a rising tone that build for 3.2 s.
{
  const len = 3.2;
  const s = buffer(len);
  const grow = (t) => (t / len) ** 2.2;
  mix(s, bandpass(noiseBurst(len, grow), (t) => 400 * 12 ** (t / len), 0.8), 0, 0.8);
  mix(s, sine(len, (t) => 180 * 5 ** (t / len), grow), 0, 0.35);
  mix(s, sine(len, (t) => 270 * 5 ** (t / len), grow), 0, 0.2);
  writeWav("riser", s, 0.6);
}

// The final snap: a hard transient, a deep thump and a short ring.
{
  const s = buffer(1.4);
  mix(s, highpass(noiseBurst(0.02, decay(0.003)), 1500), 0, 1);
  mix(s, sine(0.6, (t) => 75 * Math.exp(-t * 3) + 42, attackDecay(0.003, 0.18)), 0, 1.1);
  mix(s, lowpass(noiseBurst(0.25, decay(0.05)), 2500), 0.005, 0.35);
  [523.25, 784, 1046.5].forEach((f) => mix(s, sine(1.3, () => f, attackDecay(0.005, 0.4)), 0.02, 0.12));
  writeWav("snap", s, 0.85);
}

/* ---------- A light music bed ---------- */

/**
 * 76 s at 96 BPM: warm triangle-ish pads on I-vi-IV-V in D, with a soft
 * plucked arpeggio from bar 3. Kept quiet; the effects carry the cut.
 */
{
  const BPM = 96;
  const beat = 60 / BPM;
  const bar = beat * 4;
  const length = 76;
  const s = buffer(length);
  const midi = (n) => 440 * 2 ** ((n - 69) / 12);
  const chords = [
    [62, 66, 69, 74], // D
    [59, 62, 66, 71], // Bm
    [55, 59, 62, 67], // G
    [57, 61, 64, 69], // A
  ];
  const bars = Math.ceil(length / bar);
  for (let b = 0; b < bars; b++) {
    const chord = chords[b % 4];
    const start = b * bar;
    const padEnv = (t) => Math.min(1, t / 0.6) * Math.min(1, Math.max(0, (bar + 0.4 - t) / 0.8));
    for (const note of chord) {
      const f = midi(note - 12);
      const pad = sine(bar + 0.5, () => f, padEnv);
      const pad2 = sine(bar + 0.5, () => f * 1.003, padEnv, 1);
      mix(s, pad, start, 0.08);
      mix(s, pad2, start, 0.06);
    }
    mix(s, sine(bar + 0.5, () => midi(chord[0] - 24), padEnv), start, 0.12);
    if (b >= 2) {
      const pattern = [0, 2, 1, 3, 2, 1, 3, 2];
      pattern.forEach((k, step) => {
        const f = midi(chord[k] + 12);
        const pluck = mix(sine(0.6, () => f, attackDecay(0.004, 0.16)), sine(0.6, () => f * 2, attackDecay(0.002, 0.07)), 0, 0.25);
        mix(s, pluck, start + step * (beat / 2), 0.05);
      });
    }
  }
  // Fade in and out.
  for (let i = 0; i < s.length; i++) {
    const t = i / RATE;
    s[i] *= Math.min(1, t / 2) * Math.min(1, (length - t) / 3);
  }
  writeWav("bed", lowpass(s, 5000), 0.5);
}
