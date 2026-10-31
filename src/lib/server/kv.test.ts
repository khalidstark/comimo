import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileKV, upstashCredentials } from "./kv";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "comimo-kv-"));
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(dir, { recursive: true, force: true });
});

describe("FileKV", () => {
  it("stores, reads and deletes values", async () => {
    const kv = new FileKV(dir);
    expect(await kv.get("a")).toBeNull();
    expect(await kv.set("a", "one")).toBe(true);
    expect(await kv.get("a")).toBe("one");
    await kv.del("a");
    expect(await kv.get("a")).toBeNull();
    await kv.del("missing");
  });

  it("only writes a new key when asked to", async () => {
    const kv = new FileKV(dir);
    expect(await kv.set("email", "first", { onlyIfNew: true })).toBe(true);
    expect(await kv.set("email", "second", { onlyIfNew: true })).toBe(false);
    expect(await kv.get("email")).toBe("first");
  });

  it("expires values after their TTL", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-31T10:00:00Z"));
    const kv = new FileKV(dir);
    await kv.set("session", "x", { ttlSec: 60 });
    vi.setSystemTime(new Date("2026-10-31T10:00:59Z"));
    expect(await kv.get("session")).toBe("x");
    vi.setSystemTime(new Date("2026-10-31T10:01:01Z"));
    expect(await kv.get("session")).toBeNull();
    // An expired key counts as new again.
    expect(await kv.set("session", "y", { onlyIfNew: true })).toBe(true);
  });

  it("counts, sets the TTL only on a new counter, and goes back down", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-31T10:00:00Z"));
    const kv = new FileKV(dir);
    expect(await kv.incr("n", { ttlSec: 10 })).toBe(1);
    vi.setSystemTime(new Date("2026-10-31T10:00:08Z"));
    // A later TTL doesn't push the expiry out.
    expect(await kv.incr("n", { ttlSec: 10 })).toBe(2);
    expect(await kv.incr("n", { by: -1 })).toBe(1);
    vi.setSystemTime(new Date("2026-10-31T10:00:11Z"));
    expect(await kv.get("n")).toBeNull();
    expect(await kv.incr("n")).toBe(1);
  });

  it("never loses a concurrent increment", async () => {
    const kv = new FileKV(dir);
    const results = await Promise.all(Array.from({ length: 25 }, () => kv.incr("hits")));
    expect(new Set(results).size).toBe(25);
    expect(await kv.get("hits")).toBe("25");
  });

  it("keeps data on disk for the next process", async () => {
    await new FileKV(dir).set("account:1", JSON.stringify({ name: "Nour" }));
    expect(JSON.parse((await new FileKV(dir).get("account:1")) ?? "null")).toEqual({ name: "Nour" });
    expect(JSON.parse(await readFile(join(dir, "kv.json"), "utf8"))).toHaveProperty("account:1");
  });
});

describe("upstashCredentials", () => {
  it("needs both the URL and the token", () => {
    expect(upstashCredentials({})).toBeNull();
    expect(upstashCredentials({ UPSTASH_REDIS_REST_URL: "https://x.upstash.io" })).toBeNull();
    expect(
      upstashCredentials({ UPSTASH_REDIS_REST_URL: "https://x.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" }),
    ).toEqual({ url: "https://x.upstash.io", token: "t" });
  });

  it("accepts the names Vercel's Upstash integration uses", () => {
    expect(upstashCredentials({ KV_REST_API_URL: "https://y.upstash.io", KV_REST_API_TOKEN: "k" })).toEqual({
      url: "https://y.upstash.io",
      token: "k",
    });
  });
});
