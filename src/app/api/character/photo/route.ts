import { guard, guardResponse } from "@/lib/guard";
import { isMockMode } from "@/lib/models";
import { describePerson, findPeople, pickPerson } from "@/lib/models/meta/photo";
import { json, jsonError, modelErrorResponse, toWire } from "@/lib/models/wire";
import { MAX_PHOTO_BYTES, PhotoInputError, cropPerson, readPhoto } from "@/lib/photoInput";
import { BODY_LIMITS, readBoundedForm } from "@/lib/requestBody";
import type { PhotoLookResponse } from "@/lib/types";

export const maxDuration = 120;

const MOCK_LOOK = "Adult with short dark hair, wearing a plain jacket over a T-shirt. (Mock description: the real models aren't connected.)";

/**
 * POST /api/character/photo
 * multipart: `photo` (JPEG, PNG or WebP, at most 5 MB and 1536 px a side), `consent` ("yes")
 * Finds the person in the photo with SAM 3.1, cuts them out, and has Muse
 * Spark describe how they look. Returns the description and the cut-out,
 * which the browser keeps in memory to draw the sheet once.
 *
 * The visitor's photo limit is checked first, in mock mode too, before the
 * body is read; the body is read with a hard byte limit. The photo is
 * checked, used in memory for this one request and never stored: not on
 * disk, not in the Files API, not in a log.
 */
export async function POST(request: Request) {
  const mock = isMockMode();
  // The limit comes before any parsing or image work. Mock mode is counted too: decoding photos costs CPU.
  const check = guard(request, "photo", { real: true });
  if (!check.ok) return guardResponse(check);

  const body = await readBoundedForm(request, BODY_LIMITS.photo, "Send the photo as multipart form data with `photo` and `consent`.");
  if (!body.ok) {
    check.refundIfUnbilled();
    return body.response;
  }
  const form = body.value;
  const refuse = (status: number, message: string) => {
    check.refundIfUnbilled();
    return jsonError(status, message);
  };
  if (form.get("consent") !== "yes") return refuse(400, "Tick the box to confirm you have this person's permission to use their photo.");
  const file = form.get("photo");
  if (!(file instanceof File)) return refuse(400, "Add a photo.");
  if (file.size > MAX_PHOTO_BYTES) return refuse(413, "That photo is too big. Use one under 5 MB.");

  let photo: Awaited<ReturnType<typeof readPhoto>>;
  try {
    photo = await readPhoto(new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    if (error instanceof PhotoInputError) return refuse(400, error.message);
    check.refundIfUnbilled();
    throw error;
  }

  if (mock) {
    // No model calls: the middle of the photo stands in for the cut-out.
    const box = { x1: photo.width * 0.2, y1: photo.height * 0.05, x2: photo.width * 0.8, y2: photo.height * 0.95, score: 1 };
    const crop = await cropPerson(photo, photo.width, photo.height, box);
    return json<PhotoLookResponse>({ mode: "mock", look: MOCK_LOOK, crop: toWire(crop) }, "mock");
  }

  try {
    // One SAM call (daily image cap) and one Spark call, both metered as they are sent.
    const context = { visitorId: check.visitorId, signal: request.signal, meter: check.meter };
    const person = pickPerson(await findPeople(photo, context), photo.width, photo.height);
    if (!person) return jsonError(422, "Comimo couldn't find one clear person in that photo. Try a photo where they stand out.");
    const crop = await cropPerson(photo, photo.width, photo.height, person);
    const look = await describePerson(crop, context);
    if (!look) return jsonError(422, "Comimo couldn't describe a person from that photo. Try another one, or write how they look.");
    return json<PhotoLookResponse>({ mode: "meta", look, crop: toWire(crop) }, "meta");
  } catch (error) {
    check.refundIfUnbilled();
    return modelErrorResponse(error);
  }
}
