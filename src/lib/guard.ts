import "server-only";
import { after } from "next/server";
import { getKV, type KV } from "@/lib/server/kv";
import { hit, minutesText, windowOf } from "@/lib/server/rateLimit";
import { hashTag } from "@/lib/server/request";
import { sessionAccount, type SessionAccount } from "@/lib/server/session";

/**
 * Spending guard for the real model calls.
 *
 * - Per account: a few comics an hour, with room for retries on the
 *   transcribe and panel steps. Every generation route needs a signed-in
 *   account (requireSession), and sign-ups are capped per IP, so making more
 *   accounts doesn't buy more drawing.
 * - Global per UTC day: a ceiling on comics (script calls) and on image calls.
 * - Kill switch: COMIMO_PAUSE_GENERATION=1 stops every real call.
 *
 * Counters live in the shared KV store (Upstash in production), so every
 * server instance sees the same counts and a cold start resets nothing.
 * Hourly limits use fixed clock-hour windows.
 *
 * Mock calls cost nothing, so they are never limited.
 *
 * Env (all optional):
 *   COMIMO_COMICS_PER_HOUR   comics per account per hour (default 5; reference sheets get twice that,
 *                            sprites the same, photo descriptions half)
 *   COMIMO_DAILY_COMIC_CAP   comics per day for everyone (default 200)
 *   COMIMO_DAILY_IMAGE_CAP   image and SAM calls per day for everyone (default 600), counted per call
 *   COMIMO_DAILY_UPLOAD_CAP  reference-sheet uploads per day for everyone (default 300); per account 4x comics an hour
 *   COMIMO_PAUSE_GENERATION  "1" pauses all real calls
 *   COMIMO_GUARD_SALT        salt for hashed ids (account tag sent to Meta, IP tags); set it in production
 */

/**
 * `sprite`: five image calls animating one character. `photo`: one SAM and one vision call describing a reference photo.
 * `cover`: one text and one image call drawing a month's magazine cover.
 * `caption`: one vision call suggesting captions for an album's photos (only when the owner asks).
 */
export type GuardAction = "transcribe" | "script" | "panel" | "character" | "sprite" | "photo" | "cover" | "caption";

/**
 * Kinds of upstream call. Image and SAM calls count against the daily image
 * cap; reference uploads to the Files API against the daily and per-account upload caps.
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

/** An upload cap was reached; the caller sends the sheet inline instead. */
export class UploadCapError extends Error {
  constructor() {
    super("Reference upload limit reached");
    this.name = "UploadCapError";
  }
}

export type GuardResult =
  | {
      ok: true;
      /** A salted hash of the account id: stable, not reversible. Fits `safety_identifier` (64 chars). */
      visitorId: string;
      meter: UsageMeter;
      /** Give back the account's slot, but only if nothing billable was sent. */
      refundIfUnbilled: () => void;
    }
  | { ok: false; status: 401 | 429 | 503; error: string; retryAfterSec: number };

const HOUR_SEC = 60 * 60;
const DAY_SEC = 24 * HOUR_SEC;

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
      // Up to 18 panels a comic (3 pages of 6), plus a few retries.
      panel: comics * 22,
      // Reference sheets: a few new characters (or redraws) an hour.
      character: comics * 2,
      // Animating a character is five images: about one new character per comic.
      sprite: comics,
      // Describing a person from a photo: a few new people an hour.
      photo: Math.max(1, Math.ceil(comics / 2)),
      // A month's cover is drawn once; a couple more for a redraw or a second device.
      cover: Math.max(1, Math.ceil(comics / 2)),
      // Caption suggestions: a few albums an hour.
      caption: Math.max(1, Math.ceil(comics / 2)),
    } satisfies Record<GuardAction, number>,
    // Reference-sheet uploads: a few per comic (one per character), more only on stale tokens.
    uploadsPerHour: comics * 4,
    dailyComics: envInt("COMIMO_DAILY_COMIC_CAP", 200),
    // Room for about 30 three-page comics a day (each panel is one image call, more with face fixes).
    dailyImages: envInt("COMIMO_DAILY_IMAGE_CAP", 600),
    dailyUploads: envInt("COMIMO_DAILY_UPLOAD_CAP", 300),
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function secondsToTomorrow(): number {
  const now = new Date();
  const tomorrow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.ceil((tomorrow - now.getTime()) / 1000);
}

/** Daily counters for everyone, kept two days so the rollover is never early. */
function dayKey(what: "comics" | "images" | "uploads"): string {
  return `guard:day:${today()}:${what}`;
}

function accountKey(account: SessionAccount, what: string): string {
  return `guard:acct:${account.id}:${what}`;
}

/** The account's hourly upload counter (fixed clock-hour window). */
function uploadHourKey(account: SessionAccount): string {
  return `${accountKey(account, "upload")}:${windowOf(HOUR_SEC).index}`;
}

/** The tag Meta sees for this account: a salted hash, never the id or email. */
export function accountTag(account: SessionAccount): string {
  return hashTag("account", account.id);
}

const DOWN: Extract<GuardResult, { ok: false }> = {
  ok: false,
  status: 503,
  error: "Comimo can't check its limits right now. Try again in a minute.",
  retryAfterSec: 60,
};

/** Keep the counter writes alive after the response on serverless hosts. */
function flushAfterResponse(pending: Promise<unknown>[]) {
  try {
    after(async () => {
      while (pending.length) await Promise.allSettled(pending.splice(0));
    });
  } catch {
    // Outside a request (tests): the writes still run, nothing waits for them.
  }
}

/**
 * Counts upstream calls for one request: image and SAM calls go against the
 * daily image cap, uploads against the daily and this account's hourly upload caps.
 *
 * The model code calls `beforeCall` synchronously, so the meter works from
 * the counts read when the request began, adds its own calls, and writes each
 * one to the shared store as it goes (reading back the newest totals). Two
 * requests running at the same moment on different instances can each send
 * a call or two past a cap before they see each other's counts.
 */
function createMeter(
  kv: KV,
  account: SessionAccount,
  start: { images: number; uploads: number; accountUploads: number },
): UsageMeter {
  let billed = false;
  const counts = { ...start };
  const pending: Promise<unknown>[] = [];
  flushAfterResponse(pending);

  function record(key: string, ttlSec: number, onTotal: (total: number) => void) {
    pending.push(
      kv.incr(key, { ttlSec }).then(onTotal, (error: unknown) => {
        console.error(`Comimo: usage counter write failed (${error instanceof Error ? error.name : "unknown"})`);
      }),
    );
  }

  return {
    get billed() {
      return billed;
    },
    beforeCall(kind) {
      const { dailyImages, dailyUploads, uploadsPerHour } = limits();
      if (kind === "image" || kind === "sam") {
        if (counts.images >= dailyImages) throw new SpendCapError();
        counts.images += 1;
        record(dayKey("images"), 2 * DAY_SEC, (total) => (counts.images = Math.max(counts.images, total)));
      }
      if (kind === "upload") {
        if (counts.uploads >= dailyUploads || counts.accountUploads >= uploadsPerHour) throw new UploadCapError();
        counts.uploads += 1;
        counts.accountUploads += 1;
        record(dayKey("uploads"), 2 * DAY_SEC, (total) => (counts.uploads = Math.max(counts.uploads, total)));
        record(uploadHourKey(account), HOUR_SEC + 60, (total) => (counts.accountUploads = Math.max(counts.accountUploads, total)));
      }
      billed = true;
    },
  };
}

/** A meter for mock calls: counts nothing, never blocks. */
function freeMeter(): UsageMeter {
  let billed = false;
  return {
    get billed() {
      return billed;
    },
    beforeCall() {
      billed = true;
    },
  };
}

async function readCount(kv: KV, key: string): Promise<number> {
  return Number.parseInt((await kv.get(key)) ?? "0", 10) || 0;
}

function limitMessage(action: GuardAction, retryAfterSec: number): string {
  const wait = minutesText(retryAfterSec);
  if (action === "character" || action === "sprite") return `That's a lot of drawing for one hour. Try again in ${wait}.`;
  if (action === "photo") return `That's a lot of photos for one hour. Try again in ${wait}.`;
  if (action === "caption") return `That's a lot of captions for one hour. Try again in ${wait}.`;
  return `That's a lot of comics for one hour. Try again in ${wait}.`;
}

/**
 * Check and count one request for the signed-in account. `real` is false for
 * mock calls, which pass untouched (the route still needs a session). Pass
 * `meter` to the model code so each upstream call is recorded as it is sent.
 * After a failure, `refundIfUnbilled()` gives the account's slot back only
 * when no request reached Meta (bad input, a cap hit first).
 */
export async function guard(request: Request, action: GuardAction, options: { real: boolean }): Promise<GuardResult> {
  const kv = getKV();
  let account: SessionAccount | null;
  try {
    account = await sessionAccount(request, kv);
  } catch {
    return DOWN;
  }
  if (!account) return { ok: false, status: 401, error: "Sign in to keep going. It takes a few seconds.", retryAfterSec: 0 };

  const visitorId = accountTag(account);
  if (!options.real) return { ok: true, visitorId, meter: freeMeter(), refundIfUnbilled: () => {} };

  if (process.env.COMIMO_PAUSE_GENERATION === "1") {
    return { ok: false, status: 503, error: "Making new comics is paused right now. The sample days still work.", retryAfterSec: 3600 };
  }

  const { hourly, dailyComics, dailyImages } = limits();
  try {
    const slot = await hit(kv, accountKey(account, action), hourly[action], HOUR_SEC);
    if (!slot.ok) return { ok: false, status: 429, error: limitMessage(action, slot.retryAfterSec), retryAfterSec: slot.retryAfterSec };

    let comicSlot: Awaited<ReturnType<typeof hit>> | null = null;
    if (action === "script") {
      comicSlot = await hit(kv, `guard:day:${today()}:comics`, dailyComics, DAY_SEC);
      if (!comicSlot.ok) {
        await slot.undo();
        return { ok: false, status: 503, error: "Comimo has made all the comics it can for today. Come back tomorrow.", retryAfterSec: secondsToTomorrow() };
      }
    }

    // Starting counts for the meter; only actions that draw or upload need them.
    const draws = action !== "transcribe" && action !== "script";
    const [images, uploads, accountUploads] = draws
      ? await Promise.all([readCount(kv, dayKey("images")), readCount(kv, dayKey("uploads")), readCount(kv, uploadHourKey(account))])
      : [0, 0, 0];
    if (draws && images >= dailyImages) {
      await slot.undo();
      return { ok: false, status: 503, error: "Comimo has drawn all the panels it can for today. Come back tomorrow.", retryAfterSec: secondsToTomorrow() };
    }

    const meter = createMeter(kv, account, { images, uploads, accountUploads });
    let refunded = false;
    return {
      ok: true,
      visitorId,
      meter,
      refundIfUnbilled: () => {
        if (refunded || meter.billed) return;
        refunded = true;
        const undo = Promise.all([slot.undo(), comicSlot?.ok ? comicSlot.undo() : null]).catch(() => {});
        flushAfterResponse([undo]);
      },
    };
  } catch (error) {
    console.error(`Comimo: limit check failed (${error instanceof Error ? error.name : "unknown"})`);
    return DOWN;
  }
}

/** A blocked guard result as an API response. */
export function guardResponse(result: Extract<GuardResult, { ok: false }>): Response {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (result.status !== 401) headers["Retry-After"] = String(Math.max(1, result.retryAfterSec));
  return Response.json(result.status === 401 ? { error: result.error, code: "signin" } : { error: result.error }, {
    status: result.status,
    headers,
  });
}
