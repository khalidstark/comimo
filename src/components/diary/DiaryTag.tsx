"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PAGE_TURN } from "@/components/PageTurn";
import { loadDiaries } from "@/lib/diaries";
import type { Diary } from "@/lib/types";
import { DiarySticker } from "./DiarySticker";
import styles from "./diary.module.css";

/** On a comic's page: the diary it was written in, as a sticker tab linking back to it. Nothing for daily comics. */
export function DiaryTag({ diaryId }: { diaryId?: string }) {
  const [diary, setDiary] = useState<Diary | null>(null);
  useEffect(() => {
    if (!diaryId) return;
    let cancelled = false;
    void loadDiaries().then((list) => !cancelled && setDiary(list.find((d) => d.id === diaryId) ?? null));
    return () => {
      cancelled = true;
    };
  }, [diaryId]);
  if (!diaryId || !diary) return null;
  return (
    <Link href={`/diaries?d=${encodeURIComponent(diary.id)}`} className={styles.tag} data-color={diary.color} transitionTypes={PAGE_TURN}>
      <DiarySticker name={diary.sticker} className={styles.tagSticker} />
      <span>
        In <bdi>{diary.name}</bdi>
      </span>
    </Link>
  );
}
