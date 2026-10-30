/**
 * The art manifest: the only place that knows where a picture lives.
 *
 * Every component reads art through this file (via <Art> or <Icon>), never
 * by hard-coding a path. Phase 4 swaps each `src` for Muse Image art and flips
 * `placeholder` to false; no page needs to change.
 */

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

export const art = {
  brand: {
    logoMark: placeholder("logo-mark.svg", "", 64, 64),
    mascot: placeholder("mascot.svg", "Mimo, a speech bubble with legs", 260, 260),
  },
  hero: {
    scene: placeholder("hero-scene.svg", "Rooftops at golden hour with a yellow bus passing below", 640, 480),
  },
  how: {
    talk: placeholder("how-talk.svg", "A phone recording a voice note", 400, 300),
    script: placeholder("how-script.svg", "A comic script being written", 400, 300),
    draw: placeholder("how-draw.svg", "Comic panels being drawn", 400, 300),
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
    sunny: placeholder("mood-sunny.svg", "Sunny day", 64, 64),
    cloudy: placeholder("mood-cloudy.svg", "Cloudy day", 64, 64),
    rainy: placeholder("mood-rainy.svg", "Rainy day", 64, 64),
    stormy: placeholder("mood-stormy.svg", "Stormy day", 64, 64),
    rainbow: placeholder("mood-rainbow.svg", "Rainbow day", 64, 64),
  },
  empty: {
    days: placeholder("empty-days.svg", "", 400, 300),
    cast: placeholder("empty-cast.svg", "", 400, 300),
    month: placeholder("empty-month.svg", "", 400, 300),
  },
  /** Backgrounds for the sample comic panels. */
  scenes: {
    street: placeholder("scene-street.svg", "A bus stop on a grey morning", 600, 400),
    home: placeholder("scene-home.svg", "A kitchen table with a birthday cake", 600, 400),
    desk: placeholder("scene-desk.svg", "A desk at night, laptop full of tabs", 600, 400),
    rooftop: placeholder("scene-rooftop.svg", "Two cups of tea on a rooftop at sunset", 600, 400),
  },
  /** Starter cast sprites, sticker style. */
  sprites: {
    nour: placeholder("sprite-nour.svg", "Nour", 300, 360),
    karim: placeholder("sprite-karim.svg", "Karim", 300, 360),
    teta: placeholder("sprite-teta.svg", "Teta Samia", 300, 360),
    mishmish: placeholder("sprite-mishmish.svg", "Mishmish the cat", 300, 360),
  },
  /**
   * Animated sprite sheets: 6 columns x 4 rows (idle, blink, talk, wave).
   * Frame sizes and timing live in src/art/sprites.ts. Decorative here; the
   * Sprite component carries the character's name.
   */
  spriteSheets: {
    mascot: placeholder("sprites/mascot.svg", "", 1800, 1080),
    nour: placeholder("sprites/nour.svg", "", 1800, 1440),
    karim: placeholder("sprites/karim.svg", "", 1800, 1440),
    teta: placeholder("sprites/teta.svg", "", 1800, 1440),
    mishmish: placeholder("sprites/mishmish.svg", "", 1800, 1440),
  },
  month: {
    cover: placeholder("month-cover.svg", "", 480, 600),
  },
} as const satisfies Record<string, Record<string, ArtAsset>>;

export type MoodKey = keyof typeof art.mood;
export type IconKey = keyof typeof art.icons;
export type SceneKey = keyof typeof art.scenes;
export type SpriteKey = keyof typeof art.sprites;
export type SpriteSheetKey = keyof typeof art.spriteSheets;

type ArtGroups = typeof art;

/**
 * A slot in the manifest written as "group.key", e.g. "scenes.street".
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
