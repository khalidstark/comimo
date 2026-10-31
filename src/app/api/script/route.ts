import { starterCastBriefs } from "@/fixtures/cast";
import { guard, guardResponse } from "@/lib/guard";
import { getModels } from "@/lib/models";
import { isRecord, isText, json, jsonError, modelErrorResponse, readJson } from "@/lib/models/wire";
import { ALIAS_LIMITS } from "@/lib/names";
import type { CastBrief, CharacterRole, ScriptResponse } from "@/lib/types";

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
    const { id, name, aliases, role, look, personality } = item;
    if (!isText(id, 100) || !isText(name, 100)) return null;
    if (typeof role !== "string" || !ROLES.includes(role as CharacterRole)) return null;
    if (typeof look !== "string" || look.length > 2000) return null;
    if (typeof personality !== "string" || personality.length > 2000) return null;
    if (aliases !== undefined && !isAliasList(aliases)) return null;
    cast.push({ id, name, role: role as CharacterRole, look, personality, ...(aliases?.length ? { aliases } : {}) });
  }
  return cast;
}

/**
 * POST /api/script
 * JSON: { transcript: string, cast?: CastBrief[] }  (cast defaults to the starter cast)
 */
export async function POST(request: Request) {
  const body = await readJson(request);
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

  const models = getModels();
  const source = models.sources.writeScript;
  // One script is one comic: this is the call the per-visitor comic limit counts.
  const check = guard(request, "script", { real: source === "meta" });
  if (!check.ok) return guardResponse(check);

  try {
    const script = await models.writeScript(body.transcript, cast, { visitorId: check.visitorId, signal: request.signal, meter: check.meter });
    return json<ScriptResponse>({ mode: source, script }, source);
  } catch (error) {
    // Refund only when nothing billable reached Meta; an abort or timeout after sending still counts.
    check.refundIfUnbilled();
    return modelErrorResponse(error);
  }
}
