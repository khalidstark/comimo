import { readBoundedBytes } from "@/lib/requestBody";
import { addPhoto } from "@/lib/server/album";
import { MAX_ALBUM_PHOTO_BYTES } from "@/lib/server/albumPhoto";
import { albumFailure, albumJson, type AlbumContext } from "@/lib/server/albumHttp";
import { requireSession } from "@/lib/server/session";

export const maxDuration = 60;

/**
 * POST /api/album/:id/photos — owner only. The body is one photo's raw bytes
 * (JPEG, PNG, WebP or HEIC by its first bytes, at most 5 MB, with a
 * Content-Length), read as a stream with a hard limit. The photo is
 * re-encoded as a JPEG of at most 2048 px with no EXIF or location data.
 */
export async function POST(request: Request, { params }: AlbumContext) {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const { id } = await params;
  const body = await readBoundedBytes(request, MAX_ALBUM_PHOTO_BYTES);
  if (!body.ok) return body.response;
  try {
    return albumJson(await addPhoto(session.account.id, id, body.value), 201);
  } catch (error) {
    return albumFailure("photo upload", error);
  }
}
