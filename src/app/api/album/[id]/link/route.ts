import { regenerateAlbumLink } from "@/lib/server/album";
import { albumFailure, albumJson, type AlbumContext } from "@/lib/server/albumHttp";
import { requireSession } from "@/lib/server/session";

/**
 * POST /api/album/:id/link — owner only. Give the album a new random id: the
 * old link and its QR code stop working at once. Answers the album under its new id.
 */
export async function POST(request: Request, { params }: AlbumContext) {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const { id } = await params;
  try {
    return albumJson(await regenerateAlbumLink(session.account.id, id));
  } catch (error) {
    return albumFailure("new link", error);
  }
}
