"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { artStyleOf, type ArtStyleId } from "@/lib/artStyles";
import type { MagazineIssue } from "@/lib/magazine/build";
import { CoverError, drawCover } from "@/lib/magazine/coverStore";
import { issuePages, mainCast, monthInWords, monthLabel, spreadOf, spreadsFor } from "@/lib/magazine/issue";
import { loadIssue, loadLibrary, type Library, type LoadedIssue } from "@/lib/magazine/load";
import { FlipBook, type PageRole } from "./FlipBook";
import { IssuePageView, issueLine, type IssueContext } from "./IssuePages";
import { saveCoverImage } from "./saveCover";
import styles from "./reader.module.css";

const TWO_UP = "(min-width: 64rem)";

function subscribeTwoUp(onChange: () => void) {
  const query = window.matchMedia(TWO_UP);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.closest("[role='slider']") !== null;
}

type CoverState = { status: "idle" } | { status: "drawing" } | { status: "error"; message: string };

/** The art style most of the month was drawn in. */
function issueStyle(issue: MagazineIssue): ArtStyleId {
  const painterly = issue.days.filter((day) => day.style === "painterly").length;
  return artStyleOf(painterly > issue.days.length / 2 ? "painterly" : "zine");
}

/**
 * The month as a comic magazine you can hold. Opens on the sample issue
 * (rendered on the server), then on the newest month kept on this device.
 */
export function Magazine({ sample, heading }: { sample: MagazineIssue; heading: ReactNode }) {
  const twoUp = useSyncExternalStore(
    subscribeTwoUp,
    () => window.matchMedia(TWO_UP).matches,
    () => false,
  );

  const [library, setLibrary] = useState<Library | null>(null);
  const [selected, setSelected] = useState("sample");
  const [loaded, setLoaded] = useState<LoadedIssue | null>(null);
  const [failed, setFailed] = useState(false);
  const [anchor, setAnchor] = useState(0);
  const [cover, setCover] = useState<CoverState>({ status: "idle" });
  const [saving, setSaving] = useState(false);
  const loadedRef = useRef<LoadedIssue | null>(null);

  const issue = selected === "sample" ? sample : loaded?.issue.key === selected ? loaded.issue : null;

  // The months on this device; open the newest unless the link asks for another issue.
  useEffect(() => {
    let cancelled = false;
    void loadLibrary().then((found) => {
      if (cancelled) return;
      setLibrary(found);
      const asked = new URLSearchParams(window.location.search).get("issue");
      const pick = asked === "sample" ? "sample" : asked && found.months.includes(asked) ? asked : found.months.at(-1);
      if (pick && pick !== "sample") setSelected(pick);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Read the chosen month's comics from the device.
  useEffect(() => {
    if (selected === "sample" || !library) return;
    let cancelled = false;
    loadIssue(library, selected).then(
      (next) => {
        if (cancelled) return next.release();
        loadedRef.current?.release();
        loadedRef.current = next;
        setLoaded(next);
        setFailed(false);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [library, selected]);

  useEffect(() => () => loadedRef.current?.release(), []);

  const ctxBase = useMemo(() => {
    if (!issue) return null;
    const pages = issuePages(issue.days);
    return { issue, pages, words: monthInWords(issue.days, issue.cast), stars: mainCast(issue.days, issue.cast) };
  }, [issue]);

  const pageCount = ctxBase?.pages.length ?? 0;
  const spreads = useMemo(() => spreadsFor(pageCount, twoUp), [pageCount, twoUp]);
  const view = Math.min(spreadOf(anchor, twoUp), Math.max(0, spreads.length - 1));
  const last = spreads.length - 1;

  const showView = useCallback(
    (next: number) => {
      const spread = spreads[Math.min(Math.max(0, next), last)];
      if (spread) setAnchor(spread.left ?? spread.right ?? 0);
    },
    [last, spreads],
  );

  const jumpToPage = useCallback((index: number) => setAnchor(index), []);

  const ctx: IssueContext | null = useMemo(
    () => (ctxBase ? { ...ctxBase, fit: twoUp, onJump: jumpToPage } : null),
    [ctxBase, jumpToPage, twoUp],
  );

  const renderPage = useCallback(
    (index: number, role: PageRole) => (ctx ? <IssuePageView ctx={ctx} index={index} role={role} /> : null),
    [ctx],
  );

  // Arrow keys, Page Up/Down, Home and End turn the pages.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isTyping(event.target)) return;
      if (document.querySelector("dialog[open]")) return;
      let next: number;
      if (event.key === "ArrowRight" || event.key === "PageDown") next = view + 1;
      else if (event.key === "ArrowLeft" || event.key === "PageUp") next = view - 1;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = last;
      else return;
      event.preventDefault();
      showView(next);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [last, showView, view]);

  const choose = (key: string) => {
    if (key === selected) return;
    setSelected(key);
    setAnchor(0);
    setCover({ status: "idle" });
    const url = new URL(window.location.href);
    url.searchParams.set("issue", key);
    window.history.replaceState(window.history.state, "", url);
  };

  const viewLabel = (index: number): string => {
    if (!ctx) return "";
    const spread = spreads[index];
    if (!spread) return "";
    const shown = [spread.left, spread.right].filter((page): page is number => page !== null);
    const names = shown.map((page) => {
      const kind = ctx.pages[page];
      if (kind.kind === "cover") return "Front cover";
      if (kind.kind === "back") return "Back cover";
      if (kind.kind === "contents") return "Contents";
      if (kind.kind === "weather") return "The month's weather";
      if (kind.kind === "next") return "Next issue";
      return ctx.issue.days[kind.dayIndex].title;
    });
    const unique = [...new Set(names)];
    const numbers = shown.length > 1 ? `Pages ${shown[0] + 1} and ${shown[1] + 1}` : `Page ${shown[0] + 1}`;
    return `${numbers} of ${pageCount}: ${unique.join(", ")}`;
  };

  const drawThisCover = async () => {
    if (!issue || issue.sample || !library) return;
    setCover({ status: "drawing" });
    try {
      const castById = new Map(library.cast.map((member) => [member.id, member]));
      const stars = mainCast(issue.days, issue.cast).flatMap((star) => castById.get(star.id) ?? []);
      await drawCover(
        issue.month,
        issue.days.map((day) => day.title),
        stars,
        issueStyle(issue),
      );
      const next = await loadIssue(library, issue.month);
      loadedRef.current?.release();
      loadedRef.current = next;
      setLoaded(next);
      setCover({ status: "idle" });
      setAnchor(0);
    } catch (error) {
      setCover({ status: "error", message: error instanceof CoverError ? error.message : "The cover couldn't be drawn. Try again." });
    }
  };

  const saveCover = async () => {
    if (!ctx) return;
    setSaving(true);
    try {
      await saveCoverImage(ctx);
    } finally {
      setSaving(false);
    }
  };

  const months = library?.months ?? [];

  return (
    <div className={styles.reader}>
      <div className={styles.top}>
        {heading}
        <nav className={styles.issues} aria-label="Issues">
          <ul className={styles.issueList}>
            {[...months].reverse().map((month) => (
              <li key={month}>
                <button type="button" className={styles.issueChip} aria-pressed={selected === month} onClick={() => choose(month)}>
                  <span className={styles.issueMonth}>{monthLabel(month)}</span>
                  <span className={styles.issueNo}>No. {months.indexOf(month) + 1}</span>
                </button>
              </li>
            ))}
            <li>
              <button type="button" className={styles.issueChip} aria-pressed={selected === "sample"} onClick={() => choose("sample")}>
                <span className={styles.issueMonth}>{monthLabel(sample.month)}</span>
                <span className={styles.issueNo}>Sample</span>
              </button>
            </li>
          </ul>
        </nav>
      </div>

      {ctx && issue ? (
        <>
          <p className="visually-hidden" aria-live="polite">
            {viewLabel(view)}
          </p>
          <FlipBook
            key={issue.key}
            pageCount={pageCount}
            twoUp={twoUp}
            view={view}
            onViewChange={showView}
            renderPage={renderPage}
            label={`${issueLine(issue)}, a comic magazine`}
          />

          <div className={styles.controls}>
            <button type="button" className={`btn btn--ghost ${styles.turn}`} onClick={() => showView(view - 1)} disabled={view === 0}>
              <span aria-hidden="true">←</span>
              <span className={styles.turnWord}>Back</span>
            </button>
            <label className={styles.scrubber}>
              <span className={styles.scrubLabel} aria-hidden="true">
                {viewLabel(view)}
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(0, last)}
                step={1}
                value={view}
                onChange={(event) => showView(Number(event.target.value))}
                aria-label="Turn to page"
                aria-valuetext={viewLabel(view)}
                className={styles.range}
                style={{ "--fill": `${last > 0 ? (view / last) * 100 : 0}%` } as CSSProperties}
              />
            </label>
            <button type="button" className={`btn btn--accent ${styles.turn}`} onClick={() => showView(view + 1)} disabled={view === last}>
              <span className={styles.turnWord}>Turn</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>

          <div className={styles.tools}>
            {!issue.sample && !issue.cover.drawn ? (
              <button
                type="button"
                className="btn btn--ink"
                onClick={drawThisCover}
                disabled={cover.status === "drawing"}
                aria-busy={cover.status === "drawing"}
              >
                {cover.status === "drawing" ? "Muse is drawing your cover…" : "Draw this month's cover"}
              </button>
            ) : null}
            <button type="button" className="btn btn--ghost" onClick={saveCover} disabled={saving}>
              {saving ? "Saving…" : "Save cover as image"}
            </button>
            <Link href={`/month/print?issue=${issue.key}`} className="btn btn--ghost">
              Print or save as PDF
            </Link>
          </div>
          {cover.status === "error" ? (
            <p className={styles.coverError} role="alert">
              {cover.message}
            </p>
          ) : null}
          <p className={styles.hint}>Drag a page, use the arrow keys or the slider to turn.</p>
        </>
      ) : (
        <div className={styles.loading} role="status" aria-busy={!failed}>
          {failed ? "This month couldn't be opened on this device." : "Opening the issue…"}
        </div>
      )}
    </div>
  );
}
