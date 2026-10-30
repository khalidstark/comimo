import { ViewTransition, type ReactNode } from "react";

/**
 * Wraps a page so navigations tagged "page-turn" play the zine page turn:
 * the old page swings away, the new one is wiped in like the next panel.
 * Untagged updates (back button, refreshes) swap instantly.
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

/** Pass to <Link transitionTypes> for in-app navigation. */
export const PAGE_TURN = ["page-turn"];
