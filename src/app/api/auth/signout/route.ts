import { authError, authJson, logStoreError } from "@/lib/server/authHttp";
import { clearSessionCookie } from "@/lib/server/cookie";
import { isSameOrigin } from "@/lib/server/request";
import { destroySession, sessionIdFrom } from "@/lib/server/session";

/**
 * POST /api/auth/signout
 * Deletes the session from the store (so the cookie stops working everywhere)
 * and expires the cookie.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return authError(403, "That request came from another site.");
  try {
    await destroySession(sessionIdFrom(request));
  } catch (error) {
    logStoreError("sign-out", error);
    await clearSessionCookie();
    return authError(503, "Comimo couldn't finish signing you out. Try again in a minute.");
  }
  await clearSessionCookie();
  return authJson({ ok: true });
}
