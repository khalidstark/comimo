"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ART_STYLES, DEFAULT_ART_STYLE, artStyleOf, type ArtStyleId } from "@/lib/artStyles";
import { referenceSheetFor, updateStoredCharacter } from "@/lib/cast";
import { aboutUsd } from "@/lib/costs";
import { PhotoError, preparePhoto } from "@/lib/photo";
import { MAX_OUTFITS, type Character, type Outfit } from "@/lib/types";
import {
  OutfitError,
  drawNewOutfit,
  firstStyle,
  outfitSheet,
  outfitsOf,
  wearing,
  withCharacterCost,
  withOutfit,
  withoutOutfit,
  wornOutfit,
} from "@/lib/wardrobe";
import { useImageUrl as useSheetUrl } from "@/lib/useImageUrl";
import { ErrorText } from "@/components/account/ErrorText";
import { FilePick } from "@/components/FilePick";
import styles from "./wardrobe.module.css";

/** The record page's last style, so a new outfit is drawn in the style comics are made in. */
function preferredStyle(): ArtStyleId {
  try {
    return artStyleOf(window.localStorage.getItem("comimo.artStyle"));
  } catch {
    return DEFAULT_ART_STYLE;
  }
}

type Mode = "photo" | "describe";

type Work =
  | { phase: "idle" }
  | { phase: "drawing" }
  | { phase: "preview"; outfit: Outfit; refused: boolean }
  | { phase: "error"; message: string };

/**
 * A character's wardrobe on their cast card: what they wear in new comics,
 * their other outfits, and "Change clothes" from a photo or a description.
 * Each new outfit is one Muse Image edit of their sheet (face, hair and body
 * kept); a photo is shrunk here, sent once and never kept.
 */
export function Wardrobe({ member, onChange, open: openAtFirst = false }: { member: Character; onChange: (character: Character) => void; open?: boolean }) {
  const id = useId();
  const [open, setOpen] = useState(openAtFirst);
  const [mode, setMode] = useState<Mode>("photo");
  const [clothes, setClothes] = useState("");
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [work, setWork] = useState<Work>({ phase: "idle" });
  const [note, setNote] = useState("");
  /** The outfit whose Delete was tapped, waiting for a yes. */
  const [deleting, setDeleting] = useState<Outfit | null>(null);
  const controller = useRef<AbortController | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const outfits = outfitsOf(member);
  const worn = wornOutfit(member);
  const style = firstStyle(member, (s) => referenceSheetFor(member, s), typeof window === "undefined" ? DEFAULT_ART_STYLE : preferredStyle());
  const full = outfits.length >= MAX_OUTFITS;
  const self = member.role === "self";
  const busy = work.phase === "drawing";

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (openAtFirst) sectionRef.current?.scrollIntoView({ block: "center" });
  }, [openAtFirst]);
  useEffect(() => {
    if (deleting) keepRef.current?.focus();
  }, [deleting]);

  async function save(change: (current: Character) => Character, message: string) {
    const saved = await updateStoredCharacter(member, change);
    if (!saved) {
      setNote("This browser isn't letting Comimo save right now.");
      return false;
    }
    onChange(saved);
    setNote(message);
    return true;
  }

  async function draw() {
    if (busy || !style) return;
    const base = referenceSheetFor(member, style);
    if (!base) return;
    if (mode === "photo" && !file) {
      setWork({ phase: "error", message: "Choose a photo first." });
      fileRef.current?.focus();
      return;
    }
    if (mode === "photo" && !consent) {
      setWork({ phase: "error", message: self ? "Tick the box first: it's you in the photo." : `Tick the box first: ${member.name} is happy for you to use the photo.` });
      return;
    }
    if (mode === "describe" && clothes.trim().length < 3) {
      setWork({ phase: "error", message: "Say what they're wearing, like “green raincoat and yellow boots”." });
      return;
    }
    controller.current = new AbortController();
    setWork({ phase: "drawing" });
    try {
      const photo = mode === "photo" && file ? await preparePhoto(file) : null;
      const drawn = await drawNewOutfit(member, base, style, mode === "photo" ? { photo, clothes: clothes.trim() || undefined } : { clothes }, controller.current.signal);
      // The photo isn't needed any more.
      setFile(null);
      // The drawing was paid for whether or not it is kept.
      await save((current) => withCharacterCost(current, drawn.cost), "");
      setWork({ phase: "preview", outfit: drawn.outfit, refused: drawn.photoRefused });
    } catch (problem) {
      if (controller.current?.signal.aborted) return;
      const message = problem instanceof OutfitError || problem instanceof PhotoError ? problem.message : "The outfit didn't draw. Try again.";
      setWork({ phase: "error", message });
    } finally {
      controller.current = null;
    }
  }

  async function keep(outfit: Outfit, wear: boolean) {
    let refused = false;
    const ok = await save(
      (current) => {
        const next = withOutfit(current, outfit, wear);
        if (!next) refused = true;
        return next ?? current;
      },
      wear ? `${member.name} wears ${outfit.label} in new comics.` : `${outfit.label} is in ${member.name}'s wardrobe.`,
    );
    if (refused) {
      setWork({ phase: "error", message: "The wardrobe is full. Delete an outfit to keep this one." });
      return;
    }
    if (ok) {
      setWork({ phase: "idle" });
      setClothes("");
      setOpen(false);
    }
  }

  async function remove(outfit: Outfit) {
    const ok = await save((current) => withoutOutfit(current, outfit.id), `${outfit.label} left the wardrobe. Comics already made keep it.`);
    if (!ok) return;
    setDeleting(null);
    headingRef.current?.focus();
  }

  function keepOutfit(outfit: Outfit) {
    setDeleting(null);
    document.getElementById(`${id}-delete-${outfit.id}`)?.focus();
  }

  const heading = `${id}-title`;

  return (
    <section ref={sectionRef} className={styles.wardrobe} aria-labelledby={heading}>
      <h3 id={heading} ref={headingRef} tabIndex={-1} className={styles.title}>
        Wardrobe
      </h3>
      <p className={styles.wearing}>
        In new comics: <strong dir="auto">{worn ? worn.label : self ? "your usual clothes" : "their usual clothes"}</strong>
      </p>

      <ul className={styles.rail} aria-label={`${member.name}'s outfits`}>
        <OutfitTile
          label="Usual clothes"
          sheetOf={(s) => referenceSheetFor(member, s)}
          style={style}
          worn={!worn}
          onWear={() => void save((current) => wearing(current, null), `${member.name} wears their usual clothes in new comics.`)}
        />
        {outfits.map((outfit) => (
          <OutfitTile
            key={outfit.id}
            label={outfit.label}
            clothes={outfit.clothes}
            cost={outfit.cost?.usd}
            sheetOf={(s) => outfitSheet(outfit, s)}
            style={style}
            worn={worn?.id === outfit.id}
            onWear={() => void save((current) => wearing(current, outfit.id), `${member.name} wears ${outfit.label} in new comics.`)}
            deleteId={`${id}-delete-${outfit.id}`}
            onDelete={() => setDeleting(outfit)}
          />
        ))}
      </ul>

      {deleting ? (
        <div className={styles.confirm} role="group" aria-labelledby={`${id}-deleting`}>
          <p id={`${id}-deleting`}>
            Delete <bdi>{deleting.label}</bdi> from the wardrobe? Comics already made keep it.
          </p>
          <div className={styles.actions}>
            <button type="button" className="btn btn--ink" onClick={() => void remove(deleting)}>
              Delete
            </button>
            <button ref={keepRef} type="button" className="btn btn--ghost" onClick={() => keepOutfit(deleting)}>
              Keep
            </button>
          </div>
        </div>
      ) : null}

      {!style ? (
        <p className={styles.hint}>Draw {self ? "your" : "their"} sheet first, then change clothes any time.</p>
      ) : !open ? (
        <button type="button" className={`btn ${self ? "btn--accent" : "btn--ghost"} ${styles.open}`} onClick={() => setOpen(true)} disabled={full}>
          Change clothes
          <span className="visually-hidden"> for {member.name}</span>
        </button>
      ) : (
        <div className={styles.panel} role="group" aria-label={`Change ${member.name}'s clothes`}>
          {work.phase === "preview" ? (
            <Preview outfit={work.outfit} style={style} refused={work.refused} name={member.name} onWear={() => void keep(work.outfit, true)} onKeep={() => void keep(work.outfit, false)} onDiscard={() => setWork({ phase: "idle" })} />
          ) : (
            <>
              <div className={styles.modes} role="radiogroup" aria-label="How">
                {(["photo", "describe"] as const).map((value) => (
                  <label key={value} className={styles.mode}>
                    <input type="radio" name={`${id}-mode`} checked={mode === value} onChange={() => setMode(value)} disabled={busy} />
                    <span>{value === "photo" ? "From a photo" : "Describe them"}</span>
                  </label>
                ))}
              </div>
              {mode === "photo" ? (
                <>
                  <p className={styles.hint}>
                    Comimo finds {self ? "you" : member.name} in the photo and copies only the clothes. Face and hair stay as drawn. The photo is
                    shrunk here, sent once and never kept.
                  </p>
                  <FilePick
                    inputRef={fileRef}
                    label={self ? "Choose a photo of you" : `Choose a photo of ${member.name}`}
                    accept="image/jpeg,image/png,image/webp"
                    file={file}
                    onChange={setFile}
                    disabled={busy}
                  />
                  <label className={styles.consent}>
                    <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} disabled={busy} />
                    <span>{self ? "It's me in the photo." : `It's ${member.name} in the photo, and they're happy for me to use it.`}</span>
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>
                      Anything to add <span className={styles.optional}>(optional)</span>
                    </span>
                    <input value={clothes} onChange={(event) => setClothes(event.target.value)} maxLength={300} placeholder="the scarf is red" dir="auto" disabled={busy} />
                  </label>
                </>
              ) : (
                <label className={styles.field}>
                  <span className={styles.label}>What {self ? "are you" : "are they"} wearing?</span>
                  <textarea
                    value={clothes}
                    onChange={(event) => setClothes(event.target.value)}
                    rows={2}
                    maxLength={300}
                    placeholder="Long olive raincoat, cream sweater, yellow rain boots"
                    dir="auto"
                    disabled={busy}
                  />
                </label>
              )}
              <div className={styles.actions}>
                <button type="button" className="btn btn--accent" onClick={() => void draw()} aria-disabled={busy || undefined}>
                  {busy ? "Drawing…" : "Draw the outfit"}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    controller.current?.abort();
                    setWork({ phase: "idle" });
                    setOpen(false);
                  }}
                >
                  Cancel
                </button>
              </div>
              <p className={work.phase === "error" ? styles.error : styles.status} role={work.phase === "error" ? "alert" : "status"}>
                {work.phase === "error"
                  ? <ErrorText message={work.message} />
                  : busy
                    ? `Drawing ${self ? "you" : member.name} in the new clothes, ${ART_STYLES[style].label.toLowerCase()} style. This takes about a minute.`
                    : ""}
              </p>
            </>
          )}
        </div>
      )}
      {full && !open ? <p className={styles.hint}>The wardrobe holds {MAX_OUTFITS} outfits. Delete one to add another.</p> : null}
      <p className="visually-hidden" role="status">
        {note}
      </p>
    </section>
  );
}

function Preview({
  outfit,
  style,
  refused,
  name,
  onWear,
  onKeep,
  onDiscard,
}: {
  outfit: Outfit;
  style: ArtStyleId;
  refused: boolean;
  name: string;
  onWear: () => void;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  const url = useSheetUrl(outfitSheet(outfit, style)?.image ?? null);
  return (
    <figure className={styles.preview}>
      {url ? (
        // A stored Blob; next/image can't optimise Blobs.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`${name} in ${outfit.label}, front and three-quarter views`} className={styles.previewImage} />
      ) : null}
      <figcaption className={styles.previewText}>
        <strong dir="auto">{outfit.label}</strong>
        <span dir="auto">{outfit.clothes}</span>
        {refused ? <span className={styles.hint}>Muse Image wouldn&apos;t use the photo, so the clothes were drawn from its description.</span> : null}
        {outfit.cost && outfit.cost.usd > 0 ? <span className={styles.cost}>Drawn for {aboutUsd(outfit.cost.usd)}</span> : null}
      </figcaption>
      <div className={styles.actions}>
        <button type="button" className="btn btn--accent" onClick={onWear}>
          Wear this from now on
        </button>
        <button type="button" className="btn btn--ghost" onClick={onKeep}>
          Keep in wardrobe
        </button>
        <button type="button" className={styles.textButton} onClick={onDiscard}>
          Discard
        </button>
      </div>
    </figure>
  );
}

function OutfitTile({
  label,
  clothes,
  cost,
  sheetOf,
  style,
  worn,
  onWear,
  deleteId,
  onDelete,
}: {
  label: string;
  clothes?: string;
  cost?: number;
  sheetOf: (style: ArtStyleId) => ReturnType<typeof outfitSheet>;
  style: ArtStyleId | null;
  worn: boolean;
  onWear: () => void;
  /** The Delete button's id, so focus can come back to it. */
  deleteId?: string;
  onDelete?: () => void;
}) {
  const sheet = (style && sheetOf(style)) || sheetOf("zine") || sheetOf("painterly");
  const url = useSheetUrl(sheet?.image ?? null);
  return (
    <li className={styles.tile} data-worn={worn || undefined}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className={styles.tileImage} />
      ) : (
        <span className={styles.tileEmpty} aria-hidden="true" />
      )}
      <span className={styles.tileLabel} dir="auto" title={clothes}>
        {label}
      </span>
      {worn ? (
        <span className={styles.wornTag}>Wearing</span>
      ) : (
        <button type="button" className={styles.textButton} onClick={onWear}>
          Wear<span className="visually-hidden"> {label}</span>
        </button>
      )}
      {onDelete ? (
        <button id={deleteId} type="button" className={`${styles.textButton} ${styles.quiet}`} onClick={onDelete}>
          Delete<span className="visually-hidden"> {label}</span>
        </button>
      ) : null}
      {cost ? <span className="visually-hidden">Drawn for {aboutUsd(cost)}</span> : null}
    </li>
  );
}
