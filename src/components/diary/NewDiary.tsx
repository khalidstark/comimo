"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { DIARY_NAME_MAX, DIARY_SUGGESTIONS, DiaryError, createDiary } from "@/lib/diaries";
import { DIARY_COLORS, DIARY_STICKERS, type Diary, type DiaryColor, type DiarySticker as StickerName } from "@/lib/types";
import { DiarySticker } from "./DiarySticker";
import styles from "./diary.module.css";

const COLOR_NAMES: Record<DiaryColor, string> = { pink: "Riso pink", sun: "Sunflower", teal: "Teal", ink: "Night ink", lilac: "Lilac", grass: "Grass" };

/**
 * "New diary": name it anything (or start from a suggestion), pick a cover
 * colour and a sticker. A live preview of the cover sits beside the form.
 */
export function NewDiary({ existing, onMade, onCancel }: { existing: Diary[]; onMade: (diary: Diary) => void; onCancel: () => void }) {
  const id = useId();
  const [name, setName] = useState("");
  const [color, setColor] = useState<DiaryColor>("pink");
  const [sticker, setSticker] = useState<StickerName>("heart");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const taken = new Set(existing.map((d) => d.name.toLocaleLowerCase()));

  useEffect(() => inputRef.current?.focus(), []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      onMade(await createDiary({ name, color, sticker }));
    } catch (problem) {
      setError(problem instanceof DiaryError ? problem.message : "That diary didn't save. Try again.");
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.newForm} onSubmit={submit} aria-labelledby={`${id}-title`} noValidate>
      <div className={styles.newPreview} aria-hidden="true">
        <span className={styles.notebook} data-color={color} data-static>
          <span className={styles.pages} />
          <span className={styles.cover}>
            <span className={styles.spine} />
            <span className={styles.shine} />
            <DiarySticker name={sticker} className={styles.sticker} />
            <span className={styles.label}>
              <span className={styles.labelName} dir="auto">
                {name.trim() || "Your diary"}
              </span>
            </span>
            <span className={styles.band} />
          </span>
        </span>
      </div>

      <div className={styles.newFields}>
        <h3 id={`${id}-title`} className={styles.newTitle}>
          A new diary
        </h3>
        <p className={styles.hint}>For any part of your life, on any day. Comics you make can go in it instead of the daily one.</p>

        <label className={styles.field} htmlFor={`${id}-name`}>
          <span className={styles.fieldLabel}>Call it</span>
          <input
            ref={inputRef}
            id={`${id}-name`}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            maxLength={DIARY_NAME_MAX + 10}
            placeholder="Things I love"
            dir="auto"
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
          />
        </label>
        <div className={styles.suggestions} role="group" aria-label="Ideas">
          {DIARY_SUGGESTIONS.filter((s) => !taken.has(s.name.toLocaleLowerCase())).map((suggestion) => (
            <button
              key={suggestion.name}
              type="button"
              className={styles.suggestion}
              data-color={suggestion.color}
              onClick={() => {
                setName(suggestion.name);
                setColor(suggestion.color);
                setSticker(suggestion.sticker);
                setError(null);
              }}
            >
              <DiarySticker name={suggestion.sticker} className={styles.suggestionSticker} />
              {suggestion.name}
            </button>
          ))}
        </div>

        <fieldset className={styles.pickers}>
          <legend className={styles.fieldLabel}>Cover</legend>
          <div className={styles.swatches}>
            {DIARY_COLORS.map((value) => (
              <label key={value} className={styles.swatch} data-color={value}>
                <input type="radio" name={`${id}-color`} checked={color === value} onChange={() => setColor(value)} />
                <span className="visually-hidden">{COLOR_NAMES[value]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className={styles.pickers}>
          <legend className={styles.fieldLabel}>Sticker</legend>
          <div className={styles.stickers}>
            {DIARY_STICKERS.map((value) => (
              <label key={value} className={styles.stickerPick}>
                <input type="radio" name={`${id}-sticker`} checked={sticker === value} onChange={() => setSticker(value)} />
                <DiarySticker name={value} className={styles.stickerIcon} />
                <span className="visually-hidden">{value}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {error ? (
          <p id={`${id}-error`} className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.actions}>
          <button type="submit" className="btn btn--accent" aria-disabled={busy || undefined}>
            Make this diary
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Not now
          </button>
        </div>
      </div>
    </form>
  );
}
