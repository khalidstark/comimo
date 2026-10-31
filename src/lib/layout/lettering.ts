/**
 * How much room a panel's caption and bubbles take, estimated the way the
 * reader letters them (comic.module.css). Used to size lettering zones and to
 * keep text-heavy panels out of narrow phone rows.
 */

/** Nominal page widths in CSS pixels: a 390 px phone and the narrowest two-column page. */
export const PHONE_PAGE_PX = 358;
export const DESKTOP_PAGE_PX = 640;

export interface Lettering {
  caption?: string;
  lines: string[];
}

/** Mirrors the lettering sizes in comic.module.css (cqi = 1% of the panel's width). */
const fontPx = {
  caption: (panelPx: number) => clamp(11.5, 7.2 + 0.0125 * panelPx, 17.6),
  bubble: (panelPx: number) => clamp(12.5, 8 + 0.015 * panelPx, 20.8),
};

function clamp(min: number, value: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Average advance of a lettering glyph, as a share of the font size. */
const GLYPH = 0.53;
/** Caption boxes can be set in capitals (Painterly narration), which run wider. */
const CAPTION_GLYPH = 0.57;
const LINE = 1.28;

function linesFor(text: string, widthPx: number, font: number, glyph = GLYPH): number {
  const perLine = Math.max(6, Math.floor(widthPx / (font * glyph)));
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const length = word.length + (used ? 1 : 0);
    if (used + length > perLine && used > 0) {
      lines += 1;
      used = word.length;
    } else {
      used += length;
    }
  }
  return lines;
}

/** Panels at least this wide (CSS px) set two bubbles side by side in a top band (comic.module.css). */
export const BUBBLE_ROW_MIN_PX = 300;

/**
 * Height in px the caption and bubbles need in a column `columnPx` wide, on a
 * panel `panelPx` wide. In a top band of a wide enough panel, bubbles sit two
 * to a row; in a side column they stack.
 */
export function letteringHeight({ caption, lines }: Lettering, columnPx: number, panelPx: number, side = false): number {
  const cap = fontPx.caption(panelPx);
  const bub = fontPx.bubble(panelPx);
  const perRow = !side && panelPx >= BUBBLE_ROW_MIN_PX && lines.length > 1 ? 2 : 1;
  const share = perRow === 2 ? 0.48 : 0.86;
  let height = 0;
  if (caption) {
    const width = columnPx * 0.92 - cap * 1.2;
    height += linesFor(caption, width, cap, CAPTION_GLYPH) * cap * LINE + cap * 0.5;
  }
  for (let i = 0; i < lines.length; i += perRow) {
    const width = Math.min(columnPx * share, bub * 18) - bub * 1.9;
    const tallest = Math.max(...lines.slice(i, i + perRow).map((text) => linesFor(text, width, bub)));
    // A pair whose speakers stand the other way round is staggered by 0.9em (comic.module.css).
    const stagger = perRow === 2 && i + 1 < lines.length ? bub * 0.9 : 0;
    height += (height ? bub * 0.45 : 0) + tallest * bub * LINE + bub * (1.2 + 0.72 * 1.2) + bub * 0.55 + stagger;
  }
  // The layer's own padding, the bubble tail and a little air.
  return height + 22;
}
