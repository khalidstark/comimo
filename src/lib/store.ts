import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb";
import * as cloud from "./cloud";
import { blobIdsIn, imagesToPush, isSyncedMetaKey, planMeta, planRecords, stampOf, type RecordKind, type RemoteIndex } from "./sync";
import type { Character, Day, MonthBook, MonthKey } from "./types";
import { rememberCacheKey, rememberedCacheKey, whoAmI } from "./whoami";

/**
 * The store: days, the cast, image Blobs and a few flags.
 *
 * Signed in, everything lives with the account on the server (/api/me/*) and
 * this browser's IndexedDB is the account's offline cache: one database per
 * account ("comimo-<cacheKey>"), so two people signing in on one computer
 * never see each other's comics. Every save goes to the cache first and then
 * to the server; on each page load the store compares the two (sync.ts) and
 * fetches or sends what differs, newest copy winning. Images the cache lacks
 * are fetched the first time they are shown.
 *
 * Signed out, the store uses the device database ("comimo") as before
 * accounts; comics made there can be moved to an account (moveDeviceComics).
 *
 * Every function is safe to call anywhere: on the server, in a private window
 * or when IndexedDB is blocked it resolves to an empty result (reads) or
 * `false` (writes), so pages fall back to their empty states.
 */

const DEVICE_DB = "comimo";
const DB_VERSION = 2;
/** How long a page waits for the first sync before showing what the cache has. */
const FIRST_SYNC_WAIT_MS = 8_000;

interface ComimoDB extends DBSchema {
  days: {
    key: string;
    value: Day;
    indexes: { "by-date": string };
  };
  cast: {
    key: string;
    value: Character;
  };
  /** Blobs keyed by image id (out-of-line keys). */
  images: {
    key: string;
    value: Blob;
  };
  /** Small flags about this device's data, e.g. whether the starter cast was seeded (out-of-line keys). */
  meta: {
    key: string;
    value: string | number | boolean;
  };
}

type Db = IDBPDatabase<ComimoDB>;

type Scope = { kind: "device" } | { kind: "account"; key: string };

function openNamed(name: string, onTerminated: () => void): Promise<Db> {
  return openDB<ComimoDB>(name, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("days")) {
        const days = db.createObjectStore("days", { keyPath: "id" });
        days.createIndex("by-date", "date");
      }
      if (!db.objectStoreNames.contains("cast")) {
        db.createObjectStore("cast", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("images")) {
        db.createObjectStore("images");
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta");
      }
    },
    terminated: onTerminated,
  });
}

const accountDbName = (key: string) => `comimo-${key}`;

/* ---------- Which database ---------- */

let scopePromise: Promise<Scope> | null = null;

/** Signed in: the account's cache. Offline: the account last seen here. Signed out: the device database. */
function scope(): Promise<Scope> {
  scopePromise ??= whoAmI().then(
    (me) => {
      rememberCacheKey(me?.cacheKey ?? null);
      return me ? { kind: "account" as const, key: me.cacheKey } : { kind: "device" as const };
    },
    () => {
      const remembered = rememberedCacheKey();
      return remembered ? { kind: "account" as const, key: remembered } : { kind: "device" as const };
    },
  );
  return scopePromise;
}

interface Opened {
  db: Db;
  scope: Scope;
}

let openPromise: Promise<Opened | null> | null = null;

function open(): Promise<Opened | null> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return Promise.resolve(null);
  openPromise ??= scope()
    .then(async (current) => {
      const name = current.kind === "account" ? accountDbName(current.key) : DEVICE_DB;
      const db = await openNamed(name, () => {
        // The browser closed the connection (e.g. storage cleared); reopen next time.
        openPromise = null;
        readyPromise = null;
      });
      return { db, scope: current };
    })
    .catch((error: unknown) => {
      console.warn("Comimo: on-device storage is unavailable", error);
      openPromise = null;
      return null;
    });
  return openPromise;
}

let readyPromise: Promise<Opened | null> | null = null;

/**
 * The database, after the first sync of this page load (or after a short
 * wait, so an offline or slow network never blocks the app; the sync then
 * finishes in the background).
 */
function ready(): Promise<Opened | null> {
  readyPromise ??= open().then(async (opened) => {
    if (!opened || opened.scope.kind !== "account") return opened;
    const sync = runSync(opened.db);
    await Promise.race([sync, new Promise((resolve) => setTimeout(resolve, FIRST_SYNC_WAIT_MS))]);
    return opened;
  });
  return readyPromise;
}

/** Run `fn` against the database, or return `fallback` if storage is unavailable or the call fails. */
async function withDb<T>(fallback: T, fn: (db: Db, signedIn: boolean) => Promise<T>): Promise<T> {
  const opened = await ready();
  if (!opened) return fallback;
  try {
    return await fn(opened.db, opened.scope.kind === "account");
  } catch (error) {
    console.warn("Comimo: storage call failed", error);
    return fallback;
  }
}

/** Whether this browser can keep days on the device. */
export async function isStoreAvailable(): Promise<boolean> {
  return (await open()) !== null;
}

/** True when the store is the signed-in account's (synced) comic book. */
export async function isSignedInStore(): Promise<boolean> {
  return (await open())?.scope.kind === "account";
}

/** A random id for days, characters and images. */
export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const now = () => new Date().toISOString();

/* ---------- Sending changes ---------- */

const tombKey = (kind: RecordKind, id: string) => `tomb:${kind}:${id}`;
const stampKey = (key: string) => `stamp:${key}`;

/** Send a record in the background; a failure is picked up by the next sync. */
function sendRecord(kind: RecordKind, record: Day | Character): void {
  void cloud.pushRecord(kind, record);
}

function sendDeletion(db: Db, kind: RecordKind, id: string, at: string): void {
  void cloud.deleteRemoteRecord(kind, id, at).then((done) => (done ? db.delete("meta", tombKey(kind, id)) : undefined));
}

const pendingImages = new Map<string, Promise<boolean>>();

function sendImage(id: string, blob: Blob): Promise<boolean> {
  const sending = cloud.pushImage(id, blob).finally(() => pendingImages.delete(id));
  pendingImages.set(id, sending);
  return sending;
}

/* ---------- Days ---------- */

export function saveDay(day: Day): Promise<boolean> {
  return withDb(false, async (db, signedIn) => {
    const stamped: Day = { ...day, updatedAt: now() };
    await db.put("days", stamped);
    if (signedIn) {
      await db.delete("meta", tombKey("days", day.id));
      sendRecord("days", stamped);
    }
    return true;
  });
}

export function getDay(id: string): Promise<Day | undefined> {
  return withDb(undefined, async (db, signedIn) => {
    const local = await db.get("days", id);
    if (local || !signedIn) return local;
    // Not in this cache yet (made on another device moments ago): ask the account.
    const remote = await cloud.fetchRecord<Day>("days", id);
    if (remote?.id === id) await db.put("days", remote);
    return remote ?? undefined;
  });
}

/** Every stored day, oldest first. */
export function listDays(): Promise<Day[]> {
  return withDb([], (db) => db.getAllFromIndex("days", "by-date"));
}

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Days in one month (YYYY-MM), oldest first. */
export function listDaysByMonth(month: MonthKey): Promise<Day[]> {
  if (!MONTH_KEY.test(month)) return Promise.resolve([]);
  const range = IDBKeyRange.bound(`${month}-01`, `${month}-31`);
  return withDb([], (db) => db.getAllFromIndex("days", "by-date", range));
}

/** The month's issue, built from the days stored for that month. */
export async function getMonthBook(month: MonthKey): Promise<MonthBook> {
  const days = await listDaysByMonth(month);
  return { month, dayIds: days.map((day) => day.id) };
}

export function deleteDay(id: string): Promise<boolean> {
  return withDb(false, async (db, signedIn) => {
    await db.delete("days", id);
    if (signedIn) {
      const at = now();
      await db.put("meta", at, tombKey("days", id));
      sendDeletion(db, "days", id, at);
    }
    return true;
  });
}

/* ---------- Cast ---------- */

export function saveCharacter(character: Character): Promise<boolean> {
  return withDb(false, async (db, signedIn) => {
    const stamped: Character = { ...character, updatedAt: now() };
    await db.put("cast", stamped);
    if (signedIn) {
      await db.delete("meta", tombKey("cast", character.id));
      sendRecord("cast", stamped);
    }
    return true;
  });
}

export function getCharacter(id: string): Promise<Character | undefined> {
  return withDb(undefined, (db) => db.get("cast", id));
}

export function deleteCharacter(id: string): Promise<boolean> {
  return withDb(false, async (db, signedIn) => {
    await db.delete("cast", id);
    if (signedIn) {
      const at = now();
      await db.put("meta", at, tombKey("cast", id));
      sendDeletion(db, "cast", id, at);
    }
    return true;
  });
}

/** The user's own characters, oldest first. */
export async function listCast(): Promise<Character[]> {
  const cast = await withDb<Character[]>([], (db) => db.getAll("cast"));
  return cast.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/* ---------- Images ---------- */

/** Store an image Blob under `id` (replaces any image with that id); signed in, it is also sent to the account. */
export function putImage(id: string, blob: Blob): Promise<boolean> {
  return withDb(false, async (db, signedIn) => {
    await db.put("images", blob, id);
    if (signedIn) void sendImage(id, blob);
    return true;
  });
}

const fetchingImages = new Map<string, Promise<Blob | undefined>>();

export function getImage(id: string): Promise<Blob | undefined> {
  return withDb(undefined, async (db, signedIn) => {
    const local = await db.get("images", id);
    if (local || !signedIn) return local;
    // First time this image is shown on this device: fetch it once and keep it.
    let fetching = fetchingImages.get(id);
    if (!fetching) {
      fetching = cloud.fetchImage(id).then(async (blob) => {
        if (blob) await db.put("images", blob, id);
        return blob ?? undefined;
      });
      fetchingImages.set(id, fetching);
      void fetching.finally(() => fetchingImages.delete(id));
    }
    return fetching;
  });
}

/* ---------- Meta flags ---------- */

export function getMeta(key: string): Promise<string | number | boolean | undefined> {
  return withDb(undefined, (db) => db.get("meta", key));
}

export function setMeta(key: string, value: string | number | boolean): Promise<boolean> {
  return withDb(false, async (db, signedIn) => {
    await db.put("meta", value, key);
    if (signedIn && isSyncedMetaKey(key)) {
      const at = now();
      await db.put("meta", at, stampKey(key));
      void cloud.pushMeta(key, at, value);
    }
    return true;
  });
}

/* ---------- Albums (ids only; the albums live on the server) ---------- */

const ALBUMS_KEY = "albums";

async function readAlbumMap(db: Db): Promise<Record<string, string>> {
  const raw = await db.get("meta", ALBUMS_KEY);
  if (typeof raw !== "string") return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

/** The album id for a day, as last seen from the server (works offline). */
export function getAlbumId(dayId: string): Promise<string | null> {
  return withDb(null, async (db) => (await readAlbumMap(db))[dayId] ?? null);
}

/** Every day's album id (for the magazine). */
export function getAlbumIds(): Promise<Record<string, string>> {
  return withDb({}, readAlbumMap);
}

export function setAlbumId(dayId: string, albumId: string | null): Promise<boolean> {
  return withDb(false, async (db) => {
    const map = await readAlbumMap(db);
    if (albumId) map[dayId] = albumId;
    else delete map[dayId];
    await db.put("meta", JSON.stringify(map), ALBUMS_KEY);
    return true;
  });
}

/* ---------- Sync with the account ---------- */

let syncing: Promise<void> | null = null;

/** Compare this cache with the account and fetch or send what differs. One at a time. */
function runSync(db: Db): Promise<void> {
  syncing ??= syncOnce(db).finally(() => {
    syncing = null;
  });
  return syncing;
}

/** Sync now (e.g. before signing out); resolves when done. False when not signed in or offline. */
export async function syncNow(): Promise<boolean> {
  const opened = await open();
  if (!opened || opened.scope.kind !== "account") return false;
  await runSync(opened.db);
  await Promise.all(pendingImages.values());
  return lastSyncOk;
}

let lastSyncOk = false;

async function localSide(db: Db, kind: RecordKind) {
  const records = new Map<string, string>();
  for (const record of await db.getAll(kind)) records.set(record.id, stampOf(record));
  const tombstones = new Map<string, string>();
  const prefix = `tomb:${kind}:`;
  for (const key of await db.getAllKeys("meta", IDBKeyRange.bound(prefix, `${prefix}￿`))) {
    const at = await db.get("meta", key);
    if (typeof at === "string") tombstones.set(key.slice(prefix.length), at);
  }
  return { records, tombstones };
}

async function syncKind(db: Db, kind: RecordKind, remote: RemoteIndex): Promise<void> {
  const plan = planRecords(await localSide(db, kind), remote[kind]);

  await cloud.inBatches(plan.pull, 4, async (id) => {
    const record = await cloud.fetchRecord<Day & Character>(kind, id);
    if (!record || record.id !== id) return;
    const local = await db.get(kind, id);
    if (local && Date.parse(stampOf(local)) >= Date.parse(stampOf(record))) return;
    if (kind === "cast" && local) {
      // A redrawn sheet or sprite keeps its image id: drop the cached copies so the new ones are fetched.
      await Promise.all([...blobIdsIn(record)].map((imageId) => db.delete("images", imageId)));
    }
    await db.put(kind, record);
  });
  await cloud.inBatches(plan.push, 4, async (id) => {
    const record = await db.get(kind, id);
    if (record) await cloud.pushRecord(kind, record);
  });
  for (const id of plan.drop) await db.delete(kind, id);
  await cloud.inBatches(plan.deleteRemote, 4, async ([id, at]) => {
    if (await cloud.deleteRemoteRecord(kind, id, at)) await db.delete("meta", tombKey(kind, id));
  });
  for (const id of plan.forget) await db.delete("meta", tombKey(kind, id));
}

async function syncMeta(db: Db, remote: RemoteIndex): Promise<void> {
  const local = new Map<string, string>();
  for (const key of await db.getAllKeys("meta")) {
    if (!isSyncedMetaKey(key)) continue;
    const stamp = await db.get("meta", stampKey(key));
    // A setting kept before stamps existed counts as very old: the account's copy wins.
    local.set(key, typeof stamp === "string" ? stamp : "1970-01-01T00:00:00.000Z");
  }
  const plan = planMeta(local, remote.meta);
  await cloud.inBatches(plan.pull, 4, async (key) => {
    const value = await cloud.fetchMeta(key);
    if (!value) return;
    await db.put("meta", value.v, key);
    await db.put("meta", value.u, stampKey(key));
  });
  await cloud.inBatches(plan.push, 4, async (key) => {
    const value = await db.get("meta", key);
    const stamp = await db.get("meta", stampKey(key));
    if (value !== undefined) await cloud.pushMeta(key, typeof stamp === "string" ? stamp : now(), value);
  });
}

async function syncOnce(db: Db): Promise<void> {
  const remote = await cloud.fetchLibrary();
  if (!remote) {
    lastSyncOk = false;
    return;
  }
  // Settings first: the starter-cast flag decides whether this device seeds the starter cast.
  await syncMeta(db, remote);
  await syncKind(db, "cast", remote);
  await syncKind(db, "days", remote);
  await db.put("meta", JSON.stringify(remote.albums), ALBUMS_KEY);
  // Images made here that never reached the account (offline, closed tab): send them now, a few at a time.
  const missing = imagesToPush(await db.getAllKeys("images"), remote.images).filter((id) => !pendingImages.has(id));
  void cloud.inBatches(missing, 3, async (id) => {
    const blob = await db.get("images", id);
    if (blob) await sendImage(id, blob);
  });
  lastSyncOk = true;
  if (typeof window !== "undefined") window.dispatchEvent(new Event("comimo:synced"));
}

/* ---------- Comics made on this device before signing in ---------- */

/** How many comics (not counting sample days) the device database holds, when signed in; 0 otherwise. */
export async function deviceComicCount(): Promise<number> {
  const opened = await open();
  if (!opened || opened.scope.kind !== "account") return 0;
  try {
    const names = "databases" in indexedDB ? (await indexedDB.databases()).map((info) => info.name) : [DEVICE_DB];
    if (!names.includes(DEVICE_DB)) return 0;
    const device = await openNamed(DEVICE_DB, () => {});
    try {
      return (await device.getAll("days")).filter((day) => !day.sample).length;
    } finally {
      device.close();
    }
  } catch {
    return 0;
  }
}

/**
 * Move everything in the device database into the signed-in account: days,
 * cast, images and synced settings. Each record goes into the account's cache
 * and to the server; where the account already has a newer copy, that one
 * stays. The device database is deleted only when everything arrived.
 * `onProgress(done, total)` reports how far it got.
 */
export async function moveDeviceComics(onProgress?: (done: number, total: number) => void): Promise<{ ok: boolean; moved: number }> {
  const opened = await ready();
  if (!opened || opened.scope.kind !== "account") return { ok: false, moved: 0 };
  const { db } = opened;
  const device = await openNamed(DEVICE_DB, () => {});
  let failed = 0;
  let moved = 0;
  try {
    const [days, cast, imageIds, metaKeys] = await Promise.all([
      device.getAll("days"),
      device.getAll("cast"),
      device.getAllKeys("images"),
      device.getAllKeys("meta"),
    ]);
    const total = days.length + cast.length + imageIds.length;
    let done = 0;
    const step = () => onProgress?.(++done, total);

    await cloud.inBatches(imageIds, 3, async (id) => {
      const blob = await device.get("images", id);
      if (blob) {
        if (!(await db.get("images", id))) await db.put("images", blob, id);
        if (!(await sendImage(id, blob))) failed += 1;
      }
      step();
    });
    for (const kind of ["cast", "days"] as const) {
      const records: (Day | Character)[] = kind === "days" ? days : cast;
      await cloud.inBatches(records, 4, async (record) => {
        const stamped = { ...record, updatedAt: stampOf(record) };
        const mine = await db.get(kind, record.id);
        if (!mine || Date.parse(stampOf(mine)) < Date.parse(stamped.updatedAt)) {
          await db.put(kind, stamped as Day & Character);
          const result = await cloud.pushRecord(kind, stamped);
          if (result === "failed") failed += 1;
          else if (kind === "days" && !(record as Day).sample) moved += 1;
        }
        step();
      });
    }
    for (const key of metaKeys) {
      if (!isSyncedMetaKey(key) || (await db.get("meta", key)) !== undefined) continue;
      const value = await device.get("meta", key);
      if (value === undefined) continue;
      const at = now();
      await db.put("meta", value, key);
      await db.put("meta", at, stampKey(key));
      if (!(await cloud.pushMeta(key, at, value))) failed += 1;
    }
  } finally {
    device.close();
  }
  if (failed > 0) return { ok: false, moved };
  await deleteDB(DEVICE_DB).catch(() => {});
  return { ok: true, moved };
}

/* ---------- Leaving ---------- */

/**
 * Before signing out: send anything not yet sent, then delete this account's
 * cache from the device (it comes back from the server at the next sign-in).
 * When something couldn't be sent (offline), the cache stays so nothing is lost.
 */
export async function closeAccountCache(): Promise<boolean> {
  const opened = await open();
  if (!opened || opened.scope.kind !== "account") return true;
  const sent = await syncNow().catch(() => false);
  if (!sent) return false;
  opened.db.close();
  await deleteDB(accountDbName(opened.scope.key)).catch(() => {});
  return true;
}

/** After the account was deleted: drop its cache from this device without sending anything. */
export async function dropAccountCache(): Promise<void> {
  const opened = await open();
  if (!opened || opened.scope.kind !== "account") return;
  opened.db.close();
  await deleteDB(accountDbName(opened.scope.key)).catch(() => {});
}
