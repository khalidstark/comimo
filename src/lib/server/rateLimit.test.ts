import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileKV } from "./kv";
import { clearAttempts, EMAIL_LOCKOUT, hit, IP_LOCKOUT, lockedFor, releaseAttempt, reserveAttempt, windowOf } from "./rateLimit";

let dir: string;
let kv: FileKV;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "comimo-limit-"));
  kv = new FileKV(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const T0 = Date.parse("2026-10-31T10:00:00Z");

describe("hit", () => {
  it("allows the limit, refuses the next one and resets in the next window", async () => {
    for (let i = 1; i <= 3; i++) expect(await hit(kv, "k", 3, 3600, T0 + i)).toMatchObject({ ok: true, count: i });
    const refused = await hit(kv, "k", 3, 3600, T0 + 10_000);
    expect(refused).toEqual({ ok: false, retryAfterSec: 3590 });
    // Refused hits don't pile up.
    expect(await kv.get(`k:${windowOf(3600, T0).index}`)).toBe("3");
    expect(await hit(kv, "k", 3, 3600, T0 + 3600_000)).toMatchObject({ ok: true, count: 1 });
  });

  it("gives a slot back with undo, once", async () => {
    const first = await hit(kv, "k", 1, 60, T0);
    expect(first.ok).toBe(true);
    if (first.ok) {
      await first.undo();
      await first.undo();
    }
    expect(await kv.get(`k:${windowOf(60, T0).index}`)).toBe("0");
    expect((await hit(kv, "k", 1, 60, T0)).ok).toBe(true);
  });

  it("lets exactly `limit` of many concurrent hits through", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => hit(kv, "burst", 5, 3600, T0)));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
  });
});

describe("sign-in tries", () => {
  const at = (ms: number) => vi.setSystemTime(new Date(T0 + ms));

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the free tries, then one try per lock with a doubling backoff", async () => {
    const subject = "login:email:abc";
    for (let i = 0; i < EMAIL_LOCKOUT.freeTries; i++) expect(await reserveAttempt(kv, subject, EMAIL_LOCKOUT)).toEqual({ ok: true });
    // The next try is the probe: it goes through and sets a 1 minute lock.
    expect(await reserveAttempt(kv, subject, EMAIL_LOCKOUT)).toEqual({ ok: true });
    expect(await lockedFor(kv, subject)).toBe(60);
    expect(await reserveAttempt(kv, subject, EMAIL_LOCKOUT)).toEqual({ ok: false, retryAfterSec: 60 });
    at(61_000);
    expect(await reserveAttempt(kv, subject, EMAIL_LOCKOUT)).toEqual({ ok: true });
    expect(await lockedFor(kv, subject)).toBe(120);
    at(61_000 + 121_000);
    expect(await reserveAttempt(kv, subject, EMAIL_LOCKOUT)).toEqual({ ok: true });
    expect(await lockedFor(kv, subject)).toBe(240);
  });

  it("lets only the free tries plus one probe through a burst of parallel tries", async () => {
    const results = await Promise.all(Array.from({ length: 30 }, () => reserveAttempt(kv, "login:email:burst", EMAIL_LOCKOUT)));
    expect(results.filter((r) => r.ok)).toHaveLength(EMAIL_LOCKOUT.freeTries + 1);
  });

  it("caps the lock at an hour", async () => {
    await kv.incr("tries:login:ip:x", { by: 40, ttlSec: 3600 });
    expect(await reserveAttempt(kv, "login:ip:x", EMAIL_LOCKOUT)).toEqual({ ok: true });
    expect(await lockedFor(kv, "login:ip:x")).toBe(3600);
  });

  it("forgets tries after a successful sign-in", async () => {
    for (let i = 0; i < 6; i++) await reserveAttempt(kv, "s", EMAIL_LOCKOUT);
    expect(await lockedFor(kv, "s")).toBeGreaterThan(0);
    await clearAttempts(kv, "s");
    expect(await lockedFor(kv, "s")).toBe(0);
    for (let i = 0; i < EMAIL_LOCKOUT.freeTries; i++) expect((await reserveAttempt(kv, "s", EMAIL_LOCKOUT)).ok).toBe(true);
  });

  it("gives back one try for a shared subject", async () => {
    await reserveAttempt(kv, "login:ip:y", IP_LOCKOUT);
    await reserveAttempt(kv, "login:ip:y", IP_LOCKOUT);
    await releaseAttempt(kv, "login:ip:y");
    expect(await kv.get("tries:login:ip:y")).toBe("1");
  });
});
