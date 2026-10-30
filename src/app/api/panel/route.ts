import { starterCastById } from "@/fixtures/cast";
import { guard, guardResponse } from "@/lib/guard";
import { getModels, type CharacterReference } from "@/lib/models";
import { isTrustedSheet, signFileId, verifyFileToken } from "@/lib/models/fileTokens";
import { isMissingFileError, isSendableImage, pickReferences } from "@/lib/models/meta/image";
import { fromWire, isRecord, isText, json, jsonError, modelErrorResponse, readJson, toWire } from "@/lib/models/wire";
import type { ApiError, DialogueLine, PanelResponse, PanelShape, ScriptPanel, TextDir, UploadedReference } from "@/lib/types";

/** Muse Image can take a minute or two with reasoning_strength "high", plus one retry. */
export const maxDuration = 300;

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

function parseReferences(value: unknown): CharacterReference[] | "stale" | "untrusted" | null {
  if (!Array.isArray(value) || value.length > MAX_CHARACTERS) return null;
  const references: CharacterReference[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const { characterId, name, look, image, sheetToken, fileToken } = item;
    if (!isText(characterId, 100) || !isText(name, 100) || typeof look !== "string" || look.length > 2000) return null;
    const wire = image === undefined ? null : fromWire(image);
    if (image !== undefined && !wire) return null;
    // Only real PNG/JPEG/WebP sheets go to Meta (mock SVG sheets are dropped), and only
    // sheets this server drew or the shipped starter sheets: never an arbitrary image.
    const decoded = wire && isSendableImage(wire) ? wire : null;
    if (decoded && !isTrustedSheet(decoded.data, sheetToken)) return "untrusted";
    const fileId = fileToken === undefined ? null : verifyFileToken(fileToken);
    // A token this server can't use (another key, tampered) without the image: ask for the image instead.
    if (fileToken !== undefined && !fileId && !decoded) return "stale";
    references.push({ characterId, name, look, image: decoded, ...(fileId ? { fileId } : {}) });
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

/** An uploaded sheet can't be used any more; the browser resends the sheets themselves. */
function staleReference(): Response {
  return Response.json({ error: "A reference sheet needs uploading again.", code: "stale-reference" } satisfies ApiError, {
    status: 409,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * POST /api/panel
 * JSON: { panel: ScriptPanel, references?: WireReference[], shape?: "wide" | "standard" }
 * Draws the panel from the reference sheets of the characters in it, then
 * checks every character against their reference and redraws any that
 * drifted. Returns the final image, the before image, and tokens for any
 * sheet uploaded on the way (send them as `fileToken` next time).
 * 409 with code "stale-reference": an uploaded sheet is gone; resend the images.
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
    if (parsed === "stale") return staleReference();
    if (parsed === "untrusted") return jsonError(400, "That reference sheet wasn't drawn by Comimo. Redraw it from the cast screen.");
    if (!parsed) return jsonError(400, "`references` must be a list of {characterId, name, look, image?, fileToken?}.");
    references = parsed;
  }
  const inPanel = references.filter((ref) => panel.characterIds.includes(ref.characterId));
  const shape: PanelShape = body.shape === "wide" ? "wide" : "standard";

  const models = getModels();
  const { drawPanel, checkConsistency } = models.sources;
  const source = drawPanel === "meta" || checkConsistency === "meta" ? "meta" : "mock";
  // Image and SAM calls are counted against the daily cap one by one, through the meter, as they are made.
  const check = guard(request, "panel", { real: source === "meta" });
  if (!check.ok) return guardResponse(check);

  try {
    const context = { visitorId: check.visitorId, signal: request.signal, meter: check.meter };

    // Sheets that came inline are uploaded once (metered, capped per visitor); the browser keeps the token
    // for the next panel. Only the sheets this panel actually sends are uploaded.
    const uploaded: UploadedReference[] = [];
    if (drawPanel === "meta") {
      const sent = pickReferences(panel, inPanel);
      await Promise.all(
        inPanel.map(async (ref) => {
          if (!sent.has(ref.characterId) || ref.fileId || !ref.image) return;
          const fileId = await models.uploadReference(ref.image, context);
          const fileToken = fileId ? signFileId(fileId) : null;
          if (!fileId || !fileToken) return;
          ref.fileId = fileId;
          uploaded.push({ characterId: ref.characterId, fileToken });
        }),
      );
    }

    let drawn;
    try {
      drawn = await models.drawPanel(panel, inPanel, context, shape);
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
      // Uploaded sheets expire after 30 days; the browser resends the images and gets fresh tokens.
      return staleReference();
    }
    const { driftedCharacterIds, fixedImage } = await models.checkConsistency(drawn, inPanel, context);
    return json<PanelResponse>(
      {
        mode: source,
        image: toWire(fixedImage ?? drawn),
        uploaded,
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
