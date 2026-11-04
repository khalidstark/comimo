/**
 * The art manifest: the only place that knows where a picture lives.
 *
 * Every component reads art through this file (via <Art> or <Icon>), never
 * by hard-coding a path. Slots drawn with Muse Image (scripts/generate-site-art.mjs)
 * have `placeholder: false`. The code-drawn placeholders stay in
 * public/art/placeholder as the fallback for any slot that isn't drawn yet.
 */

import { samplePanels } from "./samplePanels";

export interface ArtAsset {
  /** Public path to the file. */
  src: string;
  /** Alt text. Empty string means decorative (the UI labels it elsewhere). */
  alt: string;
  /** Intrinsic size, used for aspect ratio and layout stability. */
  width: number;
  height: number;
  /** True while this slot still shows code-drawn placeholder art. */
  placeholder: boolean;
}

const PLACEHOLDER_DIR = "/art/placeholder";

function placeholder(file: string, alt: string, width: number, height: number): ArtAsset {
  return { src: `${PLACEHOLDER_DIR}/${file}`, alt, width, height, placeholder: true };
}

/** Art drawn with Muse Image, kept under public/art. */
function drawn(file: string, alt: string, width: number, height: number): ArtAsset {
  return { src: `/art/${file}`, alt, width, height, placeholder: false };
}

export const art = {
  brand: {
    logoMark: drawn("site/logo-mimo.png", "", 192, 192),
    mascot: drawn("site/mimo.webp", "Mimo, a pink speech bubble with legs", 520, 520),
  },
  hero: {
    scene: drawn(
      "site/hero-night.webp",
      "Nour on her bed at night, recording a voice note while little comic panels of her day float out of her phone",
      2048,
      1152,
    ),
  },
  /** "How it works" spots, cut out so they sit straight on the page. */
  how: {
    talk: drawn("site/how-talk.webp", "Nour talking into her phone", 1200, 977),
    comic: drawn("site/how-comic.webp", "A strip of comic panels rising out of a phone", 1200, 914),
    book: drawn("site/how-book.webp", "Mishmish asleep on a stack of comic magazines", 1200, 889),
  },
  /** Single-colour line icons, drawn with the current text colour. */
  icons: {
    today: placeholder("icon-today.svg", "", 24, 24),
    record: placeholder("icon-record.svg", "", 24, 24),
    cast: placeholder("icon-cast.svg", "", 24, 24),
    month: placeholder("icon-month.svg", "", 24, 24),
    theme: placeholder("icon-theme.svg", "", 24, 24),
    upload: placeholder("icon-upload.svg", "", 24, 24),
    bookOpen: placeholder("icon-book-open.svg", "", 24, 24),
    plus: placeholder("icon-plus.svg", "", 24, 24),
  },
  /** Day weather. Shown as a picture with a word, never as a number. */
  mood: {
    sunny: drawn("site/mood-sunny.webp", "Sunny day", 256, 256),
    cloudy: drawn("site/mood-cloudy.webp", "Cloudy day", 256, 256),
    rainy: drawn("site/mood-rainy.webp", "Rainy day", 256, 256),
    stormy: drawn("site/mood-stormy.webp", "Stormy day", 256, 256),
    rainbow: drawn("site/mood-rainbow.webp", "Rainbow day", 256, 256),
  },
  /** Mimo with what's missing, cut out. */
  empty: {
    days: drawn("site/empty-days.webp", "", 1200, 864),
    cast: drawn("site/empty-cast.webp", "", 1200, 921),
    month: drawn("site/empty-month.webp", "", 1200, 1084),
  },
  /**
   * The sample days' panels: one real Comimo run per sample transcript
   *, drawn by Muse Image from the starter sheets below. Generated
   * with their fixture data by scripts/sample-comics.mjs.
   */
  samples: samplePanels,
  /** Starter cast portraits: the first idle frame of each sprite sheet. */
  sprites: {
    nour: drawn("site/portrait-nour.webp", "Nour", 300, 360),
    karim: drawn("site/portrait-karim.webp", "Karim", 300, 360),
    teta: drawn("site/portrait-teta.webp", "Teta Samia", 300, 360),
    mishmish: drawn("site/portrait-mishmish.webp", "Mishmish the cat", 300, 360),
  },
  /**
   * Animated sprite sheets: 6 columns x 4 rows (idle, blink, talk, wave).
   * Frame sizes and timing live in src/art/sprites.ts. Decorative here; the
   * Sprite component carries the character's name.
   */
  spriteSheets: {
    mascot: drawn("site/sprite-mimo.webp", "", 1800, 1080),
    nour: drawn("site/sprite-nour.webp", "", 1800, 1440),
    karim: drawn("site/sprite-karim.webp", "", 1800, 1440),
    teta: drawn("site/sprite-teta.webp", "", 1800, 1440),
    mishmish: drawn("site/sprite-mishmish.webp", "", 1800, 1440),
  },
  /**
   * The smooth sheets of the same characters: 12 columns x 3 rows (idle, talk, wave), made once
   * at design time from the Muse art (design/). They play wherever these characters appear; a
   * character without one here keeps its Muse sheet above.
   */
  spriteSheetsHf: {
    mascot: drawn("sprites-hf/mimo.webp", "", 3840, 864),
    nour: drawn("sprites-hf/nour.webp", "", 3600, 1200),
    karim: drawn("sprites-hf/karim.webp", "", 3600, 1200),
    teta: drawn("sprites-hf/teta.webp", "", 3600, 1200),
    mishmish: drawn("sprites-hf/mishmish.webp", "", 3600, 1200),
  },
  month: {
    cover: drawn("site/month-cover.webp", "", 1000, 1250),
    /** The sample issue's own cover, drawn by Muse Image from the starter sheets through the cover route. */
    sampleCover: drawn("site/cover-sample-2026-10.webp", "", 1000, 1500),
  },
  /**
   * The home page's demo day: one real Comimo run on an invented lunch story,
   * in both art styles, plus the Mishmish panel drawn from the same scene
   * WITHOUT the cast's reference sheets (the honest "before").
   */
  demo: {
    zine0: drawn("demo/zine-panel-0.webp", "Karim waits by his car as Nour walks out to meet him", 1600, 800),
    zine1: drawn("demo/zine-panel-1.webp", "Teta Samia serves Karim a bowl of molokhia while Nour smiles", 1600, 1067),
    zine2: drawn("demo/zine-panel-2.webp", "Mishmish curled up on Karim's chair while Karim laughs on the floor", 1600, 1067),
    zine3: drawn("demo/zine-panel-3.webp", "Nour, Karim and Teta Samia drinking tea on the balcony", 1600, 800),
    painterly0: drawn("demo/painterly-panel-0.webp", "Karim waves from his car as Nour hurries out to meet him", 1600, 800),
    painterly1: drawn("demo/painterly-panel-1.webp", "Teta Samia serves Karim a bowl of molokhia while Nour smiles", 1600, 1067),
    painterly2: drawn("demo/painterly-panel-2.webp", "Mishmish curled up on Karim's chair while Karim and Nour laugh", 1600, 1067),
    painterly3: drawn("demo/painterly-panel-3.webp", "Nour, Karim and Teta Samia sipping tea on the balcony", 1600, 800),
    beforeZine: drawn("site/demo-before-zine.webp", "The same scene drawn without the cast's reference sheets", 1600, 1067),
    beforePainterly: drawn("site/demo-before-painterly.webp", "The same scene drawn without the cast's reference sheets", 1600, 1067),
  },
  /**
   * Starter cast reference sheets in the zine style, drawn by Muse Image (front and
   * three-quarter views). Panels are drawn from these, so a fresh device and
   * the live demo start with drawn characters.
   */
  cast: {
    nour: drawn("cast/nour-sheet.webp", "Nour's reference sheet, front and three-quarter views", 1536, 1024),
    karim: drawn("cast/karim-sheet.webp", "Karim's reference sheet, front and three-quarter views", 1536, 1024),
    teta: drawn("cast/teta-sheet.webp", "Teta Samia's reference sheet, front and three-quarter views", 1536, 1024),
    mishmish: drawn("cast/mishmish-sheet.webp", "Mishmish's reference sheet, front and three-quarter views", 1536, 1024),
  },
  /** The same starter sheets in the Painterly art style. */
  castPainterly: {
    nour: drawn("cast/nour-sheet-painterly.webp", "Nour's painterly reference sheet, front and three-quarter views", 1536, 1024),
    karim: drawn("cast/karim-sheet-painterly.webp", "Karim's painterly reference sheet, front and three-quarter views", 1536, 1024),
    teta: drawn("cast/teta-sheet-painterly.webp", "Teta Samia's painterly reference sheet, front and three-quarter views", 1536, 1024),
    mishmish: drawn("cast/mishmish-sheet-painterly.webp", "Mishmish's painterly reference sheet, front and three-quarter views", 1536, 1024),
  },
} as const satisfies Record<string, Record<string, ArtAsset>>;

export type MoodKey = keyof typeof art.mood;
export type IconKey = keyof typeof art.icons;
export type SpriteKey = keyof typeof art.sprites;
export type SpriteSheetKey = keyof typeof art.spriteSheets;

type ArtGroups = typeof art;

/**
 * A slot in the manifest written as "group.key", e.g. "cast.nour".
 * Stored records (fixtures, sample days) point at art with this instead of a
 * file path, so swapping the art never touches the data.
 */
export type ArtPath = {
  [G in keyof ArtGroups]: `${G}.${Extract<keyof ArtGroups[G], string>}`;
}[keyof ArtGroups];

/** Look up the asset behind an ArtPath. */
export function artAt(path: ArtPath): ArtAsset {
  const [group, key] = path.split(".") as [keyof ArtGroups, string];
  return (art[group] as Record<string, ArtAsset>)[key];
}

/**
 * Motion media, made once at design time from the Muse art by the pipeline in design/ (the app
 * never calls a video model). Frame sequences live in public/media/<dir>/000.webp ...; loops are
 * muted MP4s with their first frame as the poster.
 */
export const media = {
  /** The landing film: Nour's night room whites out into a newsprint page of real panels. */
  heroFilm: {
    dir: "hero",
    count: 48,
    width: 1440,
    height: 810,
    alt: [
      "Nour on her bed at night with her phone, her cat asleep beside her",
      "A newsprint page of five comic panels from Nour's day",
    ] as [string, string],
  },
  /** The page transition's ink splash, keyed off its paper (alpha). */
  ink: { dir: "ink-cut", count: 11, width: 800, height: 450 },
  /** The signed-in home's scene: Nour's night room, breathing (the room, the stars, the floating panels). */
  home: { src: "/media/home-loop.mp4", poster: "/media/home-poster.webp", width: 1600, height: 900 },
  /** "How it works" loops on newsprint. */
  how: {
    talk: { src: "/media/how-talk-loop.mp4", poster: "/media/how-talk-poster.webp", width: 960, height: 960 },
    comic: { src: "/media/how-comic-loop.mp4", poster: "/media/how-comic-poster.webp", width: 960, height: 960 },
    book: { src: "/media/how-book-loop.mp4", poster: "/media/how-book-poster.webp", width: 960, height: 960 },
  },
} as const;

export interface LoopMedia {
  src: string;
  poster: string;
  width: number;
  height: number;
}
