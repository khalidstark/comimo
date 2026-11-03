"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { DiarySticker } from "@/components/diary/DiarySticker";
import { EVERY_DAY, loadDiaries } from "@/lib/diaries";
import type { Diary } from "@/lib/types";
import styles from "./record.module.css";

/**
 * "Write it in": the daily diary or one the user named. Opens on the one in
 * ?diary= (from a diary's "Write in it"). Hidden until there is a choice.
 */
export function DiaryPick({ value, onChange }: { value: Diary | null; onChange: (diary: Diary | null) => void }) {
  const id = useId();
  const [diaries, setDiaries] = useState<Diary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadDiaries().then((list) => {
      if (cancelled) return;
      setDiaries(list);
      const asked = new URLSearchParams(window.location.search).get("diary");
      const found = asked && asked !== EVERY_DAY ? list.find((d) => d.id === asked) : undefined;
      if (found) onChange(found);
    });
    return () => {
      cancelled = true;
    };
    // Only on mount: the link decides the first pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!diaries) return null;
  if (diaries.length === 0) {
    return (
      <p className={styles.uploadHint}>
        Want a diary just for the good things, or the bad ones? <Link href="/diaries?d=every-day" className="link">Make one</Link> and write in it any day.
      </p>
    );
  }

  return (
    <fieldset className={styles.languages} aria-labelledby={`${id}-legend`}>
      <legend id={`${id}-legend`} className={styles.legend}>
        Write it in
      </legend>
      <div className={styles.chips}>
        <label className={styles.chip}>
          <input type="radio" name={`${id}-diary`} checked={value === null} onChange={() => onChange(null)} />
          <span>
            <DiarySticker name="spark" className={styles.diarySticker} /> Every day
          </span>
        </label>
        {diaries.map((diary) => (
          <label key={diary.id} className={styles.chip}>
            <input type="radio" name={`${id}-diary`} checked={value?.id === diary.id} onChange={() => onChange(diary)} />
            <span dir="auto">
              <DiarySticker name={diary.sticker} className={styles.diarySticker} /> {diary.name}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
