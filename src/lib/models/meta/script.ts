import "server-only";
import { firstStrongDir } from "@/lib/bidi";
import { MOODS, type CastBrief, type ComicScript, type DialogueLine, type Mood, type ScriptPanel } from "@/lib/types";
import type { ModelCallContext } from "../index";
import { MetaApiError, metaJson } from "./client";
import { SCRIPT_SYSTEM_PROMPT, castBlock, scriptSchema, transcriptMessage } from "./prompts";

/**
 * Muse Spark writes the comic script: POST /v1/chat/completions with a
 * json_schema response format (constrained decoding). The schema can't say
 * "4 to 6 panels unless crisis" or "questions only on heavy days", so the
 * answer is checked here and the call is retried once if it misses.
 * Docs: dev.meta.ai/docs/structured-output, /docs/protocols/chat-completions
 */

const MODEL = "muse-spark-1.3";
/** Standard prices per token (dev.meta.ai/docs/pricing-rate-limits). */
const PRICE = { input: 1.25e-6, cached: 0.15e-6, output: 4.25e-6 };
const MAX_OUTPUT_TOKENS = 6_000;
const ATTEMPTS = 2;

/** Same limits /api/panel accepts, so a script always draws. */
const LIMITS = { title: 80, scene: 600, caption: 200, line: 200, question: 200, linesPerPanel: 3, charactersPerPanel: 3 };

interface ChatBody {
  choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
}

/** The answer came back but doesn't make a usable script. */
class ScriptShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScriptShapeError";
  }
}

function logUsage(usage: ChatBody["usage"], attempt: number) {
  const input = usage?.prompt_tokens ?? 0;
  const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
  const output = usage?.completion_tokens ?? 0;
  const reasoning = usage?.completion_tokens_details?.reasoning_tokens ?? 0;
  const cost = (input - cached) * PRICE.input + cached * PRICE.cached + output * PRICE.output;
  console.info(
    `Comimo: script attempt ${attempt} used ${input} in (${cached} cached), ${output} out (${reasoning} reasoning) (~$${cost.toFixed(4)})`,
  );
}

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ScriptShapeError("expected an object");
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Check one panel and fix what can be fixed: unknown ids dropped, speakers added to the panel, text directions set. */
function toPanel(value: unknown, index: number, castIds: Set<string>): ScriptPanel {
  const raw = asRecord(value);
  const scene = clip(raw.scene, LIMITS.scene);
  if (!scene) throw new ScriptShapeError(`panel ${index} has no scene`);

  const characterIds = [...new Set(asArray(raw.characterIds).filter((id): id is string => typeof id === "string" && castIds.has(id)))].slice(
    0,
    LIMITS.charactersPerPanel,
  );

  const dialogue: DialogueLine[] = [];
  for (const item of asArray(raw.dialogue).slice(0, LIMITS.linesPerPanel)) {
    const line = asRecord(item);
    const speakerId = typeof line.speakerId === "string" ? line.speakerId : "";
    const text = clip(line.text, LIMITS.line);
    if (!text || !castIds.has(speakerId)) continue;
    if (!characterIds.includes(speakerId)) {
      if (characterIds.length >= LIMITS.charactersPerPanel) continue;
      characterIds.push(speakerId);
    }
    dialogue.push({ speakerId, text, dir: firstStrongDir(text) ?? "auto" });
  }

  const caption = clip(raw.caption, LIMITS.caption);
  return { index, scene, ...(caption ? { caption } : {}), dialogue, characterIds };
}

/** Turn the model's JSON into a ComicScript, or throw ScriptShapeError so the call is tried again. */
export function toComicScript(content: string, cast: CastBrief[]): ComicScript {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ScriptShapeError("answer was not JSON");
  }
  const raw = asRecord(parsed);

  if (raw.safety === "crisis") {
    return { title: "", panels: [], mood: "rainy", heavy: true, checkInQuestions: [], safety: "crisis" };
  }
  if (raw.safety !== "ok") throw new ScriptShapeError("missing safety flag");

  const mood = MOODS.includes(raw.mood as Mood) ? (raw.mood as Mood) : null;
  if (!mood) throw new ScriptShapeError("unknown mood");
  if (typeof raw.heavy !== "boolean") throw new ScriptShapeError("missing heavy flag");

  const castIds = new Set(cast.map((member) => member.id));
  const rawPanels = asArray(raw.panels);
  if (rawPanels.length < 4 || rawPanels.length > 6) throw new ScriptShapeError(`${rawPanels.length} panels, expected 4 to 6`);
  const panels = rawPanels.map((panel, index) => toPanel(panel, index, castIds));

  const questions = asArray(raw.checkInQuestions)
    .map((question) => clip(question, LIMITS.question))
    .filter(Boolean)
    .slice(0, 3);
  if (raw.heavy && questions.length < 2) throw new ScriptShapeError("heavy day without 2 or 3 check-in questions");

  return {
    title: clip(raw.title, LIMITS.title) || "Today",
    panels,
    mood,
    heavy: raw.heavy,
    checkInQuestions: raw.heavy ? questions : [],
    safety: "ok",
  };
}

export async function writeScript(transcript: string, cast: CastBrief[], context: ModelCallContext = {}): Promise<ComicScript> {
  const request = {
    model: MODEL,
    reasoning_effort: "low",
    max_completion_tokens: MAX_OUTPUT_TOKENS,
    ...(context.visitorId ? { safety_identifier: context.visitorId } : {}),
    messages: [
      { role: "system", content: SCRIPT_SYSTEM_PROMPT },
      { role: "system", content: castBlock(cast) },
      { role: "user", content: transcriptMessage(transcript) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "comic_script", strict: true, schema: scriptSchema(cast.map((member) => member.id)) },
    },
  };

  let lastProblem = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const body = await metaJson<ChatBody>("/chat/completions", {
      method: "POST",
      json: request,
      signal: context.signal,
      timeoutMs: 75_000,
      onSend: () => context.meter?.beforeCall("text"),
    });
    logUsage(body.usage, attempt);

    const choice = body.choices?.[0];
    const content = choice?.message?.content;
    try {
      if (choice?.finish_reason === "length") throw new ScriptShapeError("answer was cut off");
      if (!content) throw new ScriptShapeError(choice?.message?.refusal ? "model refused" : "empty answer");
      return toComicScript(content, cast);
    } catch (error) {
      if (!(error instanceof ScriptShapeError)) throw error;
      lastProblem = error.message;
      console.warn(`Comimo: script attempt ${attempt} unusable: ${lastProblem}`);
    }
  }
  throw new MetaApiError("server", 200, `script unusable after ${ATTEMPTS} attempts: ${lastProblem}`);
}
