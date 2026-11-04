import "server-only";
import type { GoodThing, WeekRequest } from "@/lib/types";
import type { ModelCallContext } from "../index";
import { MetaApiError, metaJson } from "./client";
import { MODEL_IDS, chargeSpark } from "./pricing";

/**
 * The week's good things: Muse Spark reads the week's comics (the
 * user's own words) and picks out what went well, what the user did and the
 * kindness they got. One chat completion with a json_schema answer.
 */

const MODEL = MODEL_IDS.spark;

export const WEEK_PROMPT = `You keep a comic diary for someone. They send you the comics they made this week: each one's date, title and their own words about that day (Arabic, English or both).

Write them a short, warm look back at the good things of their week, the way a friend who listened all week would:
Write everything in the language most of their words this week were in: natural Egyptian Arabic if they mostly spoke Arabic, English if they mostly spoke English (keep names as they wrote them).
- headline: under 70 characters, about their week.
- goodThings: 3 to 6 items, in date order. Each is one sentence under 140 characters, speaking to them in second person ("You…" or "إنت…"), about something that really happened in that day's words: something they did (helped someone, finished something, tried something new, kept going, laughed) or something good that happened to them or that someone did for them. Give the dayId it came from, kind "did" or "happened", and panel: the number of that comic's panel (from its list of panel scenes, counting from 0) that shows this moment best, or -1 if none does. Only what the words say: never invent events, people or feelings.
- line: one closing sentence under 120 characters, warm and light.

Hard rules: no advice, no suggestions, no lessons, no diagnosis, no scores or ratings of their mood or week, no therapy language, no "you should". If a day was hard, you may mention a good moment inside it, but never dwell on the hard part. If the week has fewer good things than 3, give what there is (at least 1). Never mention self-harm.`;

function schema(dayIds: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["headline", "goodThings", "line"],
    properties: {
      headline: { type: "string" },
      goodThings: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["text", "dayId", "kind", "panel"],
          properties: {
            text: { type: "string" },
            dayId: { type: "string", enum: dayIds },
            kind: { type: "string", enum: ["did", "happened"] },
            panel: { type: "integer" },
          },
        },
      },
      line: { type: "string" },
    },
  };
}

interface ChatBody {
  choices?: { message?: { content?: string | null; refusal?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
}

const clip = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
/** Advice and scores slip in sometimes; such an item is dropped. */
const ADVICE = /\b(you should|try to|remember to|consider|make sure|score|rating|out of 10|therapy|therapist|diagnos)/i;

export interface WeekAnswer {
  headline: string;
  goodThings: GoodThing[];
  line: string;
}

/** Clean the model's answer: known days only, no advice, sensible lengths. */
export function weekFrom(raw: unknown, dayIds: string[], panelCounts: Record<string, number> = {}): WeekAnswer | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { headline, goodThings, line } = raw as Record<string, unknown>;
  const known = new Set(dayIds);
  const things: GoodThing[] = [];
  for (const item of Array.isArray(goodThings) ? goodThings : []) {
    if (typeof item !== "object" || item === null) continue;
    const { text, dayId, kind, panel } = item as Record<string, unknown>;
    const sentence = clip(text, 160);
    if (!sentence || typeof dayId !== "string" || !known.has(dayId) || ADVICE.test(sentence)) continue;
    const count = panelCounts[dayId] ?? 0;
    const shown = typeof panel === "number" && Number.isInteger(panel) && panel >= 0 && panel < count ? panel : undefined;
    things.push({ text: sentence, dayId, kind: kind === "did" ? "did" : "happened", ...(shown !== undefined ? { panel: shown } : {}) });
    if (things.length >= 6) break;
  }
  if (things.length === 0) return null;
  const closing = clip(line, 140);
  return { headline: clip(headline, 90) || "Your week", goodThings: things, line: ADVICE.test(closing) ? "" : closing };
}

export async function writeWeekSummary(week: WeekRequest, context?: ModelCallContext): Promise<WeekAnswer> {
  const dayIds = week.days.map((day) => day.id);
  const body = await metaJson<ChatBody>("/chat/completions", {
    method: "POST",
    json: {
      model: MODEL,
      reasoning_effort: "low",
      max_completion_tokens: 2_000,
      ...(context?.visitorId ? { safety_identifier: context.visitorId } : {}),
      messages: [
        { role: "system", content: WEEK_PROMPT },
        { role: "user", content: JSON.stringify({ week: week.week, comics: week.days.map(({ id, date, title, text, scenes }) => ({ dayId: id, date, title, words: text, panelScenes: scenes ?? [] })) }) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "good_things", strict: true, schema: schema(dayIds) } },
    },
    timeoutMs: 60_000,
    signal: context?.signal,
    onSend: () => context?.meter?.beforeCall("text"),
  });
  chargeSpark(context, body.usage, `week of good things (${week.days.length} comics)`);
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new MetaApiError("server", 200, body.choices?.[0]?.message?.refusal ? "week refused" : "empty week");
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new MetaApiError("server", 200, "week was not JSON");
  }
  const answer = weekFrom(parsed, dayIds, Object.fromEntries(week.days.map((day) => [day.id, day.scenes?.length ?? 0])));
  if (!answer) throw new MetaApiError("server", 200, "week had no usable good things");
  return answer;
}
