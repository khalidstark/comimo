import "server-only";
import { readBoundedBytes, readBoundedJson } from "@/lib/requestBody";
import { requireSession } from "./session";
import { deleteRecord, getRecord, IMAGE_LIMIT, putImage, putRecord, RECORD_LIMITS, getImage, type LibraryResult, type RecordKind } from "./library";

/**
 * HTTP for /api/me/*: every handler starts with requireSession (session,
 * plus a same-origin check for writes) and works only inside the session's
 * own account. Nothing here is cached by the browser or a CDN.
 */

export const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export function jsonNoStore(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

export function libraryError(result: Extract<LibraryResult<unknown>, { ok: false }>): Response {
  const headers: Record<string, string> = result.retryAfterSec ? { "Retry-After": String(Math.max(1, result.retryAfterSec)) } : {};
  return jsonNoStore(result.current ? { error: result.error, current: result.current } : { error: result.error }, result.status, headers);
}

/** Log a failure by kind only: never ids, keys or record contents. */
export function logLibraryError(where: string, error: unknown): Response {
  console.error(`Comimo: ${where} failed (${error instanceof Error ? error.name : "unknown"})`);
  return jsonNoStore({ error: "Comimo can't reach your comic book right now. Try again in a minute." }, 503);
}

type IdContext = { params: Promise<{ id: string }> };

/** GET, PUT and DELETE for one day or character. */
export function recordRoutes(kind: RecordKind) {
  const where = kind === "days" ? "day" : "character";
  return {
    async GET(request: Request, { params }: IdContext) {
      const session = await requireSession(request);
      if (!session.ok) return session.response;
      const { id } = await params;
      try {
        const result = await getRecord(session.account.id, kind, id);
        if (!result.ok) return libraryError(result);
        return new Response(result.value, { headers: { ...NO_STORE, "Content-Type": "application/json" } });
      } catch (error) {
        return logLibraryError(`${where} read`, error);
      }
    },
    async PUT(request: Request, { params }: IdContext) {
      const session = await requireSession(request);
      if (!session.ok) return session.response;
      const { id } = await params;
      const body = await readBoundedJson(request, RECORD_LIMITS[kind] + 1024);
      if (!body.ok) return body.response;
      try {
        const result = await putRecord(session.account.id, kind, id, body.value);
        return result.ok ? jsonNoStore(result.value) : libraryError(result);
      } catch (error) {
        return logLibraryError(`${where} save`, error);
      }
    },
    async DELETE(request: Request, { params }: IdContext) {
      const session = await requireSession(request);
      if (!session.ok) return session.response;
      const { id } = await params;
      const at = new URL(request.url).searchParams.get("at");
      try {
        const result = await deleteRecord(session.account.id, kind, id, at);
        return result.ok ? jsonNoStore(result.value) : libraryError(result);
      } catch (error) {
        return logLibraryError(`${where} delete`, error);
      }
    },
  };
}

/** GET and PUT for one comic image (raw bytes in and out). */
export const imageRoutes = {
  async GET(request: Request, { params }: IdContext) {
    const session = await requireSession(request);
    if (!session.ok) return session.response;
    const { id } = await params;
    try {
      const result = await getImage(session.account.id, id);
      if (!result.ok) return libraryError(result);
      return new Response(result.value.body, {
        headers: {
          ...NO_STORE,
          "Content-Type": result.value.contentType,
          "Content-Length": String(result.value.size),
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
        },
      });
    } catch (error) {
      return logLibraryError("image read", error);
    }
  },
  async PUT(request: Request, { params }: IdContext) {
    const session = await requireSession(request);
    if (!session.ok) return session.response;
    const { id } = await params;
    const body = await readBoundedBytes(request, IMAGE_LIMIT);
    if (!body.ok) return body.response;
    try {
      const result = await putImage(session.account.id, id, body.value);
      return result.ok ? jsonNoStore(result.value) : libraryError(result);
    } catch (error) {
      return logLibraryError("image save", error);
    }
  },
};
