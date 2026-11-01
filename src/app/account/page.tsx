import type { Metadata } from "next";
import Link from "next/link";
import { PageTurn } from "@/components/PageTurn";
import { RequireAccount } from "@/components/account/RequireAccount";
import { DeleteAccount } from "./DeleteAccount";
import styles from "./AboutYouCard.module.css";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

export default function AccountPage() {
  return (
    <PageTurn>
      <RequireAccount />
      <main id="main" className="page">
        <header className="page-head">
          <h1>Your account</h1>
          <p className="page-head__lede">
            Your comics, your cast and your photo albums are kept with your account, so they follow you to every device you sign in on.
          </p>
        </header>
        <section className={`panel ${styles.card}`} aria-labelledby="about-title">
          <h2 id="about-title" className={styles.title}>
            About you
          </h2>
          <p>Your photo, what you&apos;re into and how you are with people. Comimo draws you and writes your lines from it.</p>
          <Link href="/welcome?next=/account" className="btn btn--accent">
            Edit about you
          </Link>
        </section>
        <DeleteAccount />
      </main>
    </PageTurn>
  );
}
