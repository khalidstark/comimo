import { artStyleOf, isArtStyleId } from "@/lib/artStyles";
import { guard, guardResponse } from "@/lib/guard";
import { requireSession } from "@/lib/server/session";
import { isMockMode, type CharacterReference } from "@/lib/models";
import { isTrustedSheet, verifyFileToken } from "@/lib/models/fileTokens";
import { drawCoverArt, writeCoverConcept } from "@/lib/models/meta/cover";
import { isMissingFileError, isSendableImage } from "@/lib/models/meta/image";
import { fromWire, isRecord, isText, json, jsonError, modelErrorResponse, toWire } from "@/lib/models/wire";
import { readBoundedJson } from "@/lib/requestBody";
import type { ApiError, CoverResponse } from "@/lib/types";

/** Muse Spark, then Muse Image (which can take a minute or two), plus one retry. */
export const maxDuration = 300;

/** Up to three inline reference sheets (each well under 1 MB) and the month's titles. */
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_STARS = 3;
const MAX_TITLES = 31;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** The cover's stars: sheets this server drew (or the shipped starter sheets), or uploaded files it signed. */
function parseStars(value: unknown): CharacterReference[] | "untrusted" | "stale" | null {
  if (!Array.isArray(value) || value.length > MAX_STARS) return null;
  const stars: CharacterReference[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const { characterId, name, look, image, sheetToken, fileToken } = item;
    if (!isText(characterId, 100) || !isText(name, 100) || typeof look !== "string" || look.length > 2000) return null;
    const wire = image === undefined ? null : fromWire(image);
    if (image !== undefined && !wire) return null;
    const decoded = wire && isSendableImage(wire) ? wire : null;
    if (decoded && !isTrustedSheet(decoded.data, sheetToken)) return "untrusted";
    const fileId = fileToken === undefined ? null : verifyFileToken(fileToken);
    if (fileToken !== undefined && !fileId && !decoded) return "stale";
    stars.push({ characterId, name: name.trim(), look: look.trim(), image: decoded, ...(fileId ? { fileId } : {}) });
  }
  return stars;
}

/**
 * POST /api/cover
 * JSON: { month: "YYYY-MM", titles: string[], cast: WireReference[] (at most 3, narrator first), style? }
 * Muse Spark writes a cover concept and a cover line from the month's titles;
 * Muse Image paints it starring the cast, from their reference sheets. The
 * browser keeps the result, so each month is drawn once. Mock mode answers
 * 503 "unavailable" and the issue keeps the shipped cover art.
 */
export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const read = await readBoundedJson(request, MAX_BODY_BYTES);
  if (!read.ok) return read.response;
  const body = read.value;
  if (!isRecord(body)) return jsonError(400, "Send JSON like {\"month\": \"2026-10\", \"titles\": [...], \"cast\": [...]}.");

  const { month, titles, cast, style } = body;
  if (typeof month !== "string" || !MONTH.test(month)) return jsonError(400, "`month` must look like 2026-10.");
  if (!Array.isArray(titles) || titles.length === 0 || titles.length > MAX_TITLES || !titles.every((title) => isText(title, 120))) {
    return jsonError(400, "`titles` must list the month's comic titles (1 to 31).");
  }
  if (style !== undefined && !isArtStyleId(style)) return jsonError(400, "`style` must be one of Comimo's art styles.");
  const stars = parseStars(cast ?? []);
  if (stars === "untrusted") return jsonError(400, "That reference sheet wasn't drawn by Comimo. Redraw it from the cast screen.");
  if (stars === "stale" || stars === null) {
    return Response.json({ error: "Send the cast's sheets again.", code: "stale-reference" } satisfies ApiError, {
      status: stars === "stale" ? 409 : 400,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (isMockMode()) {
    return Response.json({ error: "Drawing a cover needs the real models.", code: "unavailable" } satisfies ApiError, {
      status: 503,
      headers: { "Cache-Control": "no-store", "X-Comimo-Mode": "mock" },
    });
  }

  // One text and one image call; the image is counted against the daily cap by the meter as it is sent.
  const check = await guard(request, "cover", { real: true });
  if (!check.ok) return guardResponse(check);

  try {
    const context = { visitorId: check.visitorId, signal: request.signal, meter: check.meter };
    const label = monthFormat.format(new Date(`${month}-01T00:00:00Z`));
    const concept = await writeCoverConcept(label, (titles as string[]).map((title) => title.trim()), stars, context);
    let image;
    try {
      image = await drawCoverArt(concept.scene, stars, artStyleOf(style), context);
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
      return Response.json({ error: "Send the cast's sheets again.", code: "stale-reference" } satisfies ApiError, {
        status: 409,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return json<CoverResponse>({ mode: "meta", image: toWire(image), tagline: concept.tagline }, "meta");
  } catch (error) {
    check.refundIfUnbilled();
    return modelErrorResponse(error);
  }
}
