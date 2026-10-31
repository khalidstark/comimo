import { connection } from "next/server";
import { authJson, logStoreError } from "@/lib/server/authHttp";
import { sessionAccount } from "@/lib/server/session";

/**
 * GET /api/auth/me
 * { user: { name } } when signed in, { user: null } otherwise. Never cached.
 */
export async function GET(request: Request) {
  // Per request, never prerendered (Cache Components would otherwise try at build time).
  await connection();
  try {
    const account = await sessionAccount(request);
    return authJson({ user: account ? { name: account.name } : null });
  } catch (error) {
    logStoreError("session check", error);
    return authJson({ user: null, error: "Comimo can't check your sign-in right now." }, 503);
  }
}
