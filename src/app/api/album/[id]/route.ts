import { readBoundedJson } from "@/lib/requestBody";
import { deleteAlbum, ownedAlbum, setCaptions, updateAlbum } from "@/lib/server/album";
import { albumFailure, albumJson, type AlbumContext } from "@/lib/server/albumHttp";
import { requireSession } from "@/lib/server/session";

/**
 * /api/album/:id — owner only (anyone else gets 404, as for a missing album).
 * GET: the album with its photos and day. PATCH { title?, link?, captions? }:
 * change the title, the pasted link (null removes it) or captions by photo id.
 * DELETE: the album and every photo in it.
 */
export async function GET(request: Request, { params }: AlbumContext) {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const { id } = await params;
  try {
    return albumJson(await ownedAlbum(session.account.id, id));
  } catch (error) {
    return albumFailure("read", error);
  }
}

export async function PATCH(request: Request, { params }: AlbumContext) {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const { id } = await params;
  const body = await readBoundedJson(request, 32 * 1024);
  if (!body.ok) return body.response;
  const input = (typeof body.value === "object" && body.value !== null ? body.value : {}) as Record<string, unknown>;
  try {
    if (input.title !== undefined || input.link !== undefined) {
      const updated = await updateAlbum(session.account.id, id, { title: input.title, link: input.link });
      if (!updated.ok || input.captions === undefined) return albumJson(updated);
    }
    if (input.captions !== undefined) return albumJson(await setCaptions(session.account.id, id, input.captions));
    return albumJson(await ownedAlbum(session.account.id, id));
  } catch (error) {
    return albumFailure("update", error);
  }
}

export async function DELETE(request: Request, { params }: AlbumContext) {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const { id } = await params;
  try {
    return albumJson(await deleteAlbum(session.account.id, id));
  } catch (error) {
    return albumFailure("delete", error);
  }
}
