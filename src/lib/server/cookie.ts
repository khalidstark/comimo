import "server-only";
import { cookies } from "next/headers";
import { sessionCookieName, sessionCookieOptions } from "./session";

/** Set the session cookie on the response (Route Handlers and Server Functions only). */
export async function setSessionCookie(sessionId: string): Promise<void> {
  (await cookies()).set(sessionCookieName(), sessionId, sessionCookieOptions());
}

/** Expire the session cookie with the same attributes it was set with. */
export async function clearSessionCookie(): Promise<void> {
  (await cookies()).set(sessionCookieName(), "", { ...sessionCookieOptions(), maxAge: 0 });
}
