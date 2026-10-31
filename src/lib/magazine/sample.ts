import { art, artAt } from "@/art/manifest";
import { toPanelViews, type PanelArt } from "@/components/comic/view";
import { starterCast, starterCastById } from "@/fixtures/cast";
import { sampleDays } from "@/fixtures/days";
import { pageLayoutChain } from "../layout/comicPages";
import type { ImageRef } from "../types";
import { issueCast, issueDay, type MagazineIssue } from "./build";
import { monthOf } from "./issue";

/** The sample issue's cover line, written by Muse Spark with its cover art. */
const SAMPLE_TAGLINE: string | null = null;

function artFor(ref: ImageRef | null): PanelArt | null {
  return ref?.kind === "art" ? { kind: "art", asset: artAt(ref.path) } : null;
}

/** The invented sample month, built from the sample days and the starter cast. */
export function sampleIssue(): MagazineIssue {
  const chain = pageLayoutChain(sampleDays);
  const nameOf = (id: string) => starterCastById[id]?.name ?? "Someone";
  const days = sampleDays.map((day) =>
    issueDay(
      day,
      toPanelViews(day.panels, nameOf, (panel, which) => (which === "image" ? artFor(panel.image) : null)),
      chain.get(day.id) ?? [],
    ),
  );
  return {
    key: "sample",
    month: monthOf(sampleDays[0].date),
    sample: true,
    number: null,
    days,
    cast: issueCast(sampleDays, starterCast, (member) => artFor(member.portrait)),
    cover: { art: { kind: "art", asset: art.month.cover }, tagline: SAMPLE_TAGLINE, drawn: false },
  };
}
