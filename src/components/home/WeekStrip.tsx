"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Art } from "@/art/Art";
import { art, type MoodKey } from "@/art/manifest";
import { useAccount } from "@/components/account/useAccount";
import { PAGE_TURN } from "@/components/PageTurn";
import { listDays } from "@/lib/store";
import { weekStart } from "@/lib/week";

const NAMES = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

function isoAfter(first: string, days: number): string {
  const [y, m, d] = first.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

export interface WeekCell {
  /** "Sat" to "Fri". */
  day: string;
  mood?: MoodKey;
}

const BLANK_WEEK: WeekCell[] = NAMES.map((day) => ({ day }));

/**
 * The hero's week strip: for visitors, Nour's sample week (`sample`, the
 * weather her real sample comics were given); for a signed-in user, this
 * week's own day weather (Saturday to Friday), the newest comic of each day.
 */
export function WeekStrip({
  classes,
  sample = BLANK_WEEK,
}: {
  classes: Record<"week" | "weekTitle" | "weekRow" | "weekDay" | "weekIcon" | "weekBlank", string>;
  sample?: WeekCell[];
}) {
  const account = useAccount();
  const [week, setWeek] = useState<WeekCell[] | null>(null);
  const signedIn = account.status === "signed-in";

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    const first = weekStart();
    void listDays().then((days) => {
      if (cancelled) return;
      const own = days.filter((d) => !d.sample && d.safety !== "crisis").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      setWeek(
        NAMES.map((day, i) => {
          const date = isoAfter(first, i);
          const last = own.filter((d) => d.date === date).at(-1);
          return last ? { day, mood: last.mood } : { day };
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const shown = signedIn && week ? week : sample;
  return (
    <Link href="/month" className={classes.week} transitionTypes={PAGE_TURN}>
      <span className={classes.weekTitle}>{signedIn ? "Your week" : "Nour's week"}</span>
      <ol className={classes.weekRow}>
        {shown.map(({ day, mood }) => (
          <li key={day} className={classes.weekDay}>
            {mood ? (
              <Art asset={art.mood[mood]} className={classes.weekIcon} alt={`${day}: ${art.mood[mood].alt}`} />
            ) : (
              <span className={classes.weekBlank} role="img" aria-label={`${day}: no comic`} />
            )}
            <span aria-hidden="true">{day.slice(0, 2)}</span>
          </li>
        ))}
      </ol>
    </Link>
  );
}
