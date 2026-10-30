import type { WireImage } from "./types";

/** Images cross Comimo's API as {mimeType, base64}; the browser keeps them as Blobs. */

export function wireToBlob(image: WireImage): Blob {
  const binary = atob(image.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: image.mimeType });
}

export function blobToWire(blob: Blob): Promise<WireImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve({ mimeType: blob.type || "image/png", base64: url.slice(url.indexOf(",") + 1) });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
