import "server-only";
import { createHash } from "node:crypto";

/**
 * Where a request came from: same-origin checks (CSRF) and the caller's IP,
 * which is only ever stored as a salted hash.
 */

function hostOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * True when a state-changing request was sent by this site's own pages.
 *
 * Browsers send `Origin` on every POST; it must name this host (the Host
 * header, or the forwarded host behind Vercel's proxy, neither of which a
 * page on another site can set). Without `Origin`, `Sec-Fetch-Site` must say
 * same-origin. A request with neither header isn't from a browser (curl, a
 * script), so there is no victim's cookie to ride on and it passes; the
 * session check still applies. The SameSite=Lax cookie is a second wall.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    if (origin === "null") return false;
    const from = hostOf(origin);
    if (!from) return false;
    const hosts = [request.headers.get("host"), request.headers.get("x-forwarded-host")]
      .flatMap((value) => (value ? value.split(",") : []))
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    return hosts.includes(from);
  }
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  return true;
}

/**
 * The caller's IP, only from a source the visitor can't set.
 *
 * On Vercel (VERCEL=1 at runtime) the platform overwrites X-Forwarded-For and
 * sets X-Vercel-Forwarded-For "to prevent IP spoofing" (vercel.com/docs/headers/request-headers),
 * so those are trusted there. Anywhere else these headers come straight from
 * the client, so every caller counts as "local" and the global caps do the
 * limiting. X-Real-IP is never read.
 */
export function clientIp(request: Request): string {
  if (process.env.VERCEL !== "1") return "local";
  const header = request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for");
  return header?.split(",")[0]?.trim() || "local";
}

/**
 * The salt for hashed identifiers kept in the shared store. It must be the
 * same on every instance, so it comes from COMIMO_GUARD_SALT (set it in
 * production) with a fixed fallback for development.
 */
export function identifierSalt(): string {
  return process.env.COMIMO_GUARD_SALT || "comimo-dev-salt";
}

/** A salted, non-reversible tag for any identifier (IP, email, account id). */
export function hashTag(kind: string, value: string): string {
  return createHash("sha256").update(`${identifierSalt()}:${kind}:${value}`).digest("hex").slice(0, 32);
}

/** The caller's IP as a hashed tag, for per-IP limits. */
export function ipTag(request: Request): string {
  return hashTag("ip", clientIp(request));
}
