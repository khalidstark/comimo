import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanAlbumLink } from "./album";

/**
 * Albums: owner-only changes (404 for anyone else), public-by-link viewing,
 * a regenerated link killing the old id, deletion, and photos re-encoded
 * without EXIF or location.
 */

let dir: string;
let cookieA: string;
let cookieB: string;
let r: {
  album: typeof import("@/app/api/album/route");
  one: typeof import("@/app/api/album/[id]/route");
  photos: typeof import("@/app/api/album/[id]/photos/route");
  photo: typeof import("@/app/api/album/[id]/photos/[photoId]/route");
  link: typeof import("@/app/api/album/[id]/link/route");
  captions: typeof import("@/app/api/album/[id]/captions/route");
};

const ORIGIN = "http://localhost:3190";
const ACCOUNT_IDS = ["44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555"];

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "comimo-album-"));
  process.env.COMIMO_DATA_DIR = dir;
  process.env.COMIMO_MOCK = "1";
  const { createSession, sessionCookieName } = await import("./session");
  const { getKV } = await import("./kv");
  // Sessions count only while their account record exists.
  for (const id of ACCOUNT_IDS) await getKV().set(`account:${id}`, JSON.stringify({ id }));
  cookieA = `${sessionCookieName()}=${await createSession({ id: "44444444-4444-4444-8444-444444444444", name: "A" })}`;
  cookieB = `${sessionCookieName()}=${await createSession({ id: "55555555-5555-4555-8555-555555555555", name: "B" })}`;
  r = {
    album: await import("@/app/api/album/route"),
    one: await import("@/app/api/album/[id]/route"),
    photos: await import("@/app/api/album/[id]/photos/route"),
    photo: await import("@/app/api/album/[id]/photos/[photoId]/route"),
    link: await import("@/app/api/album/[id]/link/route"),
    captions: await import("@/app/api/album/[id]/captions/route"),
  };
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
const at = (id: string) => ({ params: Promise.resolve({ id }) });
const atPhoto = (id: string, photoId: string) => ({ params: Promise.resolve({ id, photoId }) });

/** A JPEG with EXIF: GPS position, camera make and a comment. */
async function photoWithExif(): Promise<Uint8Array> {
  const data = await sharp({ create: { width: 3000, height: 1600, channels: 3, background: "#d88a3c" } })
    .withExif({
      IFD0: { Make: "TestCam", Model: "Invented 1", ImageDescription: "secret note" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "30/1 2/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "31/1 14/1 0/1" },
    })
    .jpeg()
    .toBuffer();
  return new Uint8Array(data);
}

describe("albums", () => {
  let albumId = "";
  let photoId = "";

  it("creates the owner's album for a day and keeps it from other accounts", async () => {
    const created = await r.album.POST(req("POST", "/api/album", cookieA, JSON.stringify({ dayId: "day-1", title: "Basbousa night" })));
    expect(created.status).toBe(201);
    albumId = ((await created.json()) as { id: string }).id;
    expect(albumId).toMatch(/^[A-Za-z0-9_-]{22}$/);

    expect((await r.one.GET(req("GET", `/api/album/${albumId}`, cookieA), at(albumId))).status).toBe(200);
    expect((await r.one.GET(req("GET", `/api/album/${albumId}`, cookieB), at(albumId))).status).toBe(404);
    expect((await r.album.GET(req("GET", "/api/album?day=day-1", cookieB))).status).toBe(404);
    expect((await r.one.PATCH(req("PATCH", `/api/album/${albumId}`, cookieB, JSON.stringify({ title: "mine now" })), at(albumId))).status).toBe(404);
    expect((await r.link.POST(req("POST", `/api/album/${albumId}/link`, cookieB), at(albumId))).status).toBe(404);
    expect((await r.captions.POST(req("POST", `/api/album/${albumId}/captions`, cookieB), at(albumId))).status).toBe(404);
    expect((await r.one.DELETE(req("DELETE", `/api/album/${albumId}`, cookieB), at(albumId))).status).toBe(404);
    expect((await r.photos.POST(req("POST", `/api/album/${albumId}/photos`, cookieB, await photoWithExif()), at(albumId))).status).toBe(404);
  });

  it("re-encodes photos without EXIF or location, at most 2048 px", async () => {
    const original = await photoWithExif();
    expect((await sharp(original).metadata()).exif).toBeDefined();
    const added = await r.photos.POST(req("POST", `/api/album/${albumId}/photos`, cookieA, original), at(albumId));
    expect(added.status).toBe(201);
    const photo = (await added.json()) as { id: string; width: number; height: number };
    photoId = photo.id;
    expect(Math.max(photo.width, photo.height)).toBe(2048);

    // Anyone with the link can see it (no cookie at all).
    const served = await r.photo.GET(req("GET", `/api/album/${albumId}/photos/${photoId}`, null), atPhoto(albumId, photoId));
    expect(served.status).toBe(200);
    expect(served.headers.get("x-robots-tag")).toContain("noindex");
    const meta = await sharp(new Uint8Array(await served.arrayBuffer())).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.iptc).toBeUndefined();
    expect(meta.width).toBe(2048);

    expect((await r.photo.DELETE(req("DELETE", `/api/album/${albumId}/photos/${photoId}`, cookieB), atPhoto(albumId, photoId))).status).toBe(404);
  });

  it("refuses files that aren't photos", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const refused = await r.photos.POST(req("POST", `/api/album/${albumId}/photos`, cookieA, svg), at(albumId));
    expect(refused.status).toBe(400);
  });

  it("suggests captions only for the owner (mock) and saves edited ones", async () => {
    const suggested = await r.captions.POST(req("POST", `/api/album/${albumId}/captions`, cookieA), at(albumId));
    expect(suggested.status).toBe(200);
    const { captions } = (await suggested.json()) as { captions: Record<string, string> };
    expect(Object.keys(captions)).toEqual([photoId]);
    const saved = await r.one.PATCH(req("PATCH", `/api/album/${albumId}`, cookieA, JSON.stringify({ captions: { [photoId]: "Tea on the roof" } })), at(albumId));
    expect(((await saved.json()) as { photos: { caption: string }[] }).photos[0].caption).toBe("Tea on the roof");
  });

  it("regenerating the link kills the old id; deleting the album kills the new one", async () => {
    const renewed = await r.link.POST(req("POST", `/api/album/${albumId}/link`, cookieA), at(albumId));
    const next = ((await renewed.json()) as { id: string }).id;
    expect(next).not.toBe(albumId);
    expect((await r.photo.GET(req("GET", "", null), atPhoto(albumId, photoId))).status).toBe(404);
    expect((await r.photo.GET(req("GET", "", null), atPhoto(next, photoId))).status).toBe(200);
    expect((await r.one.GET(req("GET", "", cookieA), at(albumId))).status).toBe(404);

    expect((await r.one.DELETE(req("DELETE", `/api/album/${next}`, cookieA), at(next))).status).toBe(200);
    expect((await r.photo.GET(req("GET", "", null), atPhoto(next, photoId))).status).toBe(404);
    expect((await r.album.GET(req("GET", "/api/album?day=day-1", cookieA))).status).toBe(404);
  });
});

describe("album links", () => {
  it("keeps only https links without credentials", () => {
    expect(cleanAlbumLink("https://photos.app.goo.gl/AbCdEf123")).toBe("https://photos.app.goo.gl/AbCdEf123");
    expect(cleanAlbumLink(" https://drive.google.com/drive/folders/x?usp=sharing ")).toBe("https://drive.google.com/drive/folders/x?usp=sharing");
    for (const bad of [
      "http://photos.example.com/a",
      "javascript:alert(1)",
      "data:text/html,hi",
      "https://user:pass@photos.example.com/",
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://[::1]/x",
      'https://ok.example.com/"><script>',
      "photos.example.com/a",
      `https://ok.example.com/${"a".repeat(2000)}`,
    ]) {
      expect(cleanAlbumLink(bad)).toBeNull();
    }
  });
});
