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
  /** Failed tries allowed in the window before the first lock. */
  freeTries: number;
  /** How long failures are remembered. */
  windowSec: number;
  /** First lock; each further failure doubles it. */
  baseLockSec: number;
  maxLockSec: number;
}

/** Per email: 5 free tries an hour, then 1, 2, 4 ... up to 60 minutes. */
export const EMAIL_LOCKOUT: LockoutPolicy = { freeTries: 5, windowSec: 3600, baseLockSec: 60, maxLockSec: 3600 };
/** Per IP: room for a family behind one router, then the same backoff. */
export const IP_LOCKOUT: LockoutPolicy = { freeTries: 25, windowSec: 3600, baseLockSec: 60, maxLockSec: 3600 };

/** Seconds left on a lock for this subject, or 0 when it may try. */
export async function lockedFor(kv: KV, subject: string, now = Date.now()): Promise<number> {
  const until = Number(await kv.get(`lock:${subject}`));
  return Number.isFinite(until) && until > now ? Math.ceil((until - now) / 1000) : 0;
}

/**
 * Record a failed try. Past the free tries, lock the subject for a time that
 * doubles with every further failure. Returns the new lock in seconds (0 = none).
 */
export async function recordFailure(kv: KV, subject: string, policy: LockoutPolicy, now = Date.now()): Promise<number> {
  const failures = await kv.incr(`fail:${subject}`, { ttlSec: policy.windowSec });
  const over = failures - policy.freeTries;
  if (over < 0) return 0;
  const lockSec = Math.min(policy.maxLockSec, policy.baseLockSec * 2 ** Math.min(over, 20));
  await kv.set(`lock:${subject}`, String(now + lockSec * 1000), { ttlSec: lockSec });
  return lockSec;
}

/** Forget failures after a successful sign-in. */
export async function clearFailures(kv: KV, subject: string): Promise<void> {
  await Promise.all([kv.del(`fail:${subject}`), kv.del(`lock:${subject}`)]);
}

/** "3 minutes", "1 minute". */
export function minutesText(seconds: number): string {
  const m = Math.max(1, Math.ceil(seconds / 60));
  return `${m} minute${m === 1 ? "" : "s"}`;
}
