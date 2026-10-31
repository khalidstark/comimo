import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileKV } from "./kv";
import { clearFailures, EMAIL_LOCKOUT, hit, lockedFor, recordFailure, windowOf } from "./rateLimit";

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

describe("sign-in lockout", () => {
  it("allows the free tries, then locks with a doubling backoff", async () => {
    const subject = "login:email:abc";
    for (let i = 0; i < EMAIL_LOCKOUT.freeTries - 1; i++) {
      expect(await recordFailure(kv, subject, EMAIL_LOCKOUT, T0)).toBe(0);
      expect(await lockedFor(kv, subject, T0)).toBe(0);
    }
    expect(await recordFailure(kv, subject, EMAIL_LOCKOUT, T0)).toBe(60);
    expect(await lockedFor(kv, subject, T0)).toBe(60);
    expect(await lockedFor(kv, subject, T0 + 61_000)).toBe(0);
    expect(await recordFailure(kv, subject, EMAIL_LOCKOUT, T0 + 61_000)).toBe(120);
    expect(await recordFailure(kv, subject, EMAIL_LOCKOUT, T0 + 200_000)).toBe(240);
  });

  it("caps the lock at an hour", async () => {
    let lock = 0;
    for (let i = 0; i < 20; i++) lock = await recordFailure(kv, "login:ip:x", EMAIL_LOCKOUT, T0);
    expect(lock).toBe(3600);
  });

  it("forgets failures after a successful sign-in", async () => {
    for (let i = 0; i < 6; i++) await recordFailure(kv, "s", EMAIL_LOCKOUT, T0);
    expect(await lockedFor(kv, "s", T0)).toBeGreaterThan(0);
    await clearFailures(kv, "s");
    expect(await lockedFor(kv, "s", T0)).toBe(0);
    expect(await recordFailure(kv, "s", EMAIL_LOCKOUT, T0)).toBe(0);
  });
});
