import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Redis } from "@upstash/redis";

/**
 * A small key-value store for accounts, sessions and limit counters.
 *
 * Two backends behind one interface:
 * - Upstash Redis (REST) when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
 *   are set (Vercel's Upstash integration names them KV_REST_API_URL and
 *   KV_REST_API_TOKEN; those work too). Shared by every server instance.
 * - A JSON file under .data/ (or COMIMO_DATA_DIR) for local development.
 *   One process only; Vercel's file system is read-only, so production needs Upstash.
 *
 * Values are strings; callers JSON-encode what they store.
 */
export interface KV {
  get(key: string): Promise<string | null>;
  /**
   * Store a value, optionally expiring after `ttlSec`. With `onlyIfNew` the
   * write happens only when the key doesn't exist yet; the result says
   * whether it was written.
   */
  set(key: string, value: string, options?: { ttlSec?: number; onlyIfNew?: boolean }): Promise<boolean>;
  del(key: string): Promise<void>;
  /**
   * Add `by` (default 1) to a counter and return the new value. A counter
   * created by this call expires after `ttlSec`; an existing one keeps its expiry.
   */
  incr(key: string, options?: { by?: number; ttlSec?: number }): Promise<number>;
  /** One field of a hash, or `null`. */
  hget(key: string, field: string): Promise<string | null>;
  /** Set one field of a hash (each field is written on its own, so two writers to different fields never clash). */
  hset(key: string, field: string, value: string): Promise<void>;
  hdel(key: string, ...fields: string[]): Promise<void>;
  /** Every field of a hash (an empty object when there is none). */
  hgetall(key: string): Promise<Record<string, string>>;
  /**
   * Sized hash entries with a running total, kept in step in one atomic step
   * (a Lua script on Redis, the store's lock on the file backend). Each entry
   * is JSON with its size in `s`.
   *
   * `sizedPut` writes `field` and moves `counter` by (new size - old size),
   * but only when the total stays within `maxTotal` (a shrink always passes)
   * and, for a new field, the hash has fewer than `maxCount` fields.
   */
  sizedPut(hash: string, counter: string, field: string, value: string, size: number, caps: SizedCaps): Promise<SizedPutResult>;
  /** Remove fields and take their sizes off the total (never below 0). Returns the new total. */
  sizedDel(hash: string, counter: string, fields: string[]): Promise<number>;
  /** Set the total to the sum of the entries' sizes (repairs any drift). Returns it. */
  sizedRecount(hash: string, counter: string): Promise<number>;
}

export interface SizedCaps {
  maxTotal: number;
  maxCount: number;
}

export type SizedPutResult = { ok: true; total: number } | { ok: false; reason: "total" | "count"; total: number };

/** The `s` (size) of a sized entry; 0 for anything malformed. */
export function sizeOf(raw: string | null | undefined): number {
  if (!raw) return 0;
  try {
    const size = (JSON.parse(raw) as { s?: unknown }).s;
    return typeof size === "number" && Number.isFinite(size) && size > 0 ? size : 0;
  } catch {
    return 0;
  }
}

/* ---------- Local JSON file ---------- */

interface FileEntry {
  /** A plain value. */
  v?: string;
  /** A hash's fields (instead of `v`). */
  h?: Record<string, string>;
  /** Expiry, epoch ms. */
  e?: number;
}

type FileData = Record<string, FileEntry>;

/**
 * The dev store: one JSON file, read and rewritten under a lock for every
 * operation (atomic rename), so a restart or a second store on the same
 * folder sees the latest data. Fine for a handful of accounts; not for production.
 */
export class FileKV implements KV {
  private readonly file: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly dir: string) {
    this.file = join(dir, "kv.json");
  }

  /** Run one operation at a time, so concurrent counters never lose an update. */
  private locked<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => {});
    return run;
  }

  private async load(now: number): Promise<FileData> {
    let data: FileData;
    try {
      data = JSON.parse(await readFile(this.file, "utf8")) as FileData;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
    for (const [key, entry] of Object.entries(data)) if (entry.e !== undefined && entry.e <= now) delete data[key];
    return data;
  }

  private async save(data: FileData): Promise<void> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const temp = `${this.file}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(data), { mode: 0o600 });
    await rename(temp, this.file);
  }

  get(key: string): Promise<string | null> {
    return this.locked(async () => (await this.load(Date.now()))[key]?.v ?? null);
  }

  hget(key: string, field: string): Promise<string | null> {
    return this.locked(async () => {
      const hash = (await this.load(Date.now()))[key]?.h;
      return hash && Object.hasOwn(hash, field) ? hash[field] : null;
    });
  }

  hset(key: string, field: string, value: string): Promise<void> {
    // A plain object holds the fields; "__proto__" would replace its prototype instead.
    if (field === "__proto__") return Promise.reject(new Error("Bad hash field"));
    return this.locked(async () => {
      const data = await this.load(Date.now());
      const entry = data[key];
      const hash = entry?.h ?? {};
      hash[field] = value;
      data[key] = entry?.e === undefined ? { h: hash } : { h: hash, e: entry.e };
      await this.save(data);
    });
  }

  hdel(key: string, ...fields: string[]): Promise<void> {
    return this.locked(async () => {
      const data = await this.load(Date.now());
      const hash = data[key]?.h;
      if (!hash) return;
      for (const field of fields) delete hash[field];
      if (Object.keys(hash).length === 0) delete data[key];
      await this.save(data);
    });
  }

  hgetall(key: string): Promise<Record<string, string>> {
    return this.locked(async () => ({ ...(await this.load(Date.now()))[key]?.h }));
  }

  sizedPut(hash: string, counter: string, field: string, value: string, size: number, caps: SizedCaps): Promise<SizedPutResult> {
    if (field === "__proto__") return Promise.reject(new Error("Bad hash field"));
    // One locked read-modify-write: no other operation on this store runs in between.
    return this.locked(async () => {
      const data = await this.load(Date.now());
      const entries = data[hash]?.h ?? {};
      const exists = Object.hasOwn(entries, field);
      const old = exists ? sizeOf(entries[field]) : 0;
      const total = Math.max(0, Number.parseInt(data[counter]?.v ?? "0", 10) || 0);
      const next = Math.max(0, total - old + size);
      if (!exists && Object.keys(entries).length >= caps.maxCount) return { ok: false, reason: "count", total };
      if (size > old && next > caps.maxTotal) return { ok: false, reason: "total", total };
      entries[field] = value;
      data[hash] = { h: entries };
      data[counter] = { v: String(next) };
      await this.save(data);
      return { ok: true, total: next };
    });
  }

  sizedDel(hash: string, counter: string, fields: string[]): Promise<number> {
    return this.locked(async () => {
      const data = await this.load(Date.now());
      const entries = data[hash]?.h ?? {};
      let total = Math.max(0, Number.parseInt(data[counter]?.v ?? "0", 10) || 0);
      for (const field of fields) {
        if (!Object.hasOwn(entries, field)) continue;
        total = Math.max(0, total - sizeOf(entries[field]));
        delete entries[field];
      }
      if (Object.keys(entries).length) data[hash] = { h: entries };
      else delete data[hash];
      data[counter] = { v: String(total) };
      await this.save(data);
      return total;
    });
  }

  sizedRecount(hash: string, counter: string): Promise<number> {
    return this.locked(async () => {
      const data = await this.load(Date.now());
      const total = Object.values(data[hash]?.h ?? {}).reduce((sum, raw) => sum + sizeOf(raw), 0);
      data[counter] = { v: String(total) };
      await this.save(data);
      return total;
    });
  }

  set(key: string, value: string, options: { ttlSec?: number; onlyIfNew?: boolean } = {}): Promise<boolean> {
    return this.locked(async () => {
      const now = Date.now();
      const data = await this.load(now);
      if (options.onlyIfNew && key in data) return false;
      data[key] = options.ttlSec ? { v: value, e: now + options.ttlSec * 1000 } : { v: value };
      await this.save(data);
      return true;
    });
  }

  del(key: string): Promise<void> {
    return this.locked(async () => {
      const data = await this.load(Date.now());
      if (!(key in data)) return;
      delete data[key];
      await this.save(data);
    });
  }

  incr(key: string, options: { by?: number; ttlSec?: number } = {}): Promise<number> {
    return this.locked(async () => {
      const now = Date.now();
      const data = await this.load(now);
      const current = data[key];
      const value = (current ? Number.parseInt(current.v ?? "", 10) || 0 : 0) + (options.by ?? 1);
      const expiry = current ? current.e : options.ttlSec ? now + options.ttlSec * 1000 : undefined;
      data[key] = expiry === undefined ? { v: String(value) } : { v: String(value), e: expiry };
      await this.save(data);
      return value;
    });
  }
}

/* ---------- Upstash Redis ---------- */

/** INCRBY, then set the expiry only when the counter has none (it was just created). One round trip, atomic. */
/** The size in a sized entry's JSON, 0 for anything malformed (shared by the scripts below). */
const LUA_SIZE = `
local function sizeof(raw)
  if not raw then return 0 end
  local ok, entry = pcall(cjson.decode, raw)
  if ok and type(entry) == "table" and tonumber(entry.s) and tonumber(entry.s) > 0 then return tonumber(entry.s) end
  return 0
end`;

/** KEYS: hash, counter. ARGV: field, value, size, maxTotal, maxCount. Returns {1|0|-1, total}: written, over the total, over the count. */
const SIZED_PUT = `${LUA_SIZE}
local old = redis.call("HGET", KEYS[1], ARGV[1])
local oldSize = sizeof(old)
local size = tonumber(ARGV[3])
local total = math.max(0, tonumber(redis.call("GET", KEYS[2]) or "0") or 0)
local nextTotal = math.max(0, total - oldSize + size)
if not old and redis.call("HLEN", KEYS[1]) >= tonumber(ARGV[5]) then return {-1, total} end
if size > oldSize and nextTotal > tonumber(ARGV[4]) then return {0, total} end
redis.call("HSET", KEYS[1], ARGV[1], ARGV[2])
redis.call("SET", KEYS[2], nextTotal)
return {1, nextTotal}`;

/** KEYS: hash, counter. ARGV: fields. Returns the new total. */
const SIZED_DEL = `${LUA_SIZE}
local total = math.max(0, tonumber(redis.call("GET", KEYS[2]) or "0") or 0)
for _, field in ipairs(ARGV) do
  local old = redis.call("HGET", KEYS[1], field)
  if old then
    total = math.max(0, total - sizeof(old))
    redis.call("HDEL", KEYS[1], field)
  end
end
redis.call("SET", KEYS[2], total)
return total`;

/** KEYS: hash, counter. Returns the recounted total. */
const SIZED_RECOUNT = `${LUA_SIZE}
local total = 0
for _, raw in ipairs(redis.call("HVALS", KEYS[1])) do total = total + sizeof(raw) end
redis.call("SET", KEYS[2], total)
return total`;

const INCR_WITH_TTL = `
local value = redis.call("INCRBY", KEYS[1], ARGV[1])
if tonumber(ARGV[2]) > 0 and redis.call("TTL", KEYS[1]) == -1 then
  redis.call("EXPIRE", KEYS[1], ARGV[2])
end
return value`;

export class UpstashKV implements KV {
  private readonly redis: Redis;

  constructor(url: string, token: string) {
    // Values stay plain strings in both backends; callers do their own JSON.
    this.redis = new Redis({ url, token, automaticDeserialization: false, enableTelemetry: false });
  }

  async get(key: string): Promise<string | null> {
    const value = await this.redis.get<string>(key);
    return value ?? null;
  }

  async set(key: string, value: string, options: { ttlSec?: number; onlyIfNew?: boolean } = {}): Promise<boolean> {
    const ttl = options.ttlSec ? Math.ceil(options.ttlSec) : 0;
    const result = options.onlyIfNew
      ? ttl
        ? await this.redis.set(key, value, { nx: true, ex: ttl })
        : await this.redis.set(key, value, { nx: true })
      : ttl
        ? await this.redis.set(key, value, { ex: ttl })
        : await this.redis.set(key, value);
    return result === "OK";
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async incr(key: string, options: { by?: number; ttlSec?: number } = {}): Promise<number> {
    const by = options.by ?? 1;
    const ttl = options.ttlSec ? Math.ceil(options.ttlSec) : 0;
    const value = await this.redis.eval<[number, number], number | string>(INCR_WITH_TTL, [key], [by, ttl]);
    return Number(value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    const value = await this.redis.hget<string>(key, field);
    return value ?? null;
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    await this.redis.hset(key, { [field]: value });
  }

  async hdel(key: string, ...fields: string[]): Promise<void> {
    if (fields.length) await this.redis.hdel(key, ...fields);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const all = await this.redis.hgetall<Record<string, string>>(key);
    return all ?? {};
  }

  async sizedPut(hash: string, counter: string, field: string, value: string, size: number, caps: SizedCaps): Promise<SizedPutResult> {
    const [code, total] = await this.redis.eval<string[], [number, number]>(SIZED_PUT, [hash, counter], [
      field,
      value,
      String(size),
      String(caps.maxTotal),
      String(caps.maxCount),
    ]);
    if (Number(code) === 1) return { ok: true, total: Number(total) };
    return { ok: false, reason: Number(code) === -1 ? "count" : "total", total: Number(total) };
  }

  async sizedDel(hash: string, counter: string, fields: string[]): Promise<number> {
    if (!fields.length) return Number((await this.redis.get<string>(counter)) ?? 0) || 0;
    return Number(await this.redis.eval<string[], number>(SIZED_DEL, [hash, counter], fields));
  }

  async sizedRecount(hash: string, counter: string): Promise<number> {
    return Number(await this.redis.eval<string[], number>(SIZED_RECOUNT, [hash, counter], []));
  }
}

/* ---------- Choosing a backend ---------- */

/** The Upstash REST credentials from the environment, if any. */
export function upstashCredentials(env: Record<string, string | undefined> = process.env): { url: string; token: string } | null {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

let shared: KV | null = null;

/** The store for this server: Upstash when configured, otherwise the local file. */
export function getKV(): KV {
  if (shared) return shared;
  const upstash = upstashCredentials();
  if (upstash) {
    shared = new UpstashKV(upstash.url, upstash.token);
  } else {
    if (process.env.VERCEL === "1") {
      console.warn("Comimo: UPSTASH_REDIS_REST_URL/TOKEN are not set; accounts can't be saved on Vercel's read-only disk.");
    }
    // Runtime-only folder: tell Turbopack not to trace the whole project for it.
    shared = new FileKV(resolve(/* turbopackIgnore: true */ process.cwd(), process.env.COMIMO_DATA_DIR || ".data"));
  }
  return shared;
}

/** Which backend `getKV()` uses, for a startup line or a health check. */
export function kvBackend(): "upstash" | "file" {
  return upstashCredentials() ? "upstash" : "file";
}
