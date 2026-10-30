import "server-only";
import { createHash } from "node:crypto";
import type { ModelCallContext, ModelImage, SheetSubject } from "../index";
import { MetaApiError, metaJson } from "./client";
import { sheetPrompt } from "./prompts";

/**
 * Muse Image: reference sheets (POST /v1/images/generations) and panels drawn
 * from those sheets (POST /v1/images/edits, JSON body with `images` as
 * `file_id` or data URLs). Sheets are uploaded once to the Files API so a
 * panel request carries ids, not megabytes of base64.
 * Docs: dev.meta.ai/docs/image-generation, /docs/api-reference/images/schemas,
 * /docs/file-handling
 *
 * Every image request goes through the spending meter (`beforeCall("image")`
 * runs before each attempt), so the daily image cap holds. $0.01 per image.
 */

const MODEL = "muse-image-1.0";
/** Images take a while with reasoning_strength "high" (multi-pass, same price). */
const IMAGE_TIMEOUT_MS = 150_000;
/** Uploaded sheets expire after 30 days (the maximum); a stale id is re-uploaded. */
const FILE_LIFETIME_SEC = 2_592_000;

/** `size` sets the aspect ratio only; the generator picks the pixels. */
const SIZES = { sheet: "1536x1024" } as const;

interface ImagesBody {
  data?: { b64_json?: string; revised_prompt?: string }[];
  output_format?: string;
}

/** The fields every Muse Image call shares. Search and code tools are off: art comes from the prompt and our references only. */
function baseRequest(context?: ModelCallContext) {
  return {
    model: MODEL,
    n: 1,
    output_format: "webp",
    tool_enablement: { enable_image_search: false, enable_web_search: false, enable_shell: false },
    ...(context?.visitorId ? { user: context.visitorId } : {}),
  };
}

function firstImage(body: ImagesBody): ModelImage {
  const b64 = body.data?.[0]?.b64_json;
  if (!b64) throw new MetaApiError("server", 200, "no image in the response");
  const format = body.output_format ?? "webp";
  return { mimeType: `image/${format === "jpeg" ? "jpeg" : format}`, data: new Uint8Array(Buffer.from(b64, "base64")) };
}

async function requestImage(path: "/images/generations" | "/images/edits", body: object, context?: ModelCallContext): Promise<ModelImage> {
  const started = Date.now();
  const response = await metaJson<ImagesBody>(path, {
    method: "POST",
    json: body,
    timeoutMs: IMAGE_TIMEOUT_MS,
    signal: context?.signal,
    onSend: () => context?.meter?.beforeCall("image"),
  });
  const image = firstImage(response);
  console.info(`Comimo: ${path.slice(8)} returned ${image.data.byteLength} bytes in ${((Date.now() - started) / 1000).toFixed(1)} s (~$0.01)`);
  return image;
}

/* ---------- Reference sheets ---------- */

export async function drawReferenceSheet(subject: SheetSubject, context?: ModelCallContext): Promise<ModelImage> {
  const prompt = sheetPrompt({ name: subject.name, look: subject.look, animal: subject.role === "pet" });
  return requestImage("/images/generations", { ...baseRequest(context), size: SIZES.sheet, prompt }, context);
}

/* ---------- Files API ---------- */

/** Sheets already uploaded by this server instance, by content hash, so two panels drawn at once share one upload. */
const uploads = new Map<string, Promise<string | null>>();
const MAX_CACHED_UPLOADS = 500;

/**
 * Upload a sheet to the Files API and return its id, or null if the upload
 * failed (the caller then sends the image inline). Uploads are free.
 */
export function uploadReference(image: ModelImage, context?: ModelCallContext): Promise<string | null> {
  const key = createHash("sha256").update(image.data).digest("hex");
  const cached = uploads.get(key);
  if (cached) return cached;
  if (uploads.size >= MAX_CACHED_UPLOADS) uploads.clear();

  const pending = (async () => {
    const extension = image.mimeType.split("/")[1] ?? "webp";
    const form = new FormData();
    // Purpose and expiry before the file part, as the docs advise for lower latency.
    form.append("purpose", "user_data");
    form.append("expires_after[anchor]", "created_at");
    form.append("expires_after[seconds]", String(FILE_LIFETIME_SEC));
    form.append("file", new Blob([new Uint8Array(image.data)], { type: image.mimeType }), `reference-sheet.${extension}`);
    try {
      const file = await metaJson<{ id?: unknown }>("/files", { method: "POST", form, timeoutMs: 30_000, signal: context?.signal });
      return typeof file.id === "string" && /^file-[\w-]+$/.test(file.id) ? file.id : null;
    } catch (error) {
      if (context?.signal?.aborted) throw error;
      console.warn(`Comimo: reference upload failed, sending it inline instead (${error instanceof Error ? error.message : "unknown"})`);
      return null;
    }
  })();
  uploads.set(key, pending);
  // Don't remember failures; the next panel may try again.
  void pending.then((id) => id ?? uploads.delete(key), () => uploads.delete(key));
  return pending;
}

/** Make sure an id from a token still looks like a Files API id before it goes upstream. */
export function isFileId(value: string): boolean {
  return /^file-[\w-]{1,64}$/.test(value);
}
