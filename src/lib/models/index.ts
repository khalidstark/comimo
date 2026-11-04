import "server-only";
import type {
  CastBrief,
  CharacterRole,
  GoodThing,
  WeekRequest,
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
import type { CostStep } from "@/lib/costs";
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
  /** The spending meter: call `beforeCall` right before each request to Meta, `charge` after each billed answer. */
  meter?: UsageMeter;
  /** The cost step this call's money goes to, when not the route's own (the face check, redraws). */
  costStep?: CostStep;
}

/** How the script is written. */
export interface ScriptOptions {
  /** Defaults to DEFAULT_STORY_MODE. */
  storyMode?: StoryMode;
  /** The name of the diary the entry is for (03.2-05), when it isn't the daily one. */
  diary?: string;
}

/** A change of clothes in words (03.2-04). */
export interface OutfitText {
  /** What they wear, e.g. "Long olive raincoat, cream sweater, yellow rain boots". */
  clothes: string;
  /** A few words for the wardrobe list, e.g. "Olive raincoat". */
  label: string;
  /** Their whole look with these clothes (face and hair as before). */
  look: string;
}

/** A person cut from one of the day's photos, matched to a cast member, and what they wear. */
export interface PersonMatch extends OutfitText {
  /** Index of the crop in the request. */
  crop: number;
  characterId: string;
  /** 0 to 1. */
  confidence: number;
}

/** Someone SAM found in a photo, in the photo's pixels. */
export interface PhotoPerson {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
}

export type ModelMethod = "transcribe" | "writeScript" | "drawReferenceSheet" | "drawPanel" | "checkConsistency" | "outfit" | "week";

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
  /** Every person in a photo (SAM 3.1, "person"). */
  findPeople(photo: ModelImage & { width: number; height: number }, context?: ModelCallContext): Promise<PhotoPerson[]>;
  /** A character's new clothes in words, from typed text and/or a photo crop; null when there are none to go on. */
  writeOutfit(base: { name: string; look: string }, input: { clothes?: string; photo?: ModelImage | null }, context?: ModelCallContext): Promise<OutfitText | null>;
  /** A character's sheet redrawn in new clothes (the crop, when given, shows the clothes). */
  drawOutfitSheet(
    subject: SheetSubject,
    sheet: Pick<CharacterReference, "image" | "fileId">,
    clothes: string,
    photo: ModelImage | null,
    context?: ModelCallContext,
  ): Promise<{ image: ModelImage; photoRefused: boolean }>;
  /** Which cast member each person cut from the day's photos is, and what they wear. */
  matchPeople(crops: ModelImage[], references: CharacterReference[], context?: ModelCallContext): Promise<PersonMatch[]>;
  /** The good things of the week, from its comics (03.2-05). */
  writeWeek(week: WeekRequest, context?: ModelCallContext): Promise<{ headline: string; goodThings: GoodThing[]; line: string }>;
}

/** Thrown when a voice note or other input can't be sent to a model as it is. */
export class ModelInputError extends Error {
  constructor(
    message: string,
    /** The reason for the browser, e.g. "audio" when only a new recording can help. */
    readonly code?: string,
  ) {
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
