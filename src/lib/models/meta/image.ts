import "server-only";
import { createHash } from "node:crypto";
import type { PanelShape, ScriptPanel } from "@/lib/types";
import type { CharacterReference, ModelCallContext, ModelImage, SheetSubject } from "../index";
import { MetaApiError, metaJson } from "./client";
import { panelPrompt, sheetPrompt, type PanelCharacter } from "./prompts";

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
/** Most reference sheets sent with one panel (the API takes up to 10). */
const MAX_PANEL_REFERENCES = 3;
/** Uploaded sheets expire after 30 days (the maximum); a stale id is re-uploaded. */
const FILE_LIFETIME_SEC = 2_592_000;
/** Largest reference sheet sent or uploaded (Muse Image sheets are well under 1 MB). */
const MAX_REFERENCE_BYTES = 5 * 1024 * 1024;

/** `size` sets the aspect ratio only; the generator picks the pixels. */
const SIZES = { sheet: "1536x1024", wide: "2048x1024", standard: "1536x1024" } as const;

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
  if (!isSendableImage(image)) return Promise.resolve(null);
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
      const file = await metaJson<{ id?: unknown }>("/files", {
        method: "POST",
        form,
        timeoutMs: 30_000,
        signal: context?.signal,
        // Uploads are free but use the team's storage: counted per visitor and per day.
        onSend: () => context?.meter?.beforeCall("upload"),
      });
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

/* ---------- Panels ---------- */

function dataUrl(image: ModelImage): string {
  return `data:${image.mimeType};base64,${Buffer.from(image.data).toString("base64")}`;
}

/**
 * The characters to send sheets for: at most three, speakers first, then the
 * rest in panel order. Order in `characterIds` is left to right in the picture.
 */
export function pickReferences(panel: ScriptPanel, references: CharacterReference[]): Set<string> {
  const usable = new Set(
    references.filter((ref) => ref.fileId || (ref.image && isSendableImage(ref.image))).map((ref) => ref.characterId),
  );
  const speakers = panel.dialogue.map((line) => line.speakerId);
  const ranked = [...new Set([...speakers, ...panel.characterIds])].filter((id) => panel.characterIds.includes(id) && usable.has(id));
  return new Set(ranked.slice(0, MAX_PANEL_REFERENCES));
}

export async function drawPanel(
  panel: ScriptPanel,
  references: CharacterReference[],
  context?: ModelCallContext,
  shape: PanelShape = "standard",
): Promise<ModelImage> {
  const byId = new Map(references.map((ref) => [ref.characterId, ref]));
  const withSheet = pickReferences(panel, references);
  const images: ({ file_id: string } | { image_url: string })[] = [];
  const characters: PanelCharacter[] = [];

  for (const id of panel.characterIds) {
    const ref = byId.get(id);
    if (!ref) continue;
    let image: number | null = null;
    if (withSheet.has(id)) {
      images.push(ref.fileId ? { file_id: ref.fileId } : { image_url: dataUrl(ref.image!) });
      image = images.length;
    }
    characters.push({ name: ref.name, look: ref.look, image });
  }

  const prompt = panelPrompt(panel.scene, characters, shape === "wide");
  const body = { ...baseRequest(context), size: SIZES[shape], prompt };
  // Edits need at least one image; a panel with no drawn characters is plain text-to-image.
  return images.length > 0
    ? requestImage("/images/edits", { ...body, images }, context)
    : requestImage("/images/generations", body, context);
}

/** The real type from the file's first bytes: PNG, JPEG or WebP, else null. */
function sniffImageType(data: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...data.subarray(from, to));
  if (data.length >= 8 && data[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

/**
 * Muse Image takes PNG, JPEG and WebP references. The bytes must really be
 * one of those and match the declared type (mock sheets are SVG and are never sent).
 */
export function isSendableImage(image: ModelImage): boolean {
  return image.data.byteLength <= MAX_REFERENCE_BYTES && sniffImageType(image.data) === image.mimeType;
}

/** True when a failed edit points at an uploaded sheet that no longer exists (expired or deleted). */
export function isMissingFileError(error: unknown): boolean {
  if (!(error instanceof MetaApiError)) return false;
  if (error.status !== 400 && error.status !== 404) return false;
  return /file/i.test(error.message) || error.code === "file_not_found";
}

/** Make sure an id from a token still looks like a Files API id before it goes upstream. */
export function isFileId(value: string): boolean {
  return /^file-[\w-]{1,64}$/.test(value);
}
