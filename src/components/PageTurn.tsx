import { ViewTransition, type ReactNode } from "react";

/**
 * Wraps a page in the view transition that used to play the zine page turn on
 * navigations tagged "page-turn". In-app links now leave through the ink
 * overlay (motion/InkTransition) instead, and the "page-turn" CSS is a no-op,
 * so this stays only as a harmless path for the existing call sites: tagged
 * navigations that still start a view transition swap at once, and untagged
 * ones (back button, refreshes) stay instant.
 */
export function PageTurn({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      enter={{ "page-turn": "page-turn", default: "none" }}
      exit={{ "page-turn": "page-turn", default: "none" }}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}

/** The old page-turn tag on <Link transitionTypes>; harmless now (see above). */
export const PAGE_TURN = ["page-turn"];
