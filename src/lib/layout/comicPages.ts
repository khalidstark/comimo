import { MAX_PAGES, PANELS_PER_PAGE, type ComicPage, type PageLayoutChoice } from "../types";
import { normalizeStory, pickLayout, resolveLayout, type StoryPanel } from "./pickLayout";

/**
 * Multi-page comics. A day keeps all its panels in one list (`index` runs
 * across pages, so image ids stay unique); `pages` says which panels each
 * page holds and how that page is laid out. The layout engine works on one
 * page at a time with panels numbered from 0, so pages are re-numbered
 * before layout and mapped back after.
 */

/** A page's panels with the layout picked (or stored) for it. */
export interface PageSlice<T> {
  /** Zero-based page number. */
  number: number;
  panels: T[];
  layout: PageLayoutChoice | null;
  /** Seeds the page's phone slants and layout pick: the day id for page one (so old days look the same). */
  seed: string;
}

export function pageSeed(dayId: string, page: number): string {
  return page === 0 ? dayId : `${dayId}:p${page + 1}`;
}

/** True when `pages` covers every panel exactly once, in order, with a valid number of panels per page. */
export function validPages(pages: ComicPage[] | undefined, indexes: number[]): pages is ComicPage[] {
  if (!pages || pages.length === 0 || pages.length > MAX_PAGES) return false;
  const flat = pages.flatMap((page) => page.panels);
  if (flat.length !== indexes.length || flat.some((index, i) => index !== indexes[i])) return false;
  // A single page keeps whatever count it was made with (old days, the safe layout).
  return pages.length === 1 || pages.every((page) => page.panels.length >= PANELS_PER_PAGE.min && page.panels.length <= PANELS_PER_PAGE.max);
}

/**
 * Split a day's (or script's) panels into pages. Without valid pages the
 * whole comic is one page laid out with `firstLayout` (days made before
 * multi-page comics).
 */
export function splitPages<T extends { index: number }>(
  panels: T[],
  pages: ComicPage[] | undefined,
  dayId: string,
  firstLayout?: PageLayoutChoice | null,
): PageSlice<T>[] {
  const ordered = [...panels].sort((a, b) => a.index - b.index);
  const indexes = ordered.map((panel) => panel.index);
  if (!validPages(pages, indexes)) {
    return [{ number: 0, panels: ordered, layout: firstLayout ?? null, seed: pageSeed(dayId, 0) }];
  }
  const byIndex = new Map(ordered.map((panel) => [panel.index, panel]));
  return pages.map((page, number) => ({
    number,
    panels: page.panels.map((index) => byIndex.get(index)!),
    layout: page.layout ?? (number === 0 ? (firstLayout ?? null) : null),
    seed: pageSeed(dayId, number),
  }));
}

/** A page's panels numbered from 0, as the layout engine expects. */
export function localPanels<T extends { index: number }>(panels: T[]): T[] {
  return panels.map((panel, index) => ({ ...panel, index }));
}

/**
 * Group panels by the page number the script gave each one (1-based).
 * Returns null when the numbers go down or a page has the wrong number of
 * panels and no even split of the same panels works either.
 */
export function pagesFromNumbers(pageNumbers: number[]): number[][] | null {
  const n = pageNumbers.length;
  if (n < PANELS_PER_PAGE.min || n > MAX_PAGES * PANELS_PER_PAGE.max) return null;
  const groups: number[][] = [];
  let ordered = true;
  pageNumbers.forEach((page, index) => {
    const previous = index > 0 ? pageNumbers[index - 1] : page;
    if (page < previous) ordered = false;
    if (index === 0 || page !== previous) groups.push([]);
    groups[groups.length - 1].push(index);
  });
  const fits = (sizes: number[]) => sizes.every((size) => size >= PANELS_PER_PAGE.min && size <= PANELS_PER_PAGE.max);
  if (ordered && groups.length <= MAX_PAGES && fits(groups.map((group) => group.length))) return groups;

  // Fall back to an even split into as few pages as hold the panels.
  const count = Math.ceil(n / PANELS_PER_PAGE.max);
  if (count > MAX_PAGES || n < count * PANELS_PER_PAGE.min) return null;
  const sizes = Array.from({ length: count }, (_, i) => Math.floor(n / count) + (i < n % count ? 1 : 0));
  let start = 0;
  return sizes.map((size) => {
    const group = Array.from({ length: size }, (_, i) => start + i);
    start += size;
    return group;
  });
}

/**
 * Lay out every page of a new comic: each page gets a template different
 * from the page before it (and page one differs from the previous day's last page).
 */
export function layoutPages<T extends StoryPanel>(
  panels: T[],
  pages: ComicPage[] | undefined,
  dayId: string,
  previousTemplate: string | null,
): { pages: ComicPage[]; slices: PageSlice<T>[] } {
  const slices = splitPages(panels, pages, dayId);
  let previous = previousTemplate;
  const laidOut = slices.map((slice) => {
    const story = normalizeStory(localPanels(slice.panels));
    const layout = pickLayout(story, slice.seed, previous);
    previous = layout?.template ?? previous;
    // Keep the global indexes, with each page's shots normalised (one splash per page).
    const normalised = story.map((panel, i) => ({ ...panel, index: slice.panels[i].index })) as T[];
    return { ...slice, panels: normalised, layout };
  });
  return {
    pages: laidOut.map((slice) => ({ panels: slice.panels.map((panel) => panel.index), ...(slice.layout ? { layout: slice.layout } : {}) })),
    slices: laidOut,
  };
}

/** What a day needs for layout. */
export interface LayoutDay {
  id: string;
  date: string;
  createdAt: string;
  sample?: boolean;
  layout?: PageLayoutChoice;
  pages?: ComicPage[];
  panels: StoryPanel[];
}

/**
 * The layout of every page of every day, oldest day first. Stored choices
 * are kept; a page without one gets one picked now, never the same template
 * as the page before it (within the comic or the day before).
 */
export function pageLayoutChain(days: LayoutDay[]): Map<string, (PageLayoutChoice | null)[]> {
  const ordered = [...days].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const chosen = new Map<string, (PageLayoutChoice | null)[]>();
  let previous: string | null = null;
  for (const day of ordered) {
    const choices = splitPages(day.panels, day.pages, day.id, day.layout).map((slice) => {
      const stored = slice.layout && !resolveLayout(slice.layout, slice.panels.length).fallback ? slice.layout : null;
      const choice = stored ?? (slice.panels.length > 0 ? pickLayout(normalizeStory(localPanels(slice.panels)), slice.seed, previous) : null);
      previous = choice?.template ?? previous;
      return choice;
    });
    chosen.set(day.id, choices);
  }
  return chosen;
}
