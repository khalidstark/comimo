import type { Metadata } from "next";
import { PageTurn } from "@/components/PageTurn";
import { RequireAccount } from "@/components/account/RequireAccount";
import { DeleteAccount } from "./DeleteAccount";

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
        <DeleteAccount />
      </main>
    </PageTurn>
  );
}
