"use client";

import Link from "next/link";
import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Art } from "@/art/Art";
import { art } from "@/art/manifest";
import { Comic } from "@/components/comic/Comic";
import type { BookPage } from "@/components/comic/ComicBook";
import type { PanelArt } from "@/components/comic/view";
import { MoodCalendar } from "@/components/MoodCalendar";
import { PAGE_TURN } from "@/components/PageTurn";
import type { ArtStyleId } from "@/lib/artStyles";
import { countWord, moodWords } from "@/lib/format";
import type { IssueCast, MagazineIssue } from "@/lib/magazine/build";
import { monthLabel, nextMonthName, type IssuePage } from "@/lib/magazine/issue";
import type { PageRole } from "./FlipBook";
import styles from "./magazine.module.css";

/** Width the designed (desktop) comic page is laid out at before it is scaled into a magazine page. */
const DESIGN_WIDTH = 672;

/** What every page of an issue shares. */
export interface IssueContext {
  issue: MagazineIssue;
  pages: IssuePage[];
  /** The back cover's lines (see monthInWords). */
  words: string[];
  /** The cover's stars, the narrator first. */
  stars: IssueCast[];
  /** Printed pages: a fixed page size with each comic scaled to fit. Off on phones, where comics keep their own height. */
  fit: boolean;
  /** Open the page at this index (contents entries). */
  onJump?: (index: number) => void;
}

const shortDate = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const dateOf = (iso: string) => shortDate.format(new Date(`${iso}T00:00:00Z`));

/** The fallback cover line until Muse Spark writes one for the month. */
export const DEFAULT_TAGLINE = "The month, as you told it";

function capitalise(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function Picture({ picture, className, alt = "", eager }: { picture: PanelArt; className?: string; alt?: string; eager?: boolean }) {
  if (picture.kind === "art") {
    return (
      <Art
        asset={picture.asset}
        className={className}
        alt={alt}
        sizes="(min-width: 64rem) 36vw, 92vw"
        loading={eager ? "eager" : undefined}
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={picture.src} className={className} alt={alt} decoding="async" draggable={false} />;
}

export function issueLine(issue: MagazineIssue): string {
  const month = monthLabel(issue.month);
  return issue.sample ? `${month} · Sample issue` : `${month} · No. ${issue.number}`;
}

function Folio({ index, side }: { index: number; side?: "start" | "end" }) {
  return (
    <span className={styles.folio} data-side={side}>
      {index + 1}
    </span>
  );
}

/* ---------- Front cover ---------- */

function Cover({ ctx }: { ctx: IssueContext }) {
  const { issue, stars } = ctx;
  const lines = [...issue.days].sort((a, b) => b.panelCount - a.panelCount).slice(0, 3);
  const tagline = issue.cover.tagline ?? DEFAULT_TAGLINE;
  return (
    <article className={styles.sheet} data-kind="cover" aria-label={`Front cover: ${issueLine(issue)}`}>
      <Picture picture={issue.cover.art} className={styles.coverArt} eager />
      <div className={styles.coverWash} aria-hidden="true" />
      <ol className={styles.spine} aria-label="The month's weather, day by day">
        {issue.days.map((day) => (
          <li key={day.id} style={{ background: `var(--mood-${day.mood})` } as CSSProperties}>
            <span className="visually-hidden">
              {dateOf(day.date)}: {moodWords[day.mood]}
            </span>
          </li>
        ))}
      </ol>
      <header className={styles.masthead}>
        <span className={styles.mastheadWord}>comimo</span>
        <span className={styles.issueLine}>{issueLine(issue)}</span>
      </header>
      <span className={styles.badge} aria-hidden="true">
        <span>{issue.days.length}</span>
        <span>{issue.days.length === 1 ? "day" : "days"}</span>
      </span>
      <div className={styles.coverFoot}>
        <p className={styles.tagline} dir="auto">
          {tagline}
        </p>
        <ul className={styles.coverLines} aria-label="Inside">
          {lines.map((day) => (
            <li key={day.id} dir="auto">
              {day.title}
            </li>
          ))}
        </ul>
        {stars.length > 0 ? (
          <p className={styles.starring}>
            <span className={styles.starringLabel}>Starring</span>
            {stars.map((star) => (
              <span key={star.id} className={styles.star}>
                {star.portrait ? <Picture picture={star.portrait} className={styles.starFace} /> : null}
                <span dir="auto">{star.name}</span>
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </article>
  );
}

/* ---------- Contents ---------- */

function Contents({
  ctx,
  page,
  index,
  role,
}: {
  ctx: IssueContext;
  page: Extract<IssuePage, { kind: "contents" }>;
  index: number;
  role: PageRole;
}) {
  const { issue } = ctx;
  const live = role === "live" && ctx.onJump;
  return (
    <article className={styles.sheet} data-kind="contents" aria-label={page.part === 0 ? "Contents" : "Contents, continued"}>
      <header className={styles.contentsHead}>
        <p className={styles.kicker}>{issueLine(issue)}</p>
        <h2 className={styles.contentsTitle}>{page.part === 0 ? "In this issue" : "In this issue, continued"}</h2>
      </header>
      <ol className={styles.contents}>
        {page.entries.map(({ dayIndex, folio }) => {
          const day = issue.days[dayIndex];
          const inner = (
            <>
              <span className={styles.entryFolio}>{folio}</span>
              <span className={styles.entryText}>
                <span className={styles.entryDate}>{dateOf(day.date)}</span>
                <span className={styles.entryTitle} dir="auto">
                  {day.title}
                </span>
                <span className={styles.entryMeta}>
                  {moodWords[day.mood]}
                  {day.pageCount > 1 ? ` · ${countWord(day.pageCount)} pages` : ""}
                </span>
              </span>
              <Art asset={art.mood[day.mood]} className={styles.entryIcon} alt="" />
            </>
          );
          return (
            <li key={day.id}>
              {live ? (
                <button type="button" className={styles.entry} onClick={() => ctx.onJump?.(folio - 1)}>
                  {inner}
                  <span className="visually-hidden">, page {folio}</span>
                </button>
              ) : (
                <span className={styles.entry}>{inner}</span>
              )}
            </li>
          );
        })}
      </ol>
      <Folio index={index} />
    </article>
  );
}

/* ---------- The month's weather ---------- */

function Weather({ ctx, index, role }: { ctx: IssueContext; index: number; role: PageRole }) {
  const { issue, words } = ctx;
  const titleId = useId();
  const [year, month] = issue.month.split("-").map(Number);
  const moods = Object.fromEntries(issue.days.map((day) => [day.date, day.mood]));
  return (
    <article className={styles.sheet} data-kind="weather" aria-labelledby={role === "live" ? titleId : undefined}>
      <p className={styles.kicker}>At a glance</p>
      <h2 id={role === "live" ? titleId : undefined} className={styles.weatherTitle}>
        The month&apos;s weather
      </h2>
      {words[1] ? <p className={styles.weatherLede}>{words[1]}</p> : null}
      <div className={styles.calendar}>
        <MoodCalendar year={year} month={month} moods={moods} labelledBy={role === "live" ? titleId : undefined} compact={!ctx.fit} />
      </div>
      <p className={styles.weatherNote}>Blank squares are days you didn&apos;t record, and that&apos;s fine.</p>
      <Folio index={index} side="end" />
    </article>
  );
}

/* ---------- A comic page ---------- */

/**
 * A comic page as the day reader draws it (the same <Comic>). On printed
 * pages the designed wide layout is set at a fixed width and scaled to fit
 * the page; on phones it keeps the phone layout at full width.
 */
function FittedComic({ book, style, label, fit }: { book: BookPage; style: ArtStyleId; label: string; fit: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ scale: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!fit) return;
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;
    const measure = () => {
      const height = inner.offsetHeight;
      if (!height || !box.clientWidth) return;
      const scale = Math.min(box.clientWidth / DESIGN_WIDTH, box.clientHeight / height);
      setPlacement({ scale, top: Math.max(0, (box.clientHeight - height * scale) / 2) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [fit]);

  return (
    <div ref={boxRef} className={styles.comicBox} data-fit={fit || undefined}>
      <div
        ref={innerRef}
        className={styles.comicDesign}
        style={
          fit
            ? ({
                inlineSize: DESIGN_WIDTH,
                transform: `translate(-50%, ${placement?.top ?? 0}px) scale(${placement?.scale ?? 0})`,
              } as CSSProperties)
            : undefined
        }
      >
        <Comic panels={book.panels} page={book.page} style={style} label={label} still />
      </div>
    </div>
  );
}

function ComicSheet({
  ctx,
  page,
  index,
  role,
}: {
  ctx: IssueContext;
  page: Extract<IssuePage, { kind: "comic" }>;
  index: number;
  role: PageRole;
}) {
  const day = ctx.issue.days[page.dayIndex];
  const book = day.pages[page.page];
  if (!book) return null;
  const left = ctx.fit && index % 2 === 1;
  const of = day.pageCount > 1 ? `, page ${page.page + 1} of ${day.pageCount}` : "";
  return (
    <article className={styles.sheet} data-kind="comic" data-style={day.style} aria-label={`${day.title}${of}`}>
      <header className={styles.runningHead}>
        <span className={styles.headDate}>{dateOf(day.date)}</span>
        <span className={styles.headTitle} dir="auto">
          {day.title}
        </span>
        {day.pageCount > 1 ? (
          <span className={styles.headPart}>
            {page.page + 1}/{day.pageCount}
          </span>
        ) : null}
        <Art asset={art.mood[day.mood]} className={styles.headIcon} alt={moodWords[day.mood]} />
      </header>
      <FittedComic book={book} style={day.style} label={`Comic for ${dateOf(day.date)}${of}`} fit={ctx.fit} />
      <footer className={styles.foot} data-side={left ? "start" : "end"}>
        <span className={styles.folioPlain}>{index + 1}</span>
        {role === "live" && page.page === 0 ? (
          <Link href={`/day/${day.id}`} className={styles.footLink} transitionTypes={PAGE_TURN}>
            Open this day
          </Link>
        ) : null}
      </footer>
    </article>
  );
}

/* ---------- Next issue (keeps the back cover on its own) ---------- */

function NextIssue({ ctx, index, role }: { ctx: IssueContext; index: number; role: PageRole }) {
  const { issue } = ctx;
  return (
    <article className={styles.sheet} data-kind="next" aria-label="Next issue">
      <Art asset={art.empty.month} className={styles.nextArt} alt="" />
      <p className={styles.kicker}>Coming next</p>
      <h2 className={styles.nextTitle}>{issue.sample ? "Your own issue" : `The ${nextMonthName(issue.month)} issue`}</h2>
      <p className={styles.nextText}>
        {issue.sample ? "Record a day and it becomes the first page of your own magazine." : "Every day you record lands in it."}
      </p>
      {role === "live" ? (
        <Link href="/record" className="btn btn--accent" transitionTypes={PAGE_TURN}>
          Record today
        </Link>
      ) : (
        <span className="btn btn--accent">Record today</span>
      )}
      <Folio index={index} />
    </article>
  );
}

/* ---------- Back cover ---------- */

function BackCover({ ctx }: { ctx: IssueContext }) {
  const { issue, words } = ctx;
  return (
    <article className={styles.sheet} data-kind="back" aria-label={`Back cover: ${monthLabel(issue.month)} in words`}>
      <p className={styles.backKicker}>{monthLabel(issue.month)}, in words</p>
      <div className={styles.words}>
        {words.map((line, i) => (
          <p key={i} className={styles.wordsLine}>
            {line}
          </p>
        ))}
      </div>
      <ol className={styles.backStrip} aria-label="Every day's weather">
        {issue.days.map((day) => (
          <li key={day.id}>
            <Art asset={art.mood[day.mood]} className={styles.backIcon} alt="" />
            <span className={styles.backDay} aria-hidden="true">
              {Number(day.date.slice(8))}
            </span>
            <span className="visually-hidden">
              {dateOf(day.date)}: {moodWords[day.mood]}
            </span>
          </li>
        ))}
      </ol>
      <Art asset={art.brand.mascot} className={styles.backMimo} alt="" />
      <footer className={styles.backFoot}>
        <span className={styles.backLogo}>comimo</span>
        <span className={styles.barcode} aria-hidden="true" />
        <span className={styles.backIssue}>{capitalise(issueLine(issue))}</span>
      </footer>
    </article>
  );
}

/** One page of the issue, by kind. */
export function IssuePageView({ ctx, index, role }: { ctx: IssueContext; index: number; role: PageRole }) {
  const page = ctx.pages[index];
  if (!page) return null;
  switch (page.kind) {
    case "cover":
      return <Cover ctx={ctx} />;
    case "contents":
      return <Contents ctx={ctx} page={page} index={index} role={role} />;
    case "weather":
      return <Weather ctx={ctx} index={index} role={role} />;
    case "comic":
      return <ComicSheet ctx={ctx} page={page} index={index} role={role} />;
    case "next":
      return <NextIssue ctx={ctx} index={index} role={role} />;
    case "back":
      return <BackCover ctx={ctx} />;
  }
}
