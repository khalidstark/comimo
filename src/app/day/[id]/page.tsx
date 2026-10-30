import type { Metadata } from "next";
import { artAt } from "@/art/manifest";
import { PageTurn } from "@/components/PageTurn";
import { toPanelViews } from "@/components/comic/view";
import { starterCastById } from "@/fixtures/cast";
import { getSampleDay, sampleDays } from "@/fixtures/days";
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

export default async function DayPage({ params }: DayPageProps) {
  const { id } = await params;
  const day = getSampleDay(id);

  if (!day) {
    // Stored days live only in this browser's IndexedDB, so the reader loads them on the client.
    return (
      <PageTurn>
        <DayReader id={id} />
      </PageTurn>
    );
  }

  const index = sampleDays.findIndex((d) => d.id === day.id);
  const previous = sampleDays[index - 1];
  const next = sampleDays[index + 1];
  const panels = toPanelViews(
    day.panels,
    (characterId) => starterCastById[characterId]?.name ?? characterId,
    (panel, which) => {
      const ref = which === "image" ? panel.image : panel.consistency.beforeImage;
      return ref?.kind === "art" ? { kind: "art", asset: artAt(ref.path) } : null;
    },
  );

  return (
    <PageTurn>
      <DayView
        day={day}
        panels={panels}
        faces={null}
        previous={previous ? { href: `/day/${previous.id}`, title: previous.title } : undefined}
        next={next ? { href: `/day/${next.id}`, title: next.title } : undefined}
      />
    </PageTurn>
  );
}
