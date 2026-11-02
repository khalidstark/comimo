/**
 * What each Meta model call costs, in one place (dev.meta.ai/docs/pricing-rate-limits,
 * standard prices). Every log line and every cost record is computed from
 * this table, so a price change is one edit here.
 *
 * Pure (no server-only): the unit tests read it too.
 */

import type { ModelCallContext } from "../index";

/** The model versions Comimo calls; stored with each comic's cost so later price or model changes can be told apart. */
export const MODEL_IDS = {
  spark: "muse-spark-1.3",
  image: "muse-image-1.0",
  sam: "sam-3.1",
  transcribe: "muse-voice-transcribe-1.0",
} as const;

export const PRICES = {
  /** Muse Spark, per token. Cached input is the part of the prompt the API served from its cache. */
  spark: { input: 1.25e-6, cached: 0.15e-6, output: 4.25e-6 },
  /** Muse Image, per image returned (generations and edits; reasoning strength doesn't change it). */
  image: 0.01,
  /** SAM 3.1, per image segmented (one noun phrase per request). */
  sam: 0.0025,
  /** Muse Voice Transcribe: $0.18 an audio hour, billed in whole seconds. */
  transcribePerSecond: 0.18 / 3600,
  /** Files API uploads are free. */
  upload: 0,
} as const;

/** Token counts from a Spark answer; chat completions and Responses name them differently. */
export interface SparkUsage {
  input: number;
  /** Of `input`, the tokens served from the prompt cache. */
  cached: number;
  output: number;
}

interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

interface ResponsesUsage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
}

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0);

/** Spark usage from either API's `usage` object; missing fields count as 0. */
export function sparkUsage(usage: ChatUsage | ResponsesUsage | undefined | null): SparkUsage {
  const chat = (usage ?? {}) as ChatUsage;
  const responses = (usage ?? {}) as ResponsesUsage;
  const input = count(chat.prompt_tokens ?? responses.input_tokens);
  const cached = Math.min(input, count(chat.prompt_tokens_details?.cached_tokens ?? responses.input_tokens_details?.cached_tokens));
  return { input, cached, output: count(chat.completion_tokens ?? responses.output_tokens) };
}

/** Dollars for one Spark call. */
export function sparkUsd({ input, cached, output }: SparkUsage): number {
  return (input - cached) * PRICES.spark.input + cached * PRICES.spark.cached + output * PRICES.spark.output;
}

/** Dollars for a transcription of `seconds` (billed in whole seconds). */
export function transcribeUsd(seconds: number): number {
  return Math.ceil(Math.max(0, seconds)) * PRICES.transcribePerSecond;
}

/** "$0.0123" for a log line. */
export function usdText(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

/* ---------- Charging the meter ---------- */

/** Record a finished Muse Image call on the request's meter. */
export function chargeImage(context: ModelCallContext | undefined): number {
  context?.meter?.charge("image", PRICES.image, context.costStep);
  return PRICES.image;
}

/** Record a finished SAM 3.1 call on the request's meter. */
export function chargeSam(context: ModelCallContext | undefined): number {
  context?.meter?.charge("sam", PRICES.sam, context.costStep);
  return PRICES.sam;
}

/**
 * Record a finished Muse Spark call from its `usage` and log it as
 * "Comimo: <label> used 812 in (0 cached), 140 out (~$0.0016)".
 */
export function chargeSpark(context: ModelCallContext | undefined, usage: Parameters<typeof sparkUsage>[0], label: string): SparkUsage & { usd: number } {
  const tokens = sparkUsage(usage);
  const usd = sparkUsd(tokens);
  context?.meter?.charge("spark", usd, context.costStep);
  console.info(`Comimo: ${label} used ${tokens.input} in (${tokens.cached} cached), ${tokens.output} out (~${usdText(usd)})`);
  return { ...tokens, usd };
}

/** Record a finished transcription of `seconds` on the request's meter. */
export function chargeTranscribe(context: ModelCallContext | undefined, seconds: number): number {
  const usd = transcribeUsd(seconds);
  context?.meter?.charge("transcribe", usd, context.costStep);
  return usd;
}
