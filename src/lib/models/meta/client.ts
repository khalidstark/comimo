import "server-only";

/**
 * A small fetch client for the Meta Model API (https://api.meta.ai/v1).
 *
 * Server only. The key is read from MODEL_API_KEY on every call, goes into the
 * Authorization header and nowhere else: it is never logged, never put in an
 * error message and never returned to the browser.
 */

const BASE_URL = "https://api.meta.ai/v1";
const DEFAULT_TIMEOUT_MS = 60_000;
/** Statuses worth one more try (the docs list 429, 500 and 503 as transient). */
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
/** Longest wait before the single retry; a longer Retry-After means give up now. */
const MAX_RETRY_WAIT_MS = 5_000;

export type MetaErrorKind = "auth" | "billing" | "busy" | "bad-request" | "not-found" | "timeout" | "server" | "network";

/** What the browser is told, by kind. Short, and never the upstream text. */
const PUBLIC_MESSAGES: Record<MetaErrorKind, string> = {
  auth: "The Meta API key was rejected.",
  billing: "The model credits have run out for now.",
  busy: "The models are busy. Try again in a minute.",
  "bad-request": "The model couldn't use that request.",
  "not-found": "That model isn't available to this key.",
  timeout: "The model took too long. Try again.",
  server: "The model had a problem. Try again.",
  network: "Couldn't reach the models. Try again.",
};

/** HTTP status our own API answers with, by kind. */
const RESPONSE_STATUS: Record<MetaErrorKind, number> = {
  auth: 502,
  billing: 503,
  busy: 503,
  "bad-request": 502,
  "not-found": 502,
  timeout: 504,
  server: 502,
  network: 502,
};

export class MetaApiError extends Error {
  /** Safe to show in the app. */
  readonly publicMessage: string;
  /** Status for Comimo's own API response. */
  readonly responseStatus: number;

  constructor(
    readonly kind: MetaErrorKind,
    /** Upstream HTTP status, null when no response arrived. */
    readonly status: number | null,
    detail: string,
    readonly code: string | null = null,
    /** Seconds the API asked us to wait (Retry-After), when given. */
    readonly retryAfterSec: number | null = null,
  ) {
    super(`Meta API ${status ?? "-"} ${kind}${code ? ` (${code})` : ""}: ${detail}`);
    this.name = "MetaApiError";
    this.publicMessage = PUBLIC_MESSAGES[kind];
    this.responseStatus = RESPONSE_STATUS[kind];
  }
}

export function hasApiKey(): boolean {
  return Boolean(process.env.MODEL_API_KEY?.trim());
}

function apiKey(): string {
  const key = process.env.MODEL_API_KEY?.trim();
  if (!key) throw new MetaApiError("auth", null, "MODEL_API_KEY is not set");
  return key;
}

function kindFor(status: number): MetaErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "billing";
  if (status === 429) return "busy";
  if (status === 404) return "not-found";
  if (status === 503) return "busy";
  if (status === 504) return "timeout";
  if (status >= 500) return "server";
  return "bad-request";
}

function retryAfterSeconds(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, (date - Date.now()) / 1000);
}

/** Build a MetaApiError from a failed response, using the documented `{error: {message, type, code}}` envelope. */
async function errorFrom(response: Response): Promise<MetaApiError> {
  let detail = response.statusText || "request failed";
  let code: string | null = null;
  try {
    const text = await response.text();
    try {
      const body = JSON.parse(text) as { error?: { message?: unknown; type?: unknown; code?: unknown } };
      const error = body?.error;
      if (error && typeof error === "object") {
        if (typeof error.message === "string") detail = error.message;
        if (typeof error.type === "string") detail = `${error.type}: ${detail}`;
        if (typeof error.code === "string") code = error.code;
      }
    } catch {
      if (text) detail = text.slice(0, 300);
    }
  } catch {
    // Keep the status text.
  }
  return new MetaApiError(kindFor(response.status), response.status, detail, code, retryAfterSeconds(response));
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface MetaRequest {
  method?: "GET" | "POST";
  /** Sent as JSON. */
  json?: unknown;
  /** Sent as multipart/form-data (FormData can be re-sent on retry). */
  form?: FormData;
  accept?: string;
  timeoutMs?: number;
  /** The caller's signal, e.g. the incoming request's, so a closed tab stops the call. */
  signal?: AbortSignal;
  /** Extra tries after the first on 429/5xx or a network failure. Default 1. */
  retries?: number;
}

/** One request with a timeout, the bearer key, and one retry with backoff on 429/5xx. */
export async function metaFetch(path: string, request: MetaRequest = {}): Promise<Response> {
  const { method = "GET", json, form, accept = "application/json", timeoutMs = DEFAULT_TIMEOUT_MS, signal, retries = 1 } = request;
  const key = apiKey();

  for (let attempt = 0; ; attempt++) {
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const headers: Record<string, string> = { Authorization: `Bearer ${key}`, Accept: accept };
    if (json !== undefined) headers["Content-Type"] = "application/json";

    let failure: MetaApiError;
    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: json !== undefined ? JSON.stringify(json) : form,
        signal: combined,
        cache: "no-store",
      });
      if (response.ok) return response;
      failure = await errorFrom(response);
      if (!RETRY_STATUSES.has(response.status)) throw failure;
    } catch (error) {
      if (error instanceof MetaApiError) throw error;
      if (signal?.aborted) throw error;
      if (timeout.aborted) throw new MetaApiError("timeout", null, `no response within ${timeoutMs} ms`);
      failure = new MetaApiError("network", null, error instanceof Error ? error.message : "fetch failed");
    }

    if (attempt >= retries) throw failure;
    const asked = failure.retryAfterSec !== null ? failure.retryAfterSec * 1000 : null;
    if (asked !== null && asked > MAX_RETRY_WAIT_MS) throw failure;
    const backoff = asked ?? 600 * 2 ** attempt + Math.round(Math.random() * 400);
    await wait(Math.min(backoff, MAX_RETRY_WAIT_MS), signal);
  }
}

/** metaFetch, then parse the JSON body. */
export async function metaJson<T>(path: string, request: MetaRequest = {}): Promise<T> {
  const response = await metaFetch(path, request);
  try {
    return (await response.json()) as T;
  } catch {
    throw new MetaApiError("server", response.status, "response was not JSON");
  }
}

/** GET /v1/models: the model ids enabled for this key's team. Free. */
export async function listModels(signal?: AbortSignal): Promise<string[]> {
  const body = await metaJson<{ data?: { id?: unknown }[] }>("/models", { signal, timeoutMs: 15_000 });
  return (body.data ?? []).flatMap((model) => (typeof model.id === "string" ? [model.id] : []));
}
