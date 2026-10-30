import "server-only";
import type {
  CastBrief,
  ComicScript,
  LanguageHint,
  ModelMode,
  ScriptPanel,
  Transcript,
} from "@/lib/types";
import { mockModels } from "./mock";

/**
 * The one interface every model call goes through. API routes ask
 * `getModels()` for an implementation and never know which one they got:
 * fixtures in mock mode now, the Meta Model API from Phase 3.
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

export interface ComicModels {
  readonly mode: ModelMode;
  /** Voice note to text, Arabic, English or mixed. */
  transcribe(audio: AudioInput): Promise<Transcript>;
  /** Transcript to a comic script with mood, heavy-day and safety flags. */
  writeScript(transcript: string, cast: CastBrief[]): Promise<ComicScript>;
  /** Draw one panel using the reference sheets of the characters in it. */
  drawPanel(panel: ScriptPanel, references: CharacterReference[]): Promise<ModelImage>;
  /** Find characters that drifted from their reference sheet and redraw them. */
  checkConsistency(image: ModelImage, references: CharacterReference[]): Promise<ConsistencyResult>;
}

/** Thrown when the real models are selected but not built yet. */
export class ModelsNotConnectedError extends Error {
  constructor() {
    super("The Meta model pipeline isn't connected yet. Set COMIMO_MOCK=1 to use mock mode.");
    this.name = "ModelsNotConnectedError";
  }
}

function notConnected(): never {
  throw new ModelsNotConnectedError();
}

/** Placeholder for the Phase 3 Meta client. Makes no network calls. */
const metaModels: ComicModels = {
  mode: "meta",
  transcribe: async () => notConnected(),
  writeScript: async () => notConnected(),
  drawPanel: async () => notConnected(),
  checkConsistency: async () => notConnected(),
};

/** Mock mode is on when COMIMO_MOCK=1 or when there is no API key. */
export function isMockMode(): boolean {
  if (process.env.COMIMO_MOCK === "1") return true;
  return !process.env.MODEL_API_KEY?.trim();
}

export function getModels(): ComicModels {
  return isMockMode() ? mockModels : metaModels;
}
