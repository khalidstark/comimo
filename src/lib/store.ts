import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Character, Day, MonthBook, MonthKey } from "./types";

/**
 * The on-device store. Days, the user's cast and image Blobs live in this
 * browser's IndexedDB and nowhere else (Comimo has no accounts).
 *
 * Every function is safe to call anywhere: on the server, in a private window
 * or when IndexedDB is blocked it resolves to an empty result (reads) or
 * `false` (writes), so pages fall back to their empty states.
 */

const DB_NAME = "comimo";
const DB_VERSION = 2;

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

let dbPromise: Promise<Db | null> | null = null;

function open(): Promise<Db | null> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }
  dbPromise ??= openDB<ComimoDB>(DB_NAME, DB_VERSION, {
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
    terminated() {
      // The browser closed the connection (e.g. storage cleared); reopen next time.
      dbPromise = null;
    },
  }).catch((error: unknown) => {
    console.warn("Comimo: on-device storage is unavailable", error);
    dbPromise = null;
    return null;
  });
  return dbPromise;
}

/** Run `fn` against the database, or return `fallback` if storage is unavailable or the call fails. */
async function withDb<T>(fallback: T, fn: (db: Db) => Promise<T>): Promise<T> {
  const db = await open();
  if (!db) return fallback;
  try {
    return await fn(db);
  } catch (error) {
    console.warn("Comimo: storage call failed", error);
    return fallback;
  }
}

/** Whether this browser can keep days on the device. */
export async function isStoreAvailable(): Promise<boolean> {
  return (await open()) !== null;
}

/** A random id for days, characters and images. */
export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ---------- Days ---------- */

export function saveDay(day: Day): Promise<boolean> {
  return withDb(false, async (db) => {
    await db.put("days", day);
    return true;
  });
}

export function getDay(id: string): Promise<Day | undefined> {
  return withDb(undefined, (db) => db.get("days", id));
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
  return withDb(false, async (db) => {
    await db.delete("days", id);
    return true;
  });
}

/* ---------- Cast ---------- */

export function saveCharacter(character: Character): Promise<boolean> {
  return withDb(false, async (db) => {
    await db.put("cast", character);
    return true;
  });
}

export function getCharacter(id: string): Promise<Character | undefined> {
  return withDb(undefined, (db) => db.get("cast", id));
}

export function deleteCharacter(id: string): Promise<boolean> {
  return withDb(false, async (db) => {
    await db.delete("cast", id);
    return true;
  });
}

/** The user's own characters, oldest first. */
export async function listCast(): Promise<Character[]> {
  const cast = await withDb<Character[]>([], (db) => db.getAll("cast"));
  return cast.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/* ---------- Images ---------- */

/** Store an image Blob under `id` (replaces any image with that id). */
export function putImage(id: string, blob: Blob): Promise<boolean> {
  return withDb(false, async (db) => {
    await db.put("images", blob, id);
    return true;
  });
}

export function getImage(id: string): Promise<Blob | undefined> {
  return withDb(undefined, (db) => db.get("images", id));
}

/* ---------- Meta flags ---------- */

export function getMeta(key: string): Promise<string | number | boolean | undefined> {
  return withDb(undefined, (db) => db.get("meta", key));
}

export function setMeta(key: string, value: string | number | boolean): Promise<boolean> {
  return withDb(false, async (db) => {
    await db.put("meta", value, key);
    return true;
  });
}
