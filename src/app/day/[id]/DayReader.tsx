"use client";

import { useEffect, useState } from "react";
import { artAt } from "@/art/manifest";
import { fixedFaces, toPanelViews, type FixedFace, type PanelArt, type PanelView } from "@/components/comic/view";
import { starterCastById } from "@/fixtures/cast";
import { getSampleDay } from "@/fixtures/days";
import { getDay, getImage, listCast, listDays } from "@/lib/store";
import type { Character, Day, ImageRef } from "@/lib/types";
import { DayView, MissingDay, type DayLink } from "./DayView";
import styles from "./day.module.css";

type Loaded =
  | { status: "loading" }
  | { status: "missing" }
  | {
      status: "ready";
      day: Day;
      panels: PanelView[];
      faces: FixedFace[] | null;
      previous?: DayLink;
      next?: DayLink;
    };

/** Neighbouring stored days by date, for the pager. Sample days kept only for their check-in answers are skipped. */
function neighbours(days: Day[], day: Day): { previous?: DayLink; next?: DayLink } {
  const ordered = days.filter((d) => !d.sample).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const at = ordered.findIndex((d) => d.id === day.id);
  if (at === -1) return {};
  const link = (d: Day | undefined): DayLink | undefined =>
    d ? { href: `/day/${d.id}`, title: d.safety === "crisis" ? "Your day" : d.title } : undefined;
  return { previous: link(ordered[at - 1]), next: link(ordered[at + 1]) };
}

/**
 * Reads a day from this browser's IndexedDB and shows it as a comic. Image
 * Blobs become object URLs, revoked when the reader unmounts. Sample ids fall
 * back to the fixtures (the page normally renders those on the server).
 */
export function DayReader({ id }: { id: string }) {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];

    async function resolve(ref: ImageRef | null): Promise<PanelArt | null> {
      if (!ref) return null;
      if (ref.kind === "art") return { kind: "art", asset: artAt(ref.path) };
      const blob = await getImage(ref.id);
      if (!blob || cancelled) return null;
      const src = URL.createObjectURL(blob);
      urls.push(src);
      return { kind: "url", src };
    }

    async function load() {
      const stored = await getDay(id);
      const day = stored ?? getSampleDay(id);
      if (cancelled) return;
      if (!day) {
        setLoaded({ status: "missing" });
        return;
      }

      const [cast, days] = await Promise.all([listCast(), stored ? listDays() : Promise.resolve([])]);
      const castById = new Map<string, Character>(cast.map((member) => [member.id, member]));
      const member = (characterId: string) => castById.get(characterId) ?? starterCastById[characterId];
      const nameOf = (characterId: string) => member(characterId)?.name ?? characterId;

      // Resolve every image first, then build the views synchronously.
      const images = new Map<string, PanelArt | null>();
      await Promise.all(
        day.panels.flatMap((panel) => [
          resolve(panel.image).then((art) => images.set(`${panel.index}:image`, art)),
          resolve(panel.consistency.beforeImage).then((art) => images.set(`${panel.index}:before`, art)),
        ]),
      );
      const fixedIds = new Set(day.panels.flatMap((panel) => panel.consistency.fixedCharacterIds));
      const portraits = new Map<string, PanelArt | null>();
      await Promise.all(
        [...fixedIds].map((characterId) =>
          resolve(member(characterId)?.portrait ?? null).then((art) => portraits.set(characterId, art)),
        ),
      );
      if (cancelled) return;

      const panels = toPanelViews(day.panels, nameOf, (panel, which) => images.get(`${panel.index}:${which}`) ?? null);
      const checked = day.panels.some((panel) => panel.consistency.checked);
      const faces = checked
        ? fixedFaces(day.panels, nameOf, (characterId) => portraits.get(characterId) ?? null)
        : null;

      document.title = `${day.safety === "crisis" ? "Your day" : day.title} | Comimo`;
      setLoaded({ status: "ready", day, panels, faces, ...(stored ? neighbours(days, day) : {}) });
    }

    void load();
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [id]);

  if (loaded.status === "missing") return <MissingDay />;
  if (loaded.status === "loading") return <DayLoading />;
  return (
    <DayView
      day={loaded.day}
      panels={loaded.panels}
      faces={loaded.faces}
      previous={loaded.previous}
      next={loaded.next}
    />
  );
}

/** Pencilled frames while the day is read from the device. */
function DayLoading() {
  return (
    <main id="main" className="page" aria-busy="true">
      <header className={`page-head ${styles.head}`}>
        <p className={styles.date}>Your day</p>
        <p className={styles.loadingTitle} role="status">
          Opening your comic…
        </p>
      </header>
      <ol className={styles.loadingPage} aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className={styles.loadingFrame} />
        ))}
      </ol>
    </main>
  );
}
