import "server-only";
import { sniffImageType } from "@/lib/models/meta/image";
import { getBlobStore, type BlobStore, type StoredBlob } from "./blob";
import { randomBytes } from "node:crypto";
import { getKV, versionOf, type KV } from "./kv";
import { hit } from "./rateLimit";

/**
 * Each account's comic book on the server: days, cast, a few synced settings
 * and the images they point at.
 *
 * Everything is keyed by the signed-in account's id, which only ever comes
 * from the session (never from the request). A record id from the URL is
 * looked up inside that account's own namespace, so asking for another
 * account's day, character or image finds nothing and answers 404: there is
 * no lookup by id alone.
 *
 * KV layout (per account `a`):
 *   lib:a:days      hash  dayId -> {"u": updatedAt, "d"?: 1 when deleted}
 *   lib:a:day:<id>  the Day as JSON
 *   lib:a:cast      hash  characterId -> index entry
 *   lib:a:char:<id> the Character as JSON
 *   lib:a:meta      hash  key -> {"u", "v"} (covers, starter-cast flag, never-ask names)
 *   lib:a:imgs      hash  imageId -> {"t": type, "s": bytes}
 *   lib:a:imgbytes  counter of stored image bytes (quota)
 * Blob layout: a/<accountId>/i/<imageId>/<version> (a new random version per upload)
 */

export type RecordKind = "days" | "cast";

/** Ids the app makes: UUIDs, starter ids ("nour"), sample ids ("sample-teta"), image ids ("<day>-panel-3"). */
const RECORD_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/;
/** Settings that follow the account; everything else in the device's `meta` store stays on the device. */
const META_KEY = /^(cover:\d{4}-(0[1-9]|1[0-2])|starterCastSeeded|newPeople:never)$/;

export function isRecordId(id: unknown): id is string {
  return typeof id === "string" && RECORD_ID.test(id);
}

export function isSyncedMetaKey(key: unknown): key is string {
  return typeof key === "string" && META_KEY.test(key);
}

/** Bytes of JSON a record may take. A three-page day is well under 100 KB. */
export const RECORD_LIMITS: Record<RecordKind, number> = { days: 256 * 1024, cast: 64 * 1024 };
export const META_LIMIT = 16 * 1024;
/** One comic image (panel, sheet, sprite sheet, cover). */
export const IMAGE_LIMIT = 8 * 1024 * 1024;

function envInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function libraryLimits() {
  return {
    days: envInt("COMIMO_ACCOUNT_DAY_CAP", 3000),
    cast: envInt("COMIMO_ACCOUNT_CAST_CAP", 300),
    /** Stored image bytes per account (default 2 GB). */
    imageBytes: envInt("COMIMO_ACCOUNT_IMAGE_MB", 2048) * 1024 * 1024,
    images: envInt("COMIMO_ACCOUNT_IMAGE_CAP", 40_000),
    /** Image uploads per account per hour: a three-page comic is about 40 with the face-fix "before" copies. */
    imageUploadsPerHour: envInt("COMIMO_IMAGE_UPLOADS_PER_HOUR", 600),
    /** Image uploads per day for everyone. */
    imageUploadsPerDay: envInt("COMIMO_DAILY_IMAGE_UPLOAD_CAP", 50_000),
    /** Record writes per account per hour (days, cast, settings). */
    writesPerHour: envInt("COMIMO_RECORD_WRITES_PER_HOUR", 1200),
  };
}

const keys = {
  index: (account: string, kind: RecordKind) => `lib:${account}:${kind}`,
  record: (account: string, kind: RecordKind, id: string) => `lib:${account}:${kind === "days" ? "day" : "char"}:${id}`,
  meta: (account: string) => `lib:${account}:meta`,
  images: (account: string) => `lib:${account}:imgs`,
  imageBytes: (account: string) => `lib:${account}:imgbytes`,
  albums: (account: string) => `lib:${account}:albums`,
};

export const libraryKeys = keys;

/** Where one version of an image is kept: a/<account>/i/<imageId>/<version>. */
export function imagePath(account: string, imageId: string, version: string): string {
  return `a/${account}/i/${imageId}/${version}`;
}

/** The blob path an image entry points at, or null when there is no entry. */
function imagePathFor(account: string, imageId: string, raw: string | null): string | null {
  if (!raw) return null;
  const version = versionOf(raw);
  return version ? imagePath(account, imageId, version) : `a/${account}/i/${imageId}`;
}

export function accountBlobPrefix(account: string): string {
  return `a/${account}/`;
}

/* ---------- Index entries ---------- */

export interface IndexEntry {
  /** updatedAt of the stored version (ISO). */
  u: string;
  /** 1 when deleted (a tombstone, so other devices drop their copy). */
  d?: 1;
}

function parseEntry(raw: string | null | undefined): IndexEntry | null {
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as IndexEntry;
    return typeof entry.u === "string" ? entry : null;
  } catch {
    return null;
  }
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
/** A device clock may run a little ahead; a stamp further out than this is refused (it would win every later sync). */
const FUTURE_SLACK_MS = 10 * 60 * 1000;

/** True when stamp `a` is later than `b` (by time, not by text: "…00Z" and "…00.500Z" differ in format). */
export function isLater(a: string, b: string): boolean {
  return Date.parse(a) > Date.parse(b);
}

export function isStamp(value: unknown, now = Date.now()): value is string {
  return typeof value === "string" && ISO.test(value) && !Number.isNaN(Date.parse(value)) && Date.parse(value) <= now + FUTURE_SLACK_MS;
}

/* ---------- Results ---------- */

export type LibraryResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 404 | 409 | 413 | 429 | 507; error: string; current?: string; retryAfterSec?: number };

const fail = <T>(status: 400 | 404 | 409 | 413 | 429 | 507, error: string, extra: { current?: string; retryAfterSec?: number } = {}): LibraryResult<T> => ({
  ok: false,
  status,
  error,
  ...extra,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The image ids a record points at (`{ kind: "blob", id }` anywhere inside it). */
export function blobRefs(value: unknown, found = new Set<string>(), depth = 0): Set<string> {
  if (depth > 12) return found;
  if (Array.isArray(value)) {
    for (const item of value) blobRefs(item, found, depth + 1);
  } else if (isRecord(value)) {
    if (value.kind === "blob" && isRecordId(value.id)) found.add(value.id);
    for (const item of Object.values(value)) if (typeof item === "object" && item !== null) blobRefs(item, found, depth + 1);
  }
  return found;
}

/* ---------- The account's whole index (sync) ---------- */

export interface LibraryIndex {
  days: Record<string, IndexEntry>;
  cast: Record<string, IndexEntry>;
  meta: Record<string, string>;
  images: string[];
  /** dayId -> album id. */
  albums: Record<string, string>;
}

function entries(raw: Record<string, string>): Record<string, IndexEntry> {
  const out: Record<string, IndexEntry> = {};
  for (const [id, value] of Object.entries(raw)) {
    const entry = parseEntry(value);
    if (entry && isRecordId(id)) out[id] = entry;
  }
  return out;
}

/** What the account has, without the records themselves: enough for a device to know what to fetch and send. */
export async function libraryIndex(account: string, kv: KV = getKV()): Promise<LibraryIndex> {
  // At most once an hour per account (every device syncs through here), recount the stored image bytes.
  if (await recountDue(account, kv)) await recountImageBytes(account, kv);
  const [days, cast, meta, images, albums] = await Promise.all([
    kv.hgetall(keys.index(account, "days")),
    kv.hgetall(keys.index(account, "cast")),
    kv.hgetall(keys.meta(account)),
    kv.hgetall(keys.images(account)),
    kv.hgetall(keys.albums(account)),
  ]);
  const metaStamps: Record<string, string> = {};
  for (const [key, raw] of Object.entries(meta)) {
    const entry = parseEntry(raw);
    if (entry && isSyncedMetaKey(key)) metaStamps[key] = entry.u;
  }
  return { days: entries(days), cast: entries(cast), meta: metaStamps, images: Object.keys(images), albums };
}

/* ---------- Days and cast ---------- */

/** The stored record as JSON text, or 404 (also for another account's id: it isn't in this namespace). */
export async function getRecord(account: string, kind: RecordKind, id: string, kv: KV = getKV()): Promise<LibraryResult<string>> {
  if (!isRecordId(id)) return fail(404, "Not found.");
  const raw = await kv.get(keys.record(account, kind, id));
  return raw ? { ok: true, value: raw } : fail(404, "Not found.");
}

async function writeSlot(account: string, kv: KV): Promise<LibraryResult> {
  const slot = await hit(kv, `lib:${account}:writes`, libraryLimits().writesPerHour, 3600);
  return slot.ok ? { ok: true, value: undefined } : fail(429, "That's a lot of saving for one hour. Try again later.", { retryAfterSec: slot.retryAfterSec });
}

/**
 * Save a day or character. `body` is the record as the device holds it; its
 * `id` must match the URL and its `updatedAt` decides which copy wins: an
 * older copy than the stored one is refused with 409 and the stored stamp.
 */
export async function putRecord(
  account: string,
  kind: RecordKind,
  id: string,
  body: unknown,
  kv: KV = getKV(),
): Promise<LibraryResult<IndexEntry>> {
  if (!isRecordId(id)) return fail(400, "That id isn't valid.");
  if (!isRecord(body) || body.id !== id) return fail(400, "Send the record with the id in the address.");
  const stamp = body.updatedAt ?? body.createdAt;
  if (!isStamp(stamp)) return fail(400, "The record needs a valid updatedAt time.");
  if (kind === "days" && (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date))) return fail(400, "A day needs a date.");
  if (kind === "cast" && typeof body.name !== "string") return fail(400, "A character needs a name.");
  const text = JSON.stringify(body);
  if (Buffer.byteLength(text) > RECORD_LIMITS[kind]) return fail(413, "That record is too big.");

  const indexKey = keys.index(account, kind);
  const current = parseEntry(await kv.hget(indexKey, id));
  if (current && isLater(current.u, stamp)) return fail(409, "A newer copy is already saved.", { current: current.u });
  if (!current) {
    const count = Object.keys(await kv.hgetall(indexKey)).length;
    const cap = kind === "days" ? libraryLimits().days : libraryLimits().cast;
    if (count >= cap) return fail(507, kind === "days" ? "Your comic book is full." : "Your cast is full.");
  }
  const slot = await writeSlot(account, kv);
  if (!slot.ok) return slot;

  const entry: IndexEntry = { u: stamp };
  await kv.set(keys.record(account, kind, id), text);
  await kv.hset(indexKey, id, JSON.stringify(entry));
  return { ok: true, value: entry };
}

/**
 * Delete a day or character, leaving a tombstone stamped `at` so other
 * devices drop it too. The images only it pointed at go with it.
 */
export async function deleteRecord(
  account: string,
  kind: RecordKind,
  id: string,
  at: unknown,
  kv: KV = getKV(),
  blobs: BlobStore = getBlobStore(),
): Promise<LibraryResult<IndexEntry>> {
  if (!isRecordId(id)) return fail(404, "Not found.");
  if (!isStamp(at)) return fail(400, "Send the time it was deleted.");
  const indexKey = keys.index(account, kind);
  const current = parseEntry(await kv.hget(indexKey, id));
  if (!current) return fail(404, "Not found.");
  if (isLater(current.u, at)) return fail(409, "A newer copy is already saved.", { current: current.u });
  const slot = await writeSlot(account, kv);
  if (!slot.ok) return slot;

  const raw = await kv.get(keys.record(account, kind, id));
  const entry: IndexEntry = { u: at, d: 1 };
  await kv.hset(indexKey, id, JSON.stringify(entry));
  await kv.del(keys.record(account, kind, id));
  if (raw) {
    try {
      await deleteImages(account, [...blobRefs(JSON.parse(raw))], kv, blobs);
    } catch {
      // A record that doesn't parse has no images to find; the account deletion sweeps the folder anyway.
    }
  }
  return { ok: true, value: entry };
}

/* ---------- Synced settings ---------- */

export async function getMeta(account: string, key: string, kv: KV = getKV()): Promise<LibraryResult<{ u: string; v: unknown }>> {
  if (!isSyncedMetaKey(key)) return fail(404, "Not found.");
  const raw = await kv.hget(keys.meta(account), key);
  if (!raw) return fail(404, "Not found.");
  try {
    return { ok: true, value: JSON.parse(raw) as { u: string; v: unknown } };
  } catch {
    return fail(404, "Not found.");
  }
}

export async function putMeta(account: string, key: string, body: unknown, kv: KV = getKV()): Promise<LibraryResult<IndexEntry>> {
  if (!isSyncedMetaKey(key)) return fail(400, "That setting isn't kept with the account.");
  if (!isRecord(body) || !isStamp(body.u)) return fail(400, "Send { u, v }.");
  const value = body.v;
  if (!(typeof value === "string" || typeof value === "number" || typeof value === "boolean")) return fail(400, "Send { u, v }.");
  const text = JSON.stringify({ u: body.u, v: value });
  if (Buffer.byteLength(text) > META_LIMIT) return fail(413, "That setting is too big.");
  const current = parseEntry(await kv.hget(keys.meta(account), key));
  if (current && isLater(current.u, body.u)) return fail(409, "A newer copy is already saved.", { current: current.u });
  const slot = await writeSlot(account, kv);
  if (!slot.ok) return slot;
  await kv.hset(keys.meta(account), key, text);
  return { ok: true, value: { u: body.u } };
}

/* ---------- Images ---------- */

interface ImageEntry {
  /** Content type, from the bytes. */
  t: string;
  /** Size in bytes. */
  s: number;
  /** Random version: the blob path of these bytes. */
  v: string;
}

function parseImage(raw: string | null): ImageEntry | null {
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as ImageEntry;
    return typeof entry.t === "string" && typeof entry.s === "number" ? entry : null;
  } catch {
    return null;
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Keep one comic image for the account. The bytes must be a PNG, JPEG or
 * WebP (by their first bytes), at most IMAGE_LIMIT; they are stored exactly
 * as sent, so server-signed sheet tokens over them stay valid. Counts against
 * the account's hourly uploads, the global daily uploads and the account's
 * stored bytes and images (each counter is bumped first, then compared).
 */
export async function putImage(
  account: string,
  imageId: string,
  bytes: Uint8Array,
  kv: KV = getKV(),
  blobs: BlobStore = getBlobStore(),
): Promise<LibraryResult<{ size: number }>> {
  if (!isRecordId(imageId)) return fail(400, "That image id isn't valid.");
  if (bytes.byteLength === 0 || bytes.byteLength > IMAGE_LIMIT) return fail(413, "That image is too big.");
  const type = sniffImageType(bytes);
  if (!type) return fail(400, "Only PNG, JPEG and WebP images are kept.");
  const limits = libraryLimits();

  // Rate-limit slots are spent for good once taken, refused or not: a client
  // over its quota can't keep retrying for free.
  const hourly = await hit(kv, `lib:${account}:uploads`, limits.imageUploadsPerHour, 3600);
  if (!hourly.ok) return fail(429, "That's a lot of pictures for one hour. Try again later.", { retryAfterSec: hourly.retryAfterSec });
  const daily = await hit(kv, `lib:uploads:${today()}`, limits.imageUploadsPerDay, 86_400);
  if (!daily.ok) {
    return fail(429, "Comimo has saved all the pictures it can for today. Your comics stay on this device until tomorrow.", {
      retryAfterSec: daily.retryAfterSec,
    });
  }

  // Each upload gets its own blob path (a random version), so two uploads to
  // one id never write the same object, and the entry always names the bytes it counts.
  const version = randomBytes(9).toString("base64url");
  const entry = JSON.stringify({ t: type, s: bytes.byteLength, v: version } satisfies ImageEntry);
  const hash = keys.images(account);
  const counter = keys.imageBytes(account);
  const caps = { maxTotal: limits.imageBytes, maxCount: limits.images };

  // Reserve the bytes before writing anything: entry and running total move
  // together in one atomic step, so parallel uploads can't double-count,
  // drift or slip past the quota.
  let reserved = await kv.sizedPut(hash, counter, imageId, entry, bytes.byteLength, caps);
  if (!reserved.ok && reserved.reason === "total" && (await recountDue(account, kv))) {
    // The total may have drifted (a crash between steps): recount from the entries, at most once an hour, and try once more.
    await recountImageBytes(account, kv);
    reserved = await kv.sizedPut(hash, counter, imageId, entry, bytes.byteLength, caps);
  }
  if (!reserved.ok) return fail(507, "Your comic book has no room for more pictures.");

  // The entry this upload replaced is no longer counted, so its bytes go once ours are settled.
  const replaced = reserved.previous ? imagePathFor(account, imageId, reserved.previous) : null;
  const mine = imagePath(account, imageId, version);
  try {
    await blobs.put(mine, bytes, type);
  } catch (error) {
    // Roll back only our own reservation: a later upload to this id may already own the entry.
    await kv.sizedDelIf(hash, counter, imageId, version);
    await blobs.del([mine, ...(replaced && replaced !== mine ? [replaced] : [])]).catch(() => {});
    throw error;
  }
  // Commit check: if a later upload took the entry meanwhile, our bytes are nobody's.
  const current = await kv.hget(hash, imageId);
  const stale = [replaced, versionOf(current) === version ? null : mine].filter((path): path is string => Boolean(path) && path !== imagePathFor(account, imageId, current));
  if (stale.length) await blobs.del(stale);
  return { ok: true, value: { size: bytes.byteLength } };
}

/** One of the account's images, or 404 (also for another account's image id). */
export async function getImage(account: string, imageId: string, kv: KV = getKV(), blobs: BlobStore = getBlobStore()): Promise<LibraryResult<StoredBlob>> {
  if (!isRecordId(imageId)) return fail(404, "Not found.");
  const raw = await kv.hget(keys.images(account), imageId);
  if (!parseImage(raw)) return fail(404, "Not found.");
  const blob = await blobs.get(imagePathFor(account, imageId, raw)!);
  return blob ? { ok: true, value: blob } : fail(404, "Not found.");
}

async function deleteImages(account: string, imageIds: string[], kv: KV, blobs: BlobStore): Promise<void> {
  const ids = imageIds.filter(isRecordId);
  if (!ids.length) return;
  const paths: string[] = [];
  for (const id of ids) {
    const path = imagePathFor(account, id, await kv.hget(keys.images(account), id));
    if (path) paths.push(path);
  }
  // Entries and total first (atomically), then the bytes. An upload racing
  // this sees its entry gone at its commit check and removes its own bytes.
  await kv.sizedDel(keys.images(account), keys.imageBytes(account), ids);
  if (paths.length) await blobs.del(paths);
}

/** True at most once an hour per account: a full recount reads every entry, so it is rationed. */
async function recountDue(account: string, kv: KV): Promise<boolean> {
  return kv.set(`lib:${account}:imgrecount`, "1", { ttlSec: 3600, onlyIfNew: true });
}

/** Recount the account's stored image bytes from its entries (repairs drift). */
export function recountImageBytes(account: string, kv: KV = getKV()): Promise<number> {
  return kv.sizedRecount(keys.images(account), keys.imageBytes(account));
}

/* ---------- Deleting everything ---------- */

/** Remove every day, character, setting and image the account has (albums are removed by the album module). */
export async function deleteLibrary(account: string, kv: KV = getKV(), blobs: BlobStore = getBlobStore()): Promise<void> {
  for (const kind of ["days", "cast"] as const) {
    const ids = Object.keys(await kv.hgetall(keys.index(account, kind)));
    for (const id of ids) await kv.del(keys.record(account, kind, id));
    await kv.del(keys.index(account, kind));
  }
  await blobs.delPrefix(accountBlobPrefix(account));
  await Promise.all([kv.del(keys.meta(account)), kv.del(keys.images(account)), kv.del(keys.imageBytes(account))]);
}
