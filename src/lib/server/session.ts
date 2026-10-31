import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { sessionCookieName } from "./cookieName";
import { getKV, type KV } from "./kv";
import { isSameOrigin } from "./request";

/**
 * Sessions: a random 32-byte id in an httpOnly cookie, and a record in the KV
 * store that expires after 30 days. The store keys sessions by a SHA-256 of
 * the id, so a leaked copy of the store holds no usable cookies. Signing out
 * deletes the record, which ends the session everywhere at once.
 */

export const SESSION_TTL_SEC = 30 * 24 * 60 * 60;

export { sessionCookieName };

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

function sessionHash(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex");
}

function sessionKey(sessionId: string): string {
  return `session:${sessionHash(sessionId)}`;
}

/** Each account's live sessions (hash of id -> created), so deleting the account can end them all. */
function accountSessionsKey(accountId: string): string {
  return `sessions:${accountId}`;
}

/** The account record's key (see auth.ts); a session counts only while it exists. */
const accountRecordKey = (accountId: string) => `account:${accountId}`;

/** Set while an account is being deleted (see accountDeletion.ts); its sessions are revoked from that moment. */
export const deletingKey = (accountId: string) => `account:${accountId}:deleting`;

/**
 * True while the account can be used: its record exists and it isn't being
 * deleted. Every session read, every new session and every public album
 * view checks this, so revocation holds even when a list missed something.
 */
export async function isAccountLive(accountId: string, kv: KV = getKV()): Promise<boolean> {
  const [record, deleting] = await Promise.all([kv.get(accountRecordKey(accountId)), kv.get(deletingKey(accountId))]);
  return record !== null && deleting === null;
}

export class NoSuchAccountError extends Error {
  name = "NoSuchAccountError";
}

/**
 * Start a session for an account; returns the id for the cookie. Refuses an
 * account whose record is gone or that is being deleted, so a sign-in
 * racing an account deletion can't bring a session back.
 */
export async function createSession(account: SessionAccount, kv: KV = getKV()): Promise<string> {
  if (!(await isAccountLive(account.id, kv))) throw new NoSuchAccountError("No such account");
  const sessionId = randomBytes(32).toString("base64url");
  const record: SessionRecord = { accountId: account.id, name: account.name, createdAt: new Date().toISOString() };
  await kv.set(sessionKey(sessionId), JSON.stringify(record), { ttlSec: SESSION_TTL_SEC });
  await kv.hset(accountSessionsKey(account.id), sessionHash(sessionId), record.createdAt);
  // Forget sessions that have expired on their own, so the list stays short.
  const listed = await kv.hgetall(accountSessionsKey(account.id));
  const expired = Object.entries(listed)
    .filter(([, created]) => Date.parse(created) < Date.now() - SESSION_TTL_SEC * 1000)
    .map(([hash]) => hash);
  if (expired.length) await kv.hdel(accountSessionsKey(account.id), ...expired);
  return sessionId;
}

/**
 * The account behind a session id, or `null` for a missing, malformed,
 * expired or signed-out session, and for any session whose account record is
 * gone: deleting the account revokes every session at once, even one the
 * per-account session list missed.
 */
export async function readSession(sessionId: string | null | undefined, kv: KV = getKV()): Promise<SessionAccount | null> {
  if (!sessionId || !SESSION_ID.test(sessionId)) return null;
  const raw = await kv.get(sessionKey(sessionId));
  if (!raw) return null;
  let record: SessionRecord;
  try {
    record = JSON.parse(raw) as SessionRecord;
  } catch {
    return null;
  }
  if (typeof record.accountId !== "string") return null;
  if (!(await isAccountLive(record.accountId, kv))) return null;
  return { id: record.accountId, name: record.name };
}

export async function destroySession(sessionId: string | null | undefined, kv: KV = getKV()): Promise<void> {
  if (!sessionId || !SESSION_ID.test(sessionId)) return;
  const account = await readSession(sessionId, kv);
  await kv.del(sessionKey(sessionId));
  if (account) await kv.hdel(accountSessionsKey(account.id), sessionHash(sessionId));
}

/** End every session of an account at once (account deletion). */
export async function destroyAllSessions(accountId: string, kv: KV = getKV()): Promise<void> {
  const hashes = Object.keys(await kv.hgetall(accountSessionsKey(accountId)));
  for (const hash of hashes) await kv.del(`session:${hash}`);
  await kv.del(accountSessionsKey(accountId));
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
