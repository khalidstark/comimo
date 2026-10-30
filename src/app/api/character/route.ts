import { guard, guardResponse } from "@/lib/guard";
import { getModels } from "@/lib/models";
import { signFileId, signSheet } from "@/lib/models/fileTokens";
import { isRecord, isText, json, jsonError, modelErrorResponse, readJson, toWire } from "@/lib/models/wire";
import type { CharacterRole, CharacterSheetResponse } from "@/lib/types";

/** Muse Image can take a minute or two with reasoning_strength "high". */
export const maxDuration = 300;

const ROLES: CharacterRole[] = ["self", "friend", "family", "teacher", "pet", "other"];
const MIN_LOOK = 12;
const MAX_LOOK = 600;

/**
 * POST /api/character
 * JSON: { characterId, name, role, look }
 * Draws the character's reference sheet (front and three-quarter views, full
 * body, plain background), uploads it to the Files API once, and returns the
 * image plus a signed file token the browser keeps on the character so panels
 * can point at the sheet instead of resending it.
 */
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!isRecord(body)) return jsonError(400, "Send JSON like {\"characterId\": \"...\", \"name\": \"...\", \"role\": \"friend\", \"look\": \"...\"}.");

  const { characterId, name, role, look } = body;
  if (!isText(characterId, 100) || !isText(name, 100)) return jsonError(400, "`characterId` and `name` are required.");
  if (typeof role !== "string" || !ROLES.includes(role as CharacterRole)) return jsonError(400, "`role` must be one of the cast roles.");
  if (!isText(look, MAX_LOOK) || look.trim().length < MIN_LOOK) {
    return jsonError(400, "Describe how they look (hair, clothes, something they carry) before drawing them.");
  }

  const models = getModels();
  const source = models.sources.drawReferenceSheet;
  // The sheet is one image call, counted against the daily image cap by the meter as it is sent.
  const check = guard(request, "character", { real: source === "meta" });
  if (!check.ok) return guardResponse(check);

  try {
    const context = { visitorId: check.visitorId, signal: request.signal, meter: check.meter };
    const image = await models.drawReferenceSheet(
      { characterId, name: name.trim(), role: role as CharacterRole, look: look.trim() },
      context,
    );
    // A failed upload isn't fatal: the sheet still works, panels send it inline and upload it then.
    const fileId = await models.uploadReference(image, context);
    return json<CharacterSheetResponse>(
      { mode: source, image: toWire(image), sheetToken: signSheet(image.data), fileToken: fileId ? signFileId(fileId) : null },
      source,
    );
  } catch (error) {
    // Refund only when nothing billable reached Meta; an abort or timeout after sending still counts.
    check.refundIfUnbilled();
    return modelErrorResponse(error);
  }
}
