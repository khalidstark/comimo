"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { Art } from "@/art/Art";
import { art } from "@/art/manifest";
import { PAGE_TURN } from "@/components/PageTurn";
import { formatDay } from "@/lib/format";
import type { Day, ImageRef, WeekSummary } from "@/lib/types";
import { useImageUrl } from "@/lib/useImageUrl";
import { WeekError, isStale, weekEnd, writeWeek } from "@/lib/week";
import styles from "./week.module.css";

const NOTE_TILTS = ["-3deg", "2deg", "-1.5deg", "3deg", "-2.5deg", "1.5deg"];

/** The panel the good thing is drawn in, as a small snapshot taped to the note. */
function NoteSnap({ image }: { image: ImageRef }) {
  const url = useImageUrl(image);
  if (!url) return <span className={styles.snap} aria-hidden="true" />;
  return (
    <span className={styles.snap} aria-hidden="true">
      {/* A stored Blob; next/image can't optimise Blobs. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" />
    </span>
  );
}

const shortDate = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
function weekday(date: string): string {
  return shortDate.format(new Date(`${date}T00:00:00Z`));
}
const rangeFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
function range(monday: string): string {
  return `${rangeFormat.format(new Date(`${monday}T00:00:00Z`))} to ${rangeFormat.format(new Date(`${weekEnd(monday)}T00:00:00Z`))}`;
}

/**
 * "This week's good things": Muse Spark reads the week's comics and pins
 * what went well and what the user did as sticky notes, each opening its
 * comic. Written only when asked (one text call), kept with the account,
 * and offered again when new comics arrive.
 */
export function WeekGoodThings({ monday, days, summary, onWritten }: { monday: string; days: Day[]; summary: WeekSummary | null; onWritten: (summary: WeekSummary) => void }) {
  const [state, setState] = useState<{ phase: "idle" } | { phase: "writing" } | { phase: "error"; message: string }>({ phase: "idle" });
  const byId = new Map(days.map((day) => [day.id, day]));
  const stale = summary ? isStale(summary, days) : false;
  const fresh = days.length - (summary?.dayIds.filter((id) => byId.has(id)).length ?? 0);

  async function write() {
    if (state.phase === "writing" || days.length === 0) return;
    setState({ phase: "writing" });
    try {
      onWritten(await writeWeek(days, monday));
      setState({ phase: "idle" });
    } catch (problem) {
      setState({ phase: "error", message: problem instanceof WeekError ? problem.message : "The week didn't come together. Try again." });
    }
  }

  const writing = state.phase === "writing";

  return (
    <section className={styles.week} aria-labelledby="week-title" aria-busy={writing || undefined}>
      <div className={styles.head}>
        <p className={styles.kicker}>{range(monday)}</p>
        <h2 id="week-title" className={styles.title}>
          This week&apos;s <span className={styles.titleMark}>good things</span>
        </h2>
      </div>

      {summary && !writing ? (
        <>
          <p className={styles.headline} dir="auto">
            {summary.headline}
          </p>
          <ol className={styles.board}>
            {summary.goodThings.map((thing, i) => {
              const day = byId.get(thing.dayId);
              const note = (
                <>
                  {day && thing.panel !== undefined && day.panels[thing.panel]?.image ? <NoteSnap image={day.panels[thing.panel].image!} /> : null}
                  <span className={styles.noteTag}>
                    {thing.kind === "did" ? "You did this" : "This happened"}
                    {day ? <span className={styles.noteDay}> · {weekday(day.date)}</span> : null}
                  </span>
                  <span className={styles.noteText} dir="auto">
                    {thing.text}
                  </span>
                </>
              );
              return (
                <li key={`${thing.dayId}-${i}`} className={styles.note} data-kind={thing.kind} style={{ "--tilt": NOTE_TILTS[i % NOTE_TILTS.length], "--i": i } as CSSProperties}>
                  {day ? (
                    <Link href={`/day/${day.id}${thing.panel !== undefined ? `#panel-${thing.panel + 1}` : ""}`} className={styles.noteLink} transitionTypes={PAGE_TURN} aria-label={`${thing.text} Open the comic from ${formatDay(day.date)}`}>
                      {note}
                    </Link>
                  ) : (
                    <span className={styles.noteLink}>{note}</span>
                  )}
                </li>
              );
            })}
          </ol>
          {summary.line ? (
            <p className={styles.line} dir="auto">
              {summary.line}
            </p>
          ) : null}
          {stale && days.length > 0 ? (
            <p className={styles.again}>
              {fresh > 0 ? `${fresh === 1 ? "A new comic" : `${fresh} new comics`} since this was written.` : "Your week changed since this was written."}{" "}
              <button type="button" className={styles.againButton} onClick={() => void write()}>
                Gather them again
              </button>
            </p>
          ) : null}
          {summary.mode === "mock" ? <p className={styles.small}>Practice mode: written from your titles, not by Muse Spark.</p> : null}
        </>
      ) : (
        <div className={styles.empty}>
          <Art asset={art.brand.mascot} className={styles.mascot} alt="" />
          <div className={styles.emptyText}>
            {writing ? (
              <p className={styles.writing} role="status">
                Reading your week<span className={styles.dots} aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>
              </p>
            ) : days.length === 0 ? (
              <>
                <p className={styles.emptyLine}>No comics yet this week.</p>
                <p className={styles.small}>Make one tonight, and Comimo can gather the week&apos;s good things for you: what you did, and what went right.</p>
                <Link href="/record" className="btn btn--accent" transitionTypes={PAGE_TURN}>
                  Record today
                </Link>
              </>
            ) : (
              <>
                <p className={styles.emptyLine}>
                  {days.length === 1 ? "One comic" : `${days.length} comics`} this week. Want to see what went right?
                </p>
                <p className={styles.small}>Muse Spark reads what you said and picks out the good parts. Nothing is scored, nothing is advice.</p>
                <button type="button" className={`btn btn--accent ${styles.gather}`} onClick={() => void write()}>
                  <span aria-hidden="true">✦</span> Gather my good things
                </button>
              </>
            )}
            {state.phase === "error" ? (
              <p className={styles.error} role="alert">
                {state.message}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
