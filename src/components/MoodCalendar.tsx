import { Art } from "@/art/Art";
import { art, type MoodKey } from "@/art/manifest";
import styles from "./MoodCalendar.module.css";

interface MoodCalendarProps {
  /** Four-digit year and 1-based month. */
  year: number;
  month: number;
  /** ISO date (YYYY-MM-DD) to mood, for days that have a comic. */
  moods: Record<string, MoodKey>;
  /** ISO date of today, outlined if inside this month. */
  today?: string;
  compact?: boolean;
  /** Visible heading id for aria-labelledby. */
  labelledBy?: string;
}

const WEEKDAYS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

/**
 * Month at a glance: one cell per day with its day-weather icon.
 * Weeks start on Saturday. No numbers or scores, only pictures and words.
 */
export function MoodCalendar({ year, month, moods, today, compact, labelledBy }: MoodCalendarProps) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 1) % 7; // Saturday = 0
  const monthName = first.toLocaleString("en-GB", { month: "long", timeZone: "UTC" });

  const cells = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { day, iso, mood: moods[iso] };
  });

  return (
    <div className={[styles.calendar, compact ? styles.compact : ""].join(" ")}>
      <div className={styles.weekdays} aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <span key={d}>{compact ? d.slice(0, 1) : d}</span>
        ))}
      </div>
      <ol className={styles.grid} aria-labelledby={labelledBy}>
        {cells.map(({ day, iso, mood }) => (
          <li
            key={iso}
            className={[styles.cell, mood ? styles.filled : "", iso === today ? styles.today : ""].join(" ")}
            style={day === 1 ? { gridColumnStart: offset + 1 } : undefined}
            data-mood={mood}
          >
            <span className={styles.date} aria-hidden="true">
              {day}
            </span>
            {mood ? <Art asset={art.mood[mood]} className={styles.icon} alt="" /> : null}
            <span className="visually-hidden">
              {`${day} ${monthName}: ${mood ? art.mood[mood].alt : "no comic"}${iso === today ? " (today)" : ""}`}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
