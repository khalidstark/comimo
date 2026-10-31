import Link from "next/link";
import { art } from "@/art/manifest";
import { ComicBook, type BookPage } from "@/components/comic/ComicBook";
import { FacesNote } from "@/components/comic/FacesNote";
import { MoodBadge } from "@/components/comic/MoodBadge";
import { pageView } from "@/components/comic/pageView";
import type { FacesSummary, PanelView } from "@/components/comic/view";
import { AlbumPanel } from "@/components/AlbumPanel";
import { AlbumQr } from "@/components/album/AlbumQr";
import { CheckInCard } from "@/components/CheckInCard";
import { EmptyState } from "@/components/EmptyState";
import { NewPeopleCard } from "@/components/NewPeopleCard";
import { PAGE_TURN } from "@/components/PageTurn";
import { artStyleOf } from "@/lib/artStyles";
import { formatDay } from "@/lib/format";
import { splitPages } from "@/lib/layout/comicPages";
import type { Day, PageLayoutChoice } from "@/lib/types";
import styles from "./day.module.css";

export interface DayLink {
  href: string;
  title: string;
}

interface DayViewProps {
  day: Day;
  panels: PanelView[];
  /** What the face check truthfully did; null for sample days and days made before the real check. */
  faces: FacesSummary | null;
  /** Each page's layout: stored, or picked for it on read (see pageLayoutChain). */
  layouts: (PageLayoutChoice | null)[];
  previous?: DayLink;
  next?: DayLink;
}

const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" });

/** One day as a comic: date, title and weather, the panels, then what comes after them. */
export function DayView({ day, panels, faces, layouts, previous, next }: DayViewProps) {
  const crisis = day.safety === "crisis";
  const book: BookPage[] =
    crisis || day.panels.length === 0
      ? []
      : splitPages(day.panels, day.pages, day.id, day.layout).map((slice) => {
          const indexes = new Set(slice.panels.map((panel) => panel.index));
          return {
            page: pageView(slice.panels, slice.layout ?? layouts[slice.number] ?? null, slice.seed),
            panels: panels.filter((panel) => indexes.has(panel.index)),
          };
        });
  const date = formatDay(day.date);

  return (
    <main id="main" className="page">
      <header className={`page-head ${styles.head}`}>
        <p className={styles.date}>
          <time dateTime={day.date}>{date}</time>
        </p>
        <h1 dir="auto">{crisis ? "Your day" : day.title}</h1>
        {crisis ? (
          <p className="page-head__lede">Comimo didn&apos;t turn this note into a comic.</p>
        ) : (
          <MoodBadge mood={day.mood} />
        )}
      </header>

      {book.length > 0 ? (
        <ComicBook
          pages={book}
          style={artStyleOf(day.artStyle)}
          label={`Comic for ${date}, ${book.length > 1 ? `${book.length} pages, ` : ""}${panels.length} panels`}
          rtl={day.languages.dominant === "ar"}
          endnote={day.sample ? undefined : <AlbumQr dayId={day.id} />}
        />
      ) : null}

      {!crisis && day.transcript ? (
        <details className={styles.said}>
          <summary className={styles.saidToggle}>What you said</summary>
          <blockquote className={styles.saidText} dir="auto">
            {day.transcript.split(/\n{2,}/).map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </blockquote>
        </details>
      ) : null}

      {!crisis && faces ? <FacesNote summary={faces} /> : null}

      {day.heavy && !crisis ? <CheckInCard day={day} /> : null}

      {!crisis && !day.sample && day.newPeople?.length ? <NewPeopleCard day={day} /> : null}

      {!crisis && !day.sample && book.length > 0 ? <AlbumPanel dayId={day.id} title={day.title} /> : null}

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

/** The day isn't in this comic book (another account, deleted, a bad link). */
export function MissingDay() {
  return (
    <main id="main" className="page">
      <div className={styles.missing}>
        <EmptyState
          as="h1"
          art={art.empty.days}
          title="This day isn't in your comic book"
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
            Your comics follow your account to every device you sign in on. If this day belongs to another account, was
            deleted, or the link is wrong, it won&apos;t show up here.
          </p>
        </EmptyState>
      </div>
    </main>
  );
}
