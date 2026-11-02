import "server-only";
import type { CharacterReference, ModelCallContext, ModelImage, OutfitText, PersonMatch, SheetSubject } from "../index";
import { MetaApiError, metaJson } from "./client";
import { SHEET_SIZE, baseRequest, dataUrl, isContentPolicyError, isSendableImage, requestImage } from "./image";
import { scrub } from "./photo";
import { MODEL_IDS, chargeSpark } from "./pricing";
import { MATCH_PROMPT, OUTFIT_PROMPT, OUTFIT_SCHEMA, matchSchema, outfitSheetPrompt } from "./prompts";
import { outputText } from "./sam";

/**
 * Outfits (03.2-04): the same character in other clothes.
 *
 * - writeOutfit: Muse Spark reads the character's description and the new
 *   clothes (a typed description, a photo crop, or both) and writes the
 *   clothes, a short label and the whole description with the clothes swapped.
 * - drawOutfitSheet: Muse Image edits the character's reference sheet into
 *   the new clothes, with the photo crop (when there is one) as the clothes
 *   reference. One image call.
 * - matchPeople: Muse Spark vision compares people cut from the day's photos
 *   with the cast's sheets (face and hair only) and says who is who and what
 *   they wear. One call for all of them.
 *
 * Photos and crops go inline with `store: false` and are never uploaded or
 * kept. Every call goes through the meter and is charged to the request.
 */

const SPARK_MODEL = MODEL_IDS.spark;
const CLOTHES_MAX = 200;
const LABEL_MAX = 40;
const LOOK_MAX = 400;

interface ChatBody {
  choices?: { message?: { content?: string | null; refusal?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
}

interface ResponsesBody {
  output_text?: string;
  output?: { type?: string; content?: { type?: string; text?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

const tidy = (text: unknown, max: number) => (typeof text === "string" ? text.replace(/\s+/g, " ").trim().slice(0, max).trim() : "");

/**
 * The new look, with any sentence the model added that names something it
 * mustn't (see photo.ts) dropped. Sentences the user wrote in the old look stay.
 */
function cleanLook(look: string, base: string): string {
  const own = new Set(base.split(/(?<=[.!?])\s+/).map((s) => s.trim().toLowerCase()));
  const sentences = tidy(look, LOOK_MAX * 2).split(/(?<=[.!?])\s+/);
  return sentences
    .filter((sentence) => own.has(sentence.trim().toLowerCase()) || scrub(sentence) === sentence.trim())
    .join(" ")
    .slice(0, LOOK_MAX)
    .trim();
}

/** Clothes, label and look from the model's fields, or null when the clothes are missing or unsafe. */
export function outfitFrom(raw: { clothes?: unknown; label?: unknown; look?: unknown }, baseLook: string): OutfitText | null {
  const clothes = scrub(tidy(raw.clothes, CLOTHES_MAX));
  if (clothes.length < 6) return null;
  const label = scrub(tidy(raw.label, LABEL_MAX)) || clothes.split(/[,.]/)[0].slice(0, LABEL_MAX);
  const look = cleanLook(tidy(raw.look, LOOK_MAX * 2), baseLook);
  return { clothes, label, look: look.length >= 12 ? look : `${baseLook.trim()} Now wearing: ${clothes}.`.slice(0, LOOK_MAX) };
}

/** Muse Spark: the new outfit in words, or null when there are no clothes to go on. */
export async function writeOutfit(
  base: { name: string; look: string },
  input: { clothes?: string; photo?: ModelImage | null },
  context?: ModelCallContext,
): Promise<OutfitText | null> {
  const text = [`Character: ${base.name}`, `Current description: ${base.look}`];
  if (input.clothes) text.push(`New clothes, as the user typed them: ${input.clothes}`);
  if (input.photo) text.push("The photo below shows the new clothes.");
  const body = await metaJson<ChatBody>("/chat/completions", {
    method: "POST",
    json: {
      model: SPARK_MODEL,
      reasoning_effort: "low",
      max_completion_tokens: 1_500,
      ...(context?.visitorId ? { safety_identifier: context.visitorId } : {}),
      messages: [
        { role: "system", content: OUTFIT_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: text.join("\n") },
            ...(input.photo ? [{ type: "image_url", image_url: { url: dataUrl(input.photo) } }] : []),
          ],
        },
      ],
      response_format: { type: "json_schema", json_schema: { name: "outfit", strict: true, schema: OUTFIT_SCHEMA } },
    },
    timeoutMs: 60_000,
    signal: context?.signal,
    onSend: () => context?.meter?.beforeCall("text"),
  });
  chargeSpark(context, body.usage, "outfit description");
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new MetaApiError("server", 200, body.choices?.[0]?.message?.refusal ? "outfit refused" : "empty outfit");
  let parsed: { ok?: unknown; clothes?: unknown; label?: unknown; look?: unknown };
  try {
    parsed = JSON.parse(content) as typeof parsed;
  } catch {
    throw new MetaApiError("server", 200, "outfit was not JSON");
  }
  return parsed.ok === true ? outfitFrom(parsed, base.look) : null;
}

/**
 * Muse Image: the character's sheet (a file id or the image) redrawn in the
 * new clothes, with the photo crop as the clothes reference when given. If
 * Muse Image refuses the photo, the sheet is drawn from the words alone and
 * `photoRefused` says so.
 */
export async function drawOutfitSheet(
  subject: SheetSubject,
  sheet: Pick<CharacterReference, "image" | "fileId">,
  clothes: string,
  photo: ModelImage | null,
  context?: ModelCallContext,
): Promise<{ image: ModelImage; photoRefused: boolean }> {
  const sheetPart = sheet.fileId ? { file_id: sheet.fileId } : sheet.image && isSendableImage(sheet.image) ? { image_url: dataUrl(sheet.image) } : null;
  if (!sheetPart) throw new MetaApiError("bad-request", null, "no usable reference sheet for the outfit");
  const draw = (withPhoto: boolean) =>
    requestImage(
      "/images/edits",
      {
        ...baseRequest(context),
        size: SHEET_SIZE,
        prompt: outfitSheetPrompt({ name: subject.name, clothes, style: subject.style, photo: withPhoto }),
        images: withPhoto && photo ? [sheetPart, { image_url: dataUrl(photo) }] : [sheetPart],
      },
      context,
    );
  if (photo) {
    try {
      return { image: await draw(true), photoRefused: false };
    } catch (error) {
      if (!isContentPolicyError(error)) throw error;
      return { image: await draw(false), photoRefused: true };
    }
  }
  return { image: await draw(false), photoRefused: false };
}

function sheetInput(ref: CharacterReference) {
  return ref.fileId ? { type: "input_image", file_id: ref.fileId } : { type: "input_image", image_url: dataUrl(ref.image!) };
}

/**
 * Muse Spark vision: for each crop, which of `refs` it is (or none), how
 * sure, and what they wear. One call; the crops are photos cut by SAM.
 */
export async function matchPeople(crops: ModelImage[], refs: CharacterReference[], context?: ModelCallContext): Promise<PersonMatch[]> {
  const usable = refs.filter((ref) => ref.fileId || (ref.image && isSendableImage(ref.image)));
  if (crops.length === 0 || usable.length === 0) return [];
  const content: object[] = [{ type: "input_text", text: `${usable.length} characters, then ${crops.length} cut-outs from today's photos.` }];
  for (const ref of usable) {
    content.push({ type: "input_text", text: `Character id "${ref.characterId}", ${ref.name}. Description: ${ref.look}\nReference sheet:` });
    content.push(sheetInput(ref));
  }
  crops.forEach((crop, i) => {
    content.push({ type: "input_text", text: `Cut-out ${i + 1}:` });
    content.push({ type: "input_image", image_url: dataUrl(crop) });
  });
  const body = await metaJson<ResponsesBody>("/responses", {
    method: "POST",
    json: {
      model: SPARK_MODEL,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 4_000,
      ...(context?.visitorId ? { safety_identifier: context.visitorId } : {}),
      instructions: MATCH_PROMPT,
      input: [{ type: "message", role: "user", content }],
      text: { format: { type: "json_schema", name: "who_is_who", strict: true, schema: matchSchema(crops.length, usable.map((ref) => ref.characterId)) } },
    },
    timeoutMs: 90_000,
    signal: context?.signal,
    onSend: () => context?.meter?.beforeCall("text"),
  });
  chargeSpark(context, body.usage, `outfit match (${usable.length} cast, ${crops.length} people)`);
  let parsed: { people?: { characterId?: unknown; confidence?: unknown; clothes?: unknown; label?: unknown; look?: unknown }[] };
  try {
    parsed = JSON.parse(outputText(body)) as typeof parsed;
  } catch {
    throw new MetaApiError("server", 200, "outfit match was not JSON");
  }
  const byId = new Map(usable.map((ref) => [ref.characterId, ref]));
  const matches: PersonMatch[] = [];
  (parsed.people ?? []).slice(0, crops.length).forEach((item, crop) => {
    const ref = typeof item.characterId === "string" ? byId.get(item.characterId) : undefined;
    if (!ref) return;
    const outfit = outfitFrom(item, ref.look);
    if (!outfit) return;
    const confidence = typeof item.confidence === "number" ? Math.max(0, Math.min(1, item.confidence)) : 0;
    matches.push({ crop, characterId: ref.characterId, confidence, ...outfit });
  });
  return matches;
}
