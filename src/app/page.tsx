import Link from "next/link";
import { media } from "@/art/manifest";
import { CastStage } from "@/components/home/CastStage";
import { DemoDay } from "@/components/home/DemoDay";
import { Magnetic } from "@/components/home/Magnetic";
import { MagazineCover } from "@/components/MagazineCover";
import { MoodCalendar } from "@/components/MoodCalendar";
import { StartNudge } from "@/components/account/StartNudge";
import { UnderTheHood } from "@/components/home/UnderTheHood";
import { WeekStrip } from "@/components/home/WeekStrip";
import { LoopVideo } from "@/components/motion/LoopVideo";
import { ScrollFilm } from "@/components/motion/ScrollFilm";
import { SmoothScroll } from "@/components/motion/SmoothScroll";
import { PAGE_TURN, PageTurn } from "@/components/PageTurn";
import { RecordStamp } from "@/components/RecordStamp";
import { sampleCheckInQuestions, sampleDays, sampleWeek } from "@/fixtures/days";
import styles from "./page.module.css";

const STEPS = [
  {
    loop: media.how.talk,
    title: "Talk for a minute",
    body: "Arabic, English or both in one sentence. Say it the way you'd tell a friend.",
  },
  {
    loop: media.how.comic,
    title: "Get your comic",
    body: "Comimo picks the moments worth drawing, and your cast acts them out looking like themselves.",
  },
  {
    loop: media.how.book,
    title: "Keep the month",
    body: "On the last day, your comics are bound into a magazine you can flip through.",
  },
];

const sampleMoods = Object.fromEntries(sampleDays.map((d) => [d.date, d.mood]));

export default function Home() {
  return (
    <PageTurn>
      <main id="main" className={styles.main}>
        <SmoothScroll />

        {/* ---------- Hero: a scroll film. Nour's night room whites out into a page of her comic. ---------- */}
        <ScrollFilm
          dir={media.heroFilm.dir}
          count={media.heroFilm.count}
          width={media.heroFilm.width}
          height={media.heroFilm.height}
          length={2.6}
          focus={[0.6, 0.5]}
          pullBack={{ at: [0.66, 0.84], scale: 0.84, y: 0.75 }}
          stillAlt={media.heroFilm.alt}
          labelledBy="hero-title"
          className={styles.film}
        >
          <div className={styles.chapterOpen} data-at="0" data-until="0.1">
            <div className={`page ${styles.heroText}`}>
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
                <div className={styles.links}>
                  <StartNudge className={`btn ${styles.startLink}`} />
                  <a href="#demo" className={styles.seeDemo}>
                    See a real day
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.chapterSay} data-at="0.38" data-until="0.5">
            <p className={`bubble bubble--tail-end ${styles.sayBubble}`}>Say it in Arabic, English or both</p>
          </div>

          <div className={styles.chapterDrawn} data-at="0.84" data-until="1">
            <p className={`caption ${styles.drawnCaption}`}>…and it comes back drawn</p>
          </div>
        </ScrollFilm>

        {/* ---------- A real day ---------- */}
        <section id="demo" className={`page section ${styles.demo}`} aria-labelledby="demo-title">
          <div className={styles.demoHead}>
            <div data-reveal="stagger">
              <h2 id="demo-title" className="section__title">
                One real day, drawn by Comimo
              </h2>
              <p className="section__lede">
                Nour talked for a minute about lunch at her grandmother&apos;s. This is the comic that came back. Nour and
                her day are invented; the panels are real Muse Image output.
              </p>
            </div>
            <div data-reveal>
              <WeekStrip
                sample={sampleWeek()}
                classes={{
                  week: styles.week,
                  weekTitle: styles.weekTitle,
                  weekRow: styles.weekRow,
                  weekDay: styles.weekDay,
                  weekIcon: styles.weekIcon,
                  weekBlank: styles.weekBlank,
                }}
              />
            </div>
          </div>
          <DemoDay />
        </section>

        {/* ---------- How it works ---------- */}
        <section className={`page section ${styles.how}`} aria-labelledby="how-title">
          <h2 id="how-title" className="section__title" data-reveal>
            From a voice note to a comic
          </h2>
          <ol className={styles.steps} data-reveal="stagger">
            {STEPS.map((step, i) => (
              <li key={step.title} className={styles.step}>
                <div className={styles.stepMedia}>
                  <div data-parallax="5">
                    <LoopVideo loop={step.loop} className={styles.stepVideo} />
                  </div>
                </div>
                <h3 className={styles.stepTitle}>
                  <span className={styles.stepNumber}>{i + 1}</span>
                  {step.title}
                </h3>
                <p className={styles.stepBody}>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------- Under the hood: the four Meta models and a real receipt ---------- */}
        <UnderTheHood />

        {/* ---------- The cast ---------- */}
        <section className={`page section ${styles.cast}`} aria-labelledby="cast-title">
          <div className={styles.castHead} data-reveal="stagger">
            <h2 id="cast-title" className="section__title">
              Your cast, drawn once
            </h2>
            <p className="section__lede">
              Make the people in your days one time. They turn up in every comic looking like themselves. Tap one to say
              hi.
            </p>
          </div>
          <div data-reveal>
            <CastStage />
          </div>
          <p className={styles.castMore}>
            <Link href="/cast" className="link" transitionTypes={PAGE_TURN}>
              Meet the cast and add your own
            </Link>
          </p>
        </section>

        {/* ---------- Check-in ---------- */}
        <section className={`page section ${styles.checkin}`} aria-labelledby="checkin-title">
          <div data-reveal="stagger">
            <h2 id="checkin-title" className="section__title">
              On heavy days, a softer last page
            </h2>
            <p className="section__lede">
              When your day sounds like a lot, a short check-in card follows the comic. A few gentle questions, no
              scores, no advice. Your answers stay with that day.
            </p>
          </div>
          <aside className={styles.checkinCard} aria-label="Example check-in card" data-reveal>
            <p className={styles.checkinHello} dir="auto">
              That sounded like a lot. Want to sit with it for a moment?
            </p>
            <ul className={styles.checkinList}>
              {sampleCheckInQuestions.map((q) => (
                <li key={q} dir="auto">
                  {q}
                </li>
              ))}
            </ul>
          </aside>
        </section>

        {/* ---------- Month magazine ---------- */}
        <section className={`page section ${styles.month}`} aria-labelledby="month-title">
          <div className={styles.coverStage} data-reveal>
            <div data-parallax="4">
              <MagazineCover
                issue="October 2026"
                coverLines={sampleDays.slice(0, 3).map((d) => d.title)}
                href="/month"
                linkLabel="Open the October issue"
              />
            </div>
          </div>
          <div className={styles.monthText} data-reveal="stagger">
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
          <p>
            Your account keeps your place, and your comics follow it to every device.{" "}
            <Link href="/privacy" className="link">
              Where your words go
            </Link>
          </p>
        </footer>
      </main>
    </PageTurn>
  );
}
