"use client";

import { useId, useState } from "react";
import { RecordStamp } from "@/components/RecordStamp";
import styles from "./record.module.css";

const LANGUAGES = [
  { value: "auto", label: "Mixed / auto", lang: "en" },
  { value: "ar", label: "عربي", lang: "ar" },
  { value: "en", label: "English", lang: "en" },
] as const;

type Language = (typeof LANGUAGES)[number]["value"];

/**
 * Recording controls. This phase ships the layout only: the microphone,
 * timer and upload are wired up in the recording phase.
 */
export function RecordPanel() {
  const [language, setLanguage] = useState<Language>("auto");
  const [status, setStatus] = useState("Talk for up to a minute.");
  const legendId = useId();

  return (
    <div className={`panel halftone ${styles.panel}`}>
      <fieldset className={styles.languages} aria-labelledby={legendId}>
        <legend id={legendId} className={styles.legend}>
          I&apos;ll be speaking
        </legend>
        <div className={styles.chips}>
          {LANGUAGES.map((option) => (
            <label key={option.value} className={styles.chip} lang={option.lang}>
              <input
                type="radio"
                name="language"
                value={option.value}
                checked={language === option.value}
                onChange={() => setLanguage(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={styles.stampArea}>
        <RecordStamp
          label="Start"
          ariaLabel="Start recording"
          onClick={() =>
            setStatus("Recording isn't connected yet in this preview. Read a sample day to see what you'll get.")
          }
        />
        <p className={styles.timer} aria-label="Recorded 0 of 60 seconds">
          <span>0:00</span>
          <span className={styles.timerMax}> / 1:00</span>
        </p>
        <div className={styles.wave} aria-hidden="true">
          {Array.from({ length: 28 }, (_, i) => (
            <span key={i} style={{ "--h": `${20 + ((i * 37) % 60)}%` } as React.CSSProperties} />
          ))}
        </div>
        <p className={styles.status} role="status">
          {status}
        </p>
      </div>
    </div>
  );
}
