import { art, artAt } from "@/art/manifest";
import { toPanelViews, type PanelArt } from "@/components/comic/view";
import { starterCastById } from "@/fixtures/cast";
import { loadCast } from "../cast";
import { pageLayoutChain } from "../layout/comicPages";
import { getImage, listDays } from "../store";
import type { Character, Day, ImageRef, MonthKey } from "../types";
import { issueCast, issueDay, type MagazineIssue } from "./build";
import { getStoredCover } from "./coverStore";
import { issueDays, issueMonths, monthOf } from "./issue";

/**
 * Reads the user's months from this browser's IndexedDB and turns one into
 * an issue. Image Blobs become object URLs; call `release` when the issue is
 * no longer shown.
 */

export interface Library {
  days: Day[];
  cast: Character[];
  months: MonthKey[];
}

export async function loadLibrary(): Promise<Library> {
  const [stored, cast] = await Promise.all([listDays(), loadCast()]);
  const days = issueDays(stored);
  return { days, cast, months: issueMonths(days) };
}

export interface LoadedIssue {
  issue: MagazineIssue;
  release: () => void;
}

export async function loadIssue(library: Library, month: MonthKey): Promise<LoadedIssue> {
  const urls: string[] = [];
  const release = () => urls.splice(0).forEach((url) => URL.revokeObjectURL(url));

  async function resolve(ref: ImageRef | null): Promise<PanelArt | null> {
    if (!ref) return null;
    if (ref.kind === "art") return { kind: "art", asset: artAt(ref.path) };
    const blob = await getImage(ref.id);
    if (!blob) return null;
    const src = URL.createObjectURL(blob);
    urls.push(src);
    return { kind: "url", src };
  }

  try {
    const days = library.days.filter((day) => monthOf(day.date) === month);
    const castById = new Map(library.cast.map((member) => [member.id, member]));
    const snapshot = new Map(days.flatMap((day) => day.panels.flatMap((panel) => Object.entries(panel.names ?? {}))));
    const nameOf = (id: string) => castById.get(id)?.name ?? snapshot.get(id) ?? starterCastById[id]?.name ?? "Someone";

    const images = new Map<string, PanelArt | null>();
    await Promise.all(
      days.flatMap((day) => day.panels.map((panel) => resolve(panel.image).then((found) => images.set(`${day.id}:${panel.index}`, found)))),
    );
    const portraits = new Map<string, PanelArt | null>();
    await Promise.all(library.cast.map((member) => resolve(member.portrait).then((found) => portraits.set(member.id, found))));

    // The same layouts the day reader picks: a chain over every stored day.
    const chain = pageLayoutChain(library.days);
    const built = days.map((day) => {
      const panels = toPanelViews(day.panels, nameOf, (panel, which) => (which === "image" ? (images.get(`${day.id}:${panel.index}`) ?? null) : null));
      return issueDay(day, panels, chain.get(day.id) ?? []);
    });

    const stored = await getStoredCover(month);
    const coverArt = stored ? await resolve({ kind: "blob", id: stored.imageId }) : null;

    const issue: MagazineIssue = {
      key: month,
      month,
      sample: false,
      number: library.months.indexOf(month) + 1,
      days: built,
      cast: issueCast(days, library.cast, (member) => portraits.get(member.id) ?? null),
      cover: coverArt
        ? { art: coverArt, tagline: stored!.tagline || null, drawn: true }
        : { art: { kind: "art", asset: art.month.cover }, tagline: null, drawn: false },
    };
    return { issue, release };
  } catch (error) {
    release();
    throw error;
  }
}
