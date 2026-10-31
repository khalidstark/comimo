import { guard, guardResponse } from "@/lib/guard";
import { isMockMode } from "@/lib/models";
import { isTrustedSheet } from "@/lib/models/fileTokens";
import { isSendableImage } from "@/lib/models/meta/image";
import { drawSpritePoses, headRegionFor } from "@/lib/models/meta/sprite";
import { fromWire, isRecord, isText, json, jsonError, modelErrorResponse, readJson } from "@/lib/models/wire";
import { SpriteAssemblyError, assembleSprite } from "@/lib/sprites/assemble";
import type { ApiError, CharacterRole, SpriteResponse } from "@/lib/types";

/** Five Muse Image calls (one, then three at once, then one) plus keying. */
export const maxDuration = 300;

const ROLES: CharacterRole[] = ["self", "friend", "family", "teacher", "pet", "other"];
const MAX_LOOK = 600;

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/**
 * POST /api/sprite
 * JSON: { characterId, name, role, look, sheet: WireImage, sheetToken? }
 * Animates a character once: five poses drawn from their reference sheet,
 * keyed and assembled into a 6 x 4 sprite sheet (idle, blink, talk, wave).
 * The sheet must be one this server drew (or a shipped starter sheet), never
 * an arbitrary image. Mock mode answers 503 "unavailable" and the app keeps
 * the static portrait.
 */
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!isRecord(body)) return jsonError(400, "Send JSON like {\"characterId\": \"...\", \"sheet\": {...}}.");
  const { characterId, name, role, look, sheet, sheetToken } = body;
  if (!isText(characterId, 100) || !isText(name, 100)) return jsonError(400, "`characterId` and `name` are required.");
  if (typeof role !== "string" || !ROLES.includes(role as CharacterRole)) return jsonError(400, "`role` must be one of the cast roles.");
  if (typeof look !== "string" || look.length > MAX_LOOK) return jsonError(400, "`look` is too long.");

  const image = fromWire(sheet);
  if (!image || !isSendableImage(image)) return jsonError(400, "`sheet` must be the character's reference sheet (PNG, JPEG or WebP).");
  if (!isTrustedSheet(image.data, sheetToken)) return jsonError(400, "That reference sheet wasn't drawn by Comimo. Redraw it from the cast screen.");

  if (isMockMode()) {
    return Response.json({ error: "Animated sprites need the real models.", code: "unavailable" } satisfies ApiError, {
      status: 503,
      headers: { "Cache-Control": "no-store", "X-Comimo-Mode": "mock" },
    });
  }

  // Each pose is one image call, counted against the daily image cap by the meter as it is sent.
  const check = guard(request, "sprite", { real: true });
  if (!check.ok) return guardResponse(check);

  try {
    const context = { visitorId: check.visitorId, signal: request.signal, meter: check.meter };
    const started = Date.now();
    const poses = await drawSpritePoses({ name: name.trim(), role: role as CharacterRole, look: look.trim() }, image, context);
    const sprite = await assembleSprite(poses, headRegionFor(role as CharacterRole));
    console.info(`Comimo: sprite assembled in ${((Date.now() - started) / 1000).toFixed(1)} s (~$0.05)`);
    return json<SpriteResponse>(
      {
        mode: "meta",
        image: { mimeType: "image/webp", base64: base64(sprite.sheet) },
        portrait: { mimeType: "image/webp", base64: base64(sprite.portrait) },
        frameWidth: sprite.frameWidth,
        frameHeight: sprite.frameHeight,
        columns: sprite.columns,
      },
      "meta",
    );
  } catch (error) {
    check.refundIfUnbilled();
    if (error instanceof SpriteAssemblyError) {
      console.warn(`Comimo: sprite assembly failed (${error.message})`);
      return jsonError(502, "The sprite didn't come out right. Comimo keeps the still picture.");
    }
    return modelErrorResponse(error);
  }
}
