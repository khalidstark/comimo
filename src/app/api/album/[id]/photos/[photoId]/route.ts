import { albumPhoto, removePhoto } from "@/lib/server/album";
import { albumFailure, albumJson, type PhotoContext } from "@/lib/server/albumHttp";
import { requireSession } from "@/lib/server/session";

/**
 * GET /api/album/:id/photos/:photoId — one photo, for anyone with the album's
 * link (that is what the link is for). Kept out of shared caches and search
 * engines; a deleted album or a regenerated link answers 404 at once.
 * DELETE — owner only: remove the photo.
 */
export async function GET(_request: Request, { params }: PhotoContext) {
  const { id, photoId } = await params;
  try {
    const photo = await albumPhoto(id, photoId);
    if (!photo) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
    return new Response(photo.body, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(photo.size),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, noimageindex",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    return albumFailure("photo read", error);
  }
}

export async function DELETE(request: Request, { params }: PhotoContext) {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const { id, photoId } = await params;
  try {
    return albumJson(await removePhoto(session.account.id, id, photoId));
  } catch (error) {
    return albumFailure("photo delete", error);
  }
}
