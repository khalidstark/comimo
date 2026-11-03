import type { Metadata } from "next";
import { RequireAccount } from "@/components/account/RequireAccount";
import { PageTurn } from "@/components/PageTurn";
import { HomeView } from "./HomeView";

export const metadata: Metadata = { title: "Home", robots: { index: false } };

/**
 * The signed-in home. The proxy shows it at `/` to anyone with a session
 * cookie; visitors without one get the landing page there instead.
 */
export default function HomePage() {
  return (
    <PageTurn>
      <RequireAccount />
      <HomeView />
    </PageTurn>
  );
}
