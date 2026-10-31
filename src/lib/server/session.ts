import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getKV, type KV } from "./kv";
import { isSameOrigin } from "./request";

/**
 * Sessions: a random 32-byte id in an httpOnly cookie, and a record in the KV
 * store that expires after 30 days. The store keys sessions by a SHA-256 of
 * the id, so a leaked copy of the store holds no usable cookies. Signing out
 * deletes the record, which ends the session everywhere at once.
 */

export const SESSION_TTL_SEC = 30 * 24 * 60 * 60;

/**
 * In production the cookie carries the __Host- prefix: the browser then only
 * accepts it over HTTPS, for this exact host and path "/".
 */
export function sessionCookieName(production = process.env.NODE_ENV === "production"): string {
  return production ? "__Host-comimo_session" : "comimo_session";
}

export function sessionCookieOptions(production = process.env.NODE_ENV === "production") {
  return {
    httpOnly: true,
    secure: production,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SEC,
  };
}

export interface SessionAccount {
  /** Account id. */
  id: string;
  name: string;
}

interface SessionRecord {
  accountId: string;
  name: string;
  createdAt: string;
}

/** 32 random bytes as base64url: exactly 43 characters. */
const SESSION_ID = /^[A-Za-z0-9_-]{43}$/;

function sessionKey(sessionId: string): string {
  return `session:${createHash("sha256").update(sessionId).digest("hex")}`;
}

/** Start a session for an account; returns the id for the cookie. */
export async function createSession(account: SessionAccount, kv: KV = getKV()): Promise<string> {
  const sessionId = randomBytes(32).toString("base64url");
  const record: SessionRecord = { accountId: account.id, name: account.name, createdAt: new Date().toISOString() };
  await kv.set(sessionKey(sessionId), JSON.stringify(record), { ttlSec: SESSION_TTL_SEC });
  return sessionId;
}

/** The account behind a session id, or `null` for a missing, malformed, expired or signed-out session. */
export async function readSession(sessionId: string | null | undefined, kv: KV = getKV()): Promise<SessionAccount | null> {
  if (!sessionId || !SESSION_ID.test(sessionId)) return null;
  const raw = await kv.get(sessionKey(sessionId));
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as SessionRecord;
    return typeof record.accountId === "string" ? { id: record.accountId, name: record.name } : null;
  } catch {
    return null;
  }
}

export async function destroySession(sessionId: string | null | undefined, kv: KV = getKV()): Promise<void> {
  if (!sessionId || !SESSION_ID.test(sessionId)) return;
  await kv.del(sessionKey(sessionId));
}

/**
 * The session id from a request's Cookie header. Only this environment's
 * cookie name counts: in production that is the __Host- cookie alone, so a
 * plain `comimo_session` planted by a sibling subdomain (cookie tossing,
 * session fixation) is ignored.
 */
export function sessionIdFrom(request: Request, cookieName = sessionCookieName()): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (name === cookieName) {
      const value = part.slice(index + 1).trim();
      if (SESSION_ID.test(value)) return value;
    }
  }
  return null;
}

/** Accounts already looked up for a request, so the guard doesn't read the store twice. */
const resolved = new WeakMap<Request, SessionAccount | null>();

/** The signed-in account for this request, or `null`. Cached per request. */
export async function sessionAccount(request: Request, kv: KV = getKV()): Promise<SessionAccount | null> {
  if (resolved.has(request)) return resolved.get(request) ?? null;
  const account = await readSession(sessionIdFrom(request), kv);
  resolved.set(request, account);
  return account;
}

function refuse(status: number, error: string, code: string): Response {
  return Response.json({ error, code }, { status, headers: { "Cache-Control": "no-store" } });
}

export type SessionCheck = { ok: true; account: SessionAccount } | { ok: false; response: Response };

/**
 * The gate for routes that need an account. For anything but GET/HEAD it
 * first checks the request came from this site (CSRF), then that the session
 * is live. Answers 403, 401 or 503 (store unreachable) as JSON.
 */
export async function requireSession(request: Request, kv?: KV): Promise<SessionCheck> {
  if (request.method !== "GET" && request.method !== "HEAD" && !isSameOrigin(request)) {
    return { ok: false, response: refuse(403, "That request came from another site.", "cross-site") };
  }
  let account: SessionAccount | null;
  try {
    account = await sessionAccount(request, kv);
  } catch (error) {
    console.error(`Comimo: session lookup failed (${error instanceof Error ? error.name : "unknown"})`);
    return { ok: false, response: refuse(503, "Comimo can't check your sign-in right now. Try again in a minute.", "store-down") };
  }
  if (!account) return { ok: false, response: refuse(401, "Sign in to keep going. It takes a few seconds.", "signin") };
  return { ok: true, account };
}
