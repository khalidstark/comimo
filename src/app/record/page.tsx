import type { Metadata } from "next";
import { AboutYouPrompt } from "@/components/account/AboutYouPrompt";
import { RequireAccount } from "@/components/account/RequireAccount";
import { PageTurn } from "@/components/PageTurn";
import { DayPrompts, RecordHeading } from "./RecordGreeting";
import { RecordPanel } from "./RecordPanel";
import styles from "./record.module.css";

export const metadata: Metadata = { title: "Record today" };

export default function RecordPage() {
  return (
    <PageTurn>
      <main id="main" className="page">
        <RequireAccount />
        <RecordHeading />

        <AboutYouPrompt />

        <div className={styles.layout}>
          <RecordPanel />

          <aside className={styles.side} aria-labelledby="prompts-title">
            <h2 id="prompts-title" className={styles.sideTitle}>
              Not sure where to start?
            </h2>
            <DayPrompts />

            <div className={styles.other}>
              <h2 className={styles.sideTitle}>Other ways in</h2>
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
