import { Art } from "@/art/Art";
import { art } from "@/art/manifest";
import { moodWords } from "@/lib/format";
import type { Mood } from "@/lib/types";
import styles from "./comic.module.css";

/** The day's weather as a sticker: manifest icon and a word, never a number. */
export function MoodBadge({ mood }: { mood: Mood }) {
  return (
    <p className={styles.mood} data-mood={mood}>
      <span className={styles.moodSun} aria-hidden="true">
        <Art asset={art.mood[mood]} className={styles.moodIcon} alt="" />
      </span>
      <span className={styles.moodText}>
        <span className={styles.moodKicker}>
          Day weather<span className="visually-hidden">:</span>
        </span>{" "}
        <span className={styles.moodWord}>{moodWords[mood]} day</span>
      </span>
    </p>
  );
}
