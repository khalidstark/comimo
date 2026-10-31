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
/**
 * Per IP: every try counts, good or bad (successes are never given back), so
 * the allowance has room for a household or a classroom behind one router.
 */
export const IP_LOCKOUT: LockoutPolicy = { freeTries: 50, windowSec: 3600, baseLockSec: 60, maxLockSec: 3600 };
/**
 * One bucket for every sign-in, used only when no trusted client IP is known
 * (so password spraying across many emails still hits a ceiling). High, with
 * short locks, because everyone shares it; `GLOBAL_SLOWDOWN` adds a growing
 * delay well before the lock.
 */
export const GLOBAL_LOCKOUT: LockoutPolicy = { freeTries: 1000, windowSec: 3600, baseLockSec: 30, maxLockSec: 300 };
export const GLOBAL_SLOWDOWN = { afterTries: 200, stepMs: 10, maxMs: 3000 } as const;

/** A progressive delay for the shared bucket: nothing at first, then a little more per try, capped. */
export function slowdownMs(tries: number, policy: { afterTries: number; stepMs: number; maxMs: number } = GLOBAL_SLOWDOWN): number {
  return Math.min(policy.maxMs, Math.max(0, tries - policy.afterTries) * policy.stepMs);
}

/**
 * Which sign-in subjects a try is counted against: always the email, plus the
 * IP when a trusted one is known, otherwise the shared global bucket.
 */
export function loginSubjects(emailTag: string, ipTag: string | null): { subject: string; policy: LockoutPolicy; shared: boolean }[] {
  return [
    ipTag
      ? { subject: `login:ip:${ipTag}`, policy: IP_LOCKOUT, shared: false }
      : { subject: "login:global", policy: GLOBAL_LOCKOUT, shared: true },
    { subject: `login:email:${emailTag}`, policy: EMAIL_LOCKOUT, shared: false },
  ];
}

/**
 * Sign-up caps: per trusted IP, or conservative global buckets when no
 * trusted IP is known (so mass account creation always hits a ceiling).
 */
export function signupBuckets(
  ipTag: string | null,
  env: Record<string, string | undefined> = process.env,
): { key: string; limit: number; windowSec: number }[] {
  const n = (name: string, fallback: number) => {
    const value = Number.parseInt(env[name] ?? "", 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return ipTag
    ? [
        { key: `signup:ip:${ipTag}:hour`, limit: n("COMIMO_SIGNUPS_PER_IP_HOUR", 5), windowSec: 3600 },
        { key: `signup:ip:${ipTag}:day`, limit: n("COMIMO_SIGNUPS_PER_IP_DAY", 20), windowSec: 86_400 },
      ]
    : [
        { key: "signup:global:hour", limit: n("COMIMO_SIGNUPS_GLOBAL_HOUR", 30), windowSec: 3600 },
        { key: "signup:global:day", limit: n("COMIMO_SIGNUPS_GLOBAL_DAY", 150), windowSec: 86_400 },
      ];
}

/** Seconds left on a lock for this subject, or 0 when it may try. */
export async function lockedFor(kv: KV, subject: string, now = Date.now()): Promise<number> {
  const until = Number(await kv.get(`lock:${subject}`));
  return Number.isFinite(until) && until > now ? Math.ceil((until - now) / 1000) : 0;
}

/** `tries`: this subject's count in the window, including this one. */
export type Attempt = { ok: true; tries: number } | { ok: false; retryAfterSec: number };

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
  if (tries <= policy.freeTries) return { ok: true, tries };

  const lockSec = Math.min(policy.maxLockSec, policy.baseLockSec * 2 ** Math.min(tries - policy.freeTries - 1, 20));
  if (await kv.set(`lock:${subject}`, String(now + lockSec * 1000), { onlyIfNew: true, ttlSec: lockSec })) return { ok: true, tries };
  return { ok: false, retryAfterSec: Math.max(1, await lockedFor(kv, subject, now)) };
}

/**
 * After a successful sign-in: forget the email's tries and lock. Only for
 * the email subject: the account's owner just proved the password. A shared
 * subject (an IP) is never cleared or given tries back, so an attacker can't
 * reset their IP's count by signing in to an account of their own; there is
 * deliberately no decrement anywhere in this scheme.
 */
export async function clearAttempts(kv: KV, subject: string): Promise<void> {
  await Promise.all([kv.del(`tries:${subject}`), kv.del(`lock:${subject}`)]);
}

/** "3 minutes", "1 minute". */
export function minutesText(seconds: number): string {
  const m = Math.max(1, Math.ceil(seconds / 60));
  return `${m} minute${m === 1 ? "" : "s"}`;
}
