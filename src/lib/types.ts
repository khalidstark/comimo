import type { ArtPath } from "@/art/manifest";

/**
 * Comimo's data model, shared by the pages, the on-device store and the
 * server API routes.
 *
 * Images never live inside a record. A record holds an ImageRef: either a Blob
 * id in the store's `images` object store, or a slot in the art manifest (used
 * by fixtures and placeholders).
 */

/* ------------------------------------------------------------------ */
/* Basics                                                              */
/* ------------------------------------------------------------------ */

/** Day weather. Shown as a picture and a word, never as a number. */
export const MOODS = ["sunny", "cloudy", "rainy", "stormy", "rainbow"] as const;
export type Mood = (typeof MOODS)[number];

export type LanguageTag = "ar" | "en";

/** Which languages a voice note used. `mixed` is true when both appear. */
export interface LanguageMix {
  spoken: LanguageTag[];
  dominant: LanguageTag;
  mixed: boolean;
}

/** What the speaker told the recorder they would speak. */
export type LanguageHint = "auto" | LanguageTag;

/** Base direction of a line of text. */
export type TextDir = "rtl" | "ltr" | "auto";

/** ISO local date, YYYY-MM-DD. */
export type IsoDate = string;
/** Month key, YYYY-MM. */
export type MonthKey = string;

export type ImageRef =
  /** A Blob in the store's `images` object store. */
  | { kind: "blob"; id: string }
  /** A slot in src/art/manifest.ts (fixtures and placeholders). */
  | { kind: "art"; path: ArtPath };

/* ------------------------------------------------------------------ */
/* Cast                                                                */
/* ------------------------------------------------------------------ */

export type CharacterRole = "self" | "friend" | "family" | "teacher" | "pet" | "other";

export const SPRITE_ANIMATIONS = ["idle", "blink", "talk", "wave"] as const;
export type SpriteAnimationName = (typeof SPRITE_ANIMATIONS)[number];

/** One row of a sprite sheet, played with CSS steps(). */
export interface SpriteAnimation {
  /** Zero-based row in the sheet. */
  row: number;
  frames: number;
  fps: number;
  loop: boolean;
}

/** A grid of equal frames; each animation is one row. */
export interface SpriteSheet {
  image: ImageRef;
  frameWidth: number;
  frameHeight: number;
  /** Frames per row in the image (rows may use fewer). */
  columns: number;
  /** `idle` is required; the player falls back to it. */
  animations: { idle: SpriteAnimation } & Partial<Record<SpriteAnimationName, SpriteAnimation>>;
}

export interface Character {
  id: string;
  name: string;
  role: CharacterRole;
  /** How the role reads in the UI, e.g. "Best friend". */
  roleLabel: string;
  /** Plain description of how they look; sent to the image model. */
  look: string;
  /** How they act and talk; sent to the script model. */
  personality: string;
  /** A line in their own voice, for their cast card. */
  line?: string;
  /** Sticker portrait for cards and lists. */
  portrait: ImageRef;
  /** Muse Image reference sheet; null until drawn. */
  referenceSheet: ImageRef | null;
  /** Animated sprite sheet (idle, blink, talk, wave); null until drawn. */
  spriteSheet: SpriteSheet | null;
  /** True for the invented starter cast that ships with the app. */
  starter: boolean;
  createdAt: string;
}

/** The part of a character the script model needs. */
export type CastBrief = Pick<Character, "id" | "name" | "role" | "look" | "personality">;

/* ------------------------------------------------------------------ */
/* Days and panels                                                     */
/* ------------------------------------------------------------------ */

export interface DialogueLine {
  /** Character id. */
  speakerId: string;
  text: string;
  dir: TextDir;
}

/** Result of the SAM consistency pass for one panel. */
export interface PanelConsistency {
  checked: boolean;
  /** Characters whose look drifted from their reference sheet. */
  driftedCharacterIds: string[];
  /** Drifted characters that were redrawn. */
  fixedCharacterIds: string[];
  /** The panel before the fix (the after is Panel.image); null if nothing was fixed. */
  beforeImage: ImageRef | null;
}

export interface Panel {
  /** Zero-based order on the page. */
  index: number;
  /** What happens and where, written for the image model. */
  scene: string;
  caption?: string;
  dialogue: DialogueLine[];
  /** Characters drawn in this panel. */
  characterIds: string[];
  /** The drawn panel; null until drawn. */
  image: ImageRef | null;
  consistency: PanelConsistency;
}

export interface CheckIn {
  questions: string[];
  /** Same order as `questions`; an empty string is a skipped question. */
  answers: string[];
  answeredAt?: string;
}

/**
 * "crisis" means the note mentioned self-harm or a crisis: the app skips the
 * comic and shows a helpline card instead.
 */
export type SafetyFlag = "ok" | "crisis";

export interface Day {
  id: string;
  date: IsoDate;
  title: string;
  transcript: string;
  languages: LanguageMix;
  panels: Panel[];
  mood: Mood;
  /** Whether the day sounded heavy enough for the check-in card. */
  heavy: boolean;
  /** Present on heavy days. */
  checkIn?: CheckIn;
  safety: SafetyFlag;
  /** True for the invented sample days. */
  sample?: boolean;
  createdAt: string;
}

/** A month's issue: the days bound into it, in date order. */
export interface MonthBook {
  month: MonthKey;
  dayIds: string[];
}

/* ------------------------------------------------------------------ */
/* Model results and API wire format                                   */
/* ------------------------------------------------------------------ */

export interface Transcript {
  text: string;
  languages: LanguageMix;
}

/** A panel as the script model writes it, before any drawing. */
export type ScriptPanel = Omit<Panel, "image" | "consistency">;

export interface ComicScript {
  title: string;
  panels: ScriptPanel[];
  mood: Mood;
  heavy: boolean;
  /** Gentle reflection questions; empty unless `heavy`. */
  checkInQuestions: string[];
  safety: SafetyFlag;
}

/** An image in a JSON response, base64 encoded. */
export interface WireImage {
  mimeType: string;
  base64: string;
}

export type ModelMode = "mock" | "meta";

/** POST /api/transcribe (multipart: `audio` file, optional `language`). */
export interface TranscribeResponse {
  mode: ModelMode;
  transcript: Transcript;
}

/** POST /api/script */
export interface ScriptRequest {
  transcript: string;
  /** Defaults to the starter cast. */
  cast?: CastBrief[];
}
export interface ScriptResponse {
  mode: ModelMode;
  script: ComicScript;
}

/** A character's look and reference sheet, sent along when drawing a panel. */
export interface WireReference {
  characterId: string;
  name: string;
  look: string;
  image?: WireImage;
}

/** POST /api/panel: draws a panel, then runs the consistency check. */
export interface PanelRequest {
  panel: ScriptPanel;
  references?: WireReference[];
}
export interface PanelResponse {
  mode: ModelMode;
  /** The final panel (after any fix). */
  image: WireImage;
  consistency: {
    driftedCharacterIds: string[];
    fixedCharacterIds: string[];
    /** The panel before the fix; null if nothing drifted. */
    before: WireImage | null;
  };
}

export interface ApiError {
  error: string;
}
