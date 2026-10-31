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
const LINE = 1.28;

function linesFor(text: string, widthPx: number, font: number): number {
  const perLine = Math.max(6, Math.floor(widthPx / (font * GLYPH)));
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

/** Height in px the caption and bubbles need in a column `columnPx` wide, on a panel `panelPx` wide. */
export function letteringHeight({ caption, lines }: Lettering, columnPx: number, panelPx: number): number {
  const cap = fontPx.caption(panelPx);
  const bub = fontPx.bubble(panelPx);
  let height = 0;
  if (caption) {
    const width = columnPx * 0.92 - cap * 1.2;
    height += linesFor(caption, width, cap) * cap * LINE + cap * 0.5;
  }
  for (const text of lines) {
    const width = Math.min(columnPx * 0.86, bub * 18) - bub * 1.9;
    height += (height ? bub * 0.45 : 0) + linesFor(text, width, bub) * bub * LINE + bub * (1.2 + 0.72 * 1.2) + bub * 0.55;
  }
  return height + (lines.length ? 6 : 4);
}
