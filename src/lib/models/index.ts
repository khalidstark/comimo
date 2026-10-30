import "server-only";
import type {
  CastBrief,
  ComicScript,
  LanguageHint,
  ModelMode,
  ScriptPanel,
  Transcript,
} from "@/lib/types";
import type { UsageMeter } from "@/lib/guard";
import { metaModels } from "./meta";
import { mockModels } from "./mock";

/**
 * The one interface every model call goes through. API routes ask
 * `getModels()` for an implementation and never know which one they got:
 * fixtures in mock mode, the Meta Model API otherwise (src/lib/models/meta).
 *
 * Server only. The API key is read here and never leaves the server.
 */

/** Raw image bytes as a model returns them. */
export interface ModelImage {
  mimeType: string;
  data: Uint8Array;
}

export interface AudioInput {
  mimeType: string;
  data: Uint8Array;
  languageHint: LanguageHint;
  /** Names worth hearing right, e.g. the cast. */
  keywords?: string[];
}

/** A character's look and reference sheet, given to the image and SAM calls. */
export interface CharacterReference {
  characterId: string;
  name: string;
  look: string;
  image: ModelImage | null;
}

export interface ConsistencyResult {
  /** Characters whose look drifted from their reference sheet. */
  driftedCharacterIds: string[];
  /** The panel with drifted characters redrawn; null when nothing drifted. */
  fixedImage: ModelImage | null;
}

/** Who is asking, and when to give up. Passed by the API routes. */
export interface ModelCallContext {
  /** Hashed visitor id from the spending guard; sent to Meta as `safety_identifier`. */
  visitorId?: string;
  /** The incoming request's signal, so a closed tab stops the upstream call. */
  signal?: AbortSignal;
  /** The spending meter: call `beforeCall` right before each request to Meta. */
  meter?: UsageMeter;
}

export type ModelMethod = "transcribe" | "writeScript" | "drawPanel" | "checkConsistency";

export interface ComicModels {
  readonly mode: ModelMode;
  /**
   * Which implementation answers each method. The Meta models are connected
   * one at a time, so a method not built yet still answers from the mock.
   */
  readonly sources: Readonly<Record<ModelMethod, ModelMode>>;
  /** Voice note to text, Arabic, English or mixed. */
  transcribe(audio: AudioInput, context?: ModelCallContext): Promise<Transcript>;
  /** Transcript to a comic script with mood, heavy-day and safety flags. */
  writeScript(transcript: string, cast: CastBrief[], context?: ModelCallContext): Promise<ComicScript>;
  /** Draw one panel using the reference sheets of the characters in it. */
  drawPanel(panel: ScriptPanel, references: CharacterReference[], context?: ModelCallContext): Promise<ModelImage>;
  /** Find characters that drifted from their reference sheet and redraw them. */
  checkConsistency(image: ModelImage, references: CharacterReference[], context?: ModelCallContext): Promise<ConsistencyResult>;
}

/** Thrown when a voice note or other input can't be sent to a model as it is. */
export class ModelInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelInputError";
  }
}

/** Mock mode is on when COMIMO_MOCK=1 or when there is no API key. */
export function isMockMode(): boolean {
  if (process.env.COMIMO_MOCK === "1") return true;
  return !process.env.MODEL_API_KEY?.trim();
}

export function getModels(): ComicModels {
  return isMockMode() ? mockModels : metaModels;
}
