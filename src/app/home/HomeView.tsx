"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { Art } from "@/art/Art";
import { art } from "@/art/manifest";
import { useAccount } from "@/components/account/useAccount";
import { NewDiary } from "@/components/diary/NewDiary";
import { Notebook } from "@/components/diary/Notebook";
import { WeekGoodThings } from "@/components/diary/WeekGoodThings";
import { Magnetic } from "@/components/home/Magnetic";
import { MoodCalendar } from "@/components/MoodCalendar";
import { PAGE_TURN } from "@/components/PageTurn";
import { RecordStamp } from "@/components/RecordStamp";
import { findSelf, hasOwnFace } from "@/lib/aboutYou";
import { EVERY_DAY, MAX_DIARIES, daysIn, loadDiaries } from "@/lib/diaries";
import { countWord, formatDay, moodWords } from "@/lib/format";
import { greeting, promptsFor } from "@/lib/greeting";
import { localIsoDate } from "@/lib/pipeline";
import { listCast, listDays } from "@/lib/store";
import type { Day, Diary, WeekSummary } from "@/lib/types";
import { useImageUrl } from "@/lib/useImageUrl";
import { loadWeek, weekDays, weekStart } from "@/lib/week";
import shelf from "@/components/diary/diary.module.css";
import styles from "./home.module.css";

interface Loaded {
  /** The user's own comics (no samples, no crisis notes), newest first. */
  comics: Day[];
  /** Every own day, for the diary counts. */
  days: Day[];
  diaries: Diary[];
  week: WeekSummary | null;
  monday: string;
  today: string;
  hour: number;
  needsFace: boolean;
}

async function load(): Promise<Loaded> {
  const now = new Date();
  const monday = weekStart(now);
  const [all, diaries, week, cast] = await Promise.all([listDays(), loadDiaries(), loadWeek(monday), listCast()]);
  const days = all.filter((day) => !day.sample);
  const self = findSelf(cast);
  return {
    comics: days
      .filter((day) => day.safety !== "crisis" && day.panels.length > 0)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    days,
    diaries,
    week,
    monday,
    today: localIsoDate(now),
    hour: now.getHours(),
    needsFace: !self || !hasOwnFace(self),
  };
}

const WEEKDAYS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];
const TILTS = ["-2deg", "1.5deg", "-1deg", "2.5deg", "-2.5deg", "1deg"];
const LATEST = 6;

function isoAfter(first: string, days: number): string {
  const [y, m, d] = first.split("-").map(Number);
  return localIsoDate(new Date(y, m - 1, d + days));
}

function monthName(today: string): string {
  const [y, m] = today.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
}

/**
 * The signed-in home: a greeting that changes with the day, today's page
 * (Record, or the comic already made), this week at a glance, the week's
 * good things, the diary shelf, the latest comics and this month's issue.
 */
export function HomeView() {
  const account = useAccount();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [making, setMaking] = useState(false);
  const signedIn = account.status === "signed-in";

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    const refresh = () => void load().then((next) => !cancelled && setLoaded(next));
    refresh();
    window.addEventListener("comimo:synced", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("comimo:synced", refresh);
    };
  }, [signedIn]);

  const name = signedIn ? account.name : "";
  const todays = loaded ? loaded.comics.filter((day) => day.date === loaded.today) : [];
  const hello = loaded
    ? greeting({ name, hour: loaded.hour, dateKey: loaded.today, comics: loaded.comics.length, madeToday: todays.length > 0, place: "home" })
    : null;

  return (
    <main id="main" className={styles.home}>
      {/* ---------- The desk: hello, today's page, this week ---------- */}
      <section className={styles.desk} aria-labelledby="home-title">
        <div className={`page ${styles.deskInner}`}>
          <div className={styles.hello}>
            <p className={styles.date}>{loaded ? formatDay(loaded.today) : " "}</p>
            <h1 id="home-title" dir="auto" className={hello ? styles.greeting : `${styles.greeting} ${styles.pending}`}>
              {hello?.title ?? " "}
            </h1>
            {hello?.lede ? <p className={styles.lede}>{hello.lede}</p> : null}
          </div>
          <div className={styles.today}>{loaded ? <TodayCard today={loaded.today} todays={todays} /> : null}</div>
          {loaded ? <ThisWeek monday={loaded.monday} today={loaded.today} comics={loaded.comics} /> : null}
        </div>
      </section>

      {loaded ? (
        <>
          {loaded.needsFace ? (
            <div className="page">
              <Link href={`/welcome?next=${encodeURIComponent("/")}`} className={styles.face} transitionTypes={PAGE_TURN}>
                <Art asset={art.brand.mascot} alt="" className={styles.faceArt} />
                <span className={styles.faceText}>
                  <strong>Put yourself in your comics</strong>
                  <span>A photo and a few things about you, and every comic draws you as you.</span>
                </span>
              </Link>
            </div>
          ) : null}

          {/* ---------- The week's good things ---------- */}
          <section className={`page section ${styles.goodThings}`} aria-label="This week's good things">
            <WeekGoodThings
              monday={loaded.monday}
              days={weekDays(loaded.days, loaded.monday)}
              summary={loaded.week}
              onWritten={(week) => setLoaded((current) => (current ? { ...current, week } : current))}
            />
          </section>

          {/* ---------- The diary shelf ---------- */}
          <section className={`page section ${shelf.book}`} aria-labelledby="shelf-title">
            <div className={shelf.shelfHead}>
              <h2 id="shelf-title" className="section__title">
                {firstOf(name) ? (
                  <>
                    <bdi>{firstOf(name)}</bdi>&apos;s diaries
                  </>
                ) : (
                  "Your diaries"
                )}
              </h2>
              <p className={shelf.hint}>Every day keeps your daily comics. Make a diary for anything else, and write in it whenever you like.</p>
            </div>
            <ul className={shelf.shelf}>
              {[{ id: EVERY_DAY, name: "Every day", color: "sun" as const, sticker: "spark" as const, daily: true }, ...loaded.diaries.map((d) => ({ ...d, daily: false }))].map(
                (diary) => {
                  const inside = daysIn(diary.id, loaded.days, loaded.diaries);
                  return (
                    <li key={diary.id} className={shelf.slot}>
                      <Notebook
                        href={`/diaries?d=${encodeURIComponent(diary.id)}`}
                        name={diary.name}
                        color={diary.color}
                        sticker={diary.sticker}
                        count={inside.length}
                        last={inside[0]?.title}
                        daily={diary.daily}
                      />
                    </li>
                  );
                },
              )}
              {loaded.diaries.length < MAX_DIARIES && !making ? (
                <li className={shelf.slot}>
                  <button type="button" className={shelf.blank} onClick={() => setMaking(true)}>
                    <span className={shelf.blankPlus} aria-hidden="true">
                      +
                    </span>
                    <span>New diary</span>
                  </button>
                </li>
              ) : null}
            </ul>
            {making ? (
              <NewDiary
                existing={loaded.diaries}
                onCancel={() => setMaking(false)}
                onMade={(diary) => {
                  setMaking(false);
                  setLoaded((current) => (current ? { ...current, diaries: [...current.diaries, diary] } : current));
                }}
              />
            ) : null}
          </section>

          {/* ---------- The latest comics ---------- */}
          {loaded.comics.length > 0 ? (
            <section className="page section" aria-labelledby="latest-title">
              <div className={styles.sectionHead}>
                <h2 id="latest-title" className="section__title">
                  Lately
                </h2>
                {loaded.comics.length > LATEST ? (
                  <Link href="/diaries" className="link" transitionTypes={PAGE_TURN}>
                    All {loaded.comics.length} comics
                  </Link>
                ) : null}
              </div>
              <ul className={styles.cards}>
                {loaded.comics.slice(0, LATEST).map((day, i) => (
                  <ComicCard key={day.id} day={day} index={i} />
                ))}
              </ul>
            </section>
          ) : null}

          {/* ---------- This month's issue ---------- */}
          <ThisMonth today={loaded.today} comics={loaded.comics} />
        </>
      ) : (
        <p className={`page ${styles.opening}`} role="status">
          Opening your book…
        </p>
      )}
    </main>
  );
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function firstOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** Today's page: the comic already made, or the Record stamp with today's question. */
function TodayCard({ today, todays }: { today: string; todays: Day[] }) {
  const latest = todays[0];
  const url = useImageUrl(latest?.panels[0]?.image ?? null);
  const [question] = promptsFor(today, 1);

  if (!latest) {
    return (
      <div className={styles.todayCard}>
        <p className={`caption ${styles.todayLabel}`}>Today&apos;s page</p>
        <p className={`bubble ${styles.question}`} dir="auto">
          {question.text}
        </p>
        <Magnetic className={styles.magnet}>
          <RecordStamp href="/record" label="Record" ariaLabel="Record today's voice note" />
        </Magnetic>
      </div>
    );
  }

  return (
    <div className={styles.todayCard} data-done>
      <Link href={`/day/${latest.id}`} className={styles.todayComic} transitionTypes={PAGE_TURN}>
        <span className={styles.todayArt}>
          {url ? (
            // A stored Blob or a manifest file; next/image can't optimise Blobs.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" />
          ) : null}
        </span>
        <span className={`caption ${styles.todayLabel}`}>{todays.length > 1 ? `Today, ${countWord(todays.length)} comics` : "Today's comic"}</span>
        <span className={styles.todayTitle} dir="auto">
          {latest.title}
        </span>
      </Link>
      <Link href="/record" className={`btn ${styles.another}`} transitionTypes={PAGE_TURN}>
        Tell another one
      </Link>
    </div>
  );
}

/** Saturday to Friday: each day's weather from its newest comic, linking to it. */
function ThisWeek({ monday, today, comics }: { monday: string; today: string; comics: Day[] }) {
  const days = WEEKDAYS.map((label, i) => {
    const date = isoAfter(monday, i);
    return { label, date, comic: comics.find((day) => day.date === date) };
  });
  const made = comics.filter((day) => day.date >= monday && day.date <= days[6].date).length;

  return (
    <div className={styles.week}>
      <p className={styles.weekHead}>
        <span className={styles.weekTitle}>This week</span>
        <span className={styles.weekCount}>{made === 0 ? "Nothing drawn yet" : `${capital(countWord(made))} ${made === 1 ? "comic" : "comics"}`}</span>
      </p>
      <ol className={styles.weekRow}>
        {days.map(({ label, date, comic }, i) => {
          const style = { "--i": i } as CSSProperties;
          const flags = { "data-today": date === today ? "" : undefined, "data-future": date > today ? "" : undefined };
          return (
            <li key={date} className={styles.weekSlot}>
              {comic ? (
                <Link href={`/day/${comic.id}`} className={styles.weekDay} style={style} {...flags} transitionTypes={PAGE_TURN}>
                  <Art asset={art.mood[comic.mood]} alt="" className={styles.weekIcon} />
                  <span aria-hidden="true">{label}</span>
                  <span className="visually-hidden">
                    {formatDay(date)}: {moodWords[comic.mood]} day, {comic.title}
                  </span>
                </Link>
              ) : (
                <span className={styles.weekDay} style={style} {...flags}>
                  <span className={styles.weekBlank} aria-hidden="true" />
                  <span aria-hidden="true">{label}</span>
                  <span className="visually-hidden">
                    {formatDay(date)}: {date > today ? "still to come" : "no comic"}
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ComicCard({ day, index }: { day: Day; index: number }) {
  const url = useImageUrl(day.panels[0]?.image ?? null);
  return (
    <li className={styles.card} style={{ "--tilt": TILTS[index % TILTS.length], "--i": index } as CSSProperties}>
      <Link href={`/day/${day.id}`} className={styles.cardLink} transitionTypes={PAGE_TURN}>
        <span className={styles.cardArt}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" />
          ) : null}
          <span className={styles.cardMood}>
            <Art asset={art.mood[day.mood]} alt="" />
            <span className="visually-hidden">{moodWords[day.mood]} day</span>
          </span>
        </span>
        <span className={styles.cardDate}>{formatDay(day.date)}</span>
        <span className={styles.cardTitle} dir="auto">
          {day.title}
        </span>
      </Link>
    </li>
  );
}

/** This month's issue so far: the newest panel on the cover, and the month's weather. */
function ThisMonth({ today, comics }: { today: string; comics: Day[] }) {
  const month = today.slice(0, 7);
  const inMonth = comics.filter((day) => day.date.startsWith(month));
  const url = useImageUrl(inMonth[0]?.panels[0]?.image ?? null);
  const label = monthName(today);
  const [year, number] = month.split("-").map(Number);
  const moods = Object.fromEntries([...inMonth].reverse().map((day) => [day.date, day.mood]));
  const dates = new Set(inMonth.map((day) => day.date)).size;

  return (
    <section className={`page section ${styles.month}`} aria-labelledby="month-title">
      <Link href="/month" className={styles.issue} transitionTypes={PAGE_TURN} aria-label={`Open the ${label} issue`}>
        <span className={styles.issueArt} aria-hidden="true">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" />
          ) : (
            <Art asset={art.empty.month} alt="" className={styles.issueEmpty} />
          )}
        </span>
        <span className={styles.masthead}>comimo</span>
        <span className={styles.issueMonth}>{label}</span>
        <span className={styles.issueLines}>
          {inMonth.length > 0 ? (
            inMonth.slice(0, 3).map((day) => (
              <span key={day.id} className={styles.issueLine} dir="auto">
                {day.title}
              </span>
            ))
          ) : (
            <span className={styles.issueLine}>Starts with your first comic</span>
          )}
        </span>
      </Link>
      <div className={styles.monthText}>
        <h2 id="month-title" className="section__title">
          {label.split(" ")[0]}, so far
        </h2>
        <p className="section__lede">
          {inMonth.length === 0
            ? "Every comic you make this month goes into this issue. On the last day it's bound as a magazine."
            : `${capital(countWord(inMonth.length))} ${inMonth.length === 1 ? "comic" : "comics"} on ${countWord(dates)} ${dates === 1 ? "day" : "days"}. On the last day the issue is bound as a magazine.`}
        </p>
        <MoodCalendar year={year} month={number} moods={moods} today={today} compact labelledBy="month-title" />
      </div>
    </section>
  );
}
