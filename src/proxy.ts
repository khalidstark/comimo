import { NextResponse, type NextRequest } from "next/server";
import { albumIsViewable } from "@/lib/server/album";
import { sessionCookieName } from "@/lib/server/cookieName";

/**
 * Two checks before a page renders:
 *
 * - /record and /welcome: an optimistic sign-in check. With no session cookie at all, a
 *   visitor who taps Record goes to the quick sign-up and comes straight back
 *   after. This only looks at the cookie's presence; the API routes check the
 *   session itself, and the page re-checks it for stale cookies.
 * - /album/:id: a missing, deleted or relinked album answers a real 404 (the
 *   page streams, so it couldn't set the status itself once it started).
 */
/** A small static page in the zine colours: no scripts, nothing from the request in it. */
const ALBUM_GONE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>This album isn't here | Comimo</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#eceff2;color:#1b2148;font:17px/1.5 system-ui,sans-serif;padding:16px}
@media (prefers-color-scheme:dark){body{background:#11152e;color:#eceff2}}
main{max-width:30rem;background:#fafbfc;color:#1b2148;border:3px solid #1b2148;border-radius:14px 18px 12px 16px;box-shadow:6px 6px 0 #1b2148;padding:28px}
.cap{display:inline-block;background:#ffc738;border:2px solid #1b2148;padding:2px 10px;font-weight:700;transform:rotate(-2deg)}
h1{font-size:2rem;line-height:1.1;margin:14px 0 8px}
a{display:inline-block;margin-top:12px;background:#f2397a;color:#1b2148;border:2px solid #1b2148;border-radius:10px;padding:10px 18px;font-weight:700;text-decoration:none;box-shadow:3px 3px 0 #1b2148}
</style></head>
<body><main><span class="cap">Photo album</span><h1>This album isn't here</h1>
<p>The link may have been changed or the album deleted. Ask whoever shared it for the new link.</p>
<a href="/">Go to Comimo</a></main></body></html>`;

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
    // A page response starts streaming with 200 (its shell is prerendered), so the 404 is answered here.
    return new NextResponse(ALBUM_GONE_HTML, {
      status: 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      },
    });
  }

  if (request.cookies.has(sessionCookieName())) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/signup";
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/record", "/welcome", "/album/:id"],
};
