import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** The spending guard: per-account hourly caps, the kill switches, and mock calls passing untouched. */

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "comimo-guard-"));
  process.env.COMIMO_DATA_DIR = dir;
  process.env.COMIMO_COMICS_PER_HOUR = "2";
});

afterAll(async () => {
  delete process.env.COMIMO_COMICS_PER_HOUR;
  await rm(dir, { recursive: true, force: true });
});

async function signedInRequest(email: string): Promise<() => Request> {
  const { createAccount } = await import("@/lib/server/auth");
  const { createSession, sessionCookieName } = await import("@/lib/server/session");
  const account = (await createAccount({ email, name: "Nour", password: "rooftop-garden" }))!;
  const cookie = `${sessionCookieName()}=${await createSession(account)}`;
  return () => new Request("http://localhost/api/script", { method: "POST", headers: { cookie } });
}

describe("guard", () => {
  it("caps real comics per account per hour, and never limits mock calls", async () => {
    const { guard, guardResponse } = await import("./guard");
    const request = await signedInRequest("cap@example.com");
    expect((await guard(request(), "script", { real: true })).ok).toBe(true);
    expect((await guard(request(), "script", { real: true })).ok).toBe(true);
    const third = await guard(request(), "script", { real: true });
    expect(third.ok).toBe(false);
    if (!third.ok) {
      expect(third.status).toBe(429);
      expect(await guardResponse(third).json()).toMatchObject({ code: "limit" });
    }
    expect((await guard(request(), "script", { real: false })).ok).toBe(true);
  });

  it("pauses every real call from the store key at once, and resumes when it is cleared", async () => {
    const { guard, guardResponse, PAUSE_KEY } = await import("./guard");
    const { getKV } = await import("@/lib/server/kv");
    const request = await signedInRequest("pause@example.com");
    await getKV().set(PAUSE_KEY, "1");
    const paused = await guard(request(), "panel", { real: true });
    expect(paused.ok).toBe(false);
    if (!paused.ok) {
      expect(paused.status).toBe(503);
      // "paused": the progress screen doesn't offer a Try again that can only fail.
      expect(await guardResponse(paused).json()).toMatchObject({ code: "paused" });
    }
    expect((await guard(request(), "panel", { real: false })).ok).toBe(true);
    await getKV().del(PAUSE_KEY);
    expect((await guard(request(), "panel", { real: true })).ok).toBe(true);
  });

  it("pauses from the environment too", async () => {
    const { guard } = await import("./guard");
    const request = await signedInRequest("env@example.com");
    process.env.COMIMO_PAUSE_GENERATION = "1";
    try {
      const paused = await guard(request(), "transcribe", { real: true });
      expect(paused.ok).toBe(false);
    } finally {
      delete process.env.COMIMO_PAUSE_GENERATION;
    }
  });
});
