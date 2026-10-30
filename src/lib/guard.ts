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
 *   COMIMO_COMICS_PER_HOUR   comics per visitor per hour (default 5)
 *   COMIMO_DAILY_COMIC_CAP   comics per day for everyone (default 200)
 *   COMIMO_DAILY_IMAGE_CAP   image calls per day for everyone (default 300)
 *   COMIMO_PAUSE_GENERATION  "1" pauses all real calls
 *   COMIMO_GUARD_SALT        salt for the visitor hash (default: random per process)
 */

export type GuardAction = "transcribe" | "script" | "panel";

export type GuardResult =
  | { ok: true; visitorId: string; undo: () => void }
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
    } satisfies Record<GuardAction, number>,
    dailyComics: envInt("COMIMO_DAILY_COMIC_CAP", 200),
    dailyImages: envInt("COMIMO_DAILY_IMAGE_CAP", 300),
  };
}

const salt = process.env.COMIMO_GUARD_SALT || randomBytes(16).toString("hex");
const visitors = new Map<string, Record<GuardAction, number[]>>();
const daily = { day: "", comics: 0, images: 0 };

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
  }
}

/** The caller's IP as the proxy reports it. Vercel sets x-forwarded-for. */
function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "local";
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
}

function minutes(seconds: number): string {
  const m = Math.max(1, Math.ceil(seconds / 60));
  return `${m} minute${m === 1 ? "" : "s"}`;
}

/**
 * Check and count one call. `real` is false for mock calls, which pass
 * untouched. `images` is how many image calls this request may make.
 * Call `undo()` if the model call failed, so a retry isn't charged twice.
 */
export function guard(request: Request, action: GuardAction, options: { real: boolean; images?: number }): GuardResult {
  const id = visitorId(request);
  if (!options.real) return { ok: true, visitorId: id, undo: () => {} };

  if (process.env.COMIMO_PAUSE_GENERATION === "1") {
    return { ok: false, status: 503, error: "Making new comics is paused right now. The sample days still work.", retryAfterSec: 3600 };
  }

  const now = Date.now();
  const { hourly, dailyComics, dailyImages } = limits();
  rollDay();

  const images = action === "panel" ? (options.images ?? 1) : 0;
  if (action === "script" && daily.comics >= dailyComics) {
    return { ok: false, status: 503, error: "Comimo has made all the comics it can for today. Come back tomorrow.", retryAfterSec: secondsToTomorrow() };
  }
  if (images > 0 && daily.images + images > dailyImages) {
    return { ok: false, status: 503, error: "Comimo has drawn all the panels it can for today. Come back tomorrow.", retryAfterSec: secondsToTomorrow() };
  }

  sweep(now);
  const counts = visitors.get(id) ?? { transcribe: [], script: [], panel: [] };
  const recent = counts[action].filter((t) => now - t < HOUR_MS);
  if (recent.length >= hourly[action]) {
    const retryAfterSec = Math.ceil((recent[0] + HOUR_MS - now) / 1000);
    return {
      ok: false,
      status: 429,
      error: `That's a lot of comics for one hour. Try again in ${minutes(retryAfterSec)}.`,
      retryAfterSec,
    };
  }

  recent.push(now);
  counts[action] = recent;
  visitors.set(id, counts);
  if (action === "script") daily.comics += 1;
  daily.images += images;

  let undone = false;
  const day = daily.day;
  return {
    ok: true,
    visitorId: id,
    undo: () => {
      if (undone) return;
      undone = true;
      const index = counts[action].lastIndexOf(now);
      if (index >= 0) counts[action].splice(index, 1);
      if (daily.day !== day) return;
      if (action === "script") daily.comics = Math.max(0, daily.comics - 1);
      daily.images = Math.max(0, daily.images - images);
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
