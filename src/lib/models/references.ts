import "server-only";
import type { CharacterRole, UnitBox } from "@/lib/types";
import type { CharacterReference } from "./index";
import { isTrustedSheet, verifyFileToken } from "./fileTokens";
import { isSendableImage } from "./meta/image";
import { fromWire, isRecord, isText } from "./wire";

/** Most characters one request may name. */
export const MAX_REFERENCES = 8;
export const ROLES: CharacterRole[] = ["self", "friend", "family", "teacher", "pet", "other"];

/**
 * Characters and their sheets from a request (WireReference[]), shared by
 * /api/panel and /api/outfit/today. Only real PNG/JPEG/WebP sheets this
 * server drew (or the shipped starter sheets) are kept as images; mock SVG
 * sheets are dropped. "stale": a file token this server can't use came
 * without the image; "untrusted": an image this server didn't draw.
 */
export function parseReferences(value: unknown, max = MAX_REFERENCES): CharacterReference[] | "stale" | "untrusted" | null {
  if (!Array.isArray(value) || value.length > max) return null;
  const references: CharacterReference[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const { characterId, name, look, image, sheetToken, fileToken, role, oneOff, box } = item;
    if (!isText(characterId, 100) || !isText(name, 100) || typeof look !== "string" || look.length > 2000) return null;
    if (role !== undefined && !ROLES.includes(role as CharacterRole)) return null;
    const wire = image === undefined ? null : fromWire(image);
    if (image !== undefined && !wire) return null;
    const decoded = wire && isSendableImage(wire) ? wire : null;
    if (decoded && !isTrustedSheet(decoded.data, sheetToken)) return "untrusted";
    const fileId = fileToken === undefined ? null : verifyFileToken(fileToken);
    if (fileToken !== undefined && !fileId && !decoded) return "stale";
    // A one-off sends the earlier panel it first appeared in (signed by imageToken) and where it is in it.
    const at = oneOff === true && isRecord(box) ? (box as unknown as UnitBox) : undefined;
    references.push({
      characterId,
      name,
      look,
      image: decoded,
      ...(fileId ? { fileId } : {}),
      ...(role ? { role: role as CharacterRole } : {}),
      ...(oneOff === true ? { oneOff: true, ...(at ? { box: at } : {}) } : {}),
    });
  }
  return references;
}
