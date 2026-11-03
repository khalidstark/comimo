import type { Metadata } from "next";
import Link from "next/link";
import { PageTurn } from "@/components/PageTurn";
import styles from "./privacy.module.css";

export const metadata: Metadata = {
  title: "Where your words go",
  description: "What Comimo keeps, what it throws away, and what it never does.",
};

const KEPT = [
  { what: "Your words", detail: "The text of each voice note (or what you typed) stays with its comic in your account, so you can read what you said." },
  { what: "Your comics and cast", detail: "Panels, reference sheets, outfits and sprites, kept with your account so they follow you to every device you sign in on." },
  { what: "Album photos you add", detail: "Re-encoded on the server without location or camera details. Anyone with the album's link or QR code can see them; you can change the link or delete the album any time." },
  { what: "What each comic cost", detail: "Dollars and model calls per comic, never the story. If you delete your account these numbers stay, with no link to you." },
];

const GONE = [
  { what: "The audio", detail: "Your voice note is turned into a small sound file in your browser, sent once to Muse Voice Transcribe, and never stored." },
  { what: "Photos for drawing faces and clothes", detail: "A selfie in About you, a photo for an outfit, today's photos for your outfit: each is shrunk on your device, used for that one drawing, then dropped. Only the drawing is kept. (Today's photos also go into that day's album, under the album's rules above.)" },
];

const NEVER = [
  "Scores, ratings or numbers about your mood or your week. A day's weather is a picture, never a number.",
  "Advice, diagnosis or therapy talk. A heavy day gets a few gentle questions, nothing more.",
  "Drawing a comic from a note about hurting yourself. It shows one plain line instead.",
  "Sharing anything to social media, or sending you reminders.",
];

/** A plain page about privacy: what is kept, what is thrown away, what never happens. */
export default function PrivacyPage() {
  return (
    <PageTurn>
      <main id="main" className="page">
        <header className="page-head">
          <h1>Where your words go</h1>
          <p className="page-head__lede">
            Comimo is a diary. Here is everything it keeps, everything it throws away, and the things it never does.
          </p>
        </header>

        <div className={styles.columns}>
          <section className={`panel ${styles.card}`} aria-labelledby="kept-title">
            <h2 id="kept-title" className={styles.title}>
              <span className={styles.stamp} data-tone="kept">Kept</span> with your account
            </h2>
            <dl className={styles.list}>
              {KEPT.map((item) => (
                <div key={item.what}>
                  <dt>{item.what}</dt>
                  <dd>{item.detail}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className={`panel ${styles.card}`} aria-labelledby="gone-title">
            <h2 id="gone-title" className={styles.title}>
              <span className={styles.stamp} data-tone="gone">Gone</span> after one use
            </h2>
            <dl className={styles.list}>
              {GONE.map((item) => (
                <div key={item.what}>
                  <dt>{item.what}</dt>
                  <dd>{item.detail}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <section className={`panel ${styles.card} ${styles.wide}`} aria-labelledby="never-title">
          <h2 id="never-title" className={styles.title}>
            <span className={styles.stamp} data-tone="never">Never</span>
          </h2>
          <ul className={styles.never}>
            {NEVER.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        <section className={`panel ${styles.card} ${styles.wide}`} aria-labelledby="meta-title">
          <h2 id="meta-title" className={styles.title}>
            The models
          </h2>
          <p>
            Your words and drawings are sent to Meta&apos;s models (Muse Voice Transcribe, Muse Spark, Muse Image and SAM 3.1) to make each comic, with a
            random tag instead of your name or email. While Comimo runs on free hackathon credits, Meta may use what is sent to its models, so
            please don&apos;t record anything you wouldn&apos;t want a stranger to read.
          </p>
          <p>
            Deleting your account (on <Link href="/account" className="link">your account page</Link>) removes your comics, cast, photos and albums from
            Comimo.
          </p>
        </section>
      </main>
    </PageTurn>
  );
}
