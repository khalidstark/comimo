"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type CSSProperties, type FormEvent } from "react";
import { Art } from "@/art/Art";
import { art } from "@/art/manifest";
import { DiarySticker } from "@/components/diary/DiarySticker";
import { NewDiary } from "@/components/diary/NewDiary";
import { Notebook } from "@/components/diary/Notebook";
import { PAGE_TURN } from "@/components/PageTurn";
import { DiaryError, EVERY_DAY, daysIn, deleteDiary, diaryNameProblem, loadDiaries, updateDiary } from "@/lib/diaries";
import { formatDay, moodWords } from "@/lib/format";
import { listDays } from "@/lib/store";
import { DIARY_COLORS, DIARY_STICKERS, type Day, type Diary } from "@/lib/types";
import { useImageUrl } from "@/lib/useImageUrl";
import styles from "./diaries.module.css";

const EVERY_DAY_DIARY: Diary = { id: EVERY_DAY, name: "Every day", color: "sun", sticker: "spark", createdAt: "" };
const TILTS = ["-1.5deg", "1deg", "-0.5deg", "1.5deg", "-1deg", "0.5deg"];

function openedId(): string {
  if (typeof window === "undefined") return EVERY_DAY;
  return new URLSearchParams(window.location.search).get("d") || EVERY_DAY;
}

/**
 * One diary, opened: its comics as a pinned strip of first panels, newest
 * first, with "Write in it" (/record?diary=…), and for the user's own
 * diaries rename, recolour, a new sticker and delete. Other diaries sit on a
 * small shelf at the top to hop between them.
 */
export function DiaryView() {
  const router = useRouter();
  const [state, setState] = useState<{ days: Day[]; diaries: Diary[]; open: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [making, setMaking] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      void Promise.all([listDays(), loadDiaries()]).then(([days, diaries]) => {
        if (!cancelled) setState((current) => ({ days: days.filter((d) => !d.sample), diaries, open: current?.open ?? openedId() }));
      });
    refresh();
    window.addEventListener("comimo:synced", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("comimo:synced", refresh);
    };
  }, []);

  if (!state) {
    return (
      <p className={styles.loading} role="status">
        Opening your diaries…
      </p>
    );
  }

  const diary = state.diaries.find((d) => d.id === state.open) ?? EVERY_DAY_DIARY;
  const own = diary.id !== EVERY_DAY;
  const comics = daysIn(diary.id, state.days, state.diaries);
  const all = [EVERY_DAY_DIARY, ...state.diaries];

  function open(id: string) {
    setEditing(false);
    setConfirm(false);
    setState((current) => (current ? { ...current, open: id } : current));
    window.history.replaceState(window.history.state, "", `/diaries?d=${encodeURIComponent(id)}`);
  }

  return (
    <div className={styles.view} data-color={diary.color}>
      <nav className={styles.tabs} aria-label="Your diaries">
        <ul className={styles.tabList}>
          {all.map((d) => (
            <li key={d.id}>
              <button type="button" className={styles.tab} data-color={d.color} aria-current={d.id === diary.id ? "page" : undefined} onClick={() => open(d.id)}>
                <DiarySticker name={d.sticker} className={styles.tabSticker} />
                <span dir="auto">{d.name}</span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" className={`${styles.tab} ${styles.tabNew}`} onClick={() => setMaking(true)}>
              + New diary
            </button>
          </li>
        </ul>
      </nav>

      {making ? (
        <NewDiary
          existing={state.diaries}
          onCancel={() => setMaking(false)}
          onMade={(made) => {
            setMaking(false);
            setState((current) => (current ? { ...current, diaries: [...current.diaries, made] } : current));
            open(made.id);
          }}
        />
      ) : null}

      <header className={styles.head}>
        <div className={styles.headCover}>
          <Notebook href={`/record?diary=${encodeURIComponent(diary.id)}`} name={diary.name} color={diary.color} sticker={diary.sticker} count={comics.length} daily={!own} />
        </div>
        <div className={styles.headText}>
          <p className={styles.kicker}>{own ? "Your diary" : "Your daily diary"}</p>
          <h1 className={styles.title} dir="auto">
            {diary.name}
          </h1>
          <p className={styles.lede}>
            {own
              ? comics.length === 0
                ? "Nothing in it yet. Tell it something, any day you like."
                : `${comics.length === 1 ? "One comic" : `${comics.length} comics`} so far, written whenever you wanted.`
              : "Every comic you make for the day, unless you put it in another diary."}
          </p>
          <div className={styles.actions}>
            <Link href={`/record?diary=${encodeURIComponent(diary.id)}`} className="btn btn--accent" transitionTypes={PAGE_TURN}>
              {own ? "Write in it" : "Record today"}
            </Link>
            {own ? (
              <button type="button" className="btn btn--ghost" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
                Edit diary
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {own && editing ? (
        <EditDiary
          diary={diary}
          others={state.diaries}
          onSaved={(next) => {
            setEditing(false);
            setState((current) => (current ? { ...current, diaries: current.diaries.map((d) => (d.id === next.id ? next : d)) } : current));
          }}
          onDelete={() => setConfirm(true)}
        />
      ) : null}

      {own && confirm ? (
        <div className={styles.confirm} role="alertdialog" aria-labelledby="delete-title">
          <p id="delete-title">
            Delete <bdi>{diary.name}</bdi>? Its {comics.length === 1 ? "comic stays" : "comics stay"} in your comic book and move to Every day.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn--ink"
              onClick={() =>
                void deleteDiary(diary.id).then(() => {
                  setConfirm(false);
                  setState((current) => (current ? { ...current, diaries: current.diaries.filter((d) => d.id !== diary.id), open: EVERY_DAY } : current));
                  router.replace("/diaries?d=every-day");
                })
              }
            >
              Delete diary
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirm(false)}>
              Keep it
            </button>
          </div>
        </div>
      ) : null}

      {comics.length > 0 ? (
        <ol className={styles.strip} aria-label={`Comics in ${diary.name}`}>
          {comics.map((day, i) => (
            <ComicCard key={day.id} day={day} tilt={TILTS[i % TILTS.length]} index={i} />
          ))}
        </ol>
      ) : (
        <div className={styles.empty}>
          <Art asset={art.empty.days} className={styles.emptyArt} alt="" />
          <p>The first page is the hardest. Talk for a minute, or type it.</p>
        </div>
      )}
    </div>
  );
}

function ComicCard({ day, tilt, index }: { day: Day; tilt: string; index: number }) {
  const url = useImageUrl(day.panels[0]?.image ?? null);
  return (
    <li className={styles.card} style={{ "--tilt": tilt, "--i": index } as CSSProperties}>
      <Link href={`/day/${day.id}`} className={styles.cardLink} transitionTypes={PAGE_TURN}>
        <span className={styles.cardArt}>
          {url ? (
            // A stored Blob or a manifest file; next/image can't optimise Blobs.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" />
          ) : (
            <span className={styles.cardBlank} aria-hidden="true" />
          )}
          <span className={styles.cardMood}>
            <Art asset={art.mood[day.mood]} alt="" className={styles.cardMoodIcon} />
            <span className="visually-hidden">{moodWords[day.mood]} day</span>
          </span>
        </span>
        <span className={styles.cardDate}>{formatDay(day.date)}</span>
        <span className={styles.cardTitle} dir="auto">
          {day.title}
        </span>
      </Link>
    </li>
  );
}

function EditDiary({ diary, others, onSaved, onDelete }: { diary: Diary; others: Diary[]; onSaved: (diary: Diary) => void; onDelete: () => void }) {
  const id = useId();
  const [name, setName] = useState(diary.name);
  const [color, setColor] = useState(diary.color);
  const [sticker, setSticker] = useState(diary.sticker);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = diaryNameProblem(name, others, diary.id);
    if (problem) return setError(problem);
    try {
      onSaved(await updateDiary(diary.id, { name, color, sticker }));
    } catch (failure) {
      setError(failure instanceof DiaryError ? failure.message : "That didn't save. Try again.");
    }
  }

  return (
    <form className={styles.edit} onSubmit={submit} noValidate>
      <label className={styles.field} htmlFor={`${id}-name`}>
        <span className={styles.fieldLabel}>Name</span>
        <input id={`${id}-name`} value={name} onChange={(event) => setName(event.target.value)} dir="auto" maxLength={50} aria-invalid={error ? true : undefined} />
      </label>
      <div className={styles.row} role="radiogroup" aria-label="Cover colour">
        {DIARY_COLORS.map((value) => (
          <label key={value} className={styles.swatch} data-color={value}>
            <input type="radio" name={`${id}-color`} checked={color === value} onChange={() => setColor(value)} />
            <span className="visually-hidden">{value}</span>
          </label>
        ))}
      </div>
      <div className={styles.row} role="radiogroup" aria-label="Sticker">
        {DIARY_STICKERS.map((value) => (
          <label key={value} className={styles.stickerPick}>
            <input type="radio" name={`${id}-sticker`} checked={sticker === value} onChange={() => setSticker(value)} />
            <DiarySticker name={value} className={styles.stickerIcon} />
            <span className="visually-hidden">{value}</span>
          </label>
        ))}
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.actions}>
        <button type="submit" className="btn btn--accent">
          Save
        </button>
        <button type="button" className={styles.danger} onClick={onDelete}>
          Delete this diary
        </button>
      </div>
    </form>
  );
}
