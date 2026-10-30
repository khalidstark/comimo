import { getModels } from "@/lib/models";
import { json, jsonError, modelErrorResponse } from "@/lib/models/wire";
import type { LanguageHint, TranscribeResponse } from "@/lib/types";

/**
 * Largest voice note accepted. A minute of compressed audio is well under
 * 1 MB; 4 MB also stays below Vercel's 4.5 MB request body limit.
 */
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const HINTS: LanguageHint[] = ["auto", "ar", "en"];

/**
 * POST /api/transcribe
 * multipart/form-data: `audio` (file), optional `language` (auto | ar | en)
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(415, "Send the voice note as multipart/form-data with an `audio` file.");
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return jsonError(400, "Missing `audio` file.");
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return jsonError(413, "That voice note is too long. Keep it to about a minute.");
  }
  if (audio.type && !/^(audio|video)\//.test(audio.type)) {
    return jsonError(415, "`audio` must be an audio file.");
  }

  const language = form.get("language") ?? "auto";
  if (typeof language !== "string" || !HINTS.includes(language as LanguageHint)) {
    return jsonError(400, "`language` must be auto, ar or en.");
  }

  const models = getModels();
  try {
    const transcript = await models.transcribe({
      mimeType: audio.type || "application/octet-stream",
      data: new Uint8Array(await audio.arrayBuffer()),
      languageHint: language as LanguageHint,
    });
    return json<TranscribeResponse>({ mode: models.mode, transcript }, models.mode);
  } catch (error) {
    return modelErrorResponse(error);
  }
}
