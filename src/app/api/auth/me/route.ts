import { cookies } from "next/headers";
import { connection } from "next/server";
import { authJson, logStoreError } from "@/lib/server/authHttp";
import { clearSessionCookie } from "@/lib/server/cookie";
import { hashTag } from "@/lib/server/request";
import { sessionAccount, sessionCookieName } from "@/lib/server/session";

/**
 * GET /api/auth/me
 * { user: { name, cacheKey } } when signed in, { user: null } otherwise. Never cached.
 * `cacheKey` names the account's on-device cache: a salted hash, never the account id.
 * A session cookie whose session is gone (expired, signed out elsewhere) is
 * expired here, so `/` shows the landing page again instead of an empty home.
 */
export async function GET(request: Request) {
  // Per request, never prerendered (Cache Components would otherwise try at build time).
  await connection();
  try {
    const account = await sessionAccount(request);
    if (!account && (await cookies()).has(sessionCookieName())) await clearSessionCookie();
    return authJson({ user: account ? { name: account.name, cacheKey: hashTag("cache", account.id) } : null });
  } catch (error) {
    logStoreError("session check", error);
    return authJson({ user: null, error: "Comimo can't check your sign-in right now." }, 503);
  }
}
