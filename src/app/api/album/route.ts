import { connection } from "next/server";
import { readBoundedJson } from "@/lib/requestBody";
import { albumForDay, createAlbum } from "@/lib/server/album";
import { albumFailure, albumJson } from "@/lib/server/albumHttp";
import { NO_STORE } from "@/lib/server/libraryHttp";
import { requireSession } from "@/lib/server/session";

/**
 * GET /api/album?day=<dayId> — the signed-in account's album for one of its days (204 when it has none:
 *   most days have no album, so that's an answer, not an error the browser console shows in red).
 * POST /api/album { dayId, title, link? } — start the album for a day (or get the one it has).
 */
export async function GET(request: Request) {
  // Per request, never prerendered (Cache Components would otherwise answer from build time).
  await connection();
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const day = new URL(request.url).searchParams.get("day") ?? "";
  try {
    const result = await albumForDay(session.account.id, day);
    if (!result.ok && result.status === 404) return new Response(null, { status: 204, headers: NO_STORE });
    return albumJson(result);
  } catch (error) {
    return albumFailure("read", error);
  }
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const body = await readBoundedJson(request, 8 * 1024);
  if (!body.ok) return body.response;
  const input = (typeof body.value === "object" && body.value !== null ? body.value : {}) as Record<string, unknown>;
  try {
    return albumJson(await createAlbum(session.account.id, { dayId: input.dayId, title: input.title, link: input.link }), 201);
  } catch (error) {
    return albumFailure("create", error);
  }
}
