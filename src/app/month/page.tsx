import type { Metadata } from "next";
import { Magazine } from "@/components/magazine/Magazine";
import { PageTurn } from "@/components/PageTurn";
import { sampleIssue } from "@/lib/magazine/sample";
import styles from "./month.module.css";

export const metadata: Metadata = {
  title: "The monthly magazine",
  description: "Every comic you made this month, bound into a magazine you can flip through.",
};

/**
 * The month as a comic magazine. The sample issue is laid out here on the
 * server; the reader then opens the newest month kept on this device.
 */
export default function MonthPage() {
  return (
    <PageTurn>
      <main id="main" className={`page ${styles.month}`}>
        <Magazine
          sample={sampleIssue()}
          heading={
            <h1 className={styles.title}>
              Your month, <span className={styles.titleAccent}>as a comic magazine</span>
            </h1>
          }
        />
      </main>
    </PageTurn>
  );
}
