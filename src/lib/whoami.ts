/**
 * Who is signed in, asked once per page load (the session cookie is
 * httpOnly, so the browser asks /api/auth/me). Shared by the account menu
 * and the store, which keeps each account's comics in its own on-device cache.
 */

export interface Me {
  name: string;
  /** An opaque per-account key (a salted hash, not the account id) naming this account's on-device cache. */
  cacheKey: string;
}

let request: Promise<Me | null> | null = null;

/** The signed-in account, or null when signed out. Rejects only when the answer couldn't be read (offline). */
export function whoAmI(): Promise<Me | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  request ??= fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" })
    .then((response) => response.json() as Promise<{ user?: { name?: unknown; cacheKey?: unknown } | null }>)
    .then((body) => {
      const name = body.user?.name;
      const cacheKey = body.user?.cacheKey;
      return typeof name === "string" && typeof cacheKey === "string" && /^[a-f0-9]{32}$/.test(cacheKey) ? { name, cacheKey } : null;
    })
    .catch((error: unknown) => {
      request = null;
      throw error;
    });
  return request;
}

const LAST_KEY = "comimo-last-account";

/** The account last seen signed in on this device, so the store can open its cache while offline. */
export function rememberedCacheKey(): string | null {
  try {
    const value = localStorage.getItem(LAST_KEY);
    return value && /^[a-f0-9]{32}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function rememberCacheKey(key: string | null): void {
  try {
    if (key) localStorage.setItem(LAST_KEY, key);
    else localStorage.removeItem(LAST_KEY);
  } catch {
    // Private mode: nothing to remember.
  }
}
