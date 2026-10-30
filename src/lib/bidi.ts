/**
 * Splitting mixed Arabic and English lines into direction runs.
 *
 * The Unicode bidi algorithm gives a neutral character (comma, ellipsis,
 * space) sitting between an English and an Arabic word the direction of the
 * paragraph, so in a right-to-left bubble "I won't make it, مش هلحق" shows its
 * comma before "I". Wrapping each language run in its own isolate (<bdi>)
 * keeps punctuation with the words it was typed after.
 */

export type RunDir = "ltr" | "rtl";

export interface BidiRun {
  text: string;
  /** null for the plain whitespace between two runs. */
  dir: RunDir | null;
}

const RTL_LETTER = /[\u0640\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;
const LETTER = /\p{L}/u;

/** The strong direction of one character, or null for neutrals (digits, punctuation, spaces, marks). */
function strongDir(char: string): RunDir | null {
  if (RTL_LETTER.test(char)) return "rtl";
  if (LETTER.test(char)) return "ltr";
  return null;
}

/**
 * Split `text` into runs of one direction. Neutrals between two runs go to
 * the run before them up to the last space (so "it, " keeps its comma and
 * "« " opens the next run); that space is returned as its own plain run.
 */
export function splitBidiRuns(text: string): BidiRun[] {
  const chars = Array.from(text);
  const runs: BidiRun[] = [];
  let start = 0;
  let current: RunDir | null = null;
  let lastStrong = -1;

  for (let i = 0; i < chars.length; i++) {
    const dir = strongDir(chars[i]);
    if (!dir) continue;
    if (current === null || dir === current) {
      current = dir;
      lastStrong = i;
      continue;
    }

    // Direction changes at i. Cut the neutral gap at its last stretch of whitespace.
    let cutEnd = i;
    while (cutEnd > lastStrong + 1 && !/\s/u.test(chars[cutEnd - 1])) cutEnd--;
    let cutStart = cutEnd;
    while (cutStart > lastStrong + 1 && /\s/u.test(chars[cutStart - 1])) cutStart--;
    if (cutStart === cutEnd) {
      // No space in the gap ("الـreport"): split right before the new run.
      cutStart = i;
      cutEnd = i;
    }

    runs.push({ text: chars.slice(start, cutStart).join(""), dir: current });
    if (cutEnd > cutStart) runs.push({ text: chars.slice(cutStart, cutEnd).join(""), dir: null });
    start = cutEnd;
    current = dir;
    lastStrong = i;
  }

  runs.push({ text: chars.slice(start).join(""), dir: current });
  return runs.filter((run) => run.text.length > 0);
}

/** Direction of the first strong character, like dir="auto". */
export function firstStrongDir(text: string): RunDir | null {
  for (const char of text) {
    const dir = strongDir(char);
    if (dir) return dir;
  }
  return null;
}
