import { starterCastById } from "@/fixtures/cast";
import { guard, guardResponse } from "@/lib/guard";
import { getModels, type CharacterReference } from "@/lib/models";
import { fromWire, isRecord, isText, json, jsonError, modelErrorResponse, readJson, toWire } from "@/lib/models/wire";
import type { DialogueLine, PanelResponse, ScriptPanel, TextDir } from "@/lib/types";

const MAX_CHARACTERS = 8;
const MAX_LINES = 8;
const DIRS: TextDir[] = ["rtl", "ltr", "auto"];

function isIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_CHARACTERS && value.every((id) => isText(id, 100));
}

function parsePanel(value: unknown): ScriptPanel | null {
  if (!isRecord(value)) return null;
  const { index, scene, caption, dialogue, characterIds } = value;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index > 20) return null;
  if (!isText(scene, 2000)) return null;
  if (caption !== undefined && typeof caption !== "string") return null;
  if (!isIdList(characterIds)) return null;
  if (!Array.isArray(dialogue) || dialogue.length > MAX_LINES) return null;

  const lines: DialogueLine[] = [];
  for (const line of dialogue) {
    if (!isRecord(line)) return null;
    const { speakerId, text, dir } = line;
    if (!isText(speakerId, 100) || !isText(text, 500)) return null;
    if (typeof dir !== "string" || !DIRS.includes(dir as TextDir)) return null;
    lines.push({ speakerId, text, dir: dir as TextDir });
  }
  return { index, scene, caption: caption?.slice(0, 300), dialogue: lines, characterIds };
}

function parseReferences(value: unknown): CharacterReference[] | null {
  if (!Array.isArray(value) || value.length > MAX_CHARACTERS) return null;
  const references: CharacterReference[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const { characterId, name, look, image } = item;
    if (!isText(characterId, 100) || !isText(name, 100) || typeof look !== "string" || look.length > 2000) return null;
    const decoded = image === undefined ? null : fromWire(image);
    if (image !== undefined && !decoded) return null;
    references.push({ characterId, name, look, image: decoded });
  }
  return references;
}

/** Without references, fall back to the starter cast's descriptions (no reference images). */
function starterReferences(characterIds: string[]): CharacterReference[] {
  return characterIds.flatMap((id) => {
    const character = starterCastById[id];
    return character ? [{ characterId: id, name: character.name, look: character.look, image: null }] : [];
  });
}

/**
 * POST /api/panel
 * JSON: { panel: ScriptPanel, references?: WireReference[] }
 * Draws the panel, then checks every character against their reference and
 * redraws any that drifted. Returns the final image and the before image.
 */
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!isRecord(body)) return jsonError(400, "Send JSON like {\"panel\": {...}, \"references\": [...]}.");

  const panel = parsePanel(body.panel);
  if (!panel) {
    return jsonError(400, "`panel` needs index, scene, dialogue (speakerId, text, dir) and characterIds.");
  }

  let references = starterReferences(panel.characterIds);
  if (body.references !== undefined) {
    const parsed = parseReferences(body.references);
    if (!parsed) return jsonError(400, "`references` must be a list of {characterId, name, look, image?}.");
    references = parsed;
  }
  const inPanel = references.filter((ref) => panel.characterIds.includes(ref.characterId));

  const models = getModels();
  const { drawPanel, checkConsistency } = models.sources;
  const source = drawPanel === "meta" || checkConsistency === "meta" ? "meta" : "mock";
  // Image and SAM calls are counted against the daily cap one by one, through the meter, as they are made.
  const check = guard(request, "panel", { real: source === "meta" });
  if (!check.ok) return guardResponse(check);

  try {
    const context = { visitorId: check.visitorId, signal: request.signal, meter: check.meter };
    const drawn = await models.drawPanel(panel, inPanel, context);
    const { driftedCharacterIds, fixedImage } = await models.checkConsistency(drawn, inPanel, context);
    return json<PanelResponse>(
      {
        mode: source,
        image: toWire(fixedImage ?? drawn),
        consistency: {
          driftedCharacterIds,
          fixedCharacterIds: fixedImage ? driftedCharacterIds : [],
          before: fixedImage ? toWire(drawn) : null,
        },
      },
      source,
    );
  } catch (error) {
    // Refund only when nothing billable reached Meta; an abort or timeout after sending still counts.
    check.refundIfUnbilled();
    return modelErrorResponse(error);
  }
}
