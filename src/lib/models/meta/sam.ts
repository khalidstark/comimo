import "server-only";
import { decodeMaskToRaster, parseImageStream, recordsOfKind, type ResponsesEvent } from "@meta-sam/parser";
import sharp from "sharp";
import type { PanelFigures } from "@/lib/types";
import type { CharacterReference, ModelCallContext, ModelImage } from "../index";
import { metaJson } from "./client";
import { dataUrl } from "./image";
import { maskAt, matchCast, mergeDetections, nounPhrase, toFigures, type CastInPanel, type Detection, type DetectionSet, type Mask, type PixelBox } from "./samMatch";

/**
 * SAM 3.1 (POST /v1/responses, model "sam-3.1"): find people and animals in
 * a drawn panel from short noun phrases, one concept per request. The answer
 * is special-token text (boxes and base85 masks) read with @meta-sam/parser.
 * Requests are sent with `store: false` and go through the spending meter
 * as "sam" ($0.0025 per image).
 * Docs: dev.meta.ai/docs/sam/segmenting, /docs/sam/reading-segmentation
 */

const MODEL = "sam-3.1";
const SAM_TIMEOUT_MS = 45_000;

interface ResponsesBody {
  output_text?: string;
  output?: { type?: string; content?: { type?: string; text?: string }[] }[];
}

/** The text of a Responses answer (the raw JSON has no `output_text` convenience field). */
export function outputText(body: ResponsesBody): string {
  if (typeof body.output_text === "string") return body.output_text;
  return (body.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("");
}

/** The parser reads a Responses event stream; a non-streamed answer is replayed as one. */
async function* asEvents(text: string): AsyncIterable<ResponsesEvent> {
  const lane = { item_id: "sam", output_index: 0, content_index: 0 };
  if (text) yield { type: "response.output_text.delta", delta: text, ...lane };
  yield { type: "response.output_text.done", text, ...lane };
  yield { type: "response.completed" };
}

/** Boxes (and their masks, when they decode) from SAM's output text. */
export async function parseSegmentation(text: string): Promise<Detection[]> {
  const result = await parseImageStream(asEvents(text)).finalResult;
  const masks = new Map(recordsOfKind(result.records, "mask").map((record) => [record.objectId, record]));
  return recordsOfKind(result.records, "box").map((record) => {
    // Box tokens give the last pixel inclusive; the mask's bounds are the half-open box it covers.
    let box: PixelBox = { x1: record.left, y1: record.top, x2: record.right + 1, y2: record.bottom + 1 };
    const maskRecord = masks.get(record.objectId);
    let mask: Mask | undefined;
    if (maskRecord) {
      try {
        const { width, height } = maskRecord.mask;
        const raster = decodeMaskToRaster(maskRecord.mask);
        const { left, top, right, bottom } = maskRecord.bounds;
        if (raster.length === width * height && right > left && bottom > top) {
          mask = { data: raster, width, height };
          box = { x1: left, y1: top, x2: right, y2: bottom };
        }
      } catch {
        // A box without a mask still places lettering.
      }
    }
    return { box, score: record.confidence ?? maskRecord?.confidence ?? 1, ...(mask ? { mask } : {}) };
  });
}

/** One SAM 3.1 request: every match for one noun phrase. Zero matches is an empty list, not an error. */
export async function segment(image: ModelImage, phrase: string, context?: ModelCallContext): Promise<Detection[]> {
  const body = await metaJson<ResponsesBody>("/responses", {
    method: "POST",
    json: {
      model: MODEL,
      store: false,
      metadata: { mask_encoding: "one_bit", include_confidence: "true" },
      input: [
        {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: phrase },
            { type: "input_image", image_url: dataUrl(image) },
          ],
        },
      ],
    },
    timeoutMs: SAM_TIMEOUT_MS,
    signal: context?.signal,
    onSend: () => context?.meter?.beforeCall("sam"),
  });
  return parseSegmentation(outputText(body));
}

export interface Located {
  width: number;
  height: number;
  /** Everyone found, cast members matched. */
  figures: PanelFigures;
  /** Pixel box (and mask) of each cast member found, by character id. */
  boxes: Map<string, { box: PixelBox; mask?: Mask }>;
  /** The phrase each cast member was looked for with. */
  phrases: Map<string, string>;
  /** SAM requests made. */
  calls: number;
}

/** True for a character drawn as an animal (pets). */
export function isAnimal(reference: CharacterReference): boolean {
  if (reference.role) return reference.role === "pet";
  return /^\W*(\w+\s+){0,4}(cat|kitten|dog|puppy|parrot|bird|rabbit|hamster)\b/i.test(reference.look);
}

/**
 * Find the panel's cast and everyone else: one request per cast member with
 * the noun phrase from their look, plus a "person" sweep for background
 * people and a "face" sweep for heads, all at once. Detections are merged and matched to cast members
 * (see matchCast).
 */
export async function locate(image: ModelImage, references: CharacterReference[], context?: ModelCallContext): Promise<Located> {
  const { width = 0, height = 0 } = await sharp(image.data).metadata();
  if (!width || !height) throw new Error("panel image has no size");
  const cast: CastInPanel[] = references.map((ref) => ({ characterId: ref.characterId, animal: isAnimal(ref) }));
  const phrases = new Map(references.map((ref) => [ref.characterId, nounPhrase(ref.look, isAnimal(ref))]));

  const requests: Promise<DetectionSet>[] = [
    ...cast.map(async (member) => ({
      characterId: member.characterId,
      animal: member.animal,
      detections: await segment(image, phrases.get(member.characterId)!, context),
    })),
    segment(image, "person", context).then((detections) => ({ characterId: null, animal: false, detections })),
    segment(image, "face", context).then((detections) => ({ characterId: null, animal: false, faces: true, detections })),
  ];
  const sets = await Promise.all(requests);
  const candidates = mergeDetections(sets, width, height);
  const matches = matchCast(cast, candidates);
  const boxes = new Map<string, { box: PixelBox; mask?: Mask }>();
  matches.forEach((c, i) => {
    if (c !== null) boxes.set(cast[i].characterId, { box: candidates[c].box, mask: candidates[c].mask });
  });
  const faces = sets.filter((set) => set.faces).flatMap((set) => set.detections);
  return { width, height, figures: toFigures(cast, candidates, matches, width, height, faces), boxes, phrases, calls: requests.length };
}

/**
 * A character cut from the panel for the judge: their box with a little
 * room, and with a mask the background around them painted white, as PNG.
 */
export async function cropFigure(image: ModelImage, width: number, height: number, found: { box: PixelBox; mask?: Mask }): Promise<ModelImage> {
  const { box, mask } = found;
  const pad = Math.round(Math.max(box.x2 - box.x1, box.y2 - box.y1) * 0.04);
  const left = Math.max(0, Math.floor(box.x1 - pad));
  const top = Math.max(0, Math.floor(box.y1 - pad));
  const right = Math.min(width, Math.ceil(box.x2 + pad));
  const bottom = Math.min(height, Math.ceil(box.y2 + pad));
  const w = right - left;
  const h = bottom - top;
  const region = sharp(image.data).extract({ left, top, width: w, height: h }).removeAlpha();
  let pixels = await region.raw().toBuffer();
  if (mask) {
    // Everything outside the mask (grown a few pixels so hair edges survive) is painted white.
    const alpha = Buffer.alloc(w * h, 0);
    for (let ay = 0; ay < h; ay++) {
      for (let ax = 0; ax < w; ax++) {
        const x = ax + left - box.x1;
        const y = ay + top - box.y1;
        if (x >= 0 && y >= 0 && x < box.x2 - box.x1 && y < box.y2 - box.y1 && maskAt(mask, box, x, y)) alpha[ay * w + ax] = 255;
      }
    }
    const grown = await sharp(alpha, { raw: { width: w, height: h, channels: 1 } }).blur(3).toColourspace("b-w").raw().toBuffer();
    pixels = Buffer.from(pixels);
    for (let i = 0; i < w * h; i++) {
      if (grown[i] > 12) continue;
      pixels[i * 3] = 255;
      pixels[i * 3 + 1] = 255;
      pixels[i * 3 + 2] = 255;
    }
  }
  const pipeline = sharp(pixels, { raw: { width: w, height: h, channels: 3 } });
  // The judge needs faces, not pixels: keep crops modest.
  const data = await pipeline.resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  return { mimeType: "image/png", data: new Uint8Array(data) };
}
