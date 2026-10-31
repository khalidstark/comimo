import { guard, guardResponse } from "@/lib/guard";
import { requireSession } from "@/lib/server/session";
import { getModels } from "@/lib/models";
import { json, jsonError, modelErrorResponse } from "@/lib/models/wire";
import { BODY_LIMITS, readBoundedForm } from "@/lib/requestBody";
import type { LanguageHint, TranscribeResponse } from "@/lib/types";

export const maxDuration = 60;

/**
 * Largest voice note accepted. The browser sends 16 kHz mono WAV, 32 KB a
 * second, so two minutes is about 3.8 MB; 4 MB also stays below Vercel's
 * 4.5 MB request body limit.
 */
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const HINTS: LanguageHint[] = ["auto", "ar", "en"];
const MAX_KEYWORDS = 20;

/** Optional `keywords` field: a JSON list of names to hear right (the cast). Bad input is ignored. */
function parseKeywords(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string" || value.length > 2000) return [];
  try {
    const list: unknown = JSON.parse(value);
    if (!Array.isArray(list)) return [];
    const words = list.filter((word): word is string => typeof word === "string" && word.trim().length > 0 && word.length <= 40);
    return [...new Set(words.map((word) => word.trim()))].slice(0, MAX_KEYWORDS);
  } catch {
    return [];
  }
}

/**
 * POST /api/transcribe
 * multipart/form-data: `audio` (file; 16 kHz or 24 kHz mono 16-bit WAV for the
 * real model), optional `language` (auto | ar | en), optional `keywords` (JSON list)
 */
export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  // Read with a hard byte limit: Content-Length alone can't be trusted.
  const body = await readBoundedForm(request, BODY_LIMITS.transcribe, "Send the voice note as multipart/form-data with an `audio` file.");
  if (!body.ok) return body.response;
  const form = body.value;

  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return jsonError(400, "Missing `audio` file.");
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return jsonError(413, "That voice note is too long. Keep it to two minutes.");
  }
  if (audio.type && !/^(audio|video)\//.test(audio.type)) {
    return jsonError(415, "`audio` must be an audio file.");
  }

  const language = form.get("language") ?? "auto";
  if (typeof language !== "string" || !HINTS.includes(language as LanguageHint)) {
    return jsonError(400, "`language` must be auto, ar or en.");
  }

  const models = getModels();
  const source = models.sources.transcribe;
  const check = await guard(request, "transcribe", { real: source === "meta" });
  if (!check.ok) return guardResponse(check);

  try {
    const transcript = await models.transcribe(
      {
        mimeType: audio.type || "application/octet-stream",
        data: new Uint8Array(await audio.arrayBuffer()),
        languageHint: language as LanguageHint,
        keywords: parseKeywords(form.get("keywords")),
      },
      { visitorId: check.visitorId, signal: request.signal, meter: check.meter },
    );
    return json<TranscribeResponse>({ mode: source, transcript }, source);
  } catch (error) {
    // Refund only when nothing billable reached Meta; an abort or timeout after sending still counts.
    check.refundIfUnbilled();
    return modelErrorResponse(error);
  }
}
