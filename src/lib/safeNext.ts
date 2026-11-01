/**
 * Where to send someone after signing in or up (the `?next=` value).
 *
 * Only a fixed list of in-app pages is allowed: home, record, cast, month, About you and
 * a day by id. Anything else, including any input that parses or normalises
 * to another origin, a protocol-relative path ("//evil.example",
 * "/.//evil.example") or an API route, falls back. The answer is always
 * rebuilt from the normalised pathname alone, never the raw input.
 */

const PAGES = new Set(["/", "/record", "/cast", "/month", "/welcome"]);
const DAY = /^\/day\/[A-Za-z0-9_-]{1,80}$/;
const BASE = "https://comimo.invalid";

export function safeNext(raw: string | null | undefined, fallback = "/"): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.length > 200) return fallback;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  const path = url.pathname;
  if (path.startsWith("//") || path.startsWith("/\\")) return fallback;
  return PAGES.has(path) || DAY.test(path) ? path : fallback;
}
