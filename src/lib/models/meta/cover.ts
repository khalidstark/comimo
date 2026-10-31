import "server-only";
import { ART_STYLES, type ArtStyleId } from "@/lib/artStyles";
import type { CharacterReference, ModelCallContext, ModelImage } from "../index";
import { MetaApiError, metaJson } from "./client";
import { baseRequest, dataUrl, isSendableImage, requestImage } from "./image";

/**
 * The monthly magazine cover. Muse Spark reads the month's comic titles and
 * writes a cover concept (one scene starring the main cast) and a short
 * cover line; Muse Image paints the scene from the cast's reference sheets,
 * keeping the top of the picture clear for the masthead Comimo prints over it.
 * Two calls: about $0.002 for the concept and $0.01 for the art.
 */

const SPARK_MODEL = "muse-spark-1.3";
const PRICE = { input: 1.25e-6, output: 4.25e-6 };
/** Portrait, close to a printed magazine page. */
const COVER_SIZE = "1024x1536";
const LIMITS = { scene: 600, tagline: 70 };

const CONCEPT_PROMPT = `You design the cover of a monthly comic magazine. Each issue collects the short comics one person made from voice notes about their own days that month; they are the narrator.
You get the month, its comic titles in date order, and the main cast (the narrator first).
Write two things:
- scene: one cover illustration in English, at most 55 words. Show the main cast together in a single warm, lively moment that gathers details from several of the titles (places, objects, weather, food, pets). Name the cast members by their names. Describe only what is seen: setting, poses, light. No text, signs or logos in the picture.
- tagline: a short cover line, at most 8 words, in the language most titles use (Egyptian Arabic or English). Specific to this month, warm, a little playful. Never a score, never a verdict on how the month felt, no hashtags, no quotation marks, at most one exclamation mark.
Use only what the titles suggest; never invent sad or private facts.`;

const CONCEPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["scene", "tagline"],
  properties: { scene: { type: "string" }, tagline: { type: "string" } },
};

const NO_TEXT = "No text anywhere in the image: no letters, words, numbers, signs, labels, logos, captions, speech bubbles or sound effects.";

interface ChatBody {
  choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export interface CoverConcept {
  scene: string;
  tagline: string;
}

function tidy(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").replace(/^["'«“]+|["'»”]+$/g, "").trim().slice(0, max).trim() : "";
}

/** Muse Spark: a cover scene and a cover line from the month's titles. */
export async function writeCoverConcept(
  month: string,
  titles: string[],
  cast: Pick<CharacterReference, "name" | "look">[],
  context?: ModelCallContext,
): Promise<CoverConcept> {
  const brief = {
    month,
    titles,
    cast: cast.map((member, i) => ({ name: member.name, ...(i === 0 ? { narrator: true } : {}) })),
  };
  const body = await metaJson<ChatBody>("/chat/completions", {
    method: "POST",
    json: {
      model: SPARK_MODEL,
      reasoning_effort: "low",
      max_completion_tokens: 1_500,
      ...(context?.visitorId ? { safety_identifier: context.visitorId } : {}),
      messages: [
        { role: "system", content: CONCEPT_PROMPT },
        { role: "user", content: JSON.stringify(brief) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "cover", strict: true, schema: CONCEPT_SCHEMA } },
    },
    timeoutMs: 60_000,
    signal: context?.signal,
    onSend: () => context?.meter?.beforeCall("text"),
  });
  const input = body.usage?.prompt_tokens ?? 0;
  const output = body.usage?.completion_tokens ?? 0;
  console.info(`Comimo: cover concept used ${input} in, ${output} out (~$${(input * PRICE.input + output * PRICE.output).toFixed(4)})`);

  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new MetaApiError("server", 200, body.choices?.[0]?.message?.refusal ? "cover concept refused" : "empty cover concept");
  let parsed: { scene?: unknown; tagline?: unknown };
  try {
    parsed = JSON.parse(content) as typeof parsed;
  } catch {
    throw new MetaApiError("server", 200, "cover concept was not JSON");
  }
  const scene = tidy(parsed.scene, LIMITS.scene);
  const tagline = tidy(parsed.tagline, LIMITS.tagline);
  if (!scene || !tagline) throw new MetaApiError("server", 200, "cover concept was incomplete");
  return { scene, tagline };
}

/** The image prompt for a cover; `image` is each star's reference image number, or null. */
export function coverPrompt(scene: string, stars: { name: string; look: string; image: number | null }[], style: ArtStyleId): string {
  const art = ART_STYLES[style];
  const lines = ["The cover illustration of a monthly comic magazine, one full-page picture in portrait format."];
  if (stars.some((star) => star.image !== null)) {
    lines.push(
      "Each reference image is a character sheet showing one character from the front and from three-quarters. Draw each character exactly as on their sheet: same face, hair, glasses, clothes, colours and body shape. Each character appears once, in a natural pose; do not copy the sheet's layout.",
    );
  }
  if (stars.length > 0) {
    lines.push("Characters, the stars of the cover:");
    for (const star of stars) lines.push(`- ${star.name}${star.image !== null ? ` (reference image ${star.image})` : ""}: ${star.look}`);
  }
  lines.push(`Scene: ${scene}`);
  lines.push(
    "Composition: the characters are big and close to the viewer, filling the lower two thirds, faces clearly visible and turned toward us. The top quarter of the picture is calm, plain background (sky, wall or ceiling) with nothing important in it, because the magazine's title is printed there. Keep faces away from the bottom edge too. Full bleed, edge to edge, no border or frame.",
  );
  lines.push(art.prompt);
  lines.push(NO_TEXT);
  return lines.join("\n");
}

/**
 * Muse Image: the cover art, drawn from the stars' reference sheets (an
 * uploaded file id when there is one, otherwise the sheet inline).
 */
export async function drawCoverArt(scene: string, stars: CharacterReference[], style: ArtStyleId, context?: ModelCallContext): Promise<ModelImage> {
  const images: ({ file_id: string } | { image_url: string })[] = [];
  const described = stars.map((star) => {
    let image: number | null = null;
    if (star.fileId) images.push({ file_id: star.fileId });
    else if (star.image && isSendableImage(star.image)) images.push({ image_url: dataUrl(star.image) });
    else return { name: star.name, look: star.look, image };
    image = images.length;
    return { name: star.name, look: star.look, image };
  });
  const body = { ...baseRequest(context), size: COVER_SIZE, prompt: coverPrompt(scene, described, style) };
  return images.length > 0
    ? requestImage("/images/edits", { ...body, images }, context)
    : requestImage("/images/generations", body, context);
}
