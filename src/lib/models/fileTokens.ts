import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { isFileId } from "./meta/image";

/**
 * Reference sheets uploaded to Meta's Files API are cached on the device as a
 * signed token ("file-123.<mac>"), not a bare id. The server only sends ids it
 * issued itself, so a visitor can't point a panel at somebody else's upload.
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
