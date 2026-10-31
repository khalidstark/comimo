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
}

/* ---------- Local JSON file ---------- */

interface FileEntry {
  v: string;
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
      const value = (current ? Number.parseInt(current.v, 10) || 0 : 0) + (options.by ?? 1);
      const expiry = current ? current.e : options.ttlSec ? now + options.ttlSec * 1000 : undefined;
      data[key] = expiry === undefined ? { v: String(value) } : { v: String(value), e: expiry };
      await this.save(data);
      return value;
    });
  }
}

/* ---------- Upstash Redis ---------- */

/** INCRBY, then set the expiry only when the counter has none (it was just created). One round trip, atomic. */
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
