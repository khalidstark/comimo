import type { Metadata } from "next";
import { PageTurn } from "@/components/PageTurn";
import { CastEditor } from "./CastEditor";

export const metadata: Metadata = { title: "Your cast" };

export default function CastPage() {
  return (
    <PageTurn>
      <main id="main" className="page">
        <header className="page-head">
          <h1>Your cast</h1>
          <p className="page-head__lede">
            Make them once and they star in every comic, looking the same in every panel. Start with this cast,
            change them, or add the people in your life. They stay on this device.
          </p>
        </header>

        <CastEditor />
      </main>
    </PageTurn>
  );
}
