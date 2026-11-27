import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MAX_PHOTO_BYTES, MAX_PHOTO_SIDE, PhotoInputError, cropPerson, isPhotoType, readPhoto } from "./photoInput";

async function image(width: number, height: number, format: "jpeg" | "png" | "gif" = "jpeg"): Promise<Uint8Array> {
  const base = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } } });
  const buffer = format === "png" ? await base.png().toBuffer() : format === "gif" ? await base.gif().toBuffer() : await base.jpeg().toBuffer();
  return new Uint8Array(buffer);
}

describe("isPhotoType", () => {
  it("accepts JPEG and PNG bytes", async () => {
    expect(isPhotoType(await image(8, 8, "jpeg"))).toBe(true);
    expect(isPhotoType(await image(8, 8, "png"))).toBe(true);
  });

  it("refuses other bytes", async () => {
    expect(isPhotoType(new Uint8Array([1, 2, 3, 4]))).toBe(false);
    expect(isPhotoType(new Uint8Array())).toBe(false);
  });
});

describe("readPhoto", () => {
  it("re-encodes a PNG as JPEG and reports its size", async () => {
    const photo = await readPhoto(await image(40, 30, "png"));
    expect(photo.mimeType).toBe("image/jpeg");
    expect(photo.width).toBe(40);
    expect(photo.height).toBe(30);
    expect(isPhotoType(photo.data)).toBe(true);
  });

  it("refuses an empty photo", async () => {
    await expect(readPhoto(new Uint8Array())).rejects.toThrow(PhotoInputError);
  });

  it("refuses a photo over the byte limit", async () => {
    await expect(readPhoto(new Uint8Array(MAX_PHOTO_BYTES + 1))).rejects.toThrow(/too big/);
  });

  it("refuses bytes that are not a supported image", async () => {
    await expect(readPhoto(await image(8, 8, "gif"))).rejects.toThrow(/JPEG, PNG or WebP/);
  });

  it("refuses a photo wider than the side limit", async () => {
    await expect(readPhoto(await image(MAX_PHOTO_SIDE + 1, 8))).rejects.toThrow(/at most 1536 pixels/);
  });
});

describe("cropPerson", () => {
  it("cuts the box out with a margin and stays inside the photo", async () => {
    const photo = await readPhoto(await image(200, 100));
    const crop = await cropPerson(photo, photo.width, photo.height, { x1: 0, y1: 0, x2: 100, y2: 100, score: 1 });
    const meta = await sharp(crop.data).metadata();
    expect(crop.mimeType).toBe("image/jpeg");
    // 100 wide plus a 10% margin on the right (the left edge is clamped to 0).
    expect(meta.width).toBe(110);
    expect(meta.height).toBe(100);
  });
});
