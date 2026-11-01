"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useAccount } from "@/components/account/useAccount";
import { greeting, promptsFor } from "@/lib/greeting";
import { localIsoDate } from "@/lib/pipeline";
import { listDays } from "@/lib/store";
import styles from "./record.module.css";

interface Shown {
  title: string;
  lede: string | null;
}

/**
 * The record page heading: by name, by time of day, different each day. The
 * how-to line shows only for the first few comics. Until the book is read,
 * the heading keeps its space empty so the page doesn't jump.
 */
export function RecordHeading() {
  const account = useAccount();
  const name = account.status === "signed-in" ? account.name : "";
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    if (account.status === "loading") return;
    let cancelled = false;
    void listDays().then((days) => {
      if (cancelled) return;
      const now = new Date();
      const dateKey = localIsoDate(now);
      setShown(greeting({ name, hour: now.getHours(), dateKey, comics: days.length, madeToday: days.some((d) => d.date === dateKey) }));
    });
    return () => {
      cancelled = true;
    };
  }, [account.status, name]);

  return (
    <header className="page-head">
      <h1 dir="auto" className={shown ? styles.greeting : `${styles.greeting} ${styles.greetingPending}`}>
        {shown?.title ?? " "}
      </h1>
      {shown?.lede ? <p className="page-head__lede">{shown.lede}</p> : null}
    </header>
  );
}

const noSubscribe = () => () => {};

/** Today's four starter questions (a different four tomorrow). */
export function DayPrompts() {
  // The visitor's own date, known only in the browser (the page itself is prerendered).
  const dateKey = useSyncExternalStore(noSubscribe, localIsoDate, () => "");
  const prompts = dateKey ? promptsFor(dateKey) : [];
  return (
    <ul className={styles.prompts}>
      {prompts.map((p, i) => (
        <li key={p.text} style={{ "--tilt": p.tilt } as React.CSSProperties}>
          <p className={`bubble ${i % 2 ? "bubble--tail-end" : ""} ${styles.prompt}`} dir="auto">
            {p.text}
          </p>
        </li>
      ))}
    </ul>
  );
}
