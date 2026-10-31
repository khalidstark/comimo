import "server-only";
import { randomBytes } from "node:crypto";
import { getBlobStore, type BlobStore, type StoredBlob } from "./blob";
import { getKV, type KV } from "./kv";
import { isRecordId, libraryKeys, type LibraryResult } from "./library";
import { hit, windowOf } from "./rateLimit";
import { isAccountLive } from "./session";
import { processAlbumPhoto } from "./albumPhoto";

/**
 * A day's photo album: real photos (or a link to an album elsewhere) that the
 * comic's last page points to with a QR code.
 *
 * - The album id is 128 random bits (22 base64url characters). Anyone with
 *   the link can look; nobody can list albums or guess one. Regenerating the
 *   link gives a new id and the old one stops working at once.
 * - Only the owner (the account in the session, compared with the album's
 *   owner on the server) can change it. For anyone else an album they don't
 *   own is "not found", the same as one that doesn't exist.
 * - The public view holds the photos, their captions and the day's title:
 *   nothing about the cast, the comic or the account.
 * - A pasted link is checked (https only, no credentials) and only ever
 *   shown as a link; the server never fetches it.
 *
 * KV: album:<id> (the album), album:<id>:photos (hash photoId -> photo),
 * lib:<account>:albums (hash dayId -> album id), lib:<account>:photos (stored photo count).
 * Blob: a/<account>/p/<photoId>.jpg
 */

export const ALBUM_ID = /^[A-Za-z0-9_-]{22}$/;
export const MAX_PHOTOS_PER_ALBUM = 20;
export const CAPTION_MAX = 200;
export const TITLE_MAX = 120;
export const LINK_MAX = 2000;

function envInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function albumLimits() {
  return {
    /** Photos kept per account across all albums. */
    photosPerAccount: envInt("COMIMO_ACCOUNT_PHOTO_CAP", 400),
    /** Photo uploads per account per hour. */
    uploadsPerHour: envInt("COMIMO_PHOTO_UPLOADS_PER_HOUR", 60),
    /** Photo uploads per day for everyone. */
    uploadsPerDay: envInt("COMIMO_DAILY_PHOTO_UPLOAD_CAP", 3000),
    /** Album changes (links, captions, regenerate) per account per hour. */
    editsPerHour: envInt("COMIMO_ALBUM_EDITS_PER_HOUR", 300),
  };
}

export interface Album {
  id: string;
  owner: string;
  dayId: string;
  title: string;
  /** A link to an album somewhere else, shown as it is; null for none. */
  link: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlbumPhoto {
  id: string;
  width: number;
  height: number;
  caption: string;
  addedAt: string;
}

/** What anyone with the link sees. */
export interface PublicAlbum {
  id: string;
  title: string;
  link: string | null;
  photos: AlbumPhoto[];
}

/** What the owner sees (the same, plus the day it belongs to). */
export interface OwnedAlbum extends PublicAlbum {
  dayId: string;
}

const albumKey = (id: string) => `album:${id}`;
const photosKey = (id: string) => `album:${id}:photos`;
const photoCountKey = (account: string) => `lib:${account}:photos`;
export const photoPath = (account: string, photoId: string) => `a/${account}/p/${photoId}.jpg`;

export function newAlbumId(): string {
  return randomBytes(16).toString("base64url");
}

export function isAlbumId(id: unknown): id is string {
  return typeof id === "string" && ALBUM_ID.test(id);
}

type Fail = Extract<LibraryResult, { ok: false }>;
const fail = (status: Fail["status"], error: string, retryAfterSec?: number): Fail => ({
  ok: false,
  status,
  error,
  ...(retryAfterSec ? { retryAfterSec } : {}),
});
const NOT_FOUND = () => fail(404, "That album isn't here. The link may have been changed or the album deleted.");

/* ---------- Text checks ---------- */

/** Collapse whitespace and drop control characters; the page renders text as text, never as HTML. */
export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim();
  return text.length <= max ? text : null;
}

/**
 * A pasted album link, or null when it isn't one Comimo will show: https
 * only, no user name or password in it, a real host name, at most 2000
 * characters. Comimo never fetches it; it is only rendered as a link.
 */
export function cleanAlbumLink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > LINK_MAX || /[\s<>"'`\\]/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname;
  if (!host.includes(".") || host.endsWith(".") || /^[\d.]+$/.test(host) || host.startsWith("[")) return null;
  return url.href.length <= LINK_MAX ? url.href : null;
}

/* ---------- Reading ---------- */

async function readAlbum(id: string, kv: KV): Promise<Album | null> {
  if (!isAlbumId(id)) return null;
  const raw = await kv.get(albumKey(id));
  if (!raw) return null;
  try {
    const album = JSON.parse(raw) as Album;
    return album.id === id ? album : null;
  } catch {
    return null;
  }
}

async function readPhotos(id: string, kv: KV): Promise<AlbumPhoto[]> {
  const all = await kv.hgetall(photosKey(id));
  const photos: AlbumPhoto[] = [];
  for (const raw of Object.values(all)) {
    try {
      const entry = JSON.parse(raw) as AlbumPhoto & { s?: number; pending?: boolean };
      if (entry.pending) continue;
      photos.push({ id: entry.id, width: entry.width, height: entry.height, caption: entry.caption, addedAt: entry.addedAt });
    } catch {
      // Skip a damaged entry.
    }
  }
  return photos.sort((a, b) => a.addedAt.localeCompare(b.addedAt) || a.id.localeCompare(b.id));
}

/** An album the account owns, or null (missing and not-yours look the same). */
async function owned(account: string, id: string, kv: KV): Promise<Album | null> {
  const album = await readAlbum(id, kv);
  return album && album.owner === account ? album : null;
}

/** An album anyone with the link may see: it exists and its owner's account is live (not missing, not being deleted). */
async function viewable(id: string, kv: KV): Promise<Album | null> {
  const album = await readAlbum(id, kv);
  return album && (await isAccountLive(album.owner, kv)) ? album : null;
}

/** The public view: photos, captions, title and link. Null when there is no such album. */
export async function publicAlbum(id: string, kv: KV = getKV()): Promise<PublicAlbum | null> {
  const album = await viewable(id, kv);
  if (!album) return null;
  return { id: album.id, title: album.title, link: album.link, photos: await readPhotos(id, kv) };
}

/** True when this account owns the album. */
export async function ownsAlbum(account: string | null | undefined, id: string, kv: KV = getKV()): Promise<boolean> {
  return Boolean(account && (await owned(account, id, kv)));
}

export async function ownedAlbum(account: string, id: string, kv: KV = getKV()): Promise<LibraryResult<OwnedAlbum>> {
  const album = await owned(account, id, kv);
  if (!album) return NOT_FOUND();
  return { ok: true, value: { id: album.id, dayId: album.dayId, title: album.title, link: album.link, photos: await readPhotos(id, kv) } };
}

/** The account's album for a day, or 404. */
export async function albumForDay(account: string, dayId: string, kv: KV = getKV()): Promise<LibraryResult<OwnedAlbum>> {
  if (!isRecordId(dayId)) return NOT_FOUND();
  const id = await kv.hget(libraryKeys.albums(account), dayId);
  return id ? ownedAlbum(account, id, kv) : NOT_FOUND();
}

/** A photo from an album, for anyone with the album's link. */
export async function albumPhoto(albumId: string, photoId: string, kv: KV = getKV(), blobs: BlobStore = getBlobStore()): Promise<StoredBlob | null> {
  if (!isAlbumId(photoId)) return null;
  const album = await viewable(albumId, kv);
  if (!album) return null;
  if (!(await kv.hget(photosKey(albumId), photoId))) return null;
  return blobs.get(photoPath(album.owner, photoId));
}

/* ---------- Changing ---------- */

async function editSlot(account: string, kv: KV): Promise<Fail | null> {
  const slot = await hit(kv, `album:edits:${account}`, albumLimits().editsPerHour, 3600);
  return slot.ok ? null : fail(429, "That's a lot of album changes for one hour. Try again later.", slot.retryAfterSec);
}

/**
 * Start the album for one of the account's days (or return the one it has).
 * `title` is the day's title as shown on the album page.
 */
export async function createAlbum(
  account: string,
  input: { dayId: unknown; title: unknown; link?: unknown },
  kv: KV = getKV(),
): Promise<LibraryResult<OwnedAlbum>> {
  if (!isRecordId(input.dayId)) return fail(400, "That day isn't valid.");
  const title = cleanText(input.title, TITLE_MAX);
  if (title === null) return fail(400, `The title can be up to ${TITLE_MAX} characters.`);
  let link: string | null = null;
  if (input.link !== undefined && input.link !== null && input.link !== "") {
    link = cleanAlbumLink(input.link);
    if (!link) return fail(400, "Paste a full https:// link to the album.");
  }
  const existing = await albumForDay(account, input.dayId, kv);
  if (existing.ok) return existing;
  const limited = await editSlot(account, kv);
  if (limited) return limited;

  const now = new Date().toISOString();
  const album: Album = { id: newAlbumId(), owner: account, dayId: input.dayId, title: title || "A day in photos", link, createdAt: now, updatedAt: now };
  await kv.set(albumKey(album.id), JSON.stringify(album), { onlyIfNew: true });
  // Claim the day for this album; if another request claimed it first, use that one.
  const claimed = await kv.hget(libraryKeys.albums(account), album.dayId);
  if (claimed && claimed !== album.id && (await readAlbum(claimed, kv))) {
    await kv.del(albumKey(album.id));
    return ownedAlbum(account, claimed, kv);
  }
  await kv.hset(libraryKeys.albums(account), album.dayId, album.id);
  return { ok: true, value: { id: album.id, dayId: album.dayId, title: album.title, link: album.link, photos: [] } };
}

/** Change the title or the pasted link (null or "" removes it). */
export async function updateAlbum(
  account: string,
  id: string,
  input: { title?: unknown; link?: unknown },
  kv: KV = getKV(),
): Promise<LibraryResult<OwnedAlbum>> {
  const album = await owned(account, id, kv);
  if (!album) return NOT_FOUND();
  const next = { ...album };
  if (input.title !== undefined) {
    const title = cleanText(input.title, TITLE_MAX);
    if (!title) return fail(400, `The title can be up to ${TITLE_MAX} characters.`);
    next.title = title;
  }
  if (input.link !== undefined) {
    if (input.link === null || input.link === "") next.link = null;
    else {
      const link = cleanAlbumLink(input.link);
      if (!link) return fail(400, "Paste a full https:// link to the album.");
      next.link = link;
    }
  }
  const limited = await editSlot(account, kv);
  if (limited) return limited;
  next.updatedAt = new Date().toISOString();
  await kv.set(albumKey(id), JSON.stringify(next));
  return ownedAlbum(account, id, kv);
}

/**
 * Add one photo: checked, re-encoded without metadata, at most 2048 px.
 * Counts against the account's hourly uploads, the global daily uploads, the
 * album's 20 photos and the account's stored photos (bump, then compare).
 */
export async function addPhoto(
  account: string,
  id: string,
  bytes: Uint8Array,
  kv: KV = getKV(),
  blobs: BlobStore = getBlobStore(),
): Promise<LibraryResult<AlbumPhoto>> {
  const album = await owned(account, id, kv);
  if (!album) return NOT_FOUND();
  const limits = albumLimits();

  const hourly = await hit(kv, `album:uploads:${account}`, limits.uploadsPerHour, 3600);
  if (!hourly.ok) return fail(429, "That's a lot of photos for one hour. Try again later.", hourly.retryAfterSec);
  const daily = await hit(kv, `album:uploads:${new Date().toISOString().slice(0, 10)}`, limits.uploadsPerDay, 86_400);
  if (!daily.ok) {
    return fail(429, "Comimo has taken all the photos it can for today. Try again tomorrow.", daily.retryAfterSec);
  }

  // Reserve the place first, atomically: the album's 20 photos and the
  // account's stored photos are checked and counted in one step, so parallel
  // uploads can't slip past either cap. The entry stays hidden until its bytes are stored.
  const photo: AlbumPhoto = { id: newAlbumId(), width: 0, height: 0, caption: "", addedAt: new Date().toISOString() };
  const reserved = await kv.sizedPut(photosKey(id), photoCountKey(account), photo.id, JSON.stringify({ ...photo, s: 1, pending: true }), 1, {
    maxTotal: limits.photosPerAccount,
    maxCount: MAX_PHOTOS_PER_ALBUM,
  });
  // Refused or not, the rate-limit slots stay spent (no free retries past a cap).
  if (!reserved.ok) {
    return reserved.reason === "count"
      ? fail(413, `An album holds up to ${MAX_PHOTOS_PER_ALBUM} photos.`)
      : fail(507, `Your albums are full (${limits.photosPerAccount} photos). Remove a few to add more.`);
  }
  const release = () => kv.sizedDel(photosKey(id), photoCountKey(account), [photo.id]);

  let processed: Awaited<ReturnType<typeof processAlbumPhoto>>;
  try {
    processed = await processAlbumPhoto(bytes);
  } catch (error) {
    await release();
    // The upload slots stay used: decoding costs CPU.
    if (error instanceof Error && error.name === "AlbumPhotoError") return fail(400, error.message);
    throw error;
  }
  const done: AlbumPhoto = { ...photo, width: processed.width, height: processed.height };
  try {
    await blobs.put(photoPath(account, photo.id), processed.data, "image/jpeg");
  } catch (error) {
    await release();
    throw error;
  }
  // Same field, same size: the count doesn't move.
  await kv.hset(photosKey(id), photo.id, JSON.stringify({ ...done, s: 1 }));
  // The album may have been deleted or relinked while this photo was processed: then let it go.
  if (!(await readAlbum(id, kv))) {
    await release();
    await blobs.del([photoPath(account, photo.id)]);
    return NOT_FOUND();
  }
  return { ok: true, value: done };
}

export async function removePhoto(account: string, id: string, photoId: string, kv: KV = getKV(), blobs: BlobStore = getBlobStore()): Promise<LibraryResult> {
  const album = await owned(account, id, kv);
  if (!album || !isAlbumId(photoId) || !(await kv.hget(photosKey(id), photoId))) return NOT_FOUND();
  // Entry and count together (a second remove of the same photo finds nothing to subtract).
  await kv.sizedDel(photosKey(id), photoCountKey(account), [photoId]);
  await blobs.del([photoPath(account, photoId)]);
  return { ok: true, value: undefined };
}

/** Set the captions of some photos ({ photoId: caption }); "" clears one. */
export async function setCaptions(account: string, id: string, captions: unknown, kv: KV = getKV()): Promise<LibraryResult<OwnedAlbum>> {
  const album = await owned(account, id, kv);
  if (!album) return NOT_FOUND();
  if (typeof captions !== "object" || captions === null || Array.isArray(captions)) return fail(400, "Send captions by photo.");
  const entries = Object.entries(captions as Record<string, unknown>);
  if (entries.length > MAX_PHOTOS_PER_ALBUM) return fail(400, "Too many captions.");
  const updates: AlbumPhoto[] = [];
  for (const [photoId, value] of entries) {
    const caption = cleanText(value, CAPTION_MAX);
    if (!isAlbumId(photoId) || caption === null) return fail(400, `A caption can be up to ${CAPTION_MAX} characters.`);
    const raw = await kv.hget(photosKey(id), photoId);
    if (!raw) return NOT_FOUND();
    const entry = JSON.parse(raw) as AlbumPhoto & { pending?: boolean };
    if (entry.pending) return NOT_FOUND();
    updates.push({ ...entry, caption });
  }
  const limited = await editSlot(account, kv);
  if (limited) return limited;
  for (const photo of updates) await kv.hset(photosKey(id), photo.id, JSON.stringify({ ...photo, s: 1 }));
  return ownedAlbum(account, id, kv);
}

/** Give the album a new id: the old link (and its QR code) stop working at once. */
export async function regenerateAlbumLink(account: string, id: string, kv: KV = getKV()): Promise<LibraryResult<OwnedAlbum>> {
  const album = await owned(account, id, kv);
  if (!album) return NOT_FOUND();
  const limited = await editSlot(account, kv);
  if (limited) return limited;
  const next: Album = { ...album, id: newAlbumId(), updatedAt: new Date().toISOString() };
  const photos = await kv.hgetall(photosKey(id));
  for (const [photoId, raw] of Object.entries(photos)) await kv.hset(photosKey(next.id), photoId, raw);
  await kv.set(albumKey(next.id), JSON.stringify(next), { onlyIfNew: true });
  await kv.hset(libraryKeys.albums(account), album.dayId, next.id);
  // The old id goes last, so a failure part way never leaves the day without an album.
  await kv.del(albumKey(id));
  await kv.del(photosKey(id));
  return ownedAlbum(account, next.id, kv);
}

async function dropAlbum(account: string, album: Album, kv: KV, blobs: BlobStore): Promise<void> {
  const photoIds = Object.keys(await kv.hgetall(photosKey(album.id)));
  // The links go first: from here the album is gone for everyone.
  await kv.del(albumKey(album.id));
  if ((await kv.hget(libraryKeys.albums(account), album.dayId)) === album.id) await kv.hdel(libraryKeys.albums(account), album.dayId);
  if (photoIds.length) {
    await kv.sizedDel(photosKey(album.id), photoCountKey(account), photoIds);
    await blobs.del(photoIds.map((photoId) => photoPath(account, photoId)));
  }
  await kv.del(photosKey(album.id));
}

/** Delete the album and its photos. */
export async function deleteAlbum(account: string, id: string, kv: KV = getKV(), blobs: BlobStore = getBlobStore()): Promise<LibraryResult> {
  const album = await owned(account, id, kv);
  if (!album) return NOT_FOUND();
  await dropAlbum(account, album, kv, blobs);
  return { ok: true, value: undefined };
}

/** Delete every album the account has (account deletion). */
export async function deleteAllAlbums(account: string, kv: KV = getKV(), blobs: BlobStore = getBlobStore()): Promise<void> {
  const ids = Object.values(await kv.hgetall(libraryKeys.albums(account)));
  for (const id of ids) {
    const album = await owned(account, id, kv);
    if (album) await dropAlbum(account, album, kv, blobs);
  }
  await kv.del(libraryKeys.albums(account));
  await kv.del(photoCountKey(account));
  const hour = windowOf(3600).index;
  await Promise.all([kv.del(`album:uploads:${account}:${hour}`), kv.del(`album:edits:${account}:${hour}`)]);
}

/** The album's photos as JPEG bytes for the caption model (owner only). */
export async function photosForCaptions(
  account: string,
  id: string,
  kv: KV = getKV(),
  blobs: BlobStore = getBlobStore(),
): Promise<LibraryResult<{ album: OwnedAlbum; images: { id: string; data: Uint8Array }[] }>> {
  const result = await ownedAlbum(account, id, kv);
  if (!result.ok) return result;
  const images: { id: string; data: Uint8Array }[] = [];
  for (const photo of result.value.photos) {
    const blob = await blobs.get(photoPath(account, photo.id));
    if (blob) images.push({ id: photo.id, data: new Uint8Array(await new Response(blob.body).arrayBuffer()) });
  }
  return { ok: true, value: { album: result.value, images } };
}
