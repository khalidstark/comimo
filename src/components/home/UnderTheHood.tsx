"use client";

import { useState } from "react";
import styles from "./UnderTheHood.module.css";

const STEPS = [
  {
    model: "Muse Voice Transcribe",
    title: "It hears your day",
    body: "Arabic, English or both in one breath. Your cast's names go in as keywords, so “Teta” and “تيتا” come out right. The audio is never kept.",
    tone: "sun",
  },
  {
    model: "Muse Spark",
    title: "It writes the chapter",
    body: "A manga-style script in structured JSON: 1 to 3 pages, shots and story beats, one splash per page, narration in your voice, new faces flagged before anything is drawn.",
    tone: "pink",
  },
  {
    model: "Muse Image",
    title: "It draws your cast",
    body: "Every panel is an edit of your people's reference sheets, drawn at its slot's exact shape with a clear band left for the lettering.",
    tone: "teal",
  },
  {
    model: "SAM 3.1 + Muse Spark",
    title: "It checks every face",
    body: "SAM 3.1 finds each character in the panel; Muse Spark compares the cut-out with their sheet; Muse Image redraws anyone who drifted. You can see the before and after.",
    tone: "ink",
  },
  {
    model: "SAM 3.1 + Muse Spark + Muse Image",
    title: "It dresses you for today",
    body: "Add the day's photos and SAM finds you in them, Spark matches you by face and hair, and your sheet is redrawn in what you actually wore.",
    tone: "lilac",
  },
] as const;

/** Measured on a real 5-panel comic with one day photo (2 Nov 2026), from Comimo's own cost ledger. */
const RECEIPT = [
  { item: "Today's outfit (SAM, Spark, 1 image)", usd: 0.026 },
  { item: "Script (Muse Spark)", usd: 0.0135 },
  { item: "5 panels (Muse Image)", usd: 0.05 },
  { item: "Face check (20 SAM calls, 5 Spark judges)", usd: 0.094 },
  { item: "Redraws (none needed)", usd: 0 },
];

/**
 * "Under the hood": the four Meta models as a strip of numbered cards (each
 * opens to say what it does), and an itemised receipt of what one real comic
 * cost. For judges and curious users.
 */
export function UnderTheHood() {
  const [open, setOpen] = useState(0);
  const total = RECEIPT.reduce((sum, line) => sum + line.usd, 0);
  return (
    <section className={`page section ${styles.hood}`} aria-labelledby="hood-title">
      <div className={styles.head} data-reveal="stagger">
        <p className={styles.kicker}>Under the hood</p>
        <h2 id="hood-title" className="section__title">
          Four Meta models, one comic
        </h2>
        <p className="section__lede">Every comic runs through Muse Voice Transcribe, Muse Spark, Muse Image and SAM 3.1, each doing what it is best at.</p>
      </div>

      <div className={styles.layout}>
        <ol className={styles.strip} data-reveal="stagger">
          {STEPS.map((step, i) => (
            <li key={step.title} className={styles.step} data-tone={step.tone} data-open={open === i || undefined}>
              <button type="button" className={styles.stepButton} aria-expanded={open === i} aria-controls={`hood-${i}`} onClick={() => setOpen(i)} onMouseEnter={() => setOpen(i)} onFocus={() => setOpen(i)}>
                <span className={styles.number} aria-hidden="true">
                  {i + 1}
                </span>
                <span className={styles.stepText}>
                  <span className={styles.model}>{step.model}</span>
                  <span className={styles.stepTitle}>{step.title}</span>
                </span>
              </button>
              <p id={`hood-${i}`} className={styles.body} hidden={open !== i}>
                {step.body}
              </p>
            </li>
          ))}
        </ol>

        <figure className={styles.receipt} aria-labelledby="receipt-title" data-reveal>
          <figcaption id="receipt-title" className={styles.receiptTitle}>
            One real comic, itemised
          </figcaption>
          <dl className={styles.lines}>
            {RECEIPT.map((line) => (
              <div key={line.item} className={styles.line}>
                <dt>{line.item}</dt>
                <dd>${line.usd.toFixed(3)}</dd>
              </div>
            ))}
            <div className={`${styles.line} ${styles.total}`}>
              <dt>Total, 5 panels</dt>
              <dd>${total.toFixed(2)}</dd>
            </div>
          </dl>
          <p className={styles.receiptNote}>Measured from Comimo&apos;s own cost ledger. Every comic you make keeps its own receipt in its &quot;how it was made&quot; note.</p>
        </figure>
      </div>
    </section>
  );
}
