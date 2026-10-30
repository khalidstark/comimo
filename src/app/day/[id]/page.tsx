import type { Metadata } from "next";
import Link from "next/link";
import { Art } from "@/art/Art";
import { art } from "@/art/manifest";
import { EmptyState } from "@/components/EmptyState";
import { PAGE_TURN, PageTurn } from "@/components/PageTurn";
import { checkInQuestions, formatDay, getSampleDay, moodWords, sampleDays } from "@/lib/sample";
import styles from "./day.module.css";

interface DayPageProps {
  params: Promise<{ id: string }>;
}

export function generateStaticParams() {
  return sampleDays.map((day) => ({ id: day.id }));
}

export async function generateMetadata({ params }: DayPageProps): Promise<Metadata> {
  const { id } = await params;
  const day = getSampleDay(id);
  return { title: day ? day.title : "Day not found" };
}

export default async function DayPage({ params }: DayPageProps) {
  const { id } = await params;
  const day = getSampleDay(id);

  if (!day) {
    return (
      <PageTurn>
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
                Comics live only in the browser where they were made. If you cleared your browser data or opened
                this link somewhere else, the day won&apos;t show up here.
              </p>
            </EmptyState>
          </div>
        </main>
      </PageTurn>
    );
  }

  const index = sampleDays.findIndex((d) => d.id === day.id);
  const previous = sampleDays[index - 1];
  const next = sampleDays[index + 1];
  const mood = art.mood[day.mood];

  return (
    <PageTurn>
      <main id="main" className="page">
        <header className={`page-head ${styles.head}`}>
          <p className={styles.date}>
            <time dateTime={day.date}>{formatDay(day.date)}</time>
          </p>
          <h1 dir="auto">{day.title}</h1>
          <p className={styles.weather}>
            <Art asset={mood} className={styles.weatherIcon} alt="" />
            <span>{moodWords[day.mood]} day</span>
          </p>
        </header>

        <ol className={styles.comic} aria-label={`Comic for ${formatDay(day.date)}, ${day.panels.length} panels`}>
          {day.panels.map((panel, i) => (
            <li key={i} className={`panel ${styles.frame}`}>
              <Art
                asset={art.scenes[panel.scene]}
                className={styles.frameArt}
                alt=""
                sizes="(min-width: 48rem) 50vw, 100vw"
              />
              {panel.caption ? (
                <p className={`caption ${styles.frameCaption}`} dir="auto">
                  {panel.caption}
                </p>
              ) : null}
              {panel.bubbles.map((bubble, b) => (
                <p
                  key={b}
                  className={`bubble ${(i + b) % 2 ? "bubble--tail-end" : ""} ${styles.frameBubble}`}
                  data-side={(i + b) % 2 ? "end" : "start"}
                  dir="auto"
                >
                  <span className="bubble__who">{bubble.who}</span>
                  {bubble.text}
                </p>
              ))}
            </li>
          ))}
        </ol>

        {day.heavy ? (
          <section className={styles.checkin} aria-labelledby="checkin-title">
            <h2 id="checkin-title" className={styles.checkinTitle}>
              That sounded like a lot. Want to sit with it for a moment?
            </h2>
            <p className={styles.checkinLede}>Answer any, all or none. Your answers stay with this day.</p>
            <form className={styles.checkinForm}>
              {checkInQuestions.map((q, i) => (
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
                  Saving arrives with on-device storage.
                </span>
              </div>
            </form>
          </section>
        ) : null}

        <nav className={styles.pager} aria-label="Other days">
          {previous ? (
            <Link href={`/day/${previous.id}`} className={styles.pagerLink} transitionTypes={PAGE_TURN}>
              <span className={styles.pagerHint}>Previous day</span>
              <span dir="auto">{previous.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`/day/${next.id}`}
              className={`${styles.pagerLink} ${styles.pagerNext}`}
              transitionTypes={PAGE_TURN}
            >
              <span className={styles.pagerHint}>Next day</span>
              <span dir="auto">{next.title}</span>
            </Link>
          ) : (
            <Link href="/month" className={`${styles.pagerLink} ${styles.pagerNext}`} transitionTypes={PAGE_TURN}>
              <span className={styles.pagerHint}>Back to</span>
              <span>The October issue</span>
            </Link>
          )}
        </nav>
      </main>
    </PageTurn>
  );
}
