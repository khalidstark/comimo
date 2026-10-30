import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { isFileId } from "./meta/image";

/**
 * Two kinds of signed token keep reference sheets honest:
 * - File tokens ("file-123.<mac>"): a sheet uploaded to Meta's Files API is
 *   cached on the device as a token, not a bare id, so a visitor can't point a
 *   panel at somebody else's upload.
 * - Sheet tokens: a MAC over the SHA-256 of a sheet this server drew. A panel
 *   request may only send (and get uploaded) a sheet with a valid sheet token,
 *   or one of the shipped starter sheets, never an arbitrary image.
 *
 * The signing key is derived from MODEL_API_KEY: stable across server
 * instances, secret, and it changes with the key (a new key may be a new team,
 * whose files differ, so old tokens should stop working anyway).
 */

const MAC_LENGTH = 24;

function signingKey(): Buffer | null {
  const key = process.env.MODEL_API_KEY?.trim();
  return key ? createHmac("sha256", key).update("comimo:file-token:v1").digest() : null;
}

function mac(key: Buffer, fileId: string): string {
  return createHmac("sha256", key).update(fileId).digest("base64url").slice(0, MAC_LENGTH);
}

/** A token for the browser to keep, or null without a key. */
export function signFileId(fileId: string): string | null {
  const key = signingKey();
  return key && isFileId(fileId) ? `${fileId}.${mac(key, fileId)}` : null;
}

/** The file id inside a token this server signed, or null for anything else. */
export function verifyFileToken(token: unknown): string | null {
  if (typeof token !== "string" || token.length > 120) return null;
  const at = token.lastIndexOf(".");
  if (at <= 0) return null;
  const fileId = token.slice(0, at);
  const given = Buffer.from(token.slice(at + 1));
  const key = signingKey();
  if (!key || !isFileId(fileId)) return null;
  const expected = Buffer.from(mac(key, fileId));
  return given.length === expected.length && timingSafeEqual(given, expected) ? fileId : null;
}

/* ---------- Sheets this server drew ---------- */

/**
 * SHA-256 of the starter sheets in public/art/cast, both styles (drawn by
 * Muse Image in 03-02 and resized). Update these when those files change.
 */
const STARTER_SHEETS = new Set([
  "6bd0220b7a06222bcca54c0c2c78302a6a3a6fa921a14d1145b5f0f987d7f0f3", // nour
  "b8349040508f74463be3359bde52eebbd16da38fd982a37791865163329a1745", // karim
  "32d5189a2fc821ff5bfdf8f16b81dbb187a18a7d23b47d4f15709df59b94b344", // teta
  "49ec269dfe4e1a9833a6d22f63594605e037eacd1163d9eb1172267a560fcbfb", // mishmish
  "1167da991d265c1b31909bb9363655fc9e7a3df2467208aa5073809d2e836ba8", // nour, painterly
  "b59eda46b88f9d4f4972670020ea12c74502e23b09dbecdf973354271db1df09", // karim, painterly
  "5807c96bed83732ba13db8cc4e6e84cbdd073a49104a21362e84aae5a65e2de3", // teta, painterly
  "37f06258df6a72b72a662cdebceaada7fc65009d81f0176c57a731bb3a152318", // mishmish, painterly
]);

function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** A token proving this server drew these exact bytes, or null without a key. */
export function signSheet(data: Uint8Array): string | null {
  const key = signingKey();
  return key ? mac(key, `sheet:${sha256(data)}`) : null;
}

/** True for a shipped starter sheet, or bytes that match a sheet token this server signed. */
export function isTrustedSheet(data: Uint8Array, token: unknown): boolean {
  const hash = sha256(data);
  if (STARTER_SHEETS.has(hash)) return true;
  const key = signingKey();
  if (!key || typeof token !== "string" || token.length !== MAC_LENGTH) return false;
  const expected = Buffer.from(mac(key, `sheet:${hash}`));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
