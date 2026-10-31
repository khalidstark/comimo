import "server-only";
import sharp from "sharp";
import type { ModelCallContext } from "../index";
import { MetaApiError, metaJson } from "./client";
import { dataUrl } from "./image";
import { outputText } from "./sam";

/**
 * Muse Spark vision: one short caption per album photo, only when the owner
 * presses "Suggest captions" (never automatic). The photos go inline as small
 * JPEG copies (768 px) with `store: false`, in one metered call.
 * Docs: dev.meta.ai/docs/image-understanding
 */

const SPARK_MODEL = "muse-spark-1.3";
const PRICE = { input: 1.25e-6, output: 4.25e-6 };
const SIDE = 768;
export const CAPTION_WORDS = 14;

const PROMPT = `You write captions for someone's own photo album of one day.
For each photo, write one short, warm caption in plain words (at most ${CAPTION_WORDS} words), the way a person would write it in their album.
Describe what is happening or what is in the photo. Never name or identify anyone, and never guess anyone's age, ethnicity, religion, health or where the photo was taken.
No hashtags, no emoji, no quotes. Use the language of the day's title when it is Arabic, otherwise English.`;

function schema(count: number) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["captions"],
    properties: {
      captions: { type: "array", minItems: count, maxItems: count, items: { type: "string" } },
    },
  };
}

interface ResponsesBody {
  output_text?: string;
  output?: { type?: string; content?: { type?: string; text?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** Trim a caption to one line of at most CAPTION_WORDS words and 200 characters. */
export function tidyCaption(text: unknown): string {
  if (typeof text !== "string") return "";
  const words = text.replace(/[#"“”]/g, "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  return words.slice(0, CAPTION_WORDS).join(" ").slice(0, 200);
}

/** One caption per photo, in order. */
export async function suggestCaptions(photos: Uint8Array[], title: string, context?: ModelCallContext): Promise<string[]> {
  if (photos.length === 0) return [];
  const content: object[] = [{ type: "input_text", text: `The day's title: ${title}\nWrite ${photos.length} captions, one per photo, in order.` }];
  for (const [i, photo] of photos.entries()) {
    const small = await sharp(photo).resize({ width: SIDE, height: SIDE, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    content.push({ type: "input_text", text: `Photo ${i + 1}:` });
    content.push({ type: "input_image", image_url: dataUrl({ mimeType: "image/jpeg", data: new Uint8Array(small) }) });
  }
  const body = await metaJson<ResponsesBody>("/responses", {
    method: "POST",
    json: {
      model: SPARK_MODEL,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 2_000,
      ...(context?.visitorId ? { safety_identifier: context.visitorId } : {}),
      instructions: PROMPT,
      input: [{ type: "message", role: "user", content }],
      text: { format: { type: "json_schema", name: "album_captions", strict: true, schema: schema(photos.length) } },
    },
    timeoutMs: 90_000,
    signal: context?.signal,
    onSend: () => context?.meter?.beforeCall("text"),
  });
  const input = body.usage?.input_tokens ?? 0;
  const output = body.usage?.output_tokens ?? 0;
  console.info(`Comimo: album captions (${photos.length}) used ${input} in, ${output} out (~$${(input * PRICE.input + output * PRICE.output).toFixed(4)})`);
  let parsed: { captions?: unknown };
  try {
    parsed = JSON.parse(outputText(body)) as typeof parsed;
  } catch {
    throw new MetaApiError("server", 200, "captions were not JSON");
  }
  const list = Array.isArray(parsed.captions) ? parsed.captions : [];
  return photos.map((_, i) => tidyCaption(list[i]));
}
