import { readBoundedJson } from "@/lib/requestBody";
import { getMeta, META_LIMIT, putMeta } from "@/lib/server/library";
import { jsonNoStore, libraryError, logLibraryError } from "@/lib/server/libraryHttp";
import { requireSession } from "@/lib/server/session";

type Context = { params: Promise<{ key: string }> };

/** The key from the path; anything that doesn't decode becomes "" (refused as unknown). */
function keyOf(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return "";
  }
}

/**
 * /api/me/meta/:key — a setting that follows the account: a month's cover
 * ("cover:YYYY-MM"), the starter-cast flag, the never-ask names.
 * GET: { u, v }. PUT: { u: ISO time, v: string | number | boolean }.
 */
export async function GET(request: Request, { params }: Context) {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const { key } = await params;
  try {
    const result = await getMeta(session.account.id, keyOf(key));
    return result.ok ? jsonNoStore(result.value) : libraryError(result);
  } catch (error) {
    return logLibraryError("setting read", error);
  }
}

export async function PUT(request: Request, { params }: Context) {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const { key } = await params;
  const body = await readBoundedJson(request, META_LIMIT + 1024);
  if (!body.ok) return body.response;
  try {
    const result = await putMeta(session.account.id, keyOf(key), body.value);
    return result.ok ? jsonNoStore(result.value) : libraryError(result);
  } catch (error) {
    return logLibraryError("setting save", error);
  }
}
