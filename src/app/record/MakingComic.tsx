"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Art } from "@/art/Art";
import { art } from "@/art/manifest";
import { PAGE_TURN } from "@/components/PageTurn";
import { pageView, type SlotView } from "@/components/comic/pageView";
import { SlotOutline } from "@/components/comic/SlotOutline";
import pageStyles from "@/components/comic/page.module.css";
import { formatDay, moodWords } from "@/lib/format";
import { splitPages } from "@/lib/layout/comicPages";
import {
  ComicPipeline,
  PIPELINE_STEPS,
  type PanelProgress,
  type PipelineState,
  type PipelineStep,
  type StepStatus,
} from "@/lib/pipeline";
import type { ArtStyleId } from "@/lib/artStyles";
import type { LanguageHint, LanguageMix, ScriptPanel, StoryMode } from "@/lib/types";
import styles from "./making.module.css";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
/** Frames shown before the script says how many panels there will be. */
const SKETCH_FRAMES = 4;
/** The page pencilled in before the script picks the real layout. */
const SKETCH_LAYOUT = { template: "turn-4", focus: 1 };
const SKETCH_STORY = Array.from({ length: SKETCH_FRAMES }, (_, index) => ({
  index,
  dialogue: [],
  characterIds: [],
  shot: index === 1 ? ("splash" as const) : ("medium" as const),
  beat: "build" as const,
}));

const STEP_LABELS: Record<PipelineStep, string> = {
  listen: "Listening",
  write: "Writing the script",
  draw: "Drawing the panels",
  check: "Checking faces",
  save: "Saving to this device",
};

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia(REDUCED_MOTION).matches;
}

function languageLabel(mix: LanguageMix): string {
  if (mix.mixed) return "Arabic and English";
  return mix.dominant === "ar" ? "Arabic" : "English";
}

/** "Karim's face", "Karim's and Nour's faces". */
function facesOf(names: string[]): string {
  if (names.length === 0) return "a face";
  const owners = names.map((name) => `${name}'s`);
  const joined = owners.length === 1 ? owners[0] : `${owners.slice(0, -1).join(", ")} and ${owners.at(-1)}`;
  return `${joined} ${names.length === 1 ? "face" : "faces"}`;
}

function excerpt(text: string, max = 150): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}

function stepDetail(step: PipelineStep, status: StepStatus, state: PipelineState): string {
  if (status === "skipped") return "Skipped today";
  if (status === "error" || status === "waiting") return "";
  const total = state.panels.length;
  const drawn = state.panels.filter((panel) => panel.status === "done").length;
  const fixes = state.panels.reduce((sum, panel) => sum + panel.fixedNames.length, 0);
  switch (step) {
    case "listen":
      return state.transcript ? languageLabel(state.transcript.languages) : "";
    case "write": {
      if (!state.script) return "";
      if (state.script.safety === "crisis") return "Comic paused";
      const pages = state.pages?.length ?? 1;
      return pages > 1 ? `${pages} pages, ${total} panels` : `${total} panels`;
    }
    case "draw":
      return `${drawn} of ${total}`;
    case "check":
      if (fixes > 0) return `${fixes} ${fixes === 1 ? "face" : "faces"} fixed`;
      return status === "done" ? "Every face matched" : "Comparing with your cast";
    case "save":
      return status === "done" ? "Saved" : "";
  }
}

function captionFor(state: PipelineState, fixing: PanelProgress | undefined): string {
  const crisis = state.script?.safety === "crisis";
  if (state.status === "error" && state.error) return state.error.message;
  if (state.status === "cancelled") return "Stopped. Your voice note is still here.";
  if (fixing) return `Fixing ${facesOf(fixing.fixedNames)}…`;
  if (state.status === "done")
    return crisis ? "Comimo didn't turn this note into a comic." : "Your comic is ready. Opening it…";
  const { steps } = state;
  if (steps.save === "active") return "Binding the pages…";
  if (steps.draw === "active") {
    const pages = state.pages?.length ?? 1;
    const drawingPanels = state.panels.filter((panel) => panel.status === "drawing");
    if (drawingPanels.length === 0) return "Checking faces…";
    // Name the panels by their place on their page: "Page 2 of 3 · drawing panel 4".
    const page = drawingPanels[0].page;
    const onPage = state.panels.filter((panel) => panel.page === page);
    const numbers = drawingPanels.filter((panel) => panel.page === page).map((panel) => onPage.indexOf(panel) + 1);
    const what = numbers.length === 1 ? `drawing panel ${numbers[0]}` : `drawing panels ${numbers.slice(0, -1).join(", ")} and ${numbers.at(-1)}`;
    if (pages > 1) return `Page ${page + 1} of ${pages} · ${what}…`;
    return `${what.charAt(0).toUpperCase()}${what.slice(1)} of ${onPage.length}…`;
  }
  if (steps.write === "active") return "Writing the script…";
  return "Listening to your day…";
}

interface MakingComicProps {
  /** The voice note; null when the day was typed. */
  audio: Blob | null;
  /** The typed day, used instead of a voice note. */
  text?: string;
  language: LanguageHint;
  style: ArtStyleId;
  storyMode: StoryMode;
  /** Called after the screen is cancelled and closed. */
  onClose: () => void;
}

/**
 * "Making your comic": a full-screen comic page that fills in as each step
 * finishes. Panels are pencilled from the script, inked when drawn, and a
 * panel whose face was fixed flips from before to after.
 */
export function MakingComic({ audio, text, language, style, storyMode, onClose }: MakingComicProps) {
  const [pipeline] = useState(() => new ComicPipeline({ audio, text, language, style, storyMode }));
  const state = useSyncExternalStore(pipeline.subscribe, pipeline.getSnapshot, pipeline.getSnapshot);
  const [settled, setSettled] = useState<ReadonlySet<number>>(() => new Set());
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const router = useRouter();

  const { script, transcript, status } = state;
  const crisis = script?.safety === "crisis";
  const fixing = state.panels.find((panel) => panel.status === "done" && panel.beforeUrl && !settled.has(panel.index));
  const finished = status === "done" && state.dayId !== null && !fixing;
  const failedStep = state.error?.step;

  // Coming back to /record after the comic opened: the run is over, so drop the screen.
  const leaveFinished = useEffectEvent(() => onClose());

  // Open as a modal (the page behind goes inert) and announce the heading.
  // Next keeps this page mounted but hidden (Activity) after routing to the
  // day, so the dialog must close when hidden or the day page stays inert.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (pipeline.getSnapshot().status === "done") {
      leaveFinished();
      return;
    }
    if (!dialog.open) dialog.showModal();
    headingRef.current?.focus();
    return () => dialog.close();
  }, [pipeline]);

  useEffect(() => {
    void pipeline.start();
    return () => pipeline.dispose();
  }, [pipeline]);

  // Hold on the finished page for a beat, then turn to the day.
  useEffect(() => {
    if (!finished) return;
    const delay = crisis ? 1800 : prefersReducedMotion() ? 700 : 1600;
    const timer = window.setTimeout(() => {
      router.push(`/day/${state.dayId}`, { transitionTypes: PAGE_TURN });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [finished, crisis, router, state.dayId]);

  const close = useCallback(() => {
    pipeline.cancel();
    dialogRef.current?.close();
    onClose();
  }, [pipeline, onClose]);

  const retry = useCallback(() => {
    headingRef.current?.focus();
    void pipeline.start();
  }, [pipeline]);

  const markSettled = useCallback((index: number) => {
    setSettled((previous) => new Set(previous).add(index));
  }, []);

  // Each page builds in its final shape: the layouts are picked right after the script.
  const slices = useMemo(
    () => (script && script.panels.length > 0 ? splitPages(script.panels, state.pages ?? undefined, pipeline.dayId) : []),
    [script, state.pages, pipeline],
  );
  // The page on the easel: the first one with a panel still to draw, else the last.
  const pageCount = Math.max(1, slices.length);
  const firstOpen = state.panels.find((panel) => panel.status !== "done");
  const pageNumber = slices.length === 0 ? 0 : (firstOpen?.page ?? slices.length - 1);
  const slice = slices[pageNumber];
  const page = useMemo(
    () =>
      slice
        ? pageView(slice.panels, slice.layout, slice.seed)
        : pageView(SKETCH_STORY, SKETCH_LAYOUT, pipeline.dayId),
    [slice, pipeline],
  );

  const frames: { index: number; scene?: ScriptPanel; progress?: PanelProgress }[] = slice
    ? slice.panels.map((panel) => ({
        index: panel.index,
        scene: panel,
        progress: state.panels.find((p) => p.index === panel.index),
      }))
    : Array.from({ length: SKETCH_FRAMES }, (_, index) => ({ index }));

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="making-title"
      onCancel={(event) => {
        // Escape cancels the run (and closes); once finished there is nothing to cancel.
        event.preventDefault();
        if (status !== "done") close();
      }}
    >
      <div className={styles.sheet}>
        <header className={styles.top}>
          <p className={styles.kicker}>
            <span className={styles.recDot} data-live={status === "running" || undefined} aria-hidden="true" />
            <time dateTime={state.date}>{formatDay(state.date)}</time>
          </p>
          {status !== "done" ? (
            <button type="button" className={`btn btn--ghost ${styles.cancel}`} onClick={close}>
              {status === "running" ? "Cancel" : "Back to recording"}
            </button>
          ) : null}
        </header>

        <div className={styles.head}>
          <h2 id="making-title" ref={headingRef} tabIndex={-1} className={styles.title}>
            {crisis ? "No comic this time" : finished ? "Your comic is ready" : "Making your comic"}
          </h2>
          <p
            className={`caption ${styles.caption}`}
            data-tone={status === "error" ? "error" : undefined}
            role="status"
            aria-live="polite"
            dir="auto"
          >
            {captionFor(state, fixing)}
          </p>
        </div>

        <div className={styles.stage}>
          <div className={`halftone ${styles.page}`}>
            <div className={styles.titleFrame} data-stage={script ? "title" : transcript ? "heard" : "listening"}>
              {!transcript ? (
                <>
                  <Art asset={art.brand.mascot} className={styles.mascot} alt="" />
                  <p className={`bubble ${styles.titleBubble}`}>
                    Listening
                    <span className={styles.ear} aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                  </p>
                </>
              ) : !script ? (
                <>
                  <Art asset={art.brand.mascot} className={styles.mascot} alt="" />
                  <p className={`bubble ${styles.titleBubble} ${styles.heard}`} dir="auto">
                    <span className="bubble__who">You said</span>
                    {excerpt(transcript.text)}
                  </p>
                </>
              ) : crisis ? (
                <p className={styles.pause} dir="auto">
                  That sounded like a really heavy day. Instead of a comic, the next page has some people you can talk
                  to.
                </p>
              ) : (
                <div className={styles.titleCard}>
                  <h3 className={styles.comicTitle} dir="auto">
                    {script.title}
                  </h3>
                  <p className={styles.weather}>
                    <Art asset={art.mood[script.mood]} className={styles.weatherIcon} alt="" />
                    <span>{moodWords[script.mood]} day</span>
                  </p>
                </div>
              )}
            </div>

            {crisis ? null : (
              <div key={pageNumber} className={`${pageStyles.wrap} ${styles.frames}`} data-style={style} data-turned={pageNumber > 0 || undefined}>
                {pageCount > 1 ? (
                  <p className={styles.pageTag}>
                    Page {pageNumber + 1} of {pageCount}
                  </p>
                ) : null}
                <ol
                  className={pageStyles.page}
                  style={page.vars as CSSProperties}
                  aria-label={pageCount > 1 ? `Panels on page ${pageNumber + 1} of ${pageCount}` : "Panels"}
                >
                  {frames.map((frame, i) => (
                    <ProgressFrame
                      key={frame.index}
                      index={frame.index}
                      number={i + 1}
                      total={frames.length}
                      slot={page.slots.find((s) => s.index === frame.index) ?? page.slots[i]}
                      scene={frame.scene}
                      progress={frame.progress}
                      onSettled={markSettled}
                    />
                  ))}
                </ol>
              </div>
            )}

            {finished && !crisis ? (
              <span className={styles.doneStamp} aria-hidden="true">
                <span>Done!</span>
              </span>
            ) : null}
          </div>

          <div className={styles.side}>
            <ol className={styles.steps} aria-label="Steps">
              {PIPELINE_STEPS.map((step, i) => {
                const stepStatus = state.steps[step];
                const detail = stepDetail(step, stepStatus, state);
                return (
                  <li key={step} className={styles.step} data-status={stepStatus}>
                    <span className={styles.stepMark} aria-hidden="true">
                      {stepStatus === "done" ? "✓" : stepStatus === "error" ? "!" : i + 1}
                    </span>
                    <span className={styles.stepText}>
                      <span className={styles.stepLabel}>{STEP_LABELS[step]}</span>
                      <span className="visually-hidden">: {stepStatus === "active" ? "in progress" : stepStatus}</span>
                      {detail ? <span className={styles.stepDetail}>{detail}</span> : null}
                    </span>
                    {stepStatus === "error" && failedStep === step ? (
                      <button type="button" className={`btn btn--ink ${styles.retry}`} onClick={retry}>
                        Try again
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ol>

            {finished ? (
              <Link href={`/day/${state.dayId}`} className="btn btn--accent" transitionTypes={PAGE_TURN}>
                {crisis ? "Continue" : "Open your comic"}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </dialog>
  );
}

interface ProgressFrameProps {
  /** The panel's index in the comic. */
  index: number;
  /** Its number on this page, from 1. */
  number: number;
  total: number;
  slot: SlotView;
  scene?: ScriptPanel;
  progress?: PanelProgress;
  onSettled: (index: number) => void;
}

/** One panel on the page: pencilled, being drawn, inked, or flipping from before to after. */
function ProgressFrame({ index, number, total, slot, scene, progress, onSettled }: ProgressFrameProps) {
  const status = progress?.status ?? "waiting";
  const fixing = status === "done" && Boolean(progress?.beforeUrl);
  const [flipped, setFlipped] = useState(false);

  // Show the drifted panel under a "fixing" stamp, then flip to the fixed one.
  useEffect(() => {
    if (!fixing) return;
    const reduce = prefersReducedMotion();
    const flip = window.setTimeout(() => setFlipped(true), reduce ? 900 : 1300);
    const done = window.setTimeout(() => onSettled(index), reduce ? 1400 : 2300);
    return () => {
      window.clearTimeout(flip);
      window.clearTimeout(done);
    };
  }, [fixing, index, onSettled]);

  const spoken =
    status === "done"
      ? fixing
        ? `drawn, ${facesOf(progress?.fixedNames ?? [])} fixed`
        : "drawn"
      : status === "drawing"
        ? "drawing"
        : status === "error"
          ? "didn't draw"
          : "waiting";

  return (
    <li
      className={`${pageStyles.slot} ${styles.frame}`}
      style={slot.vars as CSSProperties}
      data-inset={slot.inset || undefined}
      data-status={status}
      data-fix={fixing ? (flipped ? "after" : "before") : undefined}
    >
      <span className={styles.cut}>
      <span className="visually-hidden">
        Panel {number} of {total}: {spoken}
      </span>
      <span className={styles.frameNo} aria-hidden="true">
        {number}
      </span>

      {status === "waiting" && scene ? (
        <p className={styles.sketch} dir="auto" aria-hidden="true">
          {scene.narration || scene.caption || scene.scene}
        </p>
      ) : null}

      {status === "drawing" ? (
        <>
          <span className={styles.speed} aria-hidden="true" />
          <span className={`caption ${styles.drawingTag}`} aria-hidden="true">
            Drawing
          </span>
        </>
      ) : null}

      {status === "done" && progress?.imageUrl && !fixing ? (
        // Object URLs from the on-device store; next/image can't optimise them.
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.ink} src={progress.imageUrl} alt="" />
      ) : null}

      {fixing && progress?.imageUrl && progress.beforeUrl ? (
        <>
          <span className={styles.flipper} data-flipped={flipped || undefined} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={`${styles.face} ${styles.front}`} src={progress.beforeUrl} alt="" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={`${styles.face} ${styles.back}`} src={progress.imageUrl} alt="" />
          </span>
          <span className={styles.fixStamp} data-flipped={flipped || undefined} aria-hidden="true">
            {flipped ? "Face fixed" : `Fixing ${facesOf(progress.fixedNames)}`}
          </span>
        </>
      ) : null}

      {status === "error" ? (
        <p className={styles.frameError} aria-hidden="true">
          Didn&apos;t draw
        </p>
      ) : null}
      </span>
      <SlotOutline slot={slot} className={styles.outline} />
    </li>
  );
}
