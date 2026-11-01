import { starterCastBriefs } from "@/fixtures/cast";
import { guard, guardResponse } from "@/lib/guard";
import { requireSession } from "@/lib/server/session";
import { getModels } from "@/lib/models";
import { isRecord, isText, json, jsonError, modelErrorResponse } from "@/lib/models/wire";
import { BODY_LIMITS, readBoundedJson } from "@/lib/requestBody";
import { ALIAS_LIMITS } from "@/lib/names";
import { cleanAbout } from "@/lib/aboutYou";
import type { CastBrief, CharacterRole, ScriptResponse } from "@/lib/types";
import { DEFAULT_STORY_MODE, isStoryMode } from "@/lib/types";

export const maxDuration = 60;

const MAX_TRANSCRIPT = 20_000;
const MAX_CAST = 20;
const ROLES: CharacterRole[] = ["self", "friend", "family", "teacher", "pet", "other"];

/** Other names a character goes by: a short list of short names. */
function isAliasList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= ALIAS_LIMITS.count && value.every((alias) => isText(alias, ALIAS_LIMITS.length));
}

function parseCast(value: unknown): CastBrief[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CAST) return null;
  const cast: CastBrief[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const { id, name, aliases, role, look, personality, about } = item;
    if (!isText(id, 100) || !isText(name, 100)) return null;
    if (typeof role !== "string" || !ROLES.includes(role as CharacterRole)) return null;
    if (typeof look !== "string" || look.length > 2000) return null;
    if (typeof personality !== "string" || personality.length > 2000) return null;
    if (aliases !== undefined && !isAliasList(aliases)) return null;
    // About-you answers only count for the speaker, and only the known choices get through.
    const answers = role === "self" && about !== undefined ? cleanAbout(about) : null;
    cast.push({ id, name, role: role as CharacterRole, look, personality, ...(aliases?.length ? { aliases } : {}), ...(answers ? { about: answers } : {}) });
  }
  return cast;
}

/**
 * POST /api/script
 * JSON: { transcript: string, cast?: CastBrief[], storyMode?: StoryMode }  (cast defaults to the starter cast, storyMode to "both")
 */
export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  // Read with a hard byte limit: Content-Length alone can't be trusted.
  const read = await readBoundedJson(request, BODY_LIMITS.script);
  if (!read.ok) return read.response;
  const body = read.value;
  if (!isRecord(body)) return jsonError(400, "Send JSON like {\"transcript\": \"...\"}.");

  if (!isText(body.transcript, MAX_TRANSCRIPT)) {
    return jsonError(400, `\`transcript\` must be non-empty text up to ${MAX_TRANSCRIPT} characters.`);
  }

  let cast = starterCastBriefs;
  if (body.cast !== undefined) {
    const parsed = parseCast(body.cast);
    if (!parsed) return jsonError(400, "`cast` must be a list of characters with id, name, role, look and personality.");
    cast = parsed;
  }

  if (body.storyMode !== undefined && !isStoryMode(body.storyMode)) {
    return jsonError(400, "`storyMode` must be \"narrated\", \"dialogue\" or \"both\".");
  }
  const storyMode = isStoryMode(body.storyMode) ? body.storyMode : DEFAULT_STORY_MODE;

  const models = getModels();
  const source = models.sources.writeScript;
  // One script is one comic: this is the call the per-visitor comic limit counts.
  const check = await guard(request, "script", { real: source === "meta" });
  if (!check.ok) return guardResponse(check);

  try {
    const script = await models.writeScript(body.transcript, cast, { visitorId: check.visitorId, signal: request.signal, meter: check.meter }, { storyMode });
    return json<ScriptResponse>({ mode: source, script }, source);
  } catch (error) {
    // Refund only when nothing billable reached Meta; an abort or timeout after sending still counts.
    check.refundIfUnbilled();
    return modelErrorResponse(error);
  }
}
