"use client";

import { useEffect, useId, useMemo, useRef } from "react";
import { MAX_DAY_PHOTOS } from "@/lib/pipeline";
import styles from "./dayPhotos.module.css";

const TILTS = ["-2deg", "1.5deg", "-1deg", "2.5deg", "-2.5deg", "1deg"];

/**
 * "Add today's photos" before the comic is made: Comimo looks for the user
 * (and their cast) in them and draws that day's clothes, then puts them in the
 * day's photo album. The files stay in memory until then. Worded for
 * yesterday when a missed day is being caught up.
 */
export function DayPhotos({ photos, onChange, day }: { photos: File[]; onChange: (photos: File[]) => void; day: "today" | "yesterday" }) {
  const id = useId();
  const whose = day === "yesterday" ? "Yesterday's" : "Today's";
  const inputRef = useRef<HTMLInputElement>(null);
  const urls = useMemo(() => photos.map((file) => URL.createObjectURL(file)), [photos]);
  useEffect(() => () => urls.forEach((url) => URL.revokeObjectURL(url)), [urls]);
  const room = MAX_DAY_PHOTOS - photos.length;

  function add(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = [...(event.target.files ?? [])].filter((file) => file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name));
    event.target.value = "";
    if (picked.length > 0) onChange([...photos, ...picked].slice(0, MAX_DAY_PHOTOS));
  }

  return (
    <fieldset className={styles.photos} aria-describedby={`${id}-hint`}>
      <legend className={styles.legend}>
        {whose} photos <span className={styles.optional}>(optional)</span>
      </legend>
      <p id={`${id}-hint`} className={styles.hint}>
        Comimo finds you in them and draws you in {whose.toLowerCase()} clothes (your cast too, if they&apos;re in them). Then they go into this
        day&apos;s photo album, behind a private link you can change or delete.
      </p>
      {photos.length > 0 ? (
        <ul className={styles.strip} aria-label="Photos added">
          {photos.map((file, i) => (
            <li key={`${file.name}-${i}`} className={styles.photo} style={{ "--tilt": TILTS[i % TILTS.length] } as React.CSSProperties}>
              {/* An object URL of a picked file; next/image can't optimise Blobs. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urls[i]} alt={`Photo ${i + 1}`} />
              <button type="button" className={styles.remove} onClick={() => onChange(photos.filter((_, j) => j !== i))}>
                <span aria-hidden="true">×</span>
                <span className="visually-hidden">Remove photo {i + 1}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {room > 0 ? (
        <label className={`btn btn--ghost ${styles.add}`}>
          <input ref={inputRef} type="file" accept="image/*" multiple className="visually-hidden" onChange={add} />
          {photos.length === 0 ? `Add ${whose.toLowerCase()} photos` : `Add more (${room} left)`}
        </label>
      ) : (
        <p className={styles.hint}>That&apos;s {MAX_DAY_PHOTOS}, the most one comic reads.</p>
      )}
    </fieldset>
  );
}
