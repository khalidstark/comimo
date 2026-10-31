import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/art/Icon";
import { RequireAccount } from "@/components/account/RequireAccount";
import { PAGE_TURN, PageTurn } from "@/components/PageTurn";
import { RecordPanel } from "./RecordPanel";
import styles from "./record.module.css";

export const metadata: Metadata = { title: "Record today" };

const PROMPTS = [
  { text: "What made you laugh today?", tilt: "-3deg" },
  { text: "ايه أحلى حاجة حصلت النهارده؟", tilt: "2deg" },
  { text: "Who did you see?", tilt: "-1deg" },
  { text: "What was the hardest part, and what came after?", tilt: "3deg" },
];

export default function RecordPage() {
  return (
    <PageTurn>
      <main id="main" className="page">
        <RequireAccount />
        <header className="page-head">
          <h1>Tell me about today</h1>
          <p className="page-head__lede">
            Talk the way you&apos;d tell a friend. Arabic, English, or both in one sentence is fine.
          </p>
        </header>

        <div className={styles.layout}>
          <RecordPanel />

          <aside className={styles.side} aria-labelledby="prompts-title">
            <h2 id="prompts-title" className={styles.sideTitle}>
              Not sure where to start?
            </h2>
            <ul className={styles.prompts}>
              {PROMPTS.map((p, i) => (
                <li key={p.text} style={{ "--tilt": p.tilt } as React.CSSProperties}>
                  <p className={`bubble ${i % 2 ? "bubble--tail-end" : ""} ${styles.prompt}`} dir="auto">
                    {p.text}
                  </p>
                </li>
              ))}
            </ul>

            <div className={styles.other}>
              <h2 className={styles.sideTitle}>Other ways in</h2>
              <div className={styles.otherActions}>
                <Link href="/day/sample" className="btn btn--ink" transitionTypes={PAGE_TURN}>
                  <Icon name="bookOpen" size="1.2em" />
                  Read a sample day
                </Link>
              </div>
              <p className={styles.note}>
                Already have a voice note on your phone? Upload it under the record button.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </PageTurn>
  );
}
