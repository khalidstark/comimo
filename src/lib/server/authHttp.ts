import "server-only";
import { readBoundedJson } from "@/lib/requestBody";
import { isSameOrigin } from "./request";
import type { AuthField } from "./auth";

/** Sign-in and sign-up bodies are three short strings. */
const AUTH_BODY_LIMIT = 4 * 1024;

const NO_STORE = { "Cache-Control": "no-store" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function authJson(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

export function authError(status: number, error: string, extra: { field?: AuthField; retryAfterSec?: number } = {}): Response {
  const headers: Record<string, string> = extra.retryAfterSec ? { "Retry-After": String(Math.max(1, extra.retryAfterSec)) } : {};
  return authJson(extra.field ? { error, field: extra.field } : { error }, status, headers);
}

export function storeDown(): Response {
  return authError(503, "Comimo can't reach its account store right now. Try again in a minute.");
}

/** Same-origin check plus a small JSON object body; either the fields or the response to send. */
export async function readAuthBody(request: Request): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  if (!isSameOrigin(request)) return { ok: false, response: authError(403, "That request came from another site.") };
  const read = await readBoundedJson(request, AUTH_BODY_LIMIT);
  if (!read.ok) return read;
  if (!isRecord(read.value)) return { ok: false, response: authError(400, "Send the form as JSON.") };
  return { ok: true, body: read.value };
}

/** Log a store failure by kind only: never the email, password or key. */
export function logStoreError(where: string, error: unknown): void {
  console.error(`Comimo: ${where} failed (${error instanceof Error ? error.name : "unknown"})`);
}
