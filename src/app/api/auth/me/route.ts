import { connection } from "next/server";
import { authJson, logStoreError } from "@/lib/server/authHttp";
import { hashTag } from "@/lib/server/request";
import { sessionAccount } from "@/lib/server/session";

/**
 * GET /api/auth/me
 * { user: { name, cacheKey } } when signed in, { user: null } otherwise. Never cached.
 * `cacheKey` names the account's on-device cache: a salted hash, never the account id.
 */
export async function GET(request: Request) {
  // Per request, never prerendered (Cache Components would otherwise try at build time).
  await connection();
  try {
    const account = await sessionAccount(request);
    return authJson({ user: account ? { name: account.name, cacheKey: hashTag("cache", account.id) } : null });
  } catch (error) {
    logStoreError("session check", error);
    return authJson({ user: null, error: "Comimo can't check your sign-in right now." }, 503);
  }
}
