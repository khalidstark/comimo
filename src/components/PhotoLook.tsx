"use client";

import { useEffect, useId, useRef, useState } from "react";
import { PhotoError, describePhoto, preparePhoto } from "@/lib/photo";
import { ErrorText } from "@/components/account/ErrorText";
import type { WireImage } from "@/lib/types";
import { FilePick } from "./FilePick";
import styles from "./PhotoLook.module.css";

interface PhotoLookProps {
  /** Who the photo is of, for the wording ("Omar"); empty for "this person". */
  name: string;
  /** The person was found and described: put the look in the form and keep the cut-out for drawing once. */
  onDescribed: (look: string, crop: WireImage) => void;
  /** The user removed the photo. */
  onCleared: () => void;
  /** A photo is picked but not described yet (true), or not any more (false). */
  onWaiting?: (waiting: boolean) => void;
  /** The cut-out the parent is holding, to preview; null when none. */
  crop: WireImage | null;
}

/** The cut-out preview as an in-memory data URL (gone with the component, nothing to revoke). */
function cropUrl(crop: WireImage | null): string | null {
  return crop ? `data:${crop.mimeType};base64,${crop.base64}` : null;
}

/**
 * "Start from a photo": pick a photo, confirm permission, and Comimo finds
 * the person (SAM 3.1), describes them (Muse Spark) and keeps the cut-out in
 * memory so their sheet can be drawn from it once (Muse Image). The photo is
 * shrunk on this device first and never stored.
 */
export function PhotoLook({ name, onDescribed, onCleared, onWaiting, crop }: PhotoLookProps) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const preview = cropUrl(crop);
  const who = name.trim() || "this person";

  useEffect(() => () => controller.current?.abort(), []);

  async function describe() {
    if (busy) return;
    if (!file) {
      setError("Choose a photo first.");
      fileRef.current?.focus();
      return;
    }
    if (!consent) {
      setError(`Tick the box to confirm ${who} is happy for you to use their photo.`);
      document.getElementById(`${id}-consent`)?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    controller.current = new AbortController();
    try {
      const photo = await preparePhoto(file);
      const result = await describePhoto(photo, controller.current.signal);
      // The picked file isn't needed any more; only the cut-out is kept, in memory.
      setFile(null);
      onWaiting?.(false);
      onDescribed(result.look, result.crop);
    } catch (problem) {
      if (controller.current?.signal.aborted) return;
      setError(problem instanceof PhotoError ? problem.message : "The photo didn't work. Try another one.");
    } finally {
      setBusy(false);
      controller.current = null;
    }
  }

  function clear() {
    setFile(null);
    onWaiting?.(false);
    setError(null);
    onCleared();
  }

  return (
    <fieldset className={styles.photo} aria-describedby={`${id}-privacy`}>
      <legend className={styles.legend}>
        Start from a photo <span className={styles.optional}>(optional)</span>
      </legend>
      <p id={`${id}-privacy`} className={styles.hint}>
        Comimo finds the person, writes how they look and draws them from it. The photo is shrunk on this device and sent to
        Meta&apos;s models (SAM 3.1 and Muse Spark find and describe them, Muse Image draws them). It is never saved.
      </p>

      {preview ? (
        <figure className={styles.found}>
          {/* An object URL for an in-memory cut-out; next/image can't optimise Blobs. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt={`The person Comimo found in the photo of ${who}`} className={styles.crop} />
          <figcaption className={styles.caption}>
            Comimo drew up how {who} looks below, so check it. Their sheet is drawn from this picture once, then the photo
            is gone.
            <button type="button" className={styles.textButton} onClick={clear}>
              Remove photo
            </button>
          </figcaption>
        </figure>
      ) : (
        <>
          <FilePick
            inputRef={fileRef}
            id={`${id}-file`}
            label={`Choose a photo of ${who}`}
            accept="image/jpeg,image/png,image/webp"
            file={file}
            onChange={(picked) => {
              setFile(picked);
              onWaiting?.(picked !== null);
              setError(null);
            }}
            disabled={busy}
          />
          <label className={styles.consent} htmlFor={`${id}-consent`}>
            <input id={`${id}-consent`} type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>I have {who === "this person" ? "this person's" : `${who}'s`} permission to use their photo.</span>
          </label>
          <div>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => void describe()}
              aria-disabled={busy || !file || !consent || undefined}
              aria-describedby={`${id}-status`}
            >
              {busy ? "Looking at the photo…" : "Describe from photo"}
            </button>
          </div>
        </>
      )}
      <p id={`${id}-status`} className={error ? styles.error : styles.status} role={error ? "alert" : "status"}>
        {error ? <ErrorText message={error} /> : busy ? "Finding the person and writing how they look. This takes about half a minute." : ""}
      </p>
    </fieldset>
  );
}
