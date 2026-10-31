import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Deleting an account removes everything it had, on every device, and frees the email. */

let dir: string;
const ORIGIN = "http://localhost:3190";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "comimo-account-"));
  process.env.COMIMO_DATA_DIR = dir;
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

function req(method: string, path: string, cookie: string | null, body?: Uint8Array | string): Request {
  const headers: Record<string, string> = { host: "localhost:3190" };
  if (method !== "GET") headers.origin = ORIGIN;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-length"] = String(typeof body === "string" ? Buffer.byteLength(body) : body.byteLength);
  return new Request(`${ORIGIN}${path}`, { method, headers, body: body as BodyInit | undefined });
}

describe("DELETE /api/me/account", () => {
  it("needs the password, then removes days, images, albums, sessions and the account", async () => {
    const { createAccount, findAccountByEmail } = await import("./auth");
    const { createSession, readSession, sessionCookieName } = await import("./session");
    const { FileBlobStore } = await import("./blob");
    const account = (await createAccount({ email: "teta@example.com", name: "Teta", password: "apricot-jam-1" }))!;
    const phone = await createSession(account);
    const laptop = await createSession(account);
    const cookie = `${sessionCookieName()}=${phone}`;
    const at = (id: string) => ({ params: Promise.resolve({ id }) });

    const days = await import("@/app/api/me/days/[id]/route");
    const images = await import("@/app/api/me/images/[id]/route");
    const album = await import("@/app/api/album/route");
    const photos = await import("@/app/api/album/[id]/photos/route");
    const photo = await import("@/app/api/album/[id]/photos/[photoId]/route");
    const route = await import("@/app/api/me/account/route");

    const day = JSON.stringify({ id: "d1", date: "2026-10-30", updatedAt: "2026-10-30T10:00:00.000Z" });
    expect((await days.PUT(req("PUT", "/api/me/days/d1", cookie, day), at("d1"))).status).toBe(200);
    const png = new Uint8Array(await sharp({ create: { width: 4, height: 4, channels: 3, background: "#fff" } }).png().toBuffer());
    expect((await images.PUT(req("PUT", "/api/me/images/d1-panel-0", cookie, png), at("d1-panel-0"))).status).toBe(200);
    const created = (await (await album.POST(req("POST", "/api/album", cookie, JSON.stringify({ dayId: "d1", title: "Jam day" })))).json()) as { id: string };
    const jpeg = new Uint8Array(await sharp({ create: { width: 40, height: 30, channels: 3, background: "#c84" } }).jpeg().toBuffer());
    const added = (await (await photos.POST(req("POST", "", cookie, jpeg), at(created.id))).json()) as { id: string };
    const photoAt = { params: Promise.resolve({ id: created.id, photoId: added.id }) };
    expect((await photo.GET(req("GET", "", null), photoAt)).status).toBe(200);

    expect((await route.DELETE(req("DELETE", "/api/me/account", cookie, JSON.stringify({ password: "wrong-password" })))).status).toBe(401);
    const done = await route.DELETE(req("DELETE", "/api/me/account", cookie, JSON.stringify({ password: "apricot-jam-1" })));
    expect(done.status).toBe(200);
    expect(done.headers.get("set-cookie")).toContain("Max-Age=0");

    // Every device is signed out, the album link is dead, nothing of the account is left in the store or the blob folder.
    expect(await readSession(phone)).toBeNull();
    expect(await readSession(laptop)).toBeNull();
    expect((await photo.GET(req("GET", "", null), photoAt)).status).toBe(404);
    expect(await findAccountByEmail("teta@example.com")).toBeNull();
    const store = await readFile(join(dir, "kv.json"), "utf8");
    // Only short-lived limit counters (which expire by themselves) may still name the account.
    const left = Object.entries(JSON.parse(store) as Record<string, { e?: number }>).filter(([key, entry]) => key.includes(account.id) && entry.e === undefined);
    expect(left.map(([key]) => key)).toEqual([]);
    expect(await new FileBlobStore(join(dir, "blob")).list(`a/${account.id}/`)).toEqual([]);
  });
});
