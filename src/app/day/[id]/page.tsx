import type { Metadata } from "next";
import { Suspense } from "react";
import { artAt } from "@/art/manifest";
import { PageTurn } from "@/components/PageTurn";
import { facesSummary, fixedFaces, oneOffFaces, toPanelViews, type PanelArt } from "@/components/comic/view";
import { starterCastById } from "@/fixtures/cast";
import { getSampleDay, sampleDays } from "@/fixtures/days";
import { pageLayoutChain } from "@/lib/layout/comicPages";
import type { ImageRef } from "@/lib/types";
import { DayReader } from "./DayReader";
import { DayView } from "./DayView";

interface DayPageProps {
  params: Promise<{ id: string }>;
}

/** The sample days are prerendered; any other id is a day kept in the browser. */
export function generateStaticParams() {
  return sampleDays.map((day) => ({ id: day.id }));
}

export async function generateMetadata({ params }: DayPageProps): Promise<Metadata> {
  const { id } = await params;
  const day = getSampleDay(id);
  return { title: day ? day.title : "Your day" };
}

export default function DayPage({ params }: DayPageProps) {
  // The id is only known per request for stored days, so the page streams in behind a boundary.
  return (
    <PageTurn>
      <Suspense fallback={null}>
        <DayContent params={params} />
      </Suspense>
    </PageTurn>
  );
}

async function DayContent({ params }: DayPageProps) {
  const { id } = await params;
  const day = getSampleDay(id);

  // Stored days live only in this browser's IndexedDB, so the reader loads them on the client.
  if (!day) return <DayReader id={id} />;

  const index = sampleDays.findIndex((d) => d.id === day.id);
  const previous = sampleDays[index - 1];
  const next = sampleDays[index + 1];
  const artOf = (ref: ImageRef | null): PanelArt | null => (ref?.kind === "art" ? { kind: "art", asset: artAt(ref.path) } : null);
  const snapshot = new Map(day.panels.flatMap((panel) => Object.entries(panel.names ?? {})));
  const nameOf = (characterId: string) => starterCastById[characterId]?.name ?? snapshot.get(characterId) ?? characterId;
  const panels = toPanelViews(day.panels, nameOf, (panel, which) => artOf(which === "image" ? panel.image : panel.consistency.beforeImage));
  // The samples are real runs: the note says what SAM 3.1 and Muse Spark did, from what is stored on the panels.
  const faces = facesSummary(
    day.panels,
    fixedFaces(day.panels, nameOf, (characterId) => artOf(starterCastById[characterId]?.portrait ?? null)),
    oneOffFaces(day.panels, nameOf),
  );

  return (
    <DayView
      day={day}
      panels={panels}
      faces={faces}
      layouts={pageLayoutChain(sampleDays).get(day.id) ?? []}
      previous={previous ? { href: `/day/${previous.id}`, title: previous.title } : undefined}
      next={next ? { href: `/day/${next.id}`, title: next.title } : undefined}
    />
  );
}
