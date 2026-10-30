import type { Metadata } from "next";
import Link from "next/link";
import { Art } from "@/art/Art";
import { art } from "@/art/manifest";
import { EmptyState } from "@/components/EmptyState";
import { MagazineCover } from "@/components/MagazineCover";
import { MoodCalendar } from "@/components/MoodCalendar";
import { PAGE_TURN, PageTurn } from "@/components/PageTurn";
import { formatDay, moodWords, sampleDays } from "@/lib/sample";
import styles from "./month.module.css";

export const metadata: Metadata = { title: "October 2026" };

const sampleMoods = Object.fromEntries(sampleDays.map((d) => [d.date, d.mood]));

export default function MonthPage() {
  return (
    <PageTurn>
      <main id="main" className="page">
        <header className="page-head">
          <h1>October 2026</h1>
          <p className="page-head__lede">
            A sample issue made from four invented days, to show how a month reads once it&apos;s bound.
          </p>
        </header>

        <section className={styles.spread} aria-labelledby="toc-title">
          <MagazineCover
            className={styles.cover}
            issue="October 2026"
            coverLines={sampleDays.map((d) => d.title)}
          />
          <div className={`panel ${styles.toc}`}>
            <h2 id="toc-title" className={styles.tocTitle}>
              In this issue
            </h2>
            <ol className={styles.tocList}>
              {sampleDays.map((day, i) => (
                <li key={day.id}>
                  <Link href={`/day/${day.id}`} className={styles.tocItem} transitionTypes={PAGE_TURN}>
                    <Art asset={art.mood[day.mood]} className={styles.tocIcon} alt="" />
                    <span className={styles.tocText}>
                      <span className={styles.tocDay}>{formatDay(day.date)}</span>
                      <span className={styles.tocName} dir="auto">
                        {day.title}
                      </span>
                      <span className="visually-hidden">, {moodWords[day.mood]} day</span>
                    </span>
                    <span className={styles.tocPage} aria-label={`page ${i * 2 + 3}`}>
                      {i * 2 + 3}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className={`section ${styles.glance}`} aria-labelledby="glance-title">
          <div className={styles.glanceText}>
            <h2 id="glance-title" className="section__title">
              The month&apos;s weather
            </h2>
            <p className="section__lede">
              Every day you made a comic gets its weather. Blank squares are days you didn&apos;t record, and
              that&apos;s fine.
            </p>
            <ul className={styles.legend} aria-label="Weather key">
              {(Object.keys(moodWords) as (keyof typeof moodWords)[]).map((m) => (
                <li key={m}>
                  <Art asset={art.mood[m]} className={styles.legendIcon} alt="" />
                  {moodWords[m]}
                </li>
              ))}
            </ul>
          </div>
          <MoodCalendar year={2026} month={10} moods={sampleMoods} today="2026-10-30" labelledBy="glance-title" />
        </section>

        <section className={styles.own} aria-label="Your own issue">
          <EmptyState
            art={art.empty.month}
            title="Your own October issue is still blank"
            action={
              <Link href="/record" className="btn btn--accent" transitionTypes={PAGE_TURN}>
                Record today
              </Link>
            }
          >
            <p>Record a day and it lands here. On the last day of the month, the issue binds itself.</p>
          </EmptyState>
        </section>
      </main>
    </PageTurn>
  );
}
