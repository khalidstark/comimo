import { artStyleOf, isArtStyleId } from "@/lib/artStyles";
import { guard, guardResponse, withCost } from "@/lib/guard";
import { getModels, type ModelImage } from "@/lib/models";
import { peopleWorthALook, pickMatches } from "@/lib/models/outfitPick";
import { signFileId, signSheet } from "@/lib/models/fileTokens";
import { parseReferences } from "@/lib/models/references";
import { fromWire, isRecord, json, jsonError, modelErrorResponse, toWire } from "@/lib/models/wire";
import { PhotoInputError, cropPerson, isPhotoType, readPhoto } from "@/lib/photoInput";
import { BODY_LIMITS, readBoundedJson } from "@/lib/requestBody";
import { requireSession } from "@/lib/server/session";
import type { ApiError, TodayOutfit, TodayOutfitResponse } from "@/lib/types";

/** SAM per photo, one Spark match, then one Muse Image edit per person dressed (at once). */
export const maxDuration = 300;

const MAX_PHOTOS = 6;
/** The narrator and up to three more cast members. */
const MAX_REFERENCES = 4;
/** People looked at in all the photos. */
const MAX_CROPS = 8;

/**
 * POST /api/outfit/today
 * JSON: TodayOutfitRequest. Before a comic is drawn: SAM 3.1 finds the people
 * in the day's photos, Muse Spark says which of them are the narrator and
 * their cast (face and hair, not clothes) and what they wear, and Muse Image
 * redraws each one's sheet in those clothes for this day only (at most three
 * people). Nobody recognised is a quiet empty answer, never an error.
 *
 * The photos are used in this request only: never stored, uploaded or logged.
 * (The browser puts them in the day's photo album itself, under the album's rules.)
 */
export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const read = await readBoundedJson(request, BODY_LIMITS.outfitToday);
  if (!read.ok) return read.response;
  const body = read.value;
  if (!isRecord(body)) return jsonError(400, "Send JSON like {\"photos\": [...], \"references\": [...]}.");
  if (body.style !== undefined && !isArtStyleId(body.style)) return jsonError(400, "`style` must be one of Comimo's art styles.");
  const style = artStyleOf(body.style);

  if (!Array.isArray(body.photos) || body.photos.length === 0 || body.photos.length > MAX_PHOTOS) {
    return jsonError(400, `Send 1 to ${MAX_PHOTOS} photos.`);
  }
  const wires = body.photos.map(fromWire);
  if (wires.some((wire) => !wire || !isPhotoType(wire.data))) return jsonError(400, "Photos must be JPEG, PNG or WebP images.");

  const references = parseReferences(body.references, MAX_REFERENCES);
  if (references === "stale") {
    return Response.json({ error: "A reference sheet needs uploading again.", code: "stale-reference" } satisfies ApiError, { status: 409, headers: { "Cache-Control": "no-store" } });
  }
  if (references === "untrusted") return jsonError(400, "That reference sheet wasn't drawn by Comimo. Redraw it from the cast screen.");
  if (!references || references.length === 0) return jsonError(400, "`references` must list the narrator and their cast.");
  const people = references.filter((ref) => ref.role !== "pet");

  const models = getModels();
  const source = models.sources.outfit;
  // The photos are decoded here, so the request counts in practice mode too; every model call is metered as it is sent.
  const check = await guard(request, "outfit", { real: true });
  if (!check.ok) return guardResponse(check);
  check.meter.tag({ style });

  try {
    const context = { visitorId: check.visitorId, signal: request.signal, meter: check.meter };
    const photos = await Promise.all(
      (wires as ModelImage[]).map(async (wire) => {
        try {
          return await readPhoto(wire.data);
        } catch (error) {
          if (error instanceof PhotoInputError) return null;
          throw error;
        }
      }),
    );

    // SAM on every photo at once; then the people worth a look, cut out.
    const found = await Promise.all(photos.map((photo) => (photo ? models.findPeople(photo, context) : Promise.resolve([]))));
    const crops: { photo: number; image: ModelImage }[] = [];
    for (const [i, photo] of photos.entries()) {
      if (!photo) continue;
      for (const person of peopleWorthALook(found[i], photo.width, photo.height)) {
        if (crops.length >= MAX_CROPS) break;
        crops.push({ photo: i, image: await cropPerson(photo, photo.width, photo.height, person) });
      }
    }
    const answer = (outfits: TodayOutfit[]) =>
      withCost(json<TodayOutfitResponse>({ mode: source, outfits, people: crops.length }, source), check.meter);
    if (crops.length === 0 || people.length === 0) return answer([]);

    const matches = pickMatches(
      await models.matchPeople(
        crops.map((crop) => crop.image),
        people,
        context,
      ),
      people.map((ref) => ref.characterId),
    );

    const dressed = await Promise.all(
      matches.map(async (match): Promise<TodayOutfit | null> => {
        const ref = people.find((p) => p.characterId === match.characterId)!;
        const crop = crops[match.crop];
        try {
          const subject = { characterId: ref.characterId, name: ref.name, role: ref.role ?? "other", look: match.look, style };
          const { image } = await models.drawOutfitSheet(subject, { image: ref.image, ...(ref.fileId ? { fileId: ref.fileId } : {}) }, match.clothes, crop.image, context);
          const fileId = await models.uploadReference(image, context);
          return {
            characterId: ref.characterId,
            clothes: match.clothes,
            label: match.label,
            look: match.look,
            photo: crop.photo,
            image: toWire(image),
            sheetToken: signSheet(image.data),
            fileToken: fileId ? signFileId(fileId) : null,
          };
        } catch (error) {
          if (request.signal.aborted) throw error;
          // One person who doesn't draw leaves the others dressed; they wear their usual clothes.
          console.warn(`Comimo: today's outfit for one person didn't draw (${error instanceof Error ? error.name : "unknown"})`);
          return null;
        }
      }),
    );
    return answer(dressed.flatMap((outfit) => outfit ?? []));
  } catch (error) {
    // No refund: the photos were decoded.
    return withCost(modelErrorResponse(error), check.meter);
  }
}
