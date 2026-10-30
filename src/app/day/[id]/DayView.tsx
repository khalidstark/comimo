import Link from "next/link";
import { art } from "@/art/manifest";
import { Comic } from "@/components/comic/Comic";
import { FacesNote } from "@/components/comic/FacesNote";
import { MoodBadge } from "@/components/comic/MoodBadge";
import type { FixedFace, PanelView } from "@/components/comic/view";
import { EmptyState } from "@/components/EmptyState";
import { PAGE_TURN } from "@/components/PageTurn";
import { formatDay } from "@/lib/format";
import type { Day } from "@/lib/types";
import styles from "./day.module.css";

export interface DayLink {
  href: string;
  title: string;
}

interface DayViewProps {
  day: Day;
  panels: PanelView[];
  /** Characters SAM fixed; null when the day was never checked (sample days). */
  faces: FixedFace[] | null;
  previous?: DayLink;
  next?: DayLink;
}

const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" });

/** One day as a comic: date, title and weather, the panels, then what comes after them. */
export function DayView({ day, panels, faces, previous, next }: DayViewProps) {
  const crisis = day.safety === "crisis";
  const date = formatDay(day.date);

  return (
    <main id="main" className="page">
      <header className={`page-head ${styles.head}`}>
        <p className={styles.date}>
          <time dateTime={day.date}>{date}</time>
        </p>
        <h1 dir="auto">{crisis ? "Let's pause here" : day.title}</h1>
        {crisis ? null : <MoodBadge mood={day.mood} />}
      </header>

      {crisis ? (
        <section className={styles.pause} aria-label="No comic today">
          <p>
            That sounded like a really heavy day, so Comimo didn&apos;t turn it into a comic. If you are in danger or
            thinking about hurting yourself, please reach out to someone now.
          </p>
          <p>
            <a className="link" href="https://findahelpline.com" target="_blank" rel="noreferrer">
              Find a free, confidential helpline near you
            </a>
          </p>
        </section>
      ) : (
        <Comic panels={panels} label={`Comic for ${date}, ${panels.length} panels`} />
      )}

      {!crisis && faces ? <FacesNote faces={faces} /> : null}

      {day.heavy && !crisis ? (
        <section className={styles.checkin} aria-labelledby="checkin-title">
          <h2 id="checkin-title" className={styles.checkinTitle}>
            That sounded like a lot. Want to sit with it for a moment?
          </h2>
          <p className={styles.checkinLede}>Answer any, all or none. Your answers stay with this day.</p>
          <form className={styles.checkinForm}>
            {(day.checkIn?.questions ?? []).map((q, i) => (
              <label key={q} className={styles.question}>
                <span>{q}</span>
                <textarea name={`q${i}`} rows={2} dir="auto" />
              </label>
            ))}
            <div className={styles.checkinActions}>
              <button type="button" className="btn btn--ink" aria-disabled="true" aria-describedby="save-note">
                Save with this day
              </button>
              <span id="save-note" className={styles.note}>
                Saving answers arrives in the next update.
              </span>
            </div>
          </form>
        </section>
      ) : null}

      <nav className={styles.pager} aria-label="Other days">
        {previous ? (
          <Link href={previous.href} className={styles.pagerLink} transitionTypes={PAGE_TURN}>
            <span className={styles.pagerHint}>Previous day</span>
            <span dir="auto">{previous.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={next.href} className={`${styles.pagerLink} ${styles.pagerNext}`} transitionTypes={PAGE_TURN}>
            <span className={styles.pagerHint}>Next day</span>
            <span dir="auto">{next.title}</span>
          </Link>
        ) : (
          <Link href="/month" className={`${styles.pagerLink} ${styles.pagerNext}`} transitionTypes={PAGE_TURN}>
            <span className={styles.pagerHint}>Back to</span>
            <span>The {monthFormat.format(new Date(`${day.date}T00:00:00Z`))} issue</span>
          </Link>
        )}
      </nav>
    </main>
  );
}

/** The day isn't in this browser (cleared data, another device, a bad link). */
export function MissingDay() {
  return (
    <main id="main" className="page">
      <div className={styles.missing}>
        <EmptyState
          as="h1"
          art={art.empty.days}
          title="This day isn't on this device"
          action={
            <div className={styles.missingActions}>
              <Link href="/record" className="btn btn--accent" transitionTypes={PAGE_TURN}>
                Record today
              </Link>
              <Link href="/day/sample" className="link" transitionTypes={PAGE_TURN}>
                Read a sample day
              </Link>
            </div>
          }
        >
          <p>
            Comics live only in the browser where they were made. If you cleared your browser data or opened this link
            somewhere else, the day won&apos;t show up here.
          </p>
        </EmptyState>
      </div>
    </main>
  );
}
