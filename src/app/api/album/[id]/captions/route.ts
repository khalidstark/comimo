import { guard, guardResponse } from "@/lib/guard";
import { isMockMode } from "@/lib/models";
import { suggestCaptions } from "@/lib/models/meta/captions";
import { modelErrorResponse } from "@/lib/models/wire";
import { photosForCaptions } from "@/lib/server/album";
import { albumFailure, type AlbumContext } from "@/lib/server/albumHttp";
import { jsonNoStore, libraryError } from "@/lib/server/libraryHttp";
import { requireSession } from "@/lib/server/session";

export const maxDuration = 120;

const MOCK_CAPTIONS = ["A good moment from the day.", "Everyone in one place.", "Worth keeping.", "The light was just right."];

/**
 * POST /api/album/:id/captions — owner only, and only when the owner asks
 * (the page never calls it by itself). Muse Spark looks at the album's
 * photos and suggests one short caption each: { captions: { photoId: text } }.
 * Nothing is saved; the owner edits and saves them. Metered per account
 * (guard action "caption") and counted against the daily caps.
 */
export async function POST(request: Request, { params }: AlbumContext) {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const { id } = await params;
  try {
    const found = await photosForCaptions(session.account.id, id);
    if (!found.ok) return libraryError(found);
    const { album, images } = found.value;
    if (images.length === 0) return jsonNoStore({ error: "Add a photo first." }, 400);

    const mock = isMockMode();
    const check = await guard(request, "caption", { real: !mock });
    if (!check.ok) return guardResponse(check);
    if (mock) {
      return jsonNoStore({ mode: "mock", captions: Object.fromEntries(images.map((image, i) => [image.id, MOCK_CAPTIONS[i % MOCK_CAPTIONS.length]])) });
    }
    try {
      const captions = await suggestCaptions(
        images.map((image) => image.data),
        album.title,
        { visitorId: check.visitorId, signal: request.signal, meter: check.meter },
      );
      return jsonNoStore({ mode: "meta", captions: Object.fromEntries(images.map((image, i) => [image.id, captions[i] ?? ""])) });
    } catch (error) {
      check.refundIfUnbilled();
      return modelErrorResponse(error);
    }
  } catch (error) {
    return albumFailure("captions", error);
  }
}
