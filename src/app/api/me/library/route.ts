import { connection } from "next/server";
import { libraryIndex } from "@/lib/server/library";
import { jsonNoStore, logLibraryError } from "@/lib/server/libraryHttp";
import { requireSession } from "@/lib/server/session";

/**
 * GET /api/me/library
 * What the signed-in account keeps, without the records themselves: each
 * day's and character's updatedAt (or tombstone), synced settings' stamps,
 * image ids and album ids by day. A device compares it with its own copy.
 */
export async function GET(request: Request) {
  await connection();
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  try {
    return jsonNoStore(await libraryIndex(session.account.id));
  } catch (error) {
    return logLibraryError("library read", error);
  }
}
