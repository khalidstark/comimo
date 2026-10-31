import Link from "next/link";
import { Art } from "@/art/Art";
import { art, type MoodKey } from "@/art/manifest";
import { CastStage } from "@/components/home/CastStage";
import { DemoDay } from "@/components/home/DemoDay";
import { Magnetic } from "@/components/home/Magnetic";
import { MagazineCover } from "@/components/MagazineCover";
import { MoodCalendar } from "@/components/MoodCalendar";
import { StartNudge } from "@/components/account/StartNudge";
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
  { day: "Thu", mood: "rainbow" },
  { day: "Fri" },
];

const STEPS = [
  {
    art: art.how.talk,
    title: "Talk for a minute",
    body: "Arabic, English or both in one sentence. Say it the way you'd tell a friend.",
  },
  {
    art: art.how.comic,
    title: "Get your comic",
    body: "Comimo picks the moments worth drawing, and your cast acts them out looking like themselves.",
  },
  {
    art: art.how.book,
    title: "Keep the month",
    body: "On the last day, your comics are bound into a magazine you can flip through.",
  },
];

const sampleMoods = Object.fromEntries(sampleDays.map((d) => [d.date, d.mood]));

export default function Home() {
  return (
    <PageTurn>
      <main id="main" className={styles.main}>
        {/* ---------- Hero: the zine's night cover ---------- */}
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroArt}>
            <Art asset={art.hero.scene} className={styles.heroImage} priority sizes="100vw" />
          </div>

          <div className={`page ${styles.heroInner}`}>
            <div className={styles.heroText}>
              <p className={`caption ${styles.kicker}`}>Tonight, before you sleep</p>
              <h1 id="hero-title" className={styles.headline}>
                <span className={styles.line}>
                  <span>Talk about your day.</span>
                </span>{" "}
                <span className={styles.line}>
                  <span>Get a comic.</span>
                </span>
              </h1>
              <p className={styles.intro}>
                Record a minute in Arabic, English or both. Comimo draws it as a short comic starring the people in
                your life.
              </p>
              <div className={styles.actions}>
                <Magnetic className={styles.magnet}>
                  <RecordStamp href="/record" label="Record" ariaLabel="Record today's voice note" />
                </Magnetic>
                <StartNudge className={styles.seeDemo} />
                <a href="#demo" className={styles.seeDemo}>
                  See a real day
                </a>
              </div>
            </div>

            <Link href="/month" className={styles.week} transitionTypes={PAGE_TURN}>
              <span className={styles.weekTitle}>This week</span>
              <ol className={styles.weekRow}>
                {WEEK.map(({ day, mood }) => (
                  <li key={day} className={styles.weekDay}>
                    {mood ? (
                      <Art asset={art.mood[mood]} className={styles.weekIcon} alt={`${day}: ${art.mood[mood].alt}`} />
                    ) : (
                      <span className={styles.weekBlank} role="img" aria-label={`${day}: no comic`} />
                    )}
                    <span aria-hidden="true">{day.slice(0, 2)}</span>
                  </li>
                ))}
              </ol>
            </Link>
          </div>
        </section>

        {/* ---------- A real day ---------- */}
        <section id="demo" className={`page section ${styles.demo}`} aria-labelledby="demo-title">
          <h2 id="demo-title" className="section__title">
            One real day, drawn by Comimo
          </h2>
          <p className="section__lede">
            Nour talked for a minute about lunch at her grandmother&apos;s. This is the comic that came back. Nour and her
            day are invented; the panels are real Muse Image output.
          </p>
          <DemoDay />
        </section>

        {/* ---------- How it works ---------- */}
        <section className={`page section ${styles.how}`} aria-labelledby="how-title">
          <h2 id="how-title" className="section__title">
            From a voice note to a comic
          </h2>
          <ol className={styles.steps}>
            {STEPS.map((step, i) => (
              <li key={step.title} className={styles.step}>
                <Art asset={step.art} className={styles.stepArt} alt="" sizes="(min-width: 48rem) 30vw, 80vw" />
                <h3 className={styles.stepTitle}>
                  <span className={styles.stepNumber}>{i + 1}</span>
                  {step.title}
                </h3>
                <p className={styles.stepBody}>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------- The cast ---------- */}
        <section className={`page section ${styles.cast}`} aria-labelledby="cast-title">
          <div className={styles.castHead}>
            <h2 id="cast-title" className="section__title">
              Your cast, drawn once
            </h2>
            <p className="section__lede">
              Make the people in your days one time. They turn up in every comic looking like themselves. Tap one to say
              hi.
            </p>
          </div>
          <CastStage />
          <p className={styles.castMore}>
            <Link href="/cast" className="link" transitionTypes={PAGE_TURN}>
              Meet the cast and add your own
            </Link>
          </p>
        </section>

        {/* ---------- Check-in ---------- */}
        <section className={`page section ${styles.checkin}`} aria-labelledby="checkin-title">
          <div>
            <h2 id="checkin-title" className="section__title">
              On heavy days, a softer last page
            </h2>
            <p className="section__lede">
              When your day sounds like a lot, a short check-in card follows the comic. A few gentle questions, no
              scores, no advice. Your answers stay with that day.
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
          <p>Your account keeps your place, and your comics follow it to every device.</p>
        </footer>
      </main>
    </PageTurn>
  );
}
