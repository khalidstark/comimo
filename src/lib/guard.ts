import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * Spending guard for the real model calls.
 *
 * - Per visitor (a salted hash of the IP, never the IP itself): a few comics an
 *   hour, with room for retries on the transcribe and panel steps.
 * - Global per UTC day: a ceiling on comics (script calls) and on image calls.
 * - Kill switch: COMIMO_PAUSE_GENERATION=1 stops every real call.
 *
 * Mock calls cost nothing, so they are never limited.
 *
 * Counters live in this server's memory. On Vercel each instance keeps its own
 * counts and they reset on a cold start, so the real ceiling is a multiple of
 * these numbers. Phase 5 decides whether to move them to a shared store.
 *
 * Env (all optional):
 *   COMIMO_COMICS_PER_HOUR   comics per visitor per hour (default 5; reference sheets get twice that,
 *                            sprites the same, photo descriptions half)
 *   COMIMO_DAILY_COMIC_CAP   comics per day for everyone (default 200)
 *   COMIMO_DAILY_IMAGE_CAP   image and SAM calls per day for everyone (default 300), counted per call
 *   COMIMO_DAILY_UPLOAD_CAP  reference-sheet uploads per day for everyone (default 300); per visitor 4x comics an hour
 *   COMIMO_PAUSE_GENERATION  "1" pauses all real calls
 *   COMIMO_GUARD_SALT        salt for the visitor hash (default: random per process)
 */

/** `sprite`: five image calls animating one character. `photo`: one SAM and one vision call describing a reference photo. */
export type GuardAction = "transcribe" | "script" | "panel" | "character" | "sprite" | "photo";

/**
 * Kinds of upstream call. Image and SAM calls count against the daily image
 * cap; reference uploads to the Files API against the daily and per-visitor upload caps.
 */
export type UpstreamCall = "transcribe" | "text" | "image" | "sam" | "upload";

/**
 * Handed to the model code with each request. `beforeCall` runs right before
 * every request to Meta (retries included): it marks the request as billed and
 * counts image and SAM calls against the daily cap, throwing SpendCapError
 * when the cap is reached so the call is never sent.
 */
export interface UsageMeter {
  beforeCall(kind: UpstreamCall): void;
  /** True once any upstream request has been sent. */
  readonly billed: boolean;
}

/** A daily cap was reached in the middle of a request. */
export class SpendCapError extends Error {
  readonly retryAfterSec = secondsToTomorrow();
  constructor() {
    super("Comimo has drawn all the panels it can for today. Come back tomorrow.");
    this.name = "SpendCapError";
  }
}

export type GuardResult =
  | {
      ok: true;
      visitorId: string;
      meter: UsageMeter;
      /** Give back the visitor's slot, but only if nothing billable was sent. */
      refundIfUnbilled: () => void;
    }
  | { ok: false; status: 429 | 503; error: string; retryAfterSec: number };

const HOUR_MS = 60 * 60 * 1000;
/** Visitors remembered before old entries are swept. */
const MAX_VISITORS = 5_000;

function envInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function limits() {
  const comics = envInt("COMIMO_COMICS_PER_HOUR", 5);
  return {
    hourly: {
      script: comics,
      // A retry after a failed step shouldn't eat a whole comic.
      transcribe: comics * 2,
      // Up to 6 panels a comic, plus retries.
      panel: comics * 8,
      // Reference sheets: a few new characters (or redraws) an hour.
      character: comics * 2,
      // Animating a character is five images: about one new character per comic.
      sprite: comics,
      // Describing a person from a photo: a few new people an hour.
      photo: Math.max(1, Math.ceil(comics / 2)),
    } satisfies Record<GuardAction, number>,
    // Reference-sheet uploads: a few per comic (one per character), more only on stale tokens.
    uploadsPerHour: comics * 4,
    dailyComics: envInt("COMIMO_DAILY_COMIC_CAP", 200),
    dailyImages: envInt("COMIMO_DAILY_IMAGE_CAP", 300),
    dailyUploads: envInt("COMIMO_DAILY_UPLOAD_CAP", 300),
  };
}

const salt = process.env.COMIMO_GUARD_SALT || randomBytes(16).toString("hex");
const visitors = new Map<string, Record<GuardAction, number[]>>();
/** Upload times per visitor in the last hour. */
const visitorUploads = new Map<string, number[]>();
const daily = { day: "", comics: 0, images: 0, uploads: 0 };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function secondsToTomorrow(): number {
  const now = new Date();
  const tomorrow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.ceil((tomorrow - now.getTime()) / 1000);
}

function rollDay() {
  const day = today();
  if (daily.day !== day) {
    daily.day = day;
    daily.comics = 0;
    daily.images = 0;
    daily.uploads = 0;
  }
}

/**
 * The caller's IP, only from a source the visitor can't set.
 *
 * On Vercel (VERCEL=1 at runtime) the platform overwrites X-Forwarded-For and
 * sets X-Vercel-Forwarded-For "to prevent IP spoofing" (vercel.com/docs/headers/request-headers),
 * so those are trusted there. Anywhere else these headers come straight from
 * the client, so every caller counts as "local" and the global daily caps do
 * the limiting. X-Real-IP is never read.
 */
function clientIp(request: Request): string {
  if (process.env.VERCEL !== "1") return "local";
  const header = request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for");
  return header?.split(",")[0]?.trim() || "local";
}

/** A salted hash of the IP: stable within this server, not reversible to the IP. Fits `safety_identifier` (64 chars). */
export function visitorId(request: Request): string {
  return createHash("sha256").update(`${salt}:${clientIp(request)}`).digest("hex").slice(0, 32);
}

function sweep(now: number) {
  if (visitors.size < MAX_VISITORS) return;
  for (const [id, counts] of visitors) {
    const active = Object.values(counts).some((times) => times.some((t) => now - t < HOUR_MS));
    if (!active) visitors.delete(id);
  }
  for (const [id, times] of visitorUploads) if (!times.some((t) => now - t < HOUR_MS)) visitorUploads.delete(id);
}

function minutes(seconds: number): string {
  const m = Math.max(1, Math.ceil(seconds / 60));
  return `${m} minute${m === 1 ? "" : "s"}`;
}

/** An upload cap was reached; the caller sends the sheet inline instead. */
export class UploadCapError extends Error {
  constructor() {
    super("Reference upload limit reached");
    this.name = "UploadCapError";
  }
}

/**
 * Counts upstream calls for one request: image and SAM calls go against the
 * daily image cap, uploads against the daily and this visitor's hourly upload caps.
 */
function createMeter(visitor: string): UsageMeter {
  let billed = false;
  return {
    get billed() {
      return billed;
    },
    beforeCall(kind) {
      if (kind === "image" || kind === "sam") {
        rollDay();
        if (daily.images >= limits().dailyImages) throw new SpendCapError();
        daily.images += 1;
      }
      if (kind === "upload") {
        rollDay();
        const now = Date.now();
        const recent = (visitorUploads.get(visitor) ?? []).filter((t) => now - t < HOUR_MS);
        const { dailyUploads, uploadsPerHour } = limits();
        if (daily.uploads >= dailyUploads || recent.length >= uploadsPerHour) throw new UploadCapError();
        daily.uploads += 1;
        recent.push(now);
        visitorUploads.set(visitor, recent);
      }
      billed = true;
    },
  };
}

/**
 * Check and count one request. `real` is false for mock calls, which pass
 * untouched. Pass `meter` to the model code so each upstream call is recorded
 * as it is sent. After a failure, `refundIfUnbilled()` gives the visitor's
 * slot back only when no request reached Meta (bad input, a cap hit first).
 */
export function guard(request: Request, action: GuardAction, options: { real: boolean }): GuardResult {
  const id = visitorId(request);
  if (!options.real) return { ok: true, visitorId: id, meter: createMeter(id), refundIfUnbilled: () => {} };

  if (process.env.COMIMO_PAUSE_GENERATION === "1") {
    return { ok: false, status: 503, error: "Making new comics is paused right now. The sample days still work.", retryAfterSec: 3600 };
  }

  const now = Date.now();
  const { hourly, dailyComics, dailyImages } = limits();
  rollDay();

  if (action === "script" && daily.comics >= dailyComics) {
    return { ok: false, status: 503, error: "Comimo has made all the comics it can for today. Come back tomorrow.", retryAfterSec: secondsToTomorrow() };
  }
  if (action !== "transcribe" && action !== "script" && daily.images >= dailyImages) {
    return { ok: false, status: 503, error: "Comimo has drawn all the panels it can for today. Come back tomorrow.", retryAfterSec: secondsToTomorrow() };
  }

  sweep(now);
  const counts = visitors.get(id) ?? { transcribe: [], script: [], panel: [], character: [], sprite: [], photo: [] };
  // Visitors counted before these actions existed lack their lists.
  counts[action] ??= [];
  const recent = counts[action].filter((t) => now - t < HOUR_MS);
  if (recent.length >= hourly[action]) {
    const retryAfterSec = Math.ceil((recent[0] + HOUR_MS - now) / 1000);
    return {
      ok: false,
      status: 429,
      error:
        action === "character" || action === "sprite"
          ? `That's a lot of drawing for one hour. Try again in ${minutes(retryAfterSec)}.`
          : action === "photo"
            ? `That's a lot of photos for one hour. Try again in ${minutes(retryAfterSec)}.`
          : `That's a lot of comics for one hour. Try again in ${minutes(retryAfterSec)}.`,
      retryAfterSec,
    };
  }

  recent.push(now);
  counts[action] = recent;
  visitors.set(id, counts);
  if (action === "script") daily.comics += 1;

  const meter = createMeter(id);
  let refunded = false;
  const day = daily.day;
  return {
    ok: true,
    visitorId: id,
    meter,
    refundIfUnbilled: () => {
      if (refunded || meter.billed) return;
      refunded = true;
      const index = counts[action].lastIndexOf(now);
      if (index >= 0) counts[action].splice(index, 1);
      if (action === "script" && daily.day === day) daily.comics = Math.max(0, daily.comics - 1);
    },
  };
}

/** A blocked guard result as an API response. */
export function guardResponse(result: Extract<GuardResult, { ok: false }>): Response {
  return Response.json(
    { error: result.error },
    {
      status: result.status,
      headers: { "Cache-Control": "no-store", "Retry-After": String(Math.max(1, result.retryAfterSec)) },
    },
  );
}
