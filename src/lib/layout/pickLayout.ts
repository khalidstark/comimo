import { BEATS, SHOTS, type Beat, type PageLayoutChoice, type Shot } from "../types";
import { aspectOf, line, quadArea, type Line } from "./geometry";
import type { Lettering } from "./lettering";
import { desktopGeometry, hashString } from "./page";
import { TEMPLATES, templateById, type PageTemplate, type Slot, type TemplateVariant } from "./templates";

/**
 * Picks a page template for a comic from its shots: the splash panel gets
 * the biggest slot, establishing shots get wide slots, close-ups and details
 * get narrow slots and insets. The choice is deterministic per day id and
 * never repeats the previous day's template.
 */

/** The story fields of a panel the layout reads. */
export interface StoryPanel {
  index: number;
  shot?: Shot;
  beat?: Beat;
  emphasis?: boolean;
  caption?: string;
  /** Narration is lettered in the caption box instead of the caption. */
  narration?: string;
  dialogue: { text: string }[];
  characterIds: string[];
}

/** A panel with its shot and beat filled in. */
export type Storied<T> = T & { shot: Shot; beat: Beat };

export interface ResolvedLayout {
  template: PageTemplate;
  variant: TemplateVariant;
  /** True when no template fits and the safe layout is used. */
  fallback: boolean;
}

/** The text lettered in a panel's caption box: its narration when it has one, else its caption. */
export function captionText(panel: { caption?: string; narration?: string }): string | undefined {
  return panel.narration || panel.caption || undefined;
}

/** The panel's caption box and lines as text to letter. */
export function letteringOf(panel: StoryPanel): Lettering {
  return { caption: captionText(panel), lines: panel.dialogue.map((line) => line.text) };
}

export function isShot(value: unknown): value is Shot {
  return typeof value === "string" && (SHOTS as readonly string[]).includes(value);
}

export function isBeat(value: unknown): value is Beat {
  return typeof value === "string" && (BEATS as readonly string[]).includes(value);
}

function textWeight(panel: StoryPanel): number {
  return (captionText(panel)?.length ?? 0) + panel.dialogue.reduce((sum, line) => sum + line.text.length, 0);
}

/**
 * Fill in shots and beats for days made before page layouts: the first panel
 * sets the scene, the last releases it, and the splash goes to the fullest
 * moment in between.
 */
export function inferStory<T extends StoryPanel>(panels: T[]): Storied<T>[] {
  const n = panels.length;
  if (n === 0) return [];
  const middle = panels.slice(1, -1);
  const peak = middle.length > 0 ? middle.reduce((best, p) => (textWeight(p) > textWeight(best) ? p : best)) : panels[n - 1];
  return panels.map((panel, i) => {
    const beat: Beat = i === 0 ? "setup" : i === n - 1 ? "release" : panel === peak ? "climax" : i >= n - 2 ? "turn" : "build";
    const shot: Shot =
      panel === peak ? "splash" : i === 0 ? "establishing" : panel.characterIds.length === 1 && !captionText(panel) ? "closeup" : i === n - 1 ? "wide" : "medium";
    return { ...panel, shot: panel.shot ?? shot, beat: panel.beat ?? beat };
  });
}

/**
 * Make sure exactly one panel is the splash: keep the first splash, or
 * promote the climax (then an emphasised panel, then the second to last).
 */
export function normalizeStory<T extends StoryPanel>(input: T[]): Storied<T>[] {
  const panels: Storied<T>[] = input.some((panel) => !isShot(panel.shot) || !isBeat(panel.beat))
    ? inferStory(input)
    : (input as Storied<T>[]);
  const n = panels.length;
  if (n === 0) return [];
  const splashes = panels.filter((panel) => panel.shot === "splash");
  const keep =
    splashes.find((panel) => panel.beat === "climax") ??
    splashes[0] ??
    panels.find((panel) => panel.beat === "climax") ??
    panels.find((panel) => panel.emphasis) ??
    panels[Math.max(0, n - 2)];
  return panels.map((panel) => {
    if (panel === keep) return { ...panel, shot: "splash" as const };
    if (panel.shot === "splash") return { ...panel, shot: panel.index === 0 ? ("establishing" as const) : ("wide" as const) };
    return panel;
  });
}

export function splashIndex(panels: StoryPanel[]): number {
  const at = panels.findIndex((panel) => panel.shot === "splash");
  return at === -1 ? Math.max(0, panels.length - 2) : at;
}

/* ---------- Scoring ---------- */

interface SlotFacts {
  aspect: number;
  area: number;
  inset: boolean;
  suits: readonly Shot[];
}

function slotFacts(variant: TemplateVariant): SlotFacts[] {
  const geometry = desktopGeometry(variant);
  return geometry.panels.map((panel) => ({
    aspect: aspectOf(panel.box),
    area: quadArea(panel.quad),
    inset: panel.inset,
    suits: variant.slots[panel.index].suits,
  }));
}

/** How well a slot frames a shot. */
function fit(shot: Shot | undefined, slot: SlotFacts, emphasis: boolean, areaRank: number): number {
  let score = 0;
  if (shot && slot.suits.includes(shot)) score += 2;
  switch (shot) {
    case "establishing":
      score += slot.aspect >= 1.8 ? 1.5 : slot.aspect < 1 ? -2 : 0;
      if (slot.inset) score -= 3;
      break;
    case "wide":
      score += slot.aspect >= 1.4 ? 1 : slot.aspect < 0.9 ? -1 : 0;
      if (slot.inset) score -= 2;
      break;
    case "closeup":
      score += slot.inset || slot.aspect <= 1.1 ? 1 : slot.aspect >= 2.4 ? -1 : 0;
      break;
    case "detail":
      score += slot.inset ? 1.5 : slot.area < 25 ? 1 : 0;
      break;
    case "medium":
      score += slot.inset ? -1 : 0.5;
      break;
    default:
      break;
  }
  if (emphasis && areaRank <= 1) score += 1;
  return score;
}

function scoreVariant(variant: TemplateVariant, panels: StoryPanel[]): number {
  const facts = slotFacts(variant);
  const ranks = facts.map((slot) => facts.filter((other) => other.area > slot.area).length);
  return panels.reduce((sum, panel, i) => sum + fit(panel.shot, facts[i], Boolean(panel.emphasis), ranks[i]), 0);
}

/** Slight, seeded variety between close scores. */
function jitter(seed: string, templateId: string): number {
  return (hashString(`${seed}|${templateId}`) % 1000) / 1000;
}

/**
 * Pick the page for a comic. `panels` must already be normalised (one
 * splash). Returns null when no template has that many panels, so the
 * caller uses the safe fallback page.
 */
export function pickLayout(panels: StoryPanel[], seed: string, previousTemplate?: string | null): PageLayoutChoice | null {
  const count = panels.length;
  const focus = splashIndex(panels);
  const forCount = TEMPLATES.filter((template) => template.count === count);
  if (forCount.length === 0) return null;

  const options = forCount.flatMap((template) => template.variants.map((variant) => ({ template, variant })));
  const fresh = options.filter((option) => option.template.id !== previousTemplate);
  const pool = [
    fresh.filter((option) => option.variant.focus === focus),
    options.filter((option) => option.variant.focus === focus),
    fresh,
    options,
  ].find((candidates) => candidates.length > 0)!;

  let best = pool[0];
  let bestScore = -Infinity;
  for (const option of pool) {
    const score = scoreVariant(option.variant, panels) + jitter(seed, option.template.id);
    if (score > bestScore) {
      best = option;
      bestScore = score;
    }
  }
  return { template: best.template.id, focus: best.variant.focus };
}

/* ---------- Resolving stored choices ---------- */

export function resolveLayout(choice: PageLayoutChoice | null | undefined, count: number): ResolvedLayout {
  const template = choice ? templateById(choice.template) : undefined;
  const variant = template?.count === count ? template.variants.find((v) => v.focus === choice!.focus) : undefined;
  if (template && variant) return { template, variant, fallback: false };
  return { ...safeLayout(count), fallback: true };
}

/**
 * The fallback page for any number of panels: a wide opening strip, then
 * pairs, with the last panel across the page when one is left over.
 */
export function safeLayout(count: number): { template: PageTemplate; variant: TemplateVariant } {
  const n = Math.max(1, count);
  const rows: number[][] = [[0]];
  for (let i = 1; i < n; i += 2) rows.push(i + 1 < n ? [i, i + 1] : [i]);
  const heights = rows.map((items) => (items.length === 1 ? 5 : 4.6));
  const height = heights.reduce((a, b) => a + b, 0);
  const left = line([0, 0], [0, 1], "left");
  const right = line([12, 0], [12, 1], "right");
  let y = 0;
  const slots: Slot[] = rows.flatMap((items, r): Slot[] => {
    const top: Line = r === 0 ? line([0, 0], [12, 0], "top") : line([0, y], [12, y]);
    y += heights[r];
    const bottom: Line = r === rows.length - 1 ? line([0, y], [12, y], "bottom") : line([0, y], [12, y]);
    if (items.length === 1) return [{ kind: "cell", top, right, bottom, left, suits: SHOTS }];
    const cut = line([6.2, y - heights[r]], [5.8, y]);
    return [
      { kind: "cell", top, right: cut, bottom, left, suits: SHOTS },
      { kind: "cell", top, right, bottom, left: cut, suits: SHOTS },
    ];
  });
  const variant: TemplateVariant = { focus: 0, height, slots };
  return { template: { id: `safe-${n}`, name: "Simple page", count: 4, variants: [variant] }, variant };
}
