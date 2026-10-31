import type { ScriptPanel, StoryMode } from "@/lib/types";

function withoutKey<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

/**
 * Hold each panel to the story mode: no narration in Dialogue mode, one
 * line a page in Narrated mode, speech on at most two panels a page in Both,
 * and in Narrated and Both a narrated panel's narration replaces its caption
 * (one caption box per panel).
 */
export function applyStoryMode(panels: ScriptPanel[], pages: number[][], mode: StoryMode): ScriptPanel[] {
  if (mode === "dialogue") return panels.map((panel) => withoutKey(panel, "narration"));
  // Narrated: at most one short line per page. Both: speech on at most two panels a page, the splash first.
  const allowed = mode === "narrated" ? 1 : 2;
  const spoken = new Set<number>();
  const byIndex = new Map(panels.map((panel) => [panel.index, panel]));
  for (const page of pages) {
    const talking = page.filter((index) => (byIndex.get(index)?.dialogue.length ?? 0) > 0);
    const splashFirst = [...talking].sort((a, b) => Number(byIndex.get(b)?.shot === "splash") - Number(byIndex.get(a)?.shot === "splash"));
    for (const index of splashFirst.slice(0, allowed)) spoken.add(index);
  }
  return panels.map((panel) => {
    const kept = spoken.has(panel.index) ? panel.dialogue : [];
    const dialogue = mode === "narrated" ? kept.slice(0, 1) : kept;
    if (!panel.narration) return { ...panel, dialogue };
    return { ...withoutKey(panel, "caption"), dialogue };
  });
}

/**
 * The note can say the speaker doesn't remember what someone said. A panel
 * whose narration (or caption) says the words were forgotten stays silent:
 * any dialogue there would be invented. English and Egyptian Arabic.
 */
const FORGOT_EN =
  /\b(?:(?:do(?:n'?t| not)|did(?:n'?t| not)|can(?:'?t|not)|could(?:n'?t| not)|never|barely|hardly)\s+(?:\w+\s+)?(?:remember|recall)|forgot(?:ten)?|forget|lost to me|gone from me|slipped (?:my|away)|no idea what)\b/i;
const WORDS_EN = /\b(said|say|saying|told|tell|telling|words?|asked|answered|replied|talked|spoke|speech|conversation|what (?:he|she|they|it) (?:was|were))\b/i;
const FORGOT_AR = /(?:مش|مو|ما|مـ)\s*(?:فاكر|فاكرة|فاكره|متذكر|متذكرة)|ماافتكرش|ما\s*افتكرتش|مفتكرش|نسيت|ناسي|ناسية|راح من بالي/;
const WORDS_AR = /قال|قالت|قالوا|كلام|كلمة|كلمات|حكى|حكت|اتكلم|اتكلمت|سأل|سألت|رد|ردت/;

export function saysWordsWereForgotten(text: string | undefined): boolean {
  if (!text) return false;
  return (FORGOT_EN.test(text) && WORDS_EN.test(text)) || (FORGOT_AR.test(text) && WORDS_AR.test(text));
}

/** Drop the lines of any panel whose narration or caption says the words weren't remembered. */
export function silenceForgottenSpeech(panels: ScriptPanel[]): ScriptPanel[] {
  return panels.map((panel) =>
    panel.dialogue.length > 0 && (saysWordsWereForgotten(panel.narration) || saysWordsWereForgotten(panel.caption)) ? { ...panel, dialogue: [] } : panel,
  );
}
