"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { getDay, saveDay } from "@/lib/store";
import type { CheckIn, Day } from "@/lib/types";
import styles from "./CheckInCard.module.css";

type SaveStatus = "idle" | "saving" | "saved" | "failed";

/** How long typing has to pause before the answers are written to the device. */
const SAVE_DELAY_MS = 700;

/** Answers in the same order as `questions`, matched by question text when a stored copy differs. */
function alignAnswers(questions: string[], stored: CheckIn | undefined): string[] {
  if (!stored) return questions.map(() => "");
  return questions.map((question) => {
    const at = stored.questions.indexOf(question);
    return at === -1 ? "" : (stored.answers[at] ?? "");
  });
}

/**
 * The check-in after a heavy day's comic: a few reflection questions, every
 * one optional. Answers save themselves to the Day in this browser while you
 * type (and when you leave a box), so nothing has to be submitted.
 *
 * Reflection only. No advice, no scores, nothing to get right.
 */
export function CheckInCard({ day }: { day: Day }) {
  const questions = day.checkIn?.questions ?? [];
  const titleId = useId();
  const statusId = useId();

  const [answers, setAnswers] = useState<string[]>(() => alignAnswers(questions, day.checkIn));
  const [status, setStatus] = useState<SaveStatus>("idle");

  const latest = useRef(answers);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Saves run one after another so an older write never lands last. */
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const questionsKey = questions.join("\u0000");

  // A stored copy of this day may hold answers from an earlier visit (sample days are prerendered without them).
  useEffect(() => {
    let cancelled = false;
    void getDay(day.id).then((stored) => {
      if (cancelled || dirty.current || !stored?.checkIn) return;
      const restored = alignAnswers(questionsKey ? questionsKey.split("\u0000") : [], stored.checkIn);
      if (restored.every((answer) => answer === "")) return;
      latest.current = restored;
      setAnswers(restored);
      setStatus("saved");
    });
    return () => {
      cancelled = true;
    };
  }, [day.id, questionsKey]);

  const save = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!dirty.current) return queue.current;
    dirty.current = false;
    const snapshot = latest.current;
    setStatus("saving");

    queue.current = queue.current.then(async () => {
      // Write onto the freshest copy so other changes to the day are kept.
      const current = (await getDay(day.id)) ?? day;
      const answered = snapshot.some((answer) => answer.trim() !== "");
      const checkIn: CheckIn = {
        questions,
        answers: snapshot,
        ...(answered ? { answeredAt: new Date().toISOString() } : {}),
      };
      const ok = await saveDay({ ...current, checkIn });
      // A newer change is already waiting; let its save report instead.
      if (!dirty.current) setStatus(ok ? "saved" : "failed");
    });
    return queue.current;
    // `questions` follows questionsKey; `day` is only the fallback when nothing is stored yet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.id, questionsKey]);

  // Leaving the page (or closing the tab) writes whatever is still waiting.
  useEffect(() => {
    const flush = () => void save();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [save]);

  if (questions.length === 0) return null;

  function change(index: number, value: string) {
    const next = latest.current.map((answer, i) => (i === index ? value : answer));
    latest.current = next;
    dirty.current = true;
    setAnswers(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), SAVE_DELAY_MS);
  }

  return (
    <section className={styles.card} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        That sounded like a lot. Want to sit with it for a moment?
      </h2>
      <p className={styles.lede}>
        Answer any, all or none. There are no right answers, and nothing here is required.
      </p>

      <form className={styles.form} onSubmit={(event) => event.preventDefault()} aria-describedby={statusId}>
        {questions.map((question, i) => (
          <label key={question} className={styles.question}>
            <span dir="auto">{question}</span>
            <textarea
              name={`answer-${i}`}
              rows={2}
              dir="auto"
              maxLength={1000}
              value={answers[i] ?? ""}
              onChange={(event) => change(i, event.target.value)}
              onBlur={() => void save()}
            />
          </label>
        ))}
      </form>

      <p id={statusId} className={styles.status} role="status" data-status={status}>
        {status === "saving" ? "Saving…" : null}
        {status === "saved" ? "Saved with this day" : null}
        {status === "failed" ? "This browser isn't letting Comimo save right now, so your answers won't be kept." : null}
        {status === "idle" ? "Your answers save on this device as you write. Only you can see them." : null}
      </p>
    </section>
  );
}
