"use client";

import { useEffect, useState } from "react";
import { deviceComicCount, moveDeviceComics } from "@/lib/store";
import { useAccount } from "./useAccount";
import styles from "./MoveComics.module.css";

const DISMISSED = "comimo-move-later";

type Step = { kind: "hidden" } | { kind: "offer"; count: number } | { kind: "moving"; done: number; total: number } | { kind: "done"; moved: number } | { kind: "failed" };

/**
 * After signing in on a browser that already holds comics made without an
 * account, offer once per visit to move them into the account, where they
 * follow the person to every device.
 */
export function MoveComics() {
  const account = useAccount();
  const [step, setStep] = useState<Step>({ kind: "hidden" });

  useEffect(() => {
    if (account.status !== "signed-in") return;
    try {
      if (sessionStorage.getItem(DISMISSED)) return;
    } catch {
      // No session storage: just ask.
    }
    let cancelled = false;
    void deviceComicCount().then((count) => {
      if (!cancelled && count > 0) setStep({ kind: "offer", count });
    });
    return () => {
      cancelled = true;
    };
  }, [account.status]);

  if (step.kind === "hidden") return null;

  const later = () => {
    try {
      sessionStorage.setItem(DISMISSED, "1");
    } catch {
      // Fine: it asks again next page.
    }
    setStep({ kind: "hidden" });
  };

  const move = async () => {
    setStep({ kind: "moving", done: 0, total: 1 });
    const result = await moveDeviceComics((done, total) => setStep({ kind: "moving", done, total }));
    setStep(result.ok ? { kind: "done", moved: result.moved } : { kind: "failed" });
  };

  return (
    <aside className={`panel ${styles.card}`} aria-labelledby="move-comics-title" role="region">
      <p className={`caption ${styles.kicker}`}>On this browser</p>
      {step.kind === "offer" ? (
        <>
          <h2 id="move-comics-title" className={styles.title}>
            {step.count === 1 ? "There's a comic here from before you signed in." : `There are ${step.count} comics here from before you signed in.`}
          </h2>
          <p className={styles.text}>Move them to your account and they&apos;ll be on every device you sign in on. Your cast comes along too.</p>
          <div className={styles.actions}>
            <button type="button" className="btn btn--accent" onClick={() => void move()}>
              Move these comics to your account
            </button>
            <button type="button" className="btn btn--ghost" onClick={later}>
              Not now
            </button>
          </div>
        </>
      ) : null}
      {step.kind === "moving" ? (
        <>
          <h2 id="move-comics-title" className={styles.title}>
            Moving your comics…
          </h2>
          <p className={styles.text} role="status">
            {step.done} of {step.total} pieces sent. Keep this page open.
          </p>
          <progress className={styles.progress} max={step.total} value={step.done} />
        </>
      ) : null}
      {step.kind === "done" ? (
        <>
          <h2 id="move-comics-title" className={styles.title}>
            {step.moved === 1 ? "Your comic is in your account." : `Your comics are in your account.`}
          </h2>
          <p className={styles.text} role="status">
            They&apos;ll show up wherever you sign in.
          </p>
          <div className={styles.actions}>
            <button type="button" className="btn btn--accent" onClick={() => window.location.reload()}>
              Show them
            </button>
          </div>
        </>
      ) : null}
      {step.kind === "failed" ? (
        <>
          <h2 id="move-comics-title" className={styles.title}>
            Some comics didn&apos;t make it yet.
          </h2>
          <p className={styles.text} role="status">
            Nothing was lost: they&apos;re still on this browser. Check your connection and try again.
          </p>
          <div className={styles.actions}>
            <button type="button" className="btn btn--accent" onClick={() => void move()}>
              Try again
            </button>
            <button type="button" className="btn btn--ghost" onClick={later}>
              Not now
            </button>
          </div>
        </>
      ) : null}
    </aside>
  );
}
