import type { ArtPath } from "@/art/manifest";
import type { ArtStyleId } from "./artStyles";

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
  /** Other names and spellings they go by, in Arabic or English (e.g. "Teta", "تيتا"). */
  aliases?: string[];
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
  /**
   * Muse Image reference sheets, one per art style; a style without one isn't
   * drawn yet. Optional because records stored before art styles don't have it.
   */
  referenceSheets?: Partial<Record<ArtStyleId, ReferenceSheet>>;
  /** Animated sprite sheet (idle, blink, talk, wave); null until drawn. */
  spriteSheet: SpriteSheet | null;
  /** True for the invented starter cast that ships with the app. */
  starter: boolean;
  createdAt: string;
}

/** A character's reference sheet in one art style. */
export interface ReferenceSheet {
  image: ImageRef;
  /** Server signature over a drawn sheet's bytes (blob sheets only); panels send it with the sheet. */
  sheetToken?: string;
  /**
   * The sheet as uploaded to Meta's Files API, so panels can point at it
   * instead of resending the image.
   */
  file?: ReferenceFile;
}

/** A server-signed Files API id for a character's reference sheet. */
export interface ReferenceFile {
  /** Opaque token from /api/character or /api/panel; only this server can use it. */
  token: string;
  /** Key of the sheet it was uploaded from. */
  sheet: string;
}

/** The part of a character the script model needs. */
export type CastBrief = Pick<Character, "id" | "name" | "role" | "look" | "personality" | "aliases">;

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

/**
 * How the camera frames a panel. "splash" is the day's emotional peak: it gets
 * the biggest slot on the page. Exactly one panel per comic is the splash.
 */
export const SHOTS = ["establishing", "wide", "medium", "closeup", "detail", "splash"] as const;
export type Shot = (typeof SHOTS)[number];

/** Where a panel sits in the day's story arc. */
export const BEATS = ["setup", "build", "turn", "climax", "release"] as const;
export type Beat = (typeof BEATS)[number];

/**
 * The part of a panel kept as plain background for the caption and bubbles,
 * so lettering never covers a face. `size` is the fraction of the panel's
 * height ("top") or width ("left", "right") it takes.
 */
export interface LetteringZone {
  side: "top" | "left" | "right" | "none";
  size: number;
}

export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/** The frame a panel is drawn for: its slot's shape on the page and what must stay clear. */
export interface PanelFrame {
  /** Width over height of the drawn image (a size Muse Image supports). */
  aspect: number;
  zone: LetteringZone;
  /** A smaller panel overlaps this corner of the panel, so nothing important goes there. */
  covered?: Corner;
  /** How much of the width and height that corner takes (fractions, with a margin). */
  coverage?: { w: number; h: number };
}

/** The page template a comic is laid out with, and which panel is its splash. */
export interface PageLayoutChoice {
  template: string;
  /** Index of the panel in the template's biggest slot. */
  focus: number;
}

export interface Panel {
  /** Zero-based order on the page. */
  index: number;
  /** What happens and where, written for the image model. */
  scene: string;
  caption?: string;
  /**
   * First-person narration in the speaker's voice, lettered in a caption box
   * pinned to the panel's edge (Narrated and Both modes). Missing on days made before story modes.
   */
  narration?: string;
  /** A memory rather than the day itself: painted and framed as a faded flashback. */
  flashback?: boolean;
  dialogue: DialogueLine[];
  /** Characters drawn in this panel. */
  characterIds: string[];
  /** Names of this panel's characters and speakers when it was made, so a later rename or delete can't turn them into ids. */
  names?: Record<string, string>;
  /** Camera framing; missing on days made before page layouts. */
  shot?: Shot;
  /** Story beat; missing on days made before page layouts. */
  beat?: Beat;
  /** A second panel worth a bit more room (a punchline, a quiet moment). */
  emphasis?: boolean;
  /** The slot shape and lettering zone the panel was drawn for. */
  frame?: PanelFrame;
  /** The drawn panel; null until drawn. */
  image: ImageRef | null;
  consistency: PanelConsistency;
}

/* ------------------------------------------------------------------ */
/* Story modes and pages                                               */
/* ------------------------------------------------------------------ */

/**
 * How a comic tells the day: "narrated" in first-person caption boxes like a
 * graphic novel, "dialogue" in speech bubbles, or "both" (the default).
 */
export const STORY_MODES = ["narrated", "dialogue", "both"] as const;
export type StoryMode = (typeof STORY_MODES)[number];
export const DEFAULT_STORY_MODE: StoryMode = "both";

export function isStoryMode(value: unknown): value is StoryMode {
  return typeof value === "string" && (STORY_MODES as readonly string[]).includes(value);
}

/** A comic runs to at most this many pages, 4 to 6 panels each. */
export const MAX_PAGES = 3;
export const PANELS_PER_PAGE = { min: 4, max: 6 } as const;

/** One page of a comic: which panels it holds (by `Panel.index`, in reading order) and how they are laid out. */
export interface ComicPage {
  panels: number[];
  /** Picked before drawing; missing on a script's pages until they are laid out. */
  layout?: PageLayoutChoice;
}

export interface CheckIn {
  questions: string[];
  /** Empty until answered; then same order as `questions`, "" for a skipped one. */
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
  /** The art style the comic was drawn in; missing means "zine" (days made before styles). */
  artStyle?: ArtStyleId;
  /** The page layout picked before drawing; days made before layouts get one picked when read. */
  layout?: PageLayoutChoice;
  /** How the story is told; missing means "dialogue" (days made before story modes). */
  storyMode?: StoryMode;
  /**
   * The comic's pages in reading order, each with its panels and layout.
   * Missing on single-page days made before multi-page comics: all panels are one page laid out with `layout`.
   */
  pages?: ComicPage[];
  /** Named people in the note who aren't in the cast yet; offered once after the comic. */
  newPeople?: NewPerson[];
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
  /** Every panel of every page, in reading order; `index` runs across pages. */
  panels: ScriptPanel[];
  /** How the panels split into pages (1 to MAX_PAGES); missing means one page. */
  pages?: ComicPage[];
  /** The story mode the script was written in. */
  storyMode?: StoryMode;
  mood: Mood;
  heavy: boolean;
  /** Gentle reflection questions; empty unless `heavy`. */
  checkInQuestions: string[];
  safety: SafetyFlag;
  /** Named people in the note who aren't in the cast; drawn only as unnamed background figures. */
  newPeople?: NewPerson[];
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
  /** Defaults to DEFAULT_STORY_MODE. */
  storyMode?: StoryMode;
}
export interface ScriptResponse {
  mode: ModelMode;
  script: ComicScript;
}

/**
 * A character's look and reference sheet, sent along when drawing a panel.
 * Send `fileToken` when the sheet is already uploaded (keeps the request
 * small), otherwise `image`.
 */
export interface WireReference {
  characterId: string;
  name: string;
  look: string;
  image?: WireImage;
  /** Required with `image` unless it is a shipped starter sheet: proves this server drew it. */
  sheetToken?: string;
  fileToken?: string;
}

/** A reference sheet the server uploaded while drawing; cache it on the character. */
export interface UploadedReference {
  characterId: string;
  fileToken: string;
}

/** POST /api/panel: draws a panel, then runs the consistency check. */
export interface PanelRequest {
  /** `panel.frame` sets the drawn aspect and the space kept clear for lettering. */
  panel: ScriptPanel;
  references?: WireReference[];
  /** Defaults to "zine". */
  style?: ArtStyleId;
}
export interface PanelResponse {
  mode: ModelMode;
  /** The final panel (after any fix). */
  image: WireImage;
  /** Sheets uploaded for this request, to send as `fileToken` next time. */
  uploaded: UploadedReference[];
  consistency: {
    driftedCharacterIds: string[];
    fixedCharacterIds: string[];
    /** The panel before the fix; null if nothing drifted. */
    before: WireImage | null;
  };
}

/** POST /api/character: draw a character's reference sheet. */
export interface CharacterSheetRequest {
  characterId: string;
  name: string;
  role: CharacterRole;
  look: string;
  /** Defaults to "zine". */
  style?: ArtStyleId;
  /** The person cut from their photo (from /api/character/photo): used for this one drawing only, never kept or reused. */
  photo?: WireImage;
  /** Must be true with `photo`: the user has this person's permission. */
  consent?: boolean;
}
export interface CharacterSheetResponse {
  mode: ModelMode;
  image: WireImage;
  /** Proves this server drew the sheet; send it with the image when drawing panels. */
  sheetToken: string | null;
  /** The sheet uploaded to the Files API; null when the upload failed or in mock mode. */
  fileToken: string | null;
  /** True when Muse Image wouldn't draw from the photo and the sheet was drawn from the written look instead. */
  photoRefused?: boolean;
}

export interface ApiError {
  error: string;
  /** Machine-readable reason, e.g. "stale-reference" when an uploaded sheet is gone. */
  code?: string;
}

/* ------------------------------------------------------------------ */
/* New people, sprites and photos                                      */
/* ------------------------------------------------------------------ */

/** Someone the note names who isn't in the cast, as the script model heard them. */
export interface NewPerson {
  /** How they are best called, e.g. "Omar". */
  name: string;
  /** Every way the note said their name ("Omar", "عمر"). */
  mentionedAs: string[];
  role: CharacterRole;
  /** Look details the note gave, in English; "" when it said nothing. */
  look: string;
}

/** POST /api/sprite: animate a character from one of their server-drawn reference sheets. */
export interface SpriteRequest {
  characterId: string;
  name: string;
  role: CharacterRole;
  look: string;
  /** The reference sheet, with the token proving this server drew it. */
  sheet: WireImage;
  sheetToken?: string;
}
export interface SpriteResponse {
  mode: ModelMode;
  /** The 6 x 4 sheet (idle, blink, talk, wave), transparent WebP. */
  image: WireImage;
  /** The idle frame on its own, for small portraits. */
  portrait: WireImage;
  frameWidth: number;
  frameHeight: number;
  columns: number;
}

/** POST /api/character/photo (multipart: `photo`, `consent`): a look description from a reference photo. */
export interface PhotoLookResponse {
  mode: ModelMode;
  /** Editable description of how the person looks. */
  look: string;
  /** The person cut from the photo, for drawing their sheet once; never stored. */
  crop: WireImage;
}

/* ------------------------------------------------------------------ */
/* Monthly magazine                                                    */
/* ------------------------------------------------------------------ */

/** POST /api/cover: draw a month's magazine cover starring its main cast. */
export interface CoverRequest {
  month: MonthKey;
  /** The month's comic titles, in date order (the cover concept and tagline come from these). */
  titles: string[];
  /** The month's main cast (at most three), the narrator first. */
  cast: WireReference[];
  /** Defaults to "zine". */
  style?: ArtStyleId;
}
export interface CoverResponse {
  mode: ModelMode;
  /** Portrait cover art (about 4:5) with the top kept clear for the masthead. */
  image: WireImage;
  /** One short cover line, in the month's own words. */
  tagline: string;
}
