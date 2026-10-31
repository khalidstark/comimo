import "server-only";
import type {
  CastBrief,
  CharacterRole,
  ComicScript,
  LanguageHint,
  ModelMode,
  PanelFigures,
  PanelFrame,
  SamReport,
  ScriptPanel,
  StoryMode,
  Transcript,
  UnitBox,
} from "@/lib/types";
import type { ArtStyleId } from "@/lib/artStyles";
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
  /** The sheet in Meta's Files API (already verified); used instead of `image` when set. */
  fileId?: string;
  /** "pet" characters are found and judged as animals. Missing from older clients. */
  role?: CharacterRole;
  /**
   * A one-off character (03-06): drawn for one story only, with no sheet. Their
   * `image`, when there is one, is a cut-out of the panel they first appeared in.
   */
  oneOff?: boolean;
  /** One-offs only: where they are in `image` (a whole earlier panel) until it is cut out (see oneOff.ts). */
  box?: UnitBox;
}

/** Who a reference sheet is drawn for. */
export interface SheetSubject {
  characterId: string;
  name: string;
  role: CharacterRole;
  look: string;
  style: ArtStyleId;
}

/** How a panel is drawn: its slot's frame on the page and the comic's art style. */
export interface PanelOptions {
  frame: PanelFrame;
  style: ArtStyleId;
  /** Corrections for a redraw after a failed face check ("Karim: olive bomber jacket, not grey"). */
  fixes?: string[];
}

/** What the consistency check needs besides the image: the panel it is, drawn how. */
export interface ConsistencyOptions extends PanelOptions {
  panel: ScriptPanel;
}

export interface ConsistencyResult {
  /** Characters whose look drifted from their reference sheet. */
  driftedCharacterIds: string[];
  /** Drifted characters a redraw fixed (judged a match afterwards). */
  fixedCharacterIds: string[];
  /** The panel with drifted characters redrawn; null when nothing was fixed. */
  fixedImage: ModelImage | null;
  /** "sam" when SAM 3.1 checked the panel, "mock" in practice mode. */
  method: "sam" | "mock";
  sam?: SamReport;
  /** Everyone SAM found in the final image. */
  figures?: PanelFigures;
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

/** How the script is written. */
export interface ScriptOptions {
  /** Defaults to DEFAULT_STORY_MODE. */
  storyMode?: StoryMode;
}

export type ModelMethod = "transcribe" | "writeScript" | "drawReferenceSheet" | "drawPanel" | "checkConsistency";

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
  writeScript(transcript: string, cast: CastBrief[], context?: ModelCallContext, options?: ScriptOptions): Promise<ComicScript>;
  /** Draw a character's reference sheet in a style: front and three-quarter views, full body, plain background. */
  drawReferenceSheet(subject: SheetSubject, context?: ModelCallContext): Promise<ModelImage>;
  /** Upload a reference sheet once so panels can point at it by id. Null when uploads aren't available. */
  uploadReference(image: ModelImage, context?: ModelCallContext): Promise<string | null>;
  /** Draw one panel using the reference sheets of the characters in it. */
  drawPanel(panel: ScriptPanel, references: CharacterReference[], options: PanelOptions, context?: ModelCallContext): Promise<ModelImage>;
  /** Find characters that drifted from their reference sheet and redraw them. */
  checkConsistency(image: ModelImage, references: CharacterReference[], options: ConsistencyOptions, context?: ModelCallContext): Promise<ConsistencyResult>;
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
