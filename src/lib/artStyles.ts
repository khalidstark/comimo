/**
 * Comimo's comic art styles. A style is picked per comic (stored on the Day)
 * and every character has one reference sheet per style, so faces stay the
 * same within a comic whichever style it is drawn in.
 *
 * Shared by the browser (labels for the picker) and the server (prompts for
 * Muse Image). Every image prompt ends with the style's `prompt` and a strict
 * no-text line, because Comimo letters captions and bubbles itself.
 */

export const ART_STYLE_IDS = ["zine", "painterly"] as const;
export type ArtStyleId = (typeof ART_STYLE_IDS)[number];

export const DEFAULT_ART_STYLE: ArtStyleId = "zine";

export interface ArtStyle {
  id: ArtStyleId;
  /** Shown in the picker. */
  label: string;
  /** One line under the label. */
  blurb: string;
  /** How every sheet and panel in this style is painted. */
  prompt: string;
  /** The plain background a reference sheet sits on. */
  sheetBackground: string;
  /** What a "plain, empty" top band of a panel looks like in this style. */
  emptyBand: string;
}

export const ART_STYLES: Record<ArtStyleId, ArtStyle> = {
  /** Matched to the approved zine design (globals.css): navy ink, riso pink, sunflower and teal on cool newsprint. */
  zine: {
    id: "zine",
    label: "Zine",
    blurb: "Bold ink and riso colours",
    prompt:
      "Art style, identical in every image: a hand-printed risograph zine comic. Bold, confident deep navy ink outlines (#1b2148) with a slightly uneven brush line. Flat riso colours with no gradients: deep navy #1b2148, riso pink #f2397a, sunflower yellow #ffc738 and teal #0f9e8e on cool newsprint off-white paper #eceff2. Any other colour is a tint or overprint of these inks (pink over yellow for orange, a pale pink wash for lilac, teal over yellow for olive). Light halftone dot shading in the shadows, a little paper grain, simple rounded shapes, warm and expressive faces with clear emotions.",
    sheetBackground: "Plain flat light newsprint background",
    emptyBand: "plain sky, wall or ceiling",
  },
  /** Semi-realistic graphic-novel painting with cinematic light. */
  painterly: {
    id: "painterly",
    label: "Painterly",
    blurb: "Cinematic painted panels",
    prompt:
      "Art style, identical in every image: a semi-realistic digital painting from a graphic novel. Visible gouache and oil brushstrokes with soft painted edges and no hard ink outlines. Cinematic lighting that follows the time of day: warm natural light with soft shadows by day; by evening and night, warm amber lamp light and the cool glow of phone and laptop screens against deep, rich shadows, with city lights melting into soft bokeh. Grounded, realistic proportions and anatomy, natural skin tones, expressive realistic faces with subtle emotion. Rich, slightly muted colour and painted backgrounds with depth.",
    sheetBackground: "Plain, evenly lit mid-grey painted studio backdrop, soft light so the face and colours read clearly",
    emptyBand: "plain wall, ceiling, sky or soft dark shadow",
  },
};

export function isArtStyleId(value: unknown): value is ArtStyleId {
  return typeof value === "string" && (ART_STYLE_IDS as readonly string[]).includes(value);
}

/** The style a stored day or request uses; anything missing or unknown is the default. */
export function artStyleOf(value: unknown): ArtStyleId {
  return isArtStyleId(value) ? value : DEFAULT_ART_STYLE;
}
