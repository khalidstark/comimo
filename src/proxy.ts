import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieName } from "@/lib/server/cookieName";

/**
 * An optimistic sign-in check for the record page: with no session cookie at
 * all, a visitor who taps Record goes to the quick sign-up and comes straight
 * back after. This only looks at the cookie's presence; the API routes check
 * the session itself, and the page re-checks it for stale cookies.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(sessionCookieName())) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/signup";
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/record"],
};
