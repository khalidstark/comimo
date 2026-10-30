/**
 * Browser only: turn any voice note the browser can decode (webm/opus from
 * Chrome, mp4/aac from Safari, mp3, m4a, wav...) into the one format Muse Voice
 * Transcribe takes: RIFF/WAVE, mono, 16-bit PCM at 16 kHz.
 *
 * 16 kHz mono 16-bit is 32 KB a second, so the two-minute cap keeps the upload
 * near 3.8 MB, under Vercel's 4.5 MB request body limit.
 */

export const WAV_SAMPLE_RATE = 16_000;
/** Longest voice note Comimo listens to. */
export const MAX_VOICE_NOTE_MS = 120_000;
/** Encoders pad a little; a recording stopped at the cap may decode slightly longer. */
const CAP_SLACK_MS = 1_500;

export type AudioConvertProblem = "unsupported" | "undecodable" | "too-long" | "silent";

export class AudioConvertError extends Error {
  constructor(
    readonly problem: AudioConvertProblem,
    message: string,
  ) {
    super(message);
    this.name = "AudioConvertError";
  }
}

export interface WavResult {
  wav: Blob;
  durationMs: number;
}

type AudioContextConstructor = typeof AudioContext;

function audioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const legacy = (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
  return window.AudioContext ?? legacy ?? null;
}

async function decode(blob: Blob): Promise<AudioBuffer> {
  const Context = audioContextConstructor();
  if (!Context || typeof OfflineAudioContext === "undefined") {
    throw new AudioConvertError("unsupported", "This browser can't prepare audio. Try a recent Chrome, Safari or Firefox.");
  }
  const bytes = await blob.arrayBuffer();
  const context = new Context();
  try {
    return await context.decodeAudioData(bytes);
  } catch {
    throw new AudioConvertError("undecodable", "Comimo couldn't read that audio. Try another file, or record instead.");
  } finally {
    void context.close().catch(() => {});
  }
}

/** Downmix to mono and resample to 16 kHz. The offline context does both: its single output channel mixes the input down. */
async function resample(buffer: AudioBuffer, durationMs: number): Promise<Float32Array> {
  const length = Math.max(1, Math.ceil((durationMs / 1000) * WAV_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, length, WAV_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

/** 16-bit little-endian PCM WAV with the standard 44-byte header. */
export function encodeWav(samples: Float32Array, sampleRate = WAV_SAMPLE_RATE): Blob {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0, offset = 44; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function isSilent(samples: Float32Array): boolean {
  for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]) > 0.003) return false;
  return true;
}

/** Decode, downmix, resample and encode a voice note as 16 kHz mono 16-bit WAV. */
export async function toWav(blob: Blob, maxMs = MAX_VOICE_NOTE_MS): Promise<WavResult> {
  const buffer = await decode(blob);
  const fullMs = buffer.duration * 1000;
  if (fullMs > maxMs + CAP_SLACK_MS) {
    throw new AudioConvertError("too-long", "That voice note is longer than two minutes. Trim it and try again.");
  }
  const durationMs = Math.min(fullMs, maxMs);
  const samples = await resample(buffer, durationMs);
  if (isSilent(samples)) {
    throw new AudioConvertError("silent", "That voice note sounds silent. Check the mic and try again.");
  }
  return { wav: encodeWav(samples), durationMs };
}
