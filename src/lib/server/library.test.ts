import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Route-level checks for /api/me/*: the account comes only from the session,
 * so one account never sees, changes or deletes another's days, cast or images.
 */

let dir: string;
let routes: {
  days: typeof import("@/app/api/me/days/[id]/route");
  cast: typeof import("@/app/api/me/cast/[id]/route");
  images: typeof import("@/app/api/me/images/[id]/route");
  meta: typeof import("@/app/api/me/meta/[key]/route");
};
let cookieA: string;
let cookieB: string;

const ORIGIN = "http://localhost:3190";
const ACCOUNT_IDS = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "comimo-lib-"));
  process.env.COMIMO_DATA_DIR = dir;
  const { createSession, sessionCookieName } = await import("./session");
  const { getKV } = await import("./kv");
  // Sessions count only while their account record exists.
  for (const id of ACCOUNT_IDS) await getKV().set(`account:${id}`, JSON.stringify({ id }));
  cookieA = `${sessionCookieName()}=${await createSession({ id: "11111111-1111-4111-8111-111111111111", name: "A" })}`;
  cookieB = `${sessionCookieName()}=${await createSession({ id: "22222222-2222-4222-8222-222222222222", name: "B" })}`;
  routes = {
    days: await import("@/app/api/me/days/[id]/route"),
    cast: await import("@/app/api/me/cast/[id]/route"),
    images: await import("@/app/api/me/images/[id]/route"),
    meta: await import("@/app/api/me/meta/[key]/route"),
  };
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

function req(method: string, path: string, cookie: string | null, body?: BodyInit, extra: Record<string, string> = {}): Request {
  const headers: Record<string, string> = { host: "localhost:3190", ...(method !== "GET" ? { origin: ORIGIN } : {}), ...extra };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-length"] = String(typeof body === "string" ? Buffer.byteLength(body) : (body as Uint8Array).byteLength);
  return new Request(`${ORIGIN}${path}`, { method, headers, body });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const day = (id: string, updatedAt: string) => JSON.stringify({ id, date: "2026-10-30", title: "Tea on the roof", panels: [], updatedAt, createdAt: updatedAt });

describe("/api/me/days/:id", () => {
  it("needs a session", async () => {
    expect((await routes.days.GET(req("GET", "/api/me/days/d1", null), ctx("d1"))).status).toBe(401);
  });

  it("saves and reads the owner's day, and answers 404 to another account", async () => {
    const put = await routes.days.PUT(req("PUT", "/api/me/days/d1", cookieA, day("d1", "2026-10-30T10:00:00.000Z")), ctx("d1"));
    expect(put.status).toBe(200);
    const mine = await routes.days.GET(req("GET", "/api/me/days/d1", cookieA), ctx("d1"));
    expect(mine.status).toBe(200);
    expect(((await mine.json()) as { title: string }).title).toBe("Tea on the roof");

    expect((await routes.days.GET(req("GET", "/api/me/days/d1", cookieB), ctx("d1"))).status).toBe(404);
    expect((await routes.days.DELETE(req("DELETE", "/api/me/days/d1?at=2026-10-31T00:00:00.000Z", cookieB), ctx("d1"))).status).toBe(404);
    // B writing the same id only ever touches B's own namespace.
    expect((await routes.days.PUT(req("PUT", "/api/me/days/d1", cookieB, day("d1", "2026-10-31T09:00:00.000Z")), ctx("d1"))).status).toBe(200);
    const stillMine = await routes.days.GET(req("GET", "/api/me/days/d1", cookieA), ctx("d1"));
    expect(((await stillMine.json()) as { updatedAt: string }).updatedAt).toBe("2026-10-30T10:00:00.000Z");
  });

  it("refuses an older copy, a mismatched id, a cross-site write and a far-future stamp", async () => {
    const older = await routes.days.PUT(req("PUT", "/api/me/days/d1", cookieA, day("d1", "2026-10-29T10:00:00Z")), ctx("d1"));
    expect(older.status).toBe(409);
    expect(((await older.json()) as { current: string }).current).toBe("2026-10-30T10:00:00.000Z");
    expect((await routes.days.PUT(req("PUT", "/api/me/days/d2", cookieA, day("d1", "2026-10-30T10:00:00Z")), ctx("d2"))).status).toBe(400);
    expect((await routes.days.PUT(req("PUT", "/api/me/days/d3", cookieA, day("d3", "2099-01-01T00:00:00Z")), ctx("d3"))).status).toBe(400);
    const cross = req("PUT", "/api/me/days/d4", cookieA, day("d4", "2026-10-30T10:00:00Z"), { origin: "https://evil.example" });
    expect((await routes.days.PUT(cross, ctx("d4"))).status).toBe(403);
  });

  it("deletes with a tombstone", async () => {
    const del = await routes.days.DELETE(req("DELETE", "/api/me/days/d1?at=2026-10-31T00:00:00.000Z", cookieA), ctx("d1"));
    expect(del.status).toBe(200);
    expect((await routes.days.GET(req("GET", "/api/me/days/d1", cookieA), ctx("d1"))).status).toBe(404);
    const { libraryIndex } = await import("./library");
    expect((await libraryIndex("11111111-1111-4111-8111-111111111111")).days.d1).toEqual({ u: "2026-10-31T00:00:00.000Z", d: 1 });
  });
});

describe("/api/me/images/:id", () => {
  it("keeps the owner's bytes exactly and answers 404 to another account", async () => {
    expect((await routes.images.PUT(req("PUT", "/api/me/images/d9-panel-0", cookieA, PNG), ctx("d9-panel-0"))).status).toBe(200);
    const mine = await routes.images.GET(req("GET", "/api/me/images/d9-panel-0", cookieA), ctx("d9-panel-0"));
    expect(mine.status).toBe(200);
    expect(mine.headers.get("content-type")).toBe("image/png");
    expect(mine.headers.get("cache-control")).toContain("no-store");
    expect([...new Uint8Array(await mine.arrayBuffer())]).toEqual([...PNG]);
    expect((await routes.images.GET(req("GET", "/api/me/images/d9-panel-0", cookieB), ctx("d9-panel-0"))).status).toBe(404);
  });

  it("refuses anything that isn't an image, bad ids and bodies without a length", async () => {
    const html = new TextEncoder().encode("<html><script>alert(1)</script>");
    expect((await routes.images.PUT(req("PUT", "/api/me/images/x", cookieA, html), ctx("x"))).status).toBe(400);
    expect((await routes.images.PUT(req("PUT", "/api/me/images/..%2Fx", cookieA, PNG), ctx("../x"))).status).toBe(400);
    const noLength = new Request(`${ORIGIN}/api/me/images/y`, { method: "PUT", headers: { host: "localhost:3190", origin: ORIGIN, cookie: cookieA }, body: PNG });
    expect((await routes.images.PUT(noLength, ctx("y"))).status).toBe(411);
  });
});

describe("/api/me/cast/:id and settings", () => {
  it("keeps characters and allowed settings per account", async () => {
    const nour = JSON.stringify({ id: "nour", name: "Nour", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-30T00:00:00.000Z" });
    expect((await routes.cast.PUT(req("PUT", "/api/me/cast/nour", cookieA, nour), ctx("nour"))).status).toBe(200);
    expect((await routes.cast.GET(req("GET", "/api/me/cast/nour", cookieB), ctx("nour"))).status).toBe(404);

    const mctx = (key: string) => ({ params: Promise.resolve({ key }) });
    const cover = JSON.stringify({ u: "2026-10-30T00:00:00.000Z", v: "{\"imageId\":\"cover-2026-10-x\"}" });
    expect((await routes.meta.PUT(req("PUT", "/api/me/meta/cover:2026-10", cookieA, cover), mctx("cover:2026-10"))).status).toBe(200);
    expect((await routes.meta.GET(req("GET", "/api/me/meta/cover:2026-10", cookieB), mctx("cover:2026-10"))).status).toBe(404);
    expect((await routes.meta.PUT(req("PUT", "/api/me/meta/anything", cookieA, cover), mctx("anything"))).status).toBe(400);
    expect((await routes.meta.GET(req("GET", "/api/me/meta/%E0%A4%A", cookieA), mctx("%E0%A4%A"))).status).toBe(404);
  });
});
