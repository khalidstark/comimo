import Link from "next/link";
import { art } from "@/art/manifest";
import { EmptyState } from "@/components/EmptyState";

/** Any address Comimo doesn't have: a torn-out page instead of the framework's 404. */
export default function NotFound() {
  return (
    <main id="main" className="page">
      <div style={{ paddingBlock: "var(--space-2xl)" }}>
        <EmptyState
          as="h1"
          art={art.empty.days}
          title="This page was torn out"
          action={
            <Link href="/" className="btn btn--accent">
              Back to the cover
            </Link>
          }
        >
          <p>The link may be old or mistyped. Your comics are safe in your comic book.</p>
        </EmptyState>
      </div>
    </main>
  );
}
