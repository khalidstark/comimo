import type { Metadata } from "next";
import { RequireAccount } from "@/components/account/RequireAccount";
import { PageTurn } from "@/components/PageTurn";
import { DiaryView } from "./DiaryView";

export const metadata: Metadata = { title: "Your diaries", robots: { index: false } };

/** Your diaries: the daily one and the ones you named, each with its comics. */
export default function DiariesPage() {
  return (
    <PageTurn>
      <RequireAccount />
      <main id="main" className="page">
        <DiaryView />
      </main>
    </PageTurn>
  );
}
