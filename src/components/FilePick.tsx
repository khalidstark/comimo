"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Icon } from "@/art/Icon";
import styles from "./FilePick.module.css";

interface FilePickProps {
  /** The button's words before a file is chosen ("Choose a photo of Omar"). */
  label: string;
  /** The button's words once one is chosen. */
  changeLabel?: string;
  accept: string;
  /** The chosen file, kept by the parent; null clears the picker. */
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  /** For focusing the picker (after "Choose a photo first", say). */
  inputRef?: RefObject<HTMLInputElement | null>;
  id?: string;
  describedBy?: string;
}

/**
 * One photo, picked with the app's own button instead of the browser's raw
 * file input: a real (visually hidden) input inside a styled label, so it is
 * reached with Tab and opened with Enter or Space, with a focus ring on the
 * button and the chosen photo's thumbnail and name beside it.
 */
export function FilePick({ label, changeLabel = "Choose another photo", accept, file, onChange, disabled, inputRef, id, describedBy }: FilePickProps) {
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;
  const url = useMemo(() => (file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null), [file]);
  const [broken, setBroken] = useState<string | null>(null);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  // A cleared file clears the input too, so picking the same photo again still counts as a change.
  useEffect(() => {
    if (!file && ref.current) ref.current.value = "";
  }, [file, ref]);

  return (
    <div className={styles.pick}>
      <label className={`btn btn--ghost ${styles.button}`} aria-disabled={disabled || undefined}>
        <input
          ref={ref}
          id={id}
          type="file"
          accept={accept}
          className="visually-hidden"
          disabled={disabled}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        />
        <Icon name="upload" size="1.2em" />
        {file ? changeLabel : label}
      </label>
      {file ? (
        <p className={styles.chosen}>
          {url && broken !== url ? (
            // An object URL of the picked file; next/image can't optimise Blobs.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className={styles.thumb} onError={() => setBroken(url)} />
          ) : null}
          <span className={styles.name} dir="auto">
            <span className="visually-hidden">Chosen: </span>
            {file.name}
          </span>
        </p>
      ) : (
        <p className={styles.none}>No photo chosen yet.</p>
      )}
    </div>
  );
}
