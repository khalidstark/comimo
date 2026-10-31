import type { ScriptPanel, StoryMode } from "@/lib/types";

function withoutKey<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

/**
 * Hold each panel to the story mode: no narration in Dialogue mode, rare
 * speech in Narrated mode, and in Narrated and Both a narrated panel's
 * narration replaces its caption (one caption box per panel).
 */
export function applyStoryMode(panels: ScriptPanel[], pages: number[][], mode: StoryMode): ScriptPanel[] {
  if (mode === "dialogue") return panels.map((panel) => withoutKey(panel, "narration"));
  const spoken = new Set<number>();
  if (mode === "narrated") {
    // At most one short line per page: the first one the script gave.
    const byIndex = new Map(panels.map((panel) => [panel.index, panel]));
    for (const page of pages) {
      const first = page.find((index) => (byIndex.get(index)?.dialogue.length ?? 0) > 0);
      if (first !== undefined) spoken.add(first);
    }
  }
  return panels.map((panel) => {
    const dialogue = mode === "narrated" ? (spoken.has(panel.index) ? panel.dialogue.slice(0, 1) : []) : panel.dialogue;
    if (!panel.narration) return { ...panel, dialogue };
    return { ...withoutKey(panel, "caption"), dialogue };
  });
}
