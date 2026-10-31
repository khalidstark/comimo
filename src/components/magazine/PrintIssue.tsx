"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { MagazineIssue } from "@/lib/magazine/build";
import { issuePages, mainCast, monthInWords } from "@/lib/magazine/issue";
import { loadIssue, loadLibrary, type LoadedIssue } from "@/lib/magazine/load";
import { PAGE_TURN } from "@/components/PageTurn";
import { IssuePageView, issueLine, type IssueContext } from "./IssuePages";
import styles from "./print.module.css";

type State = { status: "loading" } | { status: "missing" } | { status: "ready"; issue: MagazineIssue };

/**
 * The whole issue laid out flat, one A4 sheet per page, for the browser's
 * "Print" or "Save as PDF". Reads the issue named in ?issue= (the sample by default).
 */
export function PrintIssue({ sample }: { sample: MagazineIssue }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    let loaded: LoadedIssue | null = null;
    const key = new URLSearchParams(window.location.search).get("issue") ?? "sample";
    if (key === "sample") {
      // Deferred so the first render (and hydration) stays the loading state.
      queueMicrotask(() => !cancelled && setState({ status: "ready", issue: sample }));
    } else {
      void loadLibrary()
        .then((library) => (library.months.includes(key) ? loadIssue(library, key) : null))
        .then((result) => {
          if (cancelled) return result?.release();
          loaded = result;
          setState(result ? { status: "ready", issue: result.issue } : { status: "missing" });
        })
        .catch(() => !cancelled && setState({ status: "missing" }));
    }
    return () => {
      cancelled = true;
      loaded?.release();
    };
  }, [sample]);

  const ctx: IssueContext | null = useMemo(() => {
    if (state.status !== "ready") return null;
    const { issue } = state;
    return { issue, pages: issuePages(issue.days), words: monthInWords(issue.days, issue.cast), stars: mainCast(issue.days, issue.cast), fit: true };
  }, [state]);

  return (
    <main id="main" className={styles.print}>
      <div className={styles.bar}>
        <Link href="/month" className="btn btn--ghost" transitionTypes={PAGE_TURN}>
          <span aria-hidden="true">←</span> Back to the magazine
        </Link>
        <p className={styles.barText}>
          {ctx ? `${issueLine(ctx.issue)}: ${ctx.pages.length} pages on A4.` : state.status === "missing" ? "" : "Laying out the issue…"}
        </p>
        <button type="button" className="btn btn--accent" onClick={() => window.print()} disabled={!ctx}>
          Print or save as PDF
        </button>
      </div>

      {state.status === "missing" ? <p className={styles.missing}>That issue isn&apos;t on this device.</p> : null}

      {ctx ? (
        <ol className={styles.sheets} aria-label={issueLine(ctx.issue)}>
          {ctx.pages.map((_, index) => (
            <li key={index} className={styles.sheet} data-side={index === 0 ? "single" : index % 2 === 1 ? "left" : "right"}>
              <IssuePageView ctx={ctx} index={index} role="copy" />
            </li>
          ))}
        </ol>
      ) : null}
    </main>
  );
}
