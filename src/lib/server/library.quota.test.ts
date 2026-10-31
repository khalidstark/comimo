import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileBlobStore } from "./blob";
import { FileKV } from "./kv";
import { getImage, libraryKeys, putImage, recountImageBytes } from "./library";

const ACCOUNT = "33333333-3333-4333-8333-333333333333";
let dir: string;
let kv: FileKV;
let blobs: FileBlobStore;

/** A PNG-looking body of `size` bytes (only the magic bytes are checked). */
function png(size: number, fill = 1): Uint8Array {
  const bytes = new Uint8Array(size).fill(fill);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

const total = async () => Number(await kv.get(libraryKeys.imageBytes(ACCOUNT)));

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "comimo-quota-"));
  kv = new FileKV(dir);
  blobs = new FileBlobStore(join(dir, "blob"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

describe("image byte quota", () => {
  it("counts parallel uploads replacing the same image once, at the size that won", async () => {
    const sizes = [100, 300, 200, 500, 400, 150, 350, 250];
    const results = await Promise.all(sizes.map((size, i) => putImage(ACCOUNT, "same-id", png(size, i + 1), kv, blobs)));
    expect(results.every((result) => result.ok)).toBe(true);
    const stored = await getImage(ACCOUNT, "same-id", kv, blobs);
    expect(stored.ok).toBe(true);
    // The total always equals the one entry's size: no double counting, no drift.
    const entry = JSON.parse((await kv.hget(libraryKeys.images(ACCOUNT), "same-id"))!) as { s: number };
    expect(await total()).toBe(entry.s);
    expect(sizes).toContain(entry.s);
  });

  it("never lets parallel uploads past the quota, and rejects before writing the bytes", async () => {
    vi.stubEnv("COMIMO_ACCOUNT_IMAGE_MB", "1");
    const size = 300 * 1024;
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => putImage(ACCOUNT, `img-${i}`, png(size), kv, blobs)));
    const accepted = results.filter((result) => result.ok).length;
    expect(accepted).toBe(3); // 3 x 300 KB fit in 1 MB, a fourth doesn't
    expect(results.filter((result) => !result.ok).every((result) => !result.ok && result.status === 507)).toBe(true);
    expect(await total()).toBe(accepted * size);
    expect((await blobs.list(`a/${ACCOUNT}/`)).length).toBe(accepted);
  });

  it("lets a smaller copy replace a bigger one even when full, and repairs a drifted total", async () => {
    vi.stubEnv("COMIMO_ACCOUNT_IMAGE_MB", "1");
    expect((await putImage(ACCOUNT, "big", png(900 * 1024), kv, blobs)).ok).toBe(true);
    expect((await putImage(ACCOUNT, "big", png(100 * 1024), kv, blobs)).ok).toBe(true);
    expect(await total()).toBe(100 * 1024);

    // A total that drifted up (say a crash between steps) would refuse uploads that fit; the recount fixes it.
    await kv.set(libraryKeys.imageBytes(ACCOUNT), String(5 * 1024 * 1024));
    expect((await putImage(ACCOUNT, "next", png(200 * 1024), kv, blobs)).ok).toBe(true);
    expect(await total()).toBe(300 * 1024);
    await kv.set(libraryKeys.imageBytes(ACCOUNT), "-999");
    expect(await recountImageBytes(ACCOUNT, kv)).toBe(300 * 1024);
  });
});
