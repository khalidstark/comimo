import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

/**
 * Where image bytes live: panels, sheets, sprites, covers and album photos.
 *
 * Two backends behind one interface:
 * - Vercel Blob, private store, when BLOB_READ_WRITE_TOKEN (or BLOB_STORE_ID
 *   with Vercel's OIDC token) is set. Nothing in a private store has a public
 *   URL; every byte goes out through Comimo's own routes after their checks.
 * - A folder under .data/blob (or COMIMO_DATA_DIR/blob) for local development,
 *   served the same way, through the same authenticated routes.
 *
 * Paths are built by the server (account id + random or validated ids), never
 * taken from a request as they are, and checked again here.
 */

export interface StoredBlob {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  size: number;
}

export interface BlobStore {
  readonly backend: "vercel" | "file";
  /** Write (or replace) the bytes at `path`. */
  put(path: string, data: Uint8Array, contentType: string): Promise<void>;
  /** The bytes at `path`, or `null`. */
  get(path: string): Promise<StoredBlob | null>;
  del(paths: string[]): Promise<void>;
  /** Delete everything whose path starts with `prefix` (which must end in "/"). */
  delPrefix(prefix: string): Promise<void>;
}

/** Letters, digits and `_ . : -` per segment, no empty or dot-only segments, at most 240 characters. */
const SEGMENT = /^(?!\.{1,2}$)[A-Za-z0-9_.:-]{1,120}$/;

export function isBlobPath(path: string): boolean {
  if (path.length === 0 || path.length > 240) return false;
  return path.split("/").every((segment) => SEGMENT.test(segment));
}

function checkPath(path: string): string {
  if (!isBlobPath(path)) throw new Error("Bad blob path");
  return path;
}

function checkPrefix(prefix: string): string {
  if (!prefix.endsWith("/") || !isBlobPath(prefix.slice(0, -1))) throw new Error("Bad blob prefix");
  return prefix;
}

/** SVG only ever comes from the mock models in development (see isMockSvg in library.ts). */
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]);

function checkType(contentType: string): string {
  if (!ALLOWED_TYPES.has(contentType)) throw new Error("Bad blob type");
  return contentType;
}

/* ---------- Local folder ---------- */

interface Sidecar {
  type: string;
}

/** One file per blob plus a small JSON sidecar with its type. Atomic writes; one process. */
export class FileBlobStore implements BlobStore {
  readonly backend = "file" as const;
  private readonly root: string;

  constructor(dir: string) {
    this.root = resolve(dir);
  }

  private fileOf(path: string): string {
    const file = resolve(this.root, ...checkPath(path).split("/"));
    // Belt and braces: the checked path can't climb out, but make sure.
    if (!file.startsWith(this.root + sep)) throw new Error("Bad blob path");
    return file;
  }

  async put(path: string, data: Uint8Array, contentType: string): Promise<void> {
    const file = this.fileOf(path);
    const type = checkType(contentType);
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    // A unique temp name per write, so two writes to one path can't trip over each other's file.
    const temp = `${file}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    const sideTemp = `${temp}.meta`;
    await writeFile(temp, data, { mode: 0o600 });
    await writeFile(sideTemp, JSON.stringify({ type } satisfies Sidecar), { mode: 0o600 });
    await rename(sideTemp, `${file}.meta.json`);
    await rename(temp, file);
  }

  async get(path: string): Promise<StoredBlob | null> {
    const file = this.fileOf(path);
    let data: Buffer;
    let sidecar: Sidecar;
    try {
      [data, sidecar] = await Promise.all([readFile(file), readFile(`${file}.meta.json`, "utf8").then((raw) => JSON.parse(raw) as Sidecar)]);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    const bytes = new Uint8Array(data);
    return {
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
      contentType: ALLOWED_TYPES.has(sidecar.type) ? sidecar.type : "application/octet-stream",
      size: bytes.byteLength,
    };
  }

  async del(paths: string[]): Promise<void> {
    await Promise.all(
      paths.map(async (path) => {
        const file = this.fileOf(path);
        await Promise.all([rm(file, { force: true }), rm(`${file}.meta.json`, { force: true })]);
      }),
    );
  }

  async delPrefix(prefix: string): Promise<void> {
    const folder = this.fileOf(checkPrefix(prefix).slice(0, -1));
    await rm(folder, { recursive: true, force: true });
  }

  /** Every stored path under a prefix (tests and checks). */
  async list(prefix: string): Promise<string[]> {
    const folder = this.fileOf(checkPrefix(prefix).slice(0, -1));
    const found: string[] = [];
    const walk = async (dir: string, rel: string) => {
      let entries: string[];
      try {
        entries = await readdir(dir);
      } catch {
        return;
      }
      for (const name of entries) {
        const full = join(dir, name);
        if ((await stat(full)).isDirectory()) await walk(full, `${rel}${name}/`);
        else if (!name.endsWith(".meta.json") && !name.endsWith(".tmp") && !name.endsWith(".tmp.meta")) found.push(`${rel}${name}`);
      }
    };
    await walk(folder, prefix);
    return found;
  }
}

/* ---------- Vercel Blob (private store) ---------- */

/**
 * Vercel Blob in a private store. The SDK reads BLOB_READ_WRITE_TOKEN, or on
 * Vercel uses OIDC with BLOB_STORE_ID. Loaded on first use, so local
 * development never imports it.
 */
export class VercelBlobStore implements BlobStore {
  readonly backend = "vercel" as const;
  private sdk: Promise<typeof import("@vercel/blob")> | null = null;

  private load() {
    this.sdk ??= import("@vercel/blob");
    return this.sdk;
  }

  async put(path: string, data: Uint8Array, contentType: string): Promise<void> {
    const { put } = await this.load();
    await put(checkPath(path), Buffer.from(data), {
      access: "private",
      contentType: checkType(contentType),
      addRandomSuffix: false,
      allowOverwrite: true,
      // The function in front of the store decides who may read; keep the CDN copy short.
      cacheControlMaxAge: 60,
    });
  }

  async get(path: string): Promise<StoredBlob | null> {
    const { get } = await this.load();
    // Some paths are overwritten (a redrawn sheet keeps its id): read from origin, not a CDN copy up to 60 s old.
    const result = await get(checkPath(path), { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return null;
    return { body: result.stream, contentType: result.blob.contentType, size: result.blob.size };
  }

  async del(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const { del } = await this.load();
    for (let i = 0; i < paths.length; i += 500) await del(paths.slice(i, i + 500).map(checkPath));
  }

  async delPrefix(prefix: string): Promise<void> {
    const { del, list } = await this.load();
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: checkPrefix(prefix), cursor, limit: 1000 });
      if (page.blobs.length) await del(page.blobs.map((blob) => blob.url));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  }
}

/* ---------- Choosing a backend ---------- */

/** True when Vercel Blob is configured (a read-write token, or a store id for OIDC on Vercel). */
export function vercelBlobConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.BLOB_READ_WRITE_TOKEN?.trim() || (env.BLOB_STORE_ID?.trim() && env.VERCEL === "1"));
}

let shared: BlobStore | null = null;

export function getBlobStore(): BlobStore {
  if (shared) return shared;
  if (vercelBlobConfigured()) {
    shared = new VercelBlobStore();
  } else {
    if (process.env.VERCEL === "1") {
      console.warn("Comimo: BLOB_READ_WRITE_TOKEN is not set; images can't be saved on Vercel's read-only disk.");
    }
    shared = new FileBlobStore(resolve(/* turbopackIgnore: true */ process.cwd(), process.env.COMIMO_DATA_DIR || ".data", "blob"));
  }
  return shared;
}

/** Read a stored blob fully (small images only: callers bound sizes when writing). */
export async function readAll(blob: StoredBlob): Promise<Uint8Array> {
  return new Uint8Array(await new Response(blob.body).arrayBuffer());
}
