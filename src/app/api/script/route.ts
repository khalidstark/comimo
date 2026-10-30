import { starterCastBriefs } from "@/fixtures/cast";
import { getModels } from "@/lib/models";
import { isRecord, isText, json, jsonError, modelErrorResponse, readJson } from "@/lib/models/wire";
import type { CastBrief, CharacterRole, ScriptResponse } from "@/lib/types";

const MAX_TRANSCRIPT = 20_000;
const MAX_CAST = 20;
const ROLES: CharacterRole[] = ["self", "friend", "family", "teacher", "pet", "other"];

function parseCast(value: unknown): CastBrief[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CAST) return null;
  const cast: CastBrief[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const { id, name, role, look, personality } = item;
    if (!isText(id, 100) || !isText(name, 100)) return null;
    if (typeof role !== "string" || !ROLES.includes(role as CharacterRole)) return null;
    if (typeof look !== "string" || look.length > 2000) return null;
    if (typeof personality !== "string" || personality.length > 2000) return null;
    cast.push({ id, name, role: role as CharacterRole, look, personality });
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
  try {
    const script = await models.writeScript(body.transcript, cast);
    return json<ScriptResponse>({ mode: models.mode, script }, models.mode);
  } catch (error) {
    return modelErrorResponse(error);
  }
}
