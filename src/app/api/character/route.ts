import { artStyleOf, isArtStyleId } from "@/lib/artStyles";
import { guard, guardResponse } from "@/lib/guard";
import { getModels, type ModelImage } from "@/lib/models";
import { signFileId, signSheet } from "@/lib/models/fileTokens";
import { drawReferenceSheetFromPhoto, isContentPolicyError } from "@/lib/models/meta/image";
import { fromWire, isRecord, isText, json, jsonError, modelErrorResponse, toWire } from "@/lib/models/wire";
import { BODY_LIMITS, readBoundedJson } from "@/lib/requestBody";
import { PhotoInputError, isPhotoType, readPhotoCrop } from "@/lib/photoInput";
import type { CharacterRole, CharacterSheetResponse } from "@/lib/types";

/** Muse Image can take a minute or two with reasoning_strength "high". */
export const maxDuration = 300;

const ROLES: CharacterRole[] = ["self", "friend", "family", "teacher", "pet", "other"];
const MIN_LOOK = 12;
const MAX_LOOK = 600;

/**
 * POST /api/character
 * JSON: { characterId, name, role, look, style?, photo?, consent? }  (style defaults to "zine")
 * Draws the character's reference sheet in that art style (front and three-quarter views, full
 * body, plain background), uploads it to the Files API once, and returns the
 * image plus a signed file token the browser keeps on the character so panels
 * can point at the sheet instead of resending it.
 *
 * `photo` (with `consent: true`) is the person cut from their photo by
 * /api/character/photo: it is the reference for this one drawing only. It is
 * checked like a photo, sent inline, never uploaded or kept, and never gets a
 * token; only the sheet Muse Image draws from it does. If Muse Image refuses
 * the photo, the sheet is drawn from the written look and `photoRefused` says so.
 */
export async function POST(request: Request) {
  // Read with a hard byte limit: Content-Length alone can't be trusted.
  const read = await readBoundedJson(request, BODY_LIMITS.character);
  if (!read.ok) return read.response;
  const body = read.value;
  if (!isRecord(body)) return jsonError(400, "Send JSON like {\"characterId\": \"...\", \"name\": \"...\", \"role\": \"friend\", \"look\": \"...\"}.");

  const { characterId, name, role, look, style, photo, consent } = body;
  if (style !== undefined && !isArtStyleId(style)) return jsonError(400, "`style` must be one of Comimo's art styles.");
  if (!isText(characterId, 100) || !isText(name, 100)) return jsonError(400, "`characterId` and `name` are required.");
  if (typeof role !== "string" || !ROLES.includes(role as CharacterRole)) return jsonError(400, "`role` must be one of the cast roles.");
  if (!isText(look, MAX_LOOK) || look.trim().length < MIN_LOOK) {
    return jsonError(400, "Describe how they look (hair, clothes, something they carry) before drawing them.");
  }

  // Cheap checks on the photo first (nothing decoded yet).
  const wire = photo === undefined ? null : fromWire(photo);
  if (photo !== undefined) {
    if (consent !== true) return jsonError(400, "Confirm you have this person's permission to use their photo.");
    if (!wire || !isPhotoType(wire.data)) return jsonError(400, "`photo` must be a JPEG, PNG or WebP image.");
  }

  const models = getModels();
  const source = models.sources.drawReferenceSheet;
  // The sheet is one image call (two if a photo is refused), counted against the daily image cap by the meter as it is sent.
  // A photo is decoded on this server, so it is counted in mock mode too.
  const check = guard(request, "character", { real: source === "meta" || wire !== null });
  if (!check.ok) return guardResponse(check);

  // Decoding costs CPU: once it starts, the visitor's slot is never refunded.
  let reference: ModelImage | null = null;
  if (wire) {
    try {
      reference = await readPhotoCrop(wire);
    } catch (error) {
      if (error instanceof PhotoInputError) return jsonError(400, error.message);
      return modelErrorResponse(error);
    }
  }

  try {
    const context = { visitorId: check.visitorId, signal: request.signal, meter: check.meter };
    const subject = { characterId, name: name.trim(), role: role as CharacterRole, look: look.trim(), style: artStyleOf(style) };
    let image: ModelImage | null = null;
    let photoRefused = false;
    if (reference && source === "meta") {
      try {
        image = await drawReferenceSheetFromPhoto(subject, reference, context);
      } catch (error) {
        if (!isContentPolicyError(error)) throw error;
        photoRefused = true;
      }
    }
    // The photo is done with: drop the reference before anything else happens.
    reference = null;
    image ??= await models.drawReferenceSheet(subject, context);
    // A failed upload isn't fatal: the sheet still works, panels send it inline and upload it then.
    const fileId = await models.uploadReference(image, context);
    return json<CharacterSheetResponse>(
      {
        mode: source,
        image: toWire(image),
        sheetToken: signSheet(image.data),
        fileToken: fileId ? signFileId(fileId) : null,
        ...(photoRefused ? { photoRefused } : {}),
      },
      source,
    );
  } catch (error) {
    // Refund only when nothing billable reached Meta and no photo was decoded; an abort or timeout after sending still counts.
    if (!wire) check.refundIfUnbilled();
    return modelErrorResponse(error);
  }
}
