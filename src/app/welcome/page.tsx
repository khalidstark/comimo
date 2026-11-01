import type { Metadata } from "next";
import { RequireAccount } from "@/components/account/RequireAccount";
import { PageTurn } from "@/components/PageTurn";
import { AboutYouFlow } from "./AboutYouFlow";
import styles from "./welcome.module.css";

export const metadata: Metadata = { title: "About you" };

/** Right after sign-up (and from the cast page): tell Comimo who you are, so every comic stars you. */
export default function WelcomePage() {
  return (
    <PageTurn>
      <main id="main" className={`page ${styles.main}`}>
        <RequireAccount />
        <AboutYouFlow />
      </main>
    </PageTurn>
  );
}
