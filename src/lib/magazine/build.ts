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
}

export interface IssueCast extends CastInfo {
  portrait: PanelArt | null;
}

export interface IssueCover {
  art: PanelArt;
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
  };
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
