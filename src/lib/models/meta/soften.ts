import "server-only";
import type { ModelCallContext } from "../index";
import { metaJson } from "./client";
import { MODEL_IDS, chargeSpark } from "./pricing";
import { outputText } from "./sam";

/**
 * When Muse Image refuses a panel on content policy, Muse Spark rewrites that
 * one scene so it can be drawn: same place, people, action and feeling, with
 * anything the image model may refuse shown gently or left out of frame.
 * Only the art prompt changes; the panel's caption and dialogue stay as told.
 */

const SPARK_MODEL = MODEL_IDS.spark;
const MAX_SCENE = 600;

/** Last resort when Spark can't help: a calm, drawable moment that still fits a diary page. */
export const QUIET_SCENE =
  "A quiet everyday moment: the characters in a calm, softly lit room, thoughtful expressions, nothing dramatic happening.";

const PROMPT = `You adjust one scene description for a diary comic panel. An image model refused to draw it under its content policy.
Rewrite it so it can be drawn: keep the place, the people, what they are doing and the feeling, but show anything heavy gently and indirectly (a look, a posture, light and weather, an object), with no injury, blood, weapons, medicine or pills, self-harm, nudity, violence, or real brands and public figures.
Write one or two plain English sentences describing only what is visible. No names of real people. No quotes.`;

interface ResponsesBody {
  output_text?: string;
  output?: { type?: string; content?: { type?: string; text?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** A gentler version of `scene`, or QUIET_SCENE when Spark returns nothing usable. */
export async function softenScene(scene: string, context?: ModelCallContext): Promise<string> {
  const body = await metaJson<ResponsesBody>("/responses", {
    method: "POST",
    json: {
      model: SPARK_MODEL,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 1_000,
      ...(context?.visitorId ? { safety_identifier: context.visitorId } : {}),
      instructions: PROMPT,
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: `Scene: ${scene}` }] }],
    },
    timeoutMs: 60_000,
    signal: context?.signal,
    onSend: () => context?.meter?.beforeCall("text"),
  });
  chargeSpark(context, body.usage, "softening a refused scene");
  const text = outputText(body).replace(/\s+/g, " ").trim().slice(0, MAX_SCENE);
  return text || QUIET_SCENE;
}
