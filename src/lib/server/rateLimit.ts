import "server-only";
import type { KV } from "./kv";

/**
 * Counters in the shared store, so every server instance sees the same counts.
 */

/** The fixed window `now` falls in, and the seconds until it ends. */
export function windowOf(windowSec: number, now = Date.now()): { index: number; resetsInSec: number } {
  const size = windowSec * 1000;
  const index = Math.floor(now / size);
  return { index, resetsInSec: Math.max(1, Math.ceil(((index + 1) * size - now) / 1000)) };
}

export type Hit = { ok: true; count: number; undo: () => Promise<void> } | { ok: false; retryAfterSec: number };

/**
 * Count one event against `limit` per fixed window of `windowSec`.
 * Increment first, then compare: two instances racing can't both take the
 * last slot. A refused hit is taken back so it doesn't extend the block.
 */
export async function hit(kv: KV, key: string, limit: number, windowSec: number, now = Date.now()): Promise<Hit> {
  const { index, resetsInSec } = windowOf(windowSec, now);
  const windowKey = `${key}:${index}`;
  const count = await kv.incr(windowKey, { ttlSec: windowSec + 60 });
  if (count > limit) {
    await kv.incr(windowKey, { by: -1 });
    return { ok: false, retryAfterSec: resetsInSec };
  }
  let undone = false;
  return {
    ok: true,
    count,
    undo: async () => {
      if (undone) return;
      undone = true;
      await kv.incr(windowKey, { by: -1 });
    },
  };
}

/* ---------- Sign-in lockout with backoff ---------- */

export interface LockoutPolicy {
  /** Tries allowed in the window before the first lock. */
  freeTries: number;
  /** How long tries are remembered. */
  windowSec: number;
  /** First lock; each later lock doubles it. */
  baseLockSec: number;
  maxLockSec: number;
}

/** Per email: 5 free tries an hour, then one try per lock of 1, 2, 4 ... up to 60 minutes. */
export const EMAIL_LOCKOUT: LockoutPolicy = { freeTries: 5, windowSec: 3600, baseLockSec: 60, maxLockSec: 3600 };
/** Per IP: room for a family behind one router, then the same backoff. */
export const IP_LOCKOUT: LockoutPolicy = { freeTries: 25, windowSec: 3600, baseLockSec: 60, maxLockSec: 3600 };

/** Seconds left on a lock for this subject, or 0 when it may try. */
export async function lockedFor(kv: KV, subject: string, now = Date.now()): Promise<number> {
  const until = Number(await kv.get(`lock:${subject}`));
  return Number.isFinite(until) && until > now ? Math.ceil((until - now) / 1000) : 0;
}

export type Attempt = { ok: true } | { ok: false; retryAfterSec: number };

/**
 * Reserve one sign-in try for a subject (an email or an IP) BEFORE the
 * password is checked, so parallel requests can't all slip past a lock.
 *
 * Every try is counted with an atomic increment (serialised in the file
 * store, INCRBY in Redis). The first `freeTries` in the window go through.
 * After that, a try goes through only if it creates the lock itself
 * (set-if-new): it becomes the one probe for that lock period, and the lock
 * it wrote holds back every other try (429). Each later lock doubles, up to
 * `maxLockSec`.
 */
export async function reserveAttempt(kv: KV, subject: string, policy: LockoutPolicy, now = Date.now()): Promise<Attempt> {
  // A cheap early answer while a lock is on; safety comes from the steps below.
  const waiting = await lockedFor(kv, subject, now);
  if (waiting > 0) return { ok: false, retryAfterSec: waiting };

  const tries = await kv.incr(`tries:${subject}`, { ttlSec: policy.windowSec });
  if (tries <= policy.freeTries) return { ok: true };

  const lockSec = Math.min(policy.maxLockSec, policy.baseLockSec * 2 ** Math.min(tries - policy.freeTries - 1, 20));
  if (await kv.set(`lock:${subject}`, String(now + lockSec * 1000), { onlyIfNew: true, ttlSec: lockSec })) return { ok: true };
  return { ok: false, retryAfterSec: Math.max(1, await lockedFor(kv, subject, now)) };
}

/** After a successful sign-in: forget this subject's tries and lock. */
export async function clearAttempts(kv: KV, subject: string): Promise<void> {
  await Promise.all([kv.del(`tries:${subject}`), kv.del(`lock:${subject}`)]);
}

/** After a successful sign-in from a shared subject (an IP): give back just this one try. */
export async function releaseAttempt(kv: KV, subject: string): Promise<void> {
  await kv.incr(`tries:${subject}`, { by: -1 });
}

/** "3 minutes", "1 minute". */
export function minutesText(seconds: number): string {
  const m = Math.max(1, Math.ceil(seconds / 60));
  return `${m} minute${m === 1 ? "" : "s"}`;
}
