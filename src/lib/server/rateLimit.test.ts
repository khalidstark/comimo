import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileKV } from "./kv";
import {
  clearAttempts,
  EMAIL_LOCKOUT,
  GLOBAL_LOCKOUT,
  GLOBAL_SLOWDOWN,
  hit,
  IP_LOCKOUT,
  lockedFor,
  loginSubjects,
  reserveAttempt,
  signupBuckets,
  slowdownMs,
  windowOf,
} from "./rateLimit";

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
    for (let i = 0; i < EMAIL_LOCKOUT.freeTries; i++) expect(await reserveAttempt(kv, subject, EMAIL_LOCKOUT)).toMatchObject({ ok: true });
    // The next try is the probe: it goes through and sets a 1 minute lock.
    expect(await reserveAttempt(kv, subject, EMAIL_LOCKOUT)).toMatchObject({ ok: true });
    expect(await lockedFor(kv, subject)).toBe(60);
    expect(await reserveAttempt(kv, subject, EMAIL_LOCKOUT)).toEqual({ ok: false, retryAfterSec: 60 });
    at(61_000);
    expect(await reserveAttempt(kv, subject, EMAIL_LOCKOUT)).toMatchObject({ ok: true });
    expect(await lockedFor(kv, subject)).toBe(120);
    at(61_000 + 121_000);
    expect(await reserveAttempt(kv, subject, EMAIL_LOCKOUT)).toMatchObject({ ok: true });
    expect(await lockedFor(kv, subject)).toBe(240);
  });

  it("lets only the free tries plus one probe through a burst of parallel tries", async () => {
    const results = await Promise.all(Array.from({ length: 30 }, () => reserveAttempt(kv, "login:email:burst", EMAIL_LOCKOUT)));
    expect(results.filter((r) => r.ok)).toHaveLength(EMAIL_LOCKOUT.freeTries + 1);
  });

  it("caps the lock at an hour", async () => {
    await kv.incr("tries:login:ip:x", { by: 40, ttlSec: 3600 });
    expect(await reserveAttempt(kv, "login:ip:x", EMAIL_LOCKOUT)).toMatchObject({ ok: true });
    expect(await lockedFor(kv, "login:ip:x")).toBe(3600);
  });

  it("forgets tries after a successful sign-in", async () => {
    for (let i = 0; i < 6; i++) await reserveAttempt(kv, "s", EMAIL_LOCKOUT);
    expect(await lockedFor(kv, "s")).toBeGreaterThan(0);
    await clearAttempts(kv, "s");
    expect(await lockedFor(kv, "s")).toBe(0);
    for (let i = 0; i < EMAIL_LOCKOUT.freeTries; i++) expect((await reserveAttempt(kv, "s", EMAIL_LOCKOUT)).ok).toBe(true);
  });

  it("never gives tries back to an IP: successes count, and clearing an email leaves the IP alone", async () => {
    for (let i = 0; i < 3; i++) await reserveAttempt(kv, "login:ip:y", IP_LOCKOUT);
    await reserveAttempt(kv, "login:email:z", EMAIL_LOCKOUT);
    await clearAttempts(kv, "login:email:z");
    expect(await kv.get("tries:login:ip:y")).toBe("3");
    expect(await kv.get("tries:login:email:z")).toBeNull();
  });

  it("never drives a counter below zero or leaves one without an expiry", async () => {
    // Clearing a subject that was never tried, or twice, creates nothing.
    await clearAttempts(kv, "login:email:none");
    await clearAttempts(kv, "login:email:none");
    expect(await kv.get("tries:login:email:none")).toBeNull();
    // Tries always start at 1 and expire with the window.
    expect(await reserveAttempt(kv, "login:email:fresh", EMAIL_LOCKOUT)).toMatchObject({ ok: true });
    expect(await kv.get("tries:login:email:fresh")).toBe("1");
    at(EMAIL_LOCKOUT.windowSec * 1000 + 1);
    expect(await kv.get("tries:login:email:fresh")).toBeNull();
  });
});

describe("without a trusted client IP", () => {
  it("counts sign-ins against one global bucket with a high ceiling", async () => {
    const [network, email] = loginSubjects("e1", null);
    expect(network).toMatchObject({ subject: "login:global", policy: GLOBAL_LOCKOUT, shared: true });
    expect(email).toMatchObject({ subject: "login:email:e1", policy: EMAIL_LOCKOUT });
    expect(loginSubjects("e1", "ip1")[0]).toMatchObject({ subject: "login:ip:ip1", policy: IP_LOCKOUT, shared: false });

    // Spraying many emails still fills the global bucket and gets refused.
    const policy = { ...GLOBAL_LOCKOUT, freeTries: 10 };
    const results = await Promise.all(Array.from({ length: 15 }, () => reserveAttempt(kv, "login:global", policy)));
    expect(results.filter((r) => r.ok)).toHaveLength(11);
  });

  it("slows the shared bucket down progressively, capped", () => {
    expect(slowdownMs(1)).toBe(0);
    expect(slowdownMs(GLOBAL_SLOWDOWN.afterTries)).toBe(0);
    expect(slowdownMs(GLOBAL_SLOWDOWN.afterTries + 5)).toBe(5 * GLOBAL_SLOWDOWN.stepMs);
    expect(slowdownMs(1_000_000)).toBe(GLOBAL_SLOWDOWN.maxMs);
  });

  it("caps sign-ups with global buckets, and per IP when the IP is trusted", async () => {
    expect(signupBuckets(null, {}).map((b) => b.key)).toEqual(["signup:global:hour", "signup:global:day"]);
    expect(signupBuckets("ip1", {}).map((b) => b.key)).toEqual(["signup:ip:ip1:hour", "signup:ip:ip1:day"]);
    const [hour] = signupBuckets(null, { COMIMO_SIGNUPS_GLOBAL_HOUR: "3" });
    let allowed = 0;
    for (let i = 0; i < 6; i++) if ((await hit(kv, hour.key, hour.limit, hour.windowSec, T0)).ok) allowed++;
    expect(allowed).toBe(3);
  });
});
