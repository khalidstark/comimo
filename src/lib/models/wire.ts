import "server-only";
import type { ApiError, ModelMode, WireImage } from "@/lib/types";
import { ModelInputError, type ModelImage } from "./index";
import { MetaApiError } from "./meta/client";

/** Helpers shared by the API routes: JSON responses, errors and image encoding. */

/** Largest image accepted in a request (decoded). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function json<T>(body: T, mode: ModelMode, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Comimo-Mode": mode },
  });
}

export function jsonError(status: number, error: string): Response {
  return Response.json({ error } satisfies ApiError, { status, headers: { "Cache-Control": "no-store" } });
}

/** Turn a model failure into a response without leaking details to the client. */
export function modelErrorResponse(error: unknown): Response {
  if (error instanceof ModelInputError) return jsonError(400, error.message);
  if (error instanceof MetaApiError) {
    // The message holds status, type and code from Meta; never the key or the user's content.
    console.error(`Comimo: ${error.message}`);
    const response = jsonError(error.responseStatus, error.publicMessage);
    if (error.retryAfterSec !== null) response.headers.set("Retry-After", String(Math.ceil(error.retryAfterSec)));
    return response;
  }
  console.error("Comimo: model call failed", error);
  return jsonError(502, "The model call failed. Please try again.");
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

export function toWire(image: ModelImage): WireImage {
  return { mimeType: image.mimeType, base64: Buffer.from(image.data).toString("base64") };
}

/** Decode an image from a request, or null if it isn't a reasonable image. */
export function fromWire(value: unknown): ModelImage | null {
  if (!isRecord(value)) return null;
  const { mimeType, base64 } = value;
  if (typeof mimeType !== "string" || !mimeType.startsWith("image/")) return null;
  if (typeof base64 !== "string" || base64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) return null;
  const data = new Uint8Array(Buffer.from(base64, "base64"));
  return data.byteLength > 0 ? { mimeType, data } : null;
}
