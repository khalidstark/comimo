import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { drawSize } from "@/lib/layout/page";
import type { SamReport } from "@/lib/types";
import type { CharacterReference, ConsistencyOptions, ConsistencyResult, ModelCallContext, ModelImage } from "../index";
import { MetaApiError, metaJson } from "./client";
import { baseRequest, dataUrl, drawPanel, isSendableImage, requestImage } from "./image";
import { JUDGE_PROMPT, judgeSchema, redrawPrompt, type RedrawTarget } from "./prompts";
import { cropFigure, locate, outputText, type Located } from "./sam";

/**
 * The face check (03-03), three Meta models together:
 * 1. SAM 3.1 finds every cast member in the drawn panel (a noun phrase from
 *    their look) and everyone else ("person"), see sam.ts;
 * 2. Muse Spark looks at each found character's cut-out next to their
 *    reference sheet and says whether it is the same character (json_schema);
 * 3. Muse Image redraws the panel when someone drifted: first an instruction
 *    edit of the panel itself ("fix only Karim"), then, if he still drifts, the
 *    whole panel again with the differences spelled out. At most 2 redraws.
 * The panel as first drawn is kept as the "before".
 *
 * COMIMO_SAM_CHECK=0 keeps step 1 only (lettering placement still needs the
 * boxes) and skips the judge and redraws, for when latency matters more.
 */

const JUDGE_MODEL = "muse-spark-1.3";
/** Standard Spark prices per token, for the log line. */
const PRICE = { input: 1.25e-6, output: 4.25e-6 };
/** A "not the same" verdict below this confidence is ignored. */
const DRIFT_CONFIDENCE = 0.6;
const MAX_REDRAWS = 2;

export function samCheckEnabled(): boolean {
  const value = process.env.COMIMO_SAM_CHECK?.trim().toLowerCase();
  return !(value === "0" || value === "off" || value === "false");
}

interface Verdict {
  characterId: string;
  same: boolean;
  differences: string[];
  confidence: number;
}

interface ResponsesBody {
  output_text?: string;
  output?: { type?: string; content?: { type?: string; text?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

function sheetPart(ref: CharacterReference) {
  return ref.fileId ? { type: "input_image", file_id: ref.fileId } : { type: "input_image", image_url: dataUrl(ref.image!) };
}

function hasSheet(ref: CharacterReference): boolean {
  return Boolean(ref.fileId || (ref.image && isSendableImage(ref.image)));
}

/**
 * Detailed logs (names, what the judge saw) and review crops are for local
 * testing only: on in development or with COMIMO_SAM_DEBUG=1, never on Vercel.
 * Production logs carry panel indexes, character ids, counts and timings.
 */
function debugging(): boolean {
  if (process.env.VERCEL === "1") return false;
  return process.env.NODE_ENV !== "production" || process.env.COMIMO_SAM_DEBUG === "1";
}

/** Where review crops go when debugging with COMIMO_SAM_DEBUG_DIR set. */
async function saveCrop(label: string, crop: ModelImage) {
  const dir = process.env.COMIMO_SAM_DEBUG_DIR;
  if (!dir || !debugging()) return;
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${label}.png`), crop.data);
  } catch {
    // Review crops are a convenience.
  }
}

/**
 * Muse Spark vision, one call for every found character of a panel: sheet,
 * then cut-out, per character. Answers in the json_schema shape.
 */
async function judge(
  image: ModelImage,
  located: Located,
  refs: CharacterReference[],
  context: ModelCallContext | undefined,
  label: string,
): Promise<Verdict[]> {
  const content: object[] = [{ type: "input_text", text: `Check these ${refs.length} characters.` }];
  for (const [i, ref] of refs.entries()) {
    const crop = await cropFigure(image, located.width, located.height, located.boxes.get(ref.characterId)!);
    void saveCrop(`${label}-${ref.name.replace(/\W+/g, "_")}`, crop);
    content.push({ type: "input_text", text: `Character ${i + 1}: ${ref.name}. Reference sheet:` });
    content.push(sheetPart(ref));
    content.push({ type: "input_text", text: `Cut-out of ${ref.name} from the panel:` });
    content.push({ type: "input_image", image_url: dataUrl(crop) });
  }
  const body = await metaJson<ResponsesBody>("/responses", {
    method: "POST",
    json: {
      model: JUDGE_MODEL,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 2_000,
      ...(context?.visitorId ? { safety_identifier: context.visitorId } : {}),
      instructions: JUDGE_PROMPT,
      input: [{ type: "message", role: "user", content }],
      text: { format: { type: "json_schema", name: "face_check", strict: true, schema: judgeSchema(refs.length) } },
    },
    timeoutMs: 60_000,
    signal: context?.signal,
    onSend: () => context?.meter?.beforeCall("text"),
  });
  const input = body.usage?.input_tokens ?? 0;
  const output = body.usage?.output_tokens ?? 0;
  console.info(`Comimo: face judge (${refs.length}) used ${input} in, ${output} out (~$${(input * PRICE.input + output * PRICE.output).toFixed(4)})`);
  let parsed: { characters?: { sameCharacter?: unknown; differences?: unknown; confidence?: unknown }[] };
  try {
    parsed = JSON.parse(outputText(body)) as typeof parsed;
  } catch {
    throw new MetaApiError("server", 200, "face judge answer was not JSON");
  }
  return refs.map((ref, i) => {
    const item = parsed.characters?.[i];
    const differences = Array.isArray(item?.differences) ? item.differences.filter((d): d is string => typeof d === "string").map((d) => d.slice(0, 120)) : [];
    const confidence = typeof item?.confidence === "number" ? Math.max(0, Math.min(1, item.confidence)) : 0;
    return { characterId: ref.characterId, same: item?.sameCharacter !== false, differences, confidence };
  });
}

function drifted(verdicts: Verdict[]): Verdict[] {
  return verdicts.filter((v) => !v.same && v.confidence >= DRIFT_CONFIDENCE && v.differences.length > 0);
}

function whereIs(located: Located, characterId: string): string {
  const found = located.boxes.get(characterId);
  if (!found) return "in the panel";
  const centre = (found.box.x1 + found.box.x2) / 2 / located.width;
  const side = centre < 0.36 ? "on the left" : centre > 0.64 ? "on the right" : "in the middle";
  return `${side} (about ${Math.round(centre * 100)}% from the left edge)`;
}

/** Muse Image instruction edit: the panel is image 1, each drifted character's sheet follows. */
async function redrawEdit(
  image: ModelImage,
  located: Located,
  wrong: Verdict[],
  byId: Map<string, CharacterReference>,
  options: ConsistencyOptions,
  context?: ModelCallContext,
): Promise<ModelImage> {
  const images: object[] = [{ image_url: dataUrl(image) }];
  const targets: RedrawTarget[] = [];
  for (const verdict of wrong) {
    const ref = byId.get(verdict.characterId)!;
    images.push(ref.fileId ? { file_id: ref.fileId } : { image_url: dataUrl(ref.image!) });
    targets.push({ name: ref.name, where: whereIs(located, ref.characterId), differences: verdict.differences, image: images.length });
  }
  const body = { ...baseRequest(context), size: drawSize(options.frame.aspect), prompt: redrawPrompt(targets, options.style), images };
  return requestImage("/images/edits", body, context);
}

function report(sought: CharacterReference[], located: Located, judged: string[], redraws: number, checked: boolean): SamReport {
  return {
    sought: sought.map((ref) => ref.characterId),
    found: sought.filter((ref) => located.boxes.has(ref.characterId)).map((ref) => ref.characterId),
    judged,
    redraws,
    checked,
  };
}

export async function checkConsistency(
  image: ModelImage,
  references: CharacterReference[],
  options: ConsistencyOptions,
  context?: ModelCallContext,
): Promise<ConsistencyResult> {
  const started = Date.now();
  const label = `panel${options.panel.index}`;
  const byId = new Map(references.map((ref) => [ref.characterId, ref]));
  const located = await locate(image, references, context);
  const timing = [`locate ${((Date.now() - started) / 1000).toFixed(1)} s (${located.calls} SAM)`];
  const finish = (result: Omit<ConsistencyResult, "method">): ConsistencyResult => {
    console.info(`Comimo: face check ${label}: ${timing.join(", ")}; total ${((Date.now() - started) / 1000).toFixed(1)} s`);
    return { ...result, method: "sam" };
  };

  if (!samCheckEnabled()) {
    return finish({ driftedCharacterIds: [], fixedCharacterIds: [], fixedImage: null, figures: located.figures, sam: report(references, located, [], 0, false) });
  }

  const judgeable = references.filter((ref) => hasSheet(ref) && located.boxes.has(ref.characterId));
  if (judgeable.length === 0) {
    return finish({ driftedCharacterIds: [], fixedCharacterIds: [], fixedImage: null, figures: located.figures, sam: report(references, located, [], 0, true) });
  }
  const t1 = Date.now();
  const first = drifted(await judge(image, located, judgeable, context, `${label}-check`));
  timing.push(`judge ${((Date.now() - t1) / 1000).toFixed(1)} s`);
  const driftedIds = first.map((v) => v.characterId);
  if (first.length === 0) {
    return finish({ driftedCharacterIds: [], fixedCharacterIds: [], fixedImage: null, figures: located.figures, sam: report(references, located, judgeable.map((r) => r.characterId), 0, true) });
  }
  console.info(`Comimo: ${label} drifted: ${driftedIds.join(", ")} (${first.reduce((sum, v) => sum + v.differences.length, 0)} differences)`);
  if (debugging()) console.info(`Comimo: ${label} differences: ${first.map((v) => `${byId.get(v.characterId)?.name}: ${v.differences.join("; ")}`).join(" | ")}`);

  const original = { image, located };
  let current = { image, located };
  let still = first;
  let redraws = 0;
  while (still.length > 0 && redraws < MAX_REDRAWS) {
    const t = Date.now();
    redraws += 1;
    let next: ModelImage;
    try {
      next =
        redraws === 1
          ? await redrawEdit(current.image, current.located, still, byId, options, context)
          : await drawPanel(
              options.panel,
              references,
              { frame: options.frame, style: options.style, fixes: still.map((v) => `${byId.get(v.characterId)?.name}: ${v.differences.join("; ")}.`) },
              context,
            );
    } catch (error) {
      if (context?.signal?.aborted) throw error;
      // A refused or failed redraw keeps the best panel so far.
      const reason = error instanceof MetaApiError ? `${error.status ?? "-"} ${error.kind}${error.code ? ` ${error.code}` : ""}` : "unknown";
      console.warn(`Comimo: ${label} redraw ${redraws} failed (${reason})`);
      break;
    }
    const nextLocated = await locate(next, references, context);
    // An edit only touched the drifted characters; a full redraw is checked whole.
    const recheck = (redraws === 1 ? still.map((v) => byId.get(v.characterId)!) : judgeable).filter(
      (ref) => hasSheet(ref) && nextLocated.boxes.has(ref.characterId),
    );
    const verdicts = recheck.length > 0 ? await judge(next, nextLocated, recheck, context, `${label}-redraw${redraws}`) : [];
    const wrong = drifted(verdicts);
    // The redraw counts only if every drifted character is found again and fewer are wrong.
    const lost = still.some((v) => !nextLocated.boxes.has(v.characterId));
    timing.push(`redraw ${redraws} ${((Date.now() - t) / 1000).toFixed(1)} s`);
    if (lost || wrong.length >= still.length) {
      console.info(`Comimo: ${label} redraw ${redraws} not better (${wrong.length} still wrong${lost ? ", someone lost" : ""})`);
      if (redraws >= MAX_REDRAWS) break;
      continue;
    }
    current = { image: next, located: nextLocated };
    still = wrong;
  }

  const fixedIds = driftedIds.filter((id) => !still.some((v) => v.characterId === id));
  const fixed = current.image !== original.image;
  return finish({
    driftedCharacterIds: driftedIds,
    fixedCharacterIds: fixed ? fixedIds : [],
    fixedImage: fixed ? current.image : null,
    figures: current.located.figures,
    sam: report(references, current.located, judgeable.map((r) => r.characterId), redraws, true),
  });
}
