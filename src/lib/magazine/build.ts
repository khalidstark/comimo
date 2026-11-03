import type { BookPage } from "@/components/comic/ComicBook";
import { pageView } from "@/components/comic/pageView";
import type { PanelArt, PanelView } from "@/components/comic/view";
import { artStyleOf, type ArtStyleId } from "../artStyles";
import { splitPages } from "../layout/comicPages";
import type { Character, Day, MonthKey, PageLayoutChoice } from "../types";
import { dayCastIds, type CastInfo, type IssueDayInfo } from "./issue";

/**
 * A month's issue, ready to render: every day's comic pages laid out exactly
 * as the day reader lays them out (splitPages + pageView), the cast with
 * their portraits, and the cover. Plain data, so the server can build the
 * sample issue and hand it to the reader.
 */

export interface IssueDay extends IssueDayInfo {
  style: ArtStyleId;
  /** Arabic-first comics. */
  rtl: boolean;
  pages: BookPage[];
  panelCount: number;
  /** What the comic cost in model calls (dollars); missing on days made before costs were kept. */
  cost?: number;
}

export interface IssueCast extends CastInfo {
  portrait: PanelArt | null;
}

export interface IssueCover {
  /**
   * The cover picture: the drawn cover, else the month's best panel (the
   * sample issue has its own). Null only when no panel picture can be read;
   * the cover is then plain ink, never the sample art.
   */
  art: PanelArt | null;
  /** One line from Muse Spark; null until a cover is drawn. */
  tagline: string | null;
  /** True when Muse Image drew this month's own cover. */
  drawn: boolean;
}

export interface MagazineIssue {
  /** "sample" for the invented issue, else the month key. */
  key: string;
  month: MonthKey;
  sample: boolean;
  /** Issue number: the month's place among months with comics. Null for the sample. */
  number: number | null;
  days: IssueDay[];
  cast: IssueCast[];
  cover: IssueCover;
}

/** A day's comic as magazine pages. `layouts` is the day's entry from pageLayoutChain. */
export function issueDay(day: Day, panels: PanelView[], layouts: (PageLayoutChoice | null)[]): IssueDay {
  const pages: BookPage[] = splitPages(day.panels, day.pages, day.id, day.layout).map((slice) => {
    const indexes = new Set(slice.panels.map((panel) => panel.index));
    return {
      page: pageView(slice.panels, slice.layout ?? layouts[slice.number] ?? null, slice.seed),
      panels: panels.filter((panel) => indexes.has(panel.index)),
    };
  });
  return {
    id: day.id,
    date: day.date,
    title: day.title,
    mood: day.mood,
    pageCount: pages.length,
    castIds: dayCastIds(day),
    style: artStyleOf(day.artStyle),
    rtl: day.languages.dominant === "ar",
    pages,
    panelCount: day.panels.length,
    ...(day.cost && !day.cost.mock ? { cost: day.cost.usd } : {}),
  };
}

/** How well a panel stands in for the month's cover (a tall frame): the splash first, then emphasis, the climax and a fuller cast. */
function coverScore(panel: Day["panels"][number]): number {
  let score = 0;
  if (panel.shot === "splash") score += 3;
  if (panel.emphasis) score += 1;
  if (panel.beat === "climax") score += 1;
  score += Math.min(panel.characterIds.length, 3) * 0.5;
  if (panel.frame && panel.frame.aspect <= 1) score += 1;
  return score;
}

/**
 * Until a cover is drawn, the month's own panel goes on its cover: the best
 * drawn panel (see coverScore), the earliest on a tie, so the first panel of
 * the month when nothing stands out. Flashbacks (faded memories) only when
 * there is nothing else. Days are in issue order; null when nothing is drawn.
 */
export function coverPanel(days: Pick<Day, "id" | "panels">[]): { dayId: string; index: number } | null {
  let best: { dayId: string; index: number; score: number } | null = null;
  for (const day of days) {
    for (const panel of [...day.panels].sort((a, b) => a.index - b.index)) {
      if (!panel.image) continue;
      const score = coverScore(panel) - (panel.flashback ? 100 : 0);
      if (!best || score > best.score) best = { dayId: day.id, index: panel.index, score };
    }
  }
  return best ? { dayId: best.dayId, index: best.index } : null;
}

/**
 * Everyone who appears in the month, in cast order: characters still in the
 * cast first, then anyone since removed, by the name the comic kept for them.
 */
export function issueCast(
  days: Day[],
  cast: Character[],
  portraitOf: (character: Character) => PanelArt | null,
): IssueCast[] {
  const seen = new Set(days.flatMap((day) => dayCastIds(day)));
  const members: IssueCast[] = cast
    .filter((character) => seen.has(character.id))
    .map((character) => ({ id: character.id, name: character.name, role: character.role, portrait: portraitOf(character) }));
  const known = new Set(members.map((member) => member.id));
  for (const day of days) {
    for (const panel of day.panels) {
      for (const [id, name] of Object.entries(panel.names ?? {})) {
        if (known.has(id) || !seen.has(id)) continue;
        known.add(id);
        members.push({ id, name, role: "other", portrait: null });
      }
    }
  }
  return members;
}
