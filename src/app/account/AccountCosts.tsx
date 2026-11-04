"use client";

import { useEffect, useState } from "react";
import { aboutUsd, type MyCosts } from "@/lib/costs";
import styles from "./AboutYouCard.module.css";

/**
 * "Your comics so far: 4 comics, about $0.31": what this account's comics
 * and cast have cost in model calls, from the server's ledger.
 */
export function AccountCosts() {
  const [costs, setCosts] = useState<MyCosts | null | "unavailable">(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/costs", { credentials: "same-origin", cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<MyCosts>) : Promise.reject(new Error(String(response.status)))))
      .then(
        (value) => !cancelled && setCosts(value),
        () => !cancelled && setCosts("unavailable"),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className={`panel ${styles.card}`} aria-labelledby="costs-title" aria-busy={costs === null || undefined}>
      <h2 id="costs-title" className={styles.title}>
        What your comics cost
      </h2>
      {costs === null ? (
        <p className={styles.quiet}>Adding it up…</p>
      ) : costs === "unavailable" ? (
        <p className={styles.quiet}>The totals aren&apos;t available right now.</p>
      ) : (
        <>
          {costs.comics === 0 ? (
            <p className={styles.costLine}>No comics yet{costs.totalUsd > 0 ? "." : ", so nothing spent."}</p>
          ) : (
            <p className={styles.costLine}>
              Your comics so far:{" "}
              <strong>
                {costs.comics === 1 ? "1 comic" : `${costs.comics} comics`}, {aboutUsd(costs.comicsUsd)}
              </strong>
            </p>
          )}
          {costs.castUsd > 0 || costs.extrasUsd > 0 ? (
            <p className={styles.quiet}>
              Drawing your cast and outfits: {aboutUsd(costs.castUsd)}
              {costs.extrasUsd > 0 ? `. Covers and captions: ${aboutUsd(costs.extrasUsd)}` : ""}.
            </p>
          ) : null}
          <p className={styles.quiet}>
            Every Meta model call is counted: listening, the script, today&apos;s outfit, each panel, the face check and any redraws.
            Practice-mode comics cost nothing and aren&apos;t counted.
          </p>
        </>
      )}
    </section>
  );
}
