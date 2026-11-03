"use client";

import { useEffect, useState } from "react";
import { useAccount } from "@/components/account/useAccount";
import { NewDiary } from "@/components/diary/NewDiary";
import { Notebook } from "@/components/diary/Notebook";
import { WeekGoodThings } from "@/components/diary/WeekGoodThings";
import { EVERY_DAY, MAX_DIARIES, daysIn, loadDiaries } from "@/lib/diaries";
import { listDays } from "@/lib/store";
import type { Day, Diary, WeekSummary } from "@/lib/types";
import { loadWeek, weekDays, weekStart } from "@/lib/week";
import styles from "@/components/diary/diary.module.css";

interface Loaded {
  days: Day[];
  diaries: Diary[];
  week: WeekSummary | null;
  monday: string;
}

async function load(): Promise<Loaded> {
  const monday = weekStart();
  const [days, diaries, week] = await Promise.all([listDays(), loadDiaries(), loadWeek(monday)]);
  return { days: days.filter((day) => !day.sample), diaries, week, monday };
}

/**
 * The signed-in home page's own part: the week's good things and the shelf
 * of diaries (Every day plus the ones the user named), with "New diary".
 * Signed-out visitors see nothing here: the rest of the home page is for them.
 */
export function YourBook() {
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

  if (!signedIn) return null;
  const first = account.name.split(/\s+/)[0];

  return (
    <section className={`page section ${styles.book}`} aria-labelledby="book-title">
      <header className={styles.bookHead}>
        <p className={styles.bookKicker}>Your comic book</p>
        <h2 id="book-title" className={styles.bookTitle}>
          {first ? (
            <>
              <bdi>{first}</bdi>&apos;s diaries
            </>
          ) : (
            "Your diaries"
          )}
        </h2>
      </header>

      {loaded ? (
        <>
          <WeekGoodThings
            monday={loaded.monday}
            days={weekDays(loaded.days, loaded.monday)}
            summary={loaded.week}
            onWritten={(week) => setLoaded((current) => (current ? { ...current, week } : current))}
          />

          <div className={styles.shelfHead}>
            <h3 className={styles.shelfTitle}>On your shelf</h3>
            <p className={styles.hint}>Every day keeps your daily comics. Make a diary for anything else, and write in it whenever you like.</p>
          </div>
          <ul className={styles.shelf}>
            {[{ id: EVERY_DAY, name: "Every day", color: "sun" as const, sticker: "spark" as const, daily: true }, ...loaded.diaries.map((d) => ({ ...d, daily: false }))].map((diary) => {
              const inside = daysIn(diary.id, loaded.days, loaded.diaries);
              return (
                <li key={diary.id} className={styles.slot}>
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
            })}
            {loaded.diaries.length < MAX_DIARIES && !making ? (
              <li className={styles.slot}>
                <button type="button" className={styles.blank} onClick={() => setMaking(true)}>
                  <span className={styles.blankPlus} aria-hidden="true">
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
        </>
      ) : (
        <p className={styles.hint} role="status">
          Opening your shelf…
        </p>
      )}
    </section>
  );
}
