import Link from "next/link";
import { Art } from "@/art/Art";
import { art, type MoodKey } from "@/art/manifest";
import { MagazineCover } from "@/components/MagazineCover";
import { MoodCalendar } from "@/components/MoodCalendar";
import { PAGE_TURN, PageTurn } from "@/components/PageTurn";
import { RecordStamp } from "@/components/RecordStamp";
import { sampleCheckInQuestions, sampleDays } from "@/fixtures/days";
import styles from "./page.module.css";

const WEEK: { day: string; mood?: MoodKey }[] = [
  { day: "Sat", mood: "sunny" },
  { day: "Sun", mood: "cloudy" },
  { day: "Mon", mood: "rainy" },
  { day: "Tue" },
  { day: "Wed", mood: "sunny" },
  { day: "Thu", mood: "cloudy" },
  { day: "Fri" },
];

const STEPS = [
  {
    art: art.how.talk,
    title: "You talk for a minute",
    body: "Arabic, English, or both in one sentence. Say it the way you'd tell a friend.",
  },
  {
    art: art.how.script,
    title: "Comimo writes the script",
    body: "It picks the moments worth drawing, the lines people said, and the day's weather.",
  },
  {
    art: art.how.draw,
    title: "Your cast acts it out",
    body: "The characters you made once show up in every panel, looking like themselves.",
  },
];

const sampleMoods = Object.fromEntries(sampleDays.map((d) => [d.date, d.mood]));

export default function Home() {
  return (
    <PageTurn>
      <main id="main" className={styles.main}>
        {/* ---------- Hero: page one of the zine ---------- */}
        <section className={`page ${styles.hero}`} aria-labelledby="hero-title">
          <div className={`panel halftone ${styles.lead}`} style={{ "--i": 0 } as React.CSSProperties}>
            <p className="caption">Tonight, before you sleep</p>
            <h1 id="hero-title" className={styles.headline}>
              <span>Talk about your day.</span> <span>Get a comic.</span>
            </h1>
            <p className={styles.intro}>
              Record a minute in Arabic, English or both. Comimo turns it into a short comic starring the
              characters you made.
            </p>
            <div className={styles.actions}>
              <RecordStamp href="/record" label="Record" ariaLabel="Record today's voice note" />
              <Link href="/day/sample" className="link" transitionTypes={PAGE_TURN}>
                Read a sample day
              </Link>
            </div>
            <div className={`sticker ${styles.mascot}`} style={{ "--tilt": "8deg" } as React.CSSProperties}>
              <Art asset={art.brand.mascot} priority />
            </div>
          </div>

          <figure className={`panel ${styles.scene}`} style={{ "--i": 1 } as React.CSSProperties}>
            <Art asset={art.hero.scene} className={styles.sceneArt} priority sizes="(min-width: 48rem) 40vw, 100vw" />
            <p className={`caption ${styles.sceneCaption}`}>Thursday, 8:15 am</p>
            <p className={`bubble bubble--tail-end ${styles.sceneBubble}`} dir="auto">
              <span className="bubble__who">Nour</span>
              الباص اتأخر again… بس الشاورما أنقذت اليوم
            </p>
            <figcaption className="visually-hidden">A sample panel from a day in Comimo</figcaption>
          </figure>

          <Link
            href="/month"
            className={`panel halftone ${styles.week}`}
            style={{ "--i": 2 } as React.CSSProperties}
            transitionTypes={PAGE_TURN}
          >
            <h2 className={styles.weekTitle}>This week&apos;s weather</h2>
            <ol className={styles.weekRow}>
              {WEEK.map(({ day, mood }) => (
                <li key={day} className={styles.weekDay}>
                  {mood ? (
                    <Art asset={art.mood[mood]} className={styles.weekIcon} />
                  ) : (
                    <span className={styles.weekBlank} aria-label="No comic" role="img" />
                  )}
                  <span aria-hidden="true">{day}</span>
                </li>
              ))}
            </ol>
          </Link>
        </section>

        {/* ---------- How it works ---------- */}
        <section className={`page section ${styles.how}`} aria-labelledby="how-title">
          <h2 id="how-title" className="section__title">
            From a voice note to a comic page
          </h2>
          <ol className={styles.steps}>
            {STEPS.map((step, i) => (
              <li key={step.title} className={`panel ${styles.step}`}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {i + 1}
                </span>
                <Art asset={step.art} className={styles.stepArt} alt="" sizes="(min-width: 48rem) 30vw, 100vw" />
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepBody}>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------- Check-in ---------- */}
        <section className={`page section ${styles.checkin}`} aria-labelledby="checkin-title">
          <div className={styles.checkinText}>
            <h2 id="checkin-title" className="section__title">
              On heavy days, a softer last page
            </h2>
            <p className="section__lede">
              When your day sounds like a lot, a short check-in card follows the comic. A few gentle questions,
              no scores, no advice. Your answers stay with that day.
            </p>
          </div>
          <aside className={styles.checkinCard} aria-label="Example check-in card">
            <p className={styles.checkinHello} dir="auto">
              That sounded like a lot. Want to sit with it for a moment?
            </p>
            <ul className={styles.checkinList}>
              {sampleCheckInQuestions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </aside>
        </section>

        {/* ---------- Month magazine ---------- */}
        <section className={`page section ${styles.month}`} aria-labelledby="month-title">
          <MagazineCover
            className={styles.cover}
            issue="October 2026"
            coverLines={sampleDays.slice(0, 3).map((d) => d.title)}
            href="/month"
            linkLabel="Open the October issue"
          />
          <div className={styles.monthText}>
            <h2 id="month-title" className="section__title">
              Your month, bound as a magazine
            </h2>
            <p className="section__lede">
              On the last day, every comic you made becomes an issue you can flip through, with the month&apos;s
              weather on one page.
            </p>
            <h3 id="month-glance" className={styles.glanceTitle}>
              October at a glance
            </h3>
            <MoodCalendar year={2026} month={10} moods={sampleMoods} today="2026-10-30" compact labelledBy="month-glance" />
          </div>
        </section>

        <footer className={`page ${styles.footer}`}>
          <p>Your days stay on this device. Comimo has no accounts.</p>
        </footer>
      </main>
    </PageTurn>
  );
}
