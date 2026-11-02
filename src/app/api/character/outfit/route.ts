import { artStyleOf, isArtStyleId } from "@/lib/artStyles";
import { guard, guardResponse, withCost } from "@/lib/guard";
import { getModels, type ModelImage, type OutfitText } from "@/lib/models";
import { isTrustedSheet, signFileId, signSheet } from "@/lib/models/fileTokens";
import { isSendableImage } from "@/lib/models/meta/image";
import { fromWire, isRecord, isText, json, jsonError, modelErrorResponse, toWire } from "@/lib/models/wire";
import { PhotoInputError, cropPerson, isPhotoType, readPhoto } from "@/lib/photoInput";
import { pickPerson } from "@/lib/models/meta/photo";
import { BODY_LIMITS, readBoundedJson } from "@/lib/requestBody";
import { requireSession } from "@/lib/server/session";
import type { CharacterRole, OutfitResponse } from "@/lib/types";

/** SAM, Spark and one Muse Image edit (two if the photo is refused). */
export const maxDuration = 300;

const ROLES: CharacterRole[] = ["self", "friend", "family", "teacher", "pet", "other"];
const MAX_LOOK = 600;
const MAX_CLOTHES = 300;

/** An outfit the browser already has, sent back to draw it in another style. */
function parseKnown(value: unknown): OutfitText | null {
  if (!isRecord(value)) return null;
  const { clothes, label, look } = value;
  if (!isText(clothes, MAX_CLOTHES) || !isText(label, 60) || !isText(look, MAX_LOOK)) return null;
  return { clothes: clothes.trim(), label: label.trim(), look: look.trim() };
}

/**
 * POST /api/character/outfit
 * JSON: OutfitRequest. The character's reference sheet redrawn with only the
 * clothes changed (Muse Image edit), from typed clothes, a photo, or both:
 * - photo (with consent): SAM 3.1 finds the person, the crop shows Muse Spark
 *   and Muse Image the clothes; the photo and crop are used in this request
 *   only, never stored or uploaded;
 * - Muse Spark writes the clothes, a label and the whole look with the clothes swapped;
 * - `outfit` instead: an existing outfit drawn in another art style (no Spark call).
 * The sheet must be one this server drew (or a starter sheet). Returns the new
 * sheet with its tokens, like /api/character, and the request's cost header.
 */
export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const read = await readBoundedJson(request, BODY_LIMITS.wardrobe);
  if (!read.ok) return read.response;
  const body = read.value;
  if (!isRecord(body)) return jsonError(400, "Send JSON like {\"characterId\": \"...\", \"sheet\": {...}, \"clothes\": \"...\"}.");

  const { characterId, name, role, look, style, sheet, sheetToken, clothes, photo, consent, outfit } = body;
  if (!isText(characterId, 100) || !isText(name, 100)) return jsonError(400, "`characterId` and `name` are required.");
  if (typeof role !== "string" || !ROLES.includes(role as CharacterRole)) return jsonError(400, "`role` must be one of the cast roles.");
  if (role === "pet") return jsonError(400, "Pets keep their fur. Outfits are for people.");
  if (!isText(look, MAX_LOOK)) return jsonError(400, "`look` is required.");
  if (style !== undefined && !isArtStyleId(style)) return jsonError(400, "`style` must be one of Comimo's art styles.");
  if (clothes !== undefined && (typeof clothes !== "string" || clothes.length > MAX_CLOTHES)) {
    return jsonError(400, `Describe the clothes in under ${MAX_CLOTHES} characters.`);
  }
  const typed = typeof clothes === "string" ? clothes.replace(/\s+/g, " ").trim() : "";
  const known = outfit === undefined ? null : parseKnown(outfit);
  if (outfit !== undefined && !known) return jsonError(400, "`outfit` needs clothes, a label and a look.");

  const models = getModels();
  const source = models.sources.outfit;
  const mock = source === "mock";

  const sheetImage = fromWire(sheet);
  if (!sheetImage) return jsonError(400, "`sheet` must be the character's reference sheet.");
  if (!mock && (!isSendableImage(sheetImage) || !isTrustedSheet(sheetImage.data, sheetToken))) {
    return jsonError(400, "That reference sheet wasn't drawn by Comimo. Redraw it from the cast screen.");
  }

  const photoWire = photo === undefined ? null : fromWire(photo);
  if (photo !== undefined) {
    if (consent !== true) return jsonError(400, "Confirm the photo is of this person and they're happy for you to use it.");
    if (!photoWire || !isPhotoType(photoWire.data)) return jsonError(400, "`photo` must be a JPEG, PNG or WebP image.");
  }
  if (!known && !photoWire && typed.length < 3) return jsonError(400, "Describe the clothes or add a photo of them.");

  // One outfit is one image call (two if a photo is refused), plus SAM and Spark; a photo is decoded here, so it counts in mock mode too.
  const check = await guard(request, "wardrobe", { real: !mock || photoWire !== null });
  if (!check.ok) return guardResponse(check);
  const subjectStyle = artStyleOf(style);
  check.meter.tag({ style: subjectStyle });

  // Decoding costs CPU: from here the slot is never refunded when a photo came.
  let crop: ModelImage | null = null;
  try {
    const context = { visitorId: check.visitorId, signal: request.signal, meter: check.meter };
    if (photoWire && !known) {
      let decoded: Awaited<ReturnType<typeof readPhoto>>;
      try {
        decoded = await readPhoto(photoWire.data);
      } catch (error) {
        if (error instanceof PhotoInputError) return withCost(jsonError(400, error.message), check.meter);
        throw error;
      }
      const person = pickPerson(await models.findPeople(decoded, context), decoded.width, decoded.height);
      if (!person) return withCost(jsonError(422, "Comimo couldn't find one clear person in that photo. Try one where the clothes are easy to see."), check.meter);
      crop = await cropPerson(decoded, decoded.width, decoded.height, person);
    }

    const words = known ?? (await models.writeOutfit({ name: name.trim(), look: look.trim() }, { clothes: typed || undefined, photo: crop }, context));
    if (!words) {
      return withCost(jsonError(422, "Comimo couldn't tell what the clothes are. Try a clearer photo, or describe them."), check.meter);
    }
    const subject = { characterId, name: name.trim(), role: role as CharacterRole, look: words.look, style: subjectStyle };
    const { image, photoRefused } = await models.drawOutfitSheet(subject, { image: sheetImage }, words.clothes, crop, context);
    // The photo is done with.
    crop = null;
    const fileId = await models.uploadReference(image, context);
    return withCost(
      json<OutfitResponse>(
        {
          mode: source,
          outfit: words,
          image: toWire(image),
          sheetToken: signSheet(image.data),
          fileToken: fileId ? signFileId(fileId) : null,
          ...(photoRefused ? { photoRefused } : {}),
        },
        source,
      ),
      check.meter,
    );
  } catch (error) {
    if (!photoWire) check.refundIfUnbilled();
    return withCost(modelErrorResponse(error), check.meter);
  }
}
