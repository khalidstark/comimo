import "server-only";
import type { ModelCallContext, ModelImage } from "../index";
import { MetaApiError, metaJson } from "./client";
import { dataUrl } from "./image";
import { segment } from "./sam";

/**
 * A person from a reference photo, for "add someone from a photo":
 * SAM 3.1 finds the people in it (one call, text prompt "person"), and Muse
 * Spark looks at the chosen crop and writes a plain description of how they
 * look for the editable look field.
 *
 * The photo is sent inline with `store: false` and never uploaded to the
 * Files API, so nothing keeps it after the call. Every request goes through
 * the spending meter (SAM counts against the daily image cap).
 * Docs: dev.meta.ai/docs/sam/segmenting, /docs/sam/reading-segmentation, /docs/image-understanding
 */

const SPARK_MODEL = "muse-spark-1.3";
/** Standard Spark prices per token, for the log line. */
const PRICE = { input: 1.25e-6, output: 4.25e-6 };

export interface PersonBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Confidence 0 to 1, when given. */
  score: number;
}

/**
 * The person the photo is about: big and near the middle wins. Detections
 * below 0.4 confidence or smaller than 3% of the photo are ignored.
 */
export function pickPerson(boxes: PersonBox[], width: number, height: number): PersonBox | null {
  let best: PersonBox | null = null;
  let bestScore = 0;
  for (const box of boxes) {
    const area = ((box.x2 - box.x1) * (box.y2 - box.y1)) / (width * height);
    if (box.score < 0.4 || area < 0.03) continue;
    const dx = ((box.x1 + box.x2) / 2 - width / 2) / width;
    const dy = ((box.y1 + box.y2) / 2 - height / 2) / height;
    const centrality = 1 - Math.min(1, Math.hypot(dx, dy) * 1.2);
    const score = area * (0.5 + 0.5 * centrality);
    if (score > bestScore) {
      best = box;
      bestScore = score;
    }
  }
  return best;
}

/** SAM 3.1: every "person" in the photo, as boxes. One call ($0.0025), through the shared SAM client. */
export async function findPeople(image: ModelImage, context?: ModelCallContext): Promise<PersonBox[]> {
  const detections = await segment(image, "person", context);
  return detections.map(({ box, score }) => ({ ...box, score }));
}

const DESCRIBE_PROMPT = `You help someone turn a person from their own photo into a recurring comic character. Look at the photo and describe how this person looks so an illustrator can draw them the same way every time.

Write one plain English paragraph of 2 to 4 short sentences, under 350 characters, starting with "Child", "Adult" or "Older adult" and a gender word only if it is obvious (man, woman, boy, girl). Cover: hair (length, colour, texture, style), face details that stay the same (glasses and their shape, beard or moustache, freckles), what they are wearing (garments and colours), and anything they carry or always wear (a bag, a cap, a scarf).

Never mention or guess ethnicity, race, nationality, religion, health, disability, body weight, attractiveness or an exact age. Do not describe skin colour, the background, the photo itself or the pose. Do not name anyone.

If there is no single clear person in the photo (no one, a crowd, a drawing, an object), set person to false and look to "".`;

const DESCRIBE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["person", "look"],
  properties: { person: { type: "boolean" }, look: { type: "string" } },
};

interface ChatBody {
  choices?: { message?: { content?: string | null; refusal?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Words the description must never contain; a slip is dropped with its sentence. */
const SENSITIVE = /\b(ethnic\w*|race|racial|arab\w*|african|asian|caucasian|european|latin[oa]|middle[- ]eastern|hispanic|muslim|christian|jewish|hindu|religio\w*|skin|complexion|weight|overweight|fat|disab\w*|\d+\s*(?:years?|yrs?)(?:[- ]old)?)\b/i;

function scrub(look: string): string {
  const sentences = look.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/);
  return sentences
    .filter((sentence) => !SENSITIVE.test(sentence))
    .join(" ")
    .slice(0, 400)
    .trim();
}

/** Muse Spark vision: a look description of the person in the crop, or null when there is no clear person. */
export async function describePerson(crop: ModelImage, context?: ModelCallContext): Promise<string | null> {
  const body = await metaJson<ChatBody>("/chat/completions", {
    method: "POST",
    json: {
      model: SPARK_MODEL,
      reasoning_effort: "low",
      max_completion_tokens: 1_500,
      ...(context?.visitorId ? { safety_identifier: context.visitorId } : {}),
      messages: [
        { role: "system", content: DESCRIBE_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Describe the person in this photo." },
            { type: "image_url", image_url: { url: dataUrl(crop) } },
          ],
        },
      ],
      response_format: { type: "json_schema", json_schema: { name: "look", strict: true, schema: DESCRIBE_SCHEMA } },
    },
    timeoutMs: 60_000,
    signal: context?.signal,
    onSend: () => context?.meter?.beforeCall("text"),
  });
  const input = body.usage?.prompt_tokens ?? 0;
  const output = body.usage?.completion_tokens ?? 0;
  console.info(`Comimo: photo description used ${input} in, ${output} out (~$${(input * PRICE.input + output * PRICE.output).toFixed(4)})`);

  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new MetaApiError("server", 200, body.choices?.[0]?.message?.refusal ? "description refused" : "empty description");
  let parsed: { person?: unknown; look?: unknown };
  try {
    parsed = JSON.parse(content) as typeof parsed;
  } catch {
    throw new MetaApiError("server", 200, "description was not JSON");
  }
  if (parsed.person !== true || typeof parsed.look !== "string") return null;
  const look = scrub(parsed.look);
  return look.length >= 12 ? look : null;
}
