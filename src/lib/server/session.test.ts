import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileKV } from "./kv";
import { clientIp, ipTag, isSameOrigin } from "./request";
import {
  createSession,
  destroySession,
  readSession,
  requireSession,
  SESSION_TTL_SEC,
  sessionCookieName,
  sessionCookieOptions,
  sessionIdFrom,
} from "./session";

const NOUR = { id: "acct-1", name: "Nour" };

let dir: string;
let kv: FileKV;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "comimo-session-"));
  kv = new FileKV(dir);
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(dir, { recursive: true, force: true });
});

function post(headers: Record<string, string>): Request {
  return new Request("http://localhost:3170/api/script", { method: "POST", headers: { host: "localhost:3170", ...headers } });
}

describe("session lifecycle", () => {
  it("creates an unguessable id, reads it back and ends it on sign-out", async () => {
    const id = await createSession(NOUR, kv);
    expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await createSession(NOUR, kv)).not.toBe(id);
    expect(await readSession(id, kv)).toEqual(NOUR);
    await destroySession(id, kv);
    expect(await readSession(id, kv)).toBeNull();
  });

  it("keeps only a hash of the id in the store", async () => {
    const id = await createSession(NOUR, kv);
    const { readFile } = await import("node:fs/promises");
    expect(await readFile(join(dir, "kv.json"), "utf8")).not.toContain(id);
  });

  it("expires after 30 days", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
    const id = await createSession(NOUR, kv);
    vi.setSystemTime(new Date(Date.parse("2026-10-01T00:00:00Z") + (SESSION_TTL_SEC - 60) * 1000));
    expect(await readSession(id, kv)).toEqual(NOUR);
    vi.setSystemTime(new Date(Date.parse("2026-10-01T00:00:00Z") + (SESSION_TTL_SEC + 1) * 1000));
    expect(await readSession(id, kv)).toBeNull();
  });

  it("ignores malformed ids without touching the store", async () => {
    const get = vi.spyOn(kv, "get");
    expect(await readSession("short", kv)).toBeNull();
    expect(await readSession("../../etc/passwd".padEnd(43, "x"), kv)).toBeNull();
    expect(await readSession(null, kv)).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("cookie", () => {
  it("is httpOnly, SameSite=Lax, 30 days, and Secure with the __Host- prefix in production", () => {
    expect(sessionCookieOptions(true)).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESSION_TTL_SEC });
    expect(sessionCookieOptions(false).secure).toBe(false);
    expect(sessionCookieName(true)).toBe("__Host-comimo_session");
    expect(sessionCookieName(false)).toBe("comimo_session");
  });

  it("reads the session id from the Cookie header", () => {
    const id = "a".repeat(43);
    expect(sessionIdFrom(post({ cookie: `theme=dark; comimo_session=${id}` }))).toBe(id);
    expect(sessionIdFrom(post({ cookie: "comimo_session=nope" }))).toBeNull();
    expect(sessionIdFrom(post({}))).toBeNull();
  });

  it("accepts only the __Host- cookie in production, so a tossed plain cookie is ignored", () => {
    const real = "a".repeat(43);
    const tossed = "b".repeat(43);
    const production = sessionCookieName(true);
    expect(sessionIdFrom(post({ cookie: `comimo_session=${tossed}` }), production)).toBeNull();
    expect(sessionIdFrom(post({ cookie: `comimo_session=${tossed}; __Host-comimo_session=${real}` }), production)).toBe(real);
    // And in development the __Host- name isn't read either.
    expect(sessionIdFrom(post({ cookie: `__Host-comimo_session=${real}` }), sessionCookieName(false))).toBeNull();
  });
});

describe("requireSession", () => {
  it("answers 401 without a session and passes with one", async () => {
    const none = await requireSession(post({ origin: "http://localhost:3170" }), kv);
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.response.status).toBe(401);

    const id = await createSession(NOUR, kv);
    const signedIn = await requireSession(post({ origin: "http://localhost:3170", cookie: `comimo_session=${id}` }), kv);
    expect(signedIn).toEqual({ ok: true, account: NOUR });
  });

  it("refuses a POST from another site before looking at the session", async () => {
    const id = await createSession(NOUR, kv);
    const result = await requireSession(post({ origin: "https://evil.example", cookie: `comimo_session=${id}` }), kv);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });
});

describe("isSameOrigin", () => {
  it("accepts this host and refuses others", () => {
    expect(isSameOrigin(post({ origin: "http://localhost:3170" }))).toBe(true);
    expect(isSameOrigin(post({ origin: "http://localhost:3171" }))).toBe(false);
    expect(isSameOrigin(post({ origin: "null" }))).toBe(false);
    expect(isSameOrigin(post({ origin: "https://comimo.app", "x-forwarded-host": "comimo.app" }))).toBe(true);
  });

  it("falls back to Sec-Fetch-Site, and lets non-browser clients through", () => {
    expect(isSameOrigin(post({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOrigin(post({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOrigin(post({ "sec-fetch-site": "same-site" }))).toBe(false);
    expect(isSameOrigin(post({}))).toBe(true);
  });
});

describe("clientIp", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("is unknown off Vercel, so per-IP limits are skipped instead of shared", () => {
    delete process.env.VERCEL;
    delete process.env.COMIMO_TRUSTED_IP_HEADER;
    const request = post({ "x-forwarded-for": "1.2.3.4" });
    expect(clientIp(request)).toBeNull();
    expect(ipTag(request)).toBeNull();
  });

  it("trusts Vercel's header on Vercel", () => {
    process.env.VERCEL = "1";
    expect(clientIp(post({ "x-vercel-forwarded-for": "5.6.7.8, 10.0.0.1", "x-forwarded-for": "9.9.9.9" }))).toBe("5.6.7.8");
    expect(ipTag(post({ "x-vercel-forwarded-for": "5.6.7.8" }))).toMatch(/^[0-9a-f]{32}$/);
  });

  it("trusts a configured proxy header elsewhere", () => {
    delete process.env.VERCEL;
    process.env.COMIMO_TRUSTED_IP_HEADER = "CF-Connecting-IP";
    expect(clientIp(post({ "cf-connecting-ip": "4.4.4.4", "x-forwarded-for": "1.1.1.1" }))).toBe("4.4.4.4");
    expect(clientIp(post({ "x-forwarded-for": "1.1.1.1" }))).toBeNull();
  });
});
