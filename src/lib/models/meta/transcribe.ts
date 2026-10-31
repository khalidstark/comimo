import "server-only";
import { detectLanguages } from "@/lib/languages";
import type { LanguageHint, Transcript } from "@/lib/types";
import { ModelInputError, type AudioInput, type ModelCallContext } from "../index";
import { MetaApiError, metaJson } from "./client";

/**
 * Muse Voice Transcribe: POST /v1/asr/transcribe, multipart with a JSON
 * `request` part and an `audio` part. The file endpoint takes WAV only (mono
 * 16-bit PCM at 16 or 24 kHz); the browser converts every voice note first
 * (src/lib/audio/toWav.ts). Docs: dev.meta.ai/docs/api-reference/voice/transcribe
 */

const MODEL = "muse-voice-transcribe-1.0";
/** $0.18 per audio hour, billed in whole seconds (dev.meta.ai/docs/pricing-rate-limits). */
const PRICE_PER_SECOND = 0.18 / 3600;
const MAX_SECONDS = 10 * 60;
const MIN_SECONDS = 0.3;

/** `languageBias` takes language names; it steers, it doesn't force. */
const LANGUAGE_BIAS: Record<LanguageHint, string[]> = {
  auto: ["Arabic", "English"],
  ar: ["Arabic", "English"],
  en: ["English", "Arabic"],
};

interface TranscribeBody {
  sessionId?: string;
  transcript?: string;
  audioDurationMs?: number;
}

interface WavInfo {
  sampleRate: number;
  seconds: number;
}

/**
 * Check the RIFF header before paying for a call: mono, 16-bit PCM, 16 or
 * 24 kHz. Walks the chunks so a LIST chunk before `data` is fine.
 */
function readWav(data: Uint8Array): WavInfo | null {
  if (data.byteLength < 44) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const tag = (offset: number) => String.fromCharCode(...data.subarray(offset, offset + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;

  let format: { pcm: boolean; channels: number; sampleRate: number; bits: number } | null = null;
  for (let offset = 12; offset + 8 <= data.byteLength; ) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt " && body + 16 <= data.byteLength) {
      format = {
        pcm: view.getUint16(body, true) === 1,
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      if (!format?.pcm || format.channels !== 1 || format.bits !== 16) return null;
      if (format.sampleRate !== 16_000 && format.sampleRate !== 24_000) return null;
      const bytes = Math.min(size, data.byteLength - body);
      return { sampleRate: format.sampleRate, seconds: bytes / (format.sampleRate * 2) };
    }
    offset = body + size + (size % 2);
  }
  return null;
}

export { detectLanguages };

/** Small clean-ups seen in real output: an ideographic full stop after Arabic ("حلو.。"), doubled spaces. */
function tidy(text: string): string {
  return text
    .replace(/([.!?؟])\s*\u3002/g, "$1")
    .replace(/\u3002/g, ".")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function transcribe(audio: AudioInput, context: ModelCallContext = {}): Promise<Transcript> {
  const wav = readWav(audio.data);
  if (!wav) throw new ModelInputError("Send the voice note as 16 kHz mono 16-bit WAV.");
  if (wav.seconds > MAX_SECONDS) throw new ModelInputError("That voice note is too long.");
  if (wav.seconds < MIN_SECONDS) throw new ModelInputError("That voice note is too short. Tell me a bit more.");

  const request = {
    model: MODEL,
    audioEncoding: "WAV",
    mode: "PUSH_TO_TALK",
    languageBias: LANGUAGE_BIAS[audio.languageHint],
    ...(audio.keywords?.length ? { keywords: audio.keywords } : {}),
  };
  const form = new FormData();
  form.append("request", new Blob([JSON.stringify(request)], { type: "application/json" }));
  form.append("audio", new Blob([audio.data.slice()], { type: "audio/wav" }), "voice-note.wav");

  const body = await metaJson<TranscribeBody>("/asr/transcribe", {
    method: "POST",
    form,
    signal: context.signal,
    timeoutMs: 90_000,
    onSend: () => context.meter?.beforeCall("transcribe"),
  });
  if (typeof body.transcript !== "string") {
    throw new MetaApiError("server", 200, "transcribe response had no transcript");
  }

  const seconds = Math.ceil((body.audioDurationMs ?? wav.seconds * 1000) / 1000);
  console.info(`Comimo: transcribed ${seconds} s of audio (~$${(seconds * PRICE_PER_SECOND).toFixed(4)})`);

  const text = tidy(body.transcript);
  if (!text) {
    throw new ModelInputError("Comimo couldn't hear any words in that voice note. Try again a little closer to the mic.");
  }
  return { text, languages: detectLanguages(text, audio.languageHint) };
}
