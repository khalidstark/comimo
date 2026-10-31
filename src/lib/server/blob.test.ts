import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileBlobStore, isBlobPath, readAll, vercelBlobConfigured } from "./blob";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "comimo-blob-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("blob paths", () => {
  it("accepts server-built paths and refuses anything that could climb out", () => {
    expect(isBlobPath("a/0f6e-uuid/i/day-1-panel-0")).toBe(true);
    expect(isBlobPath("a/x/p/AbC_dEf-123.jpg")).toBe(true);
    for (const bad of ["", "../x", "a/../b", "a//b", "/a", "a/", "a/./b", "a\\b", "a/b c", "a/%2e%2e", "x".repeat(241)]) {
      expect(isBlobPath(bad)).toBe(false);
    }
  });
});

describe("FileBlobStore", () => {
  it("writes, reads, replaces and deletes bytes with their type", async () => {
    const store = new FileBlobStore(dir);
    expect(await store.get("a/one/i/x")).toBeNull();
    await store.put("a/one/i/x", new Uint8Array([1, 2, 3]), "image/png");
    const got = await store.get("a/one/i/x");
    expect(got?.contentType).toBe("image/png");
    expect(got?.size).toBe(3);
    expect([...(await readAll(got!))]).toEqual([1, 2, 3]);
    await store.put("a/one/i/x", new Uint8Array([9]), "image/jpeg");
    expect([...(await readAll((await store.get("a/one/i/x"))!))]).toEqual([9]);
    await store.del(["a/one/i/x"]);
    expect(await store.get("a/one/i/x")).toBeNull();
  });

  it("deletes a whole prefix and nothing beside it", async () => {
    const store = new FileBlobStore(dir);
    await store.put("a/one/i/x", new Uint8Array([1]), "image/png");
    await store.put("a/one/p/y.jpg", new Uint8Array([2]), "image/jpeg");
    await store.put("a/two/i/x", new Uint8Array([3]), "image/png");
    expect((await store.list("a/one/")).sort()).toEqual(["a/one/i/x", "a/one/p/y.jpg"]);
    await store.delPrefix("a/one/");
    expect(await store.list("a/one/")).toEqual([]);
    expect(await store.get("a/two/i/x")).not.toBeNull();
  });

  it("refuses bad paths and types", async () => {
    const store = new FileBlobStore(dir);
    await expect(store.put("../escape", new Uint8Array([1]), "image/png")).rejects.toThrow();
    await expect(store.put("a/b", new Uint8Array([1]), "text/html")).rejects.toThrow();
    await expect(store.delPrefix("a")).rejects.toThrow();
  });
});

describe("backend choice", () => {
  it("uses Vercel Blob only when it is configured", () => {
    expect(vercelBlobConfigured({})).toBe(false);
    expect(vercelBlobConfigured({ BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_x" })).toBe(true);
    expect(vercelBlobConfigured({ BLOB_STORE_ID: "store_x" })).toBe(false);
    expect(vercelBlobConfigured({ BLOB_STORE_ID: "store_x", VERCEL: "1" })).toBe(true);
  });
});
