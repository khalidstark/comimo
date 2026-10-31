import { NextResponse, type NextRequest } from "next/server";
import { albumIsViewable } from "@/lib/server/album";
import { sessionCookieName } from "@/lib/server/cookieName";

/**
 * Two checks before a page renders:
 *
 * - /record: an optimistic sign-in check. With no session cookie at all, a
 *   visitor who taps Record goes to the quick sign-up and comes straight back
 *   after. This only looks at the cookie's presence; the API routes check the
 *   session itself, and the page re-checks it for stale cookies.
 * - /album/:id: a missing, deleted or relinked album answers a real 404 (the
 *   page streams, so it couldn't set the status itself once it started).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/album/")) {
    const id = pathname.slice("/album/".length);
    let viewable = false;
    try {
      viewable = await albumIsViewable(id);
    } catch {
      // Store unreachable: let the page answer (it shows the same "not here" message).
      return NextResponse.next();
    }
    if (viewable) return NextResponse.next();
    return NextResponse.rewrite(new URL("/album/not-here", request.url), { status: 404, headers: { "X-Robots-Tag": "noindex" } });
  }

  if (request.cookies.has(sessionCookieName())) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/signup";
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/record", "/album/:id"],
};
