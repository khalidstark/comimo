"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { hasOwnFace } from "@/lib/aboutYou";
import { ABOUT_ASKED_KEY, loadSelf } from "@/lib/cast";
import { getMeta, setMeta } from "@/lib/store";
import { useAccount } from "./useAccount";
import styles from "./AboutYouPrompt.module.css";

type Show = "ask" | "photo" | null;

/**
 * On /record: accounts that never answered About you (made before it existed)
 * are asked once, and can say not now; accounts still on the stand-in look
 * get a small nudge to add their photo.
 */
export function AboutYouPrompt() {
  const account = useAccount();
  const [show, setShow] = useState<Show>(null);

  useEffect(() => {
    if (account.status !== "signed-in") return;
    let cancelled = false;
    void Promise.all([loadSelf(), getMeta(ABOUT_ASKED_KEY)]).then(([{ self }, asked]) => {
      if (cancelled) return;
      if (!self?.about) setShow(asked ? null : "ask");
      else setShow(hasOwnFace(self) ? null : "photo");
    });
    return () => {
      cancelled = true;
    };
  }, [account.status]);

  if (!show) return null;

  if (show === "photo") {
    return (
      <p className={styles.nudge}>
        Your comics still use a stand-in look for you.{" "}
        <Link href="/welcome?next=/record" className="link">
          Add your photo
        </Link>
      </p>
    );
  }

  return (
    <section className={`panel ${styles.card}`} aria-labelledby="about-you-prompt">
      <p className={`caption ${styles.kicker}`}>New</p>
      <h2 id="about-you-prompt" className={styles.title}>
        Star in your own comics
      </h2>
      <p className={styles.body}>
        Add a photo, what you&apos;re into and how you are with people. Comimo draws you and writes your lines the way you talk.
      </p>
      <div className={styles.actions}>
        <Link href="/welcome?next=/record" className="btn btn--accent">
          Tell Comimo about me
        </Link>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            setShow(null);
            void setMeta(ABOUT_ASKED_KEY, true);
          }}
        >
          Not now
        </button>
      </div>
    </section>
  );
}
