"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { PhotoLook } from "@/components/PhotoLook";
import { Sprite } from "@/components/Sprite";
import { useImageUrl } from "@/components/useImageUrl";
import { ART_STYLES, artStyleOf } from "@/lib/artStyles";
import {
  LIMITS,
  ROLE_OPTIONS,
  SheetError,
  animateCharacter,
  characterFromDraft,
  defaultRoleLabel,
  drawReferenceSheet,
  drawReferenceSheetFromPhoto,
  loadCast,
  referenceSheetFor,
  spriteSheetFor,
  validateDraft,
  type CharacterDraft,
  type DraftErrors,
  type DraftField,
} from "@/lib/cast";
import { newPersonKey, peopleToOffer } from "@/lib/newPeople";
import { getMeta, saveCharacter, setMeta } from "@/lib/store";
import type { Character, CharacterRole, Day, NewPerson, WireImage } from "@/lib/types";
import styles from "./NewPeopleCard.module.css";

/** Names the user said "Never for this name" to, on this device. */
const NEVER_KEY = "newPeople:never";
/** Names the user said "Not now" to, for one day. */
const laterKey = (dayId: string) => `newPeople:later:${dayId}`;

async function readList(key: string): Promise<string[]> {
  const value = await getMeta(key);
  if (typeof value !== "string") return [];
  try {
    const list: unknown = JSON.parse(value);
    return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

async function remember(key: string, name: string) {
  const list = await readList(key);
  if (!list.includes(name)) await setMeta(key, JSON.stringify([...list, name].slice(-200)));
}

/**
 * After a comic: "Meet Omar?" for each named person in the note who isn't in
 * the cast. Adding them takes a quick, prefilled form (or a photo) and draws
 * their sheet once in the day's art style, then animates them. "Not now"
 * hides them on this day; "Never for this name" stops asking on this device.
 */
export function NewPeopleCard({ day }: { day: Day }) {
  const [state, setState] = useState<{ cast: Character[]; offer: NewPerson[] } | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!day.newPeople?.length) return;
    let cancelled = false;
    void (async () => {
      const [cast, never, later] = await Promise.all([loadCast(), readList(NEVER_KEY), readList(laterKey(day.id))]);
      if (cancelled) return;
      setState({ cast, offer: peopleToOffer(day.newPeople, cast, new Set([...never, ...later])) });
    })();
    return () => {
      cancelled = true;
    };
  }, [day.id, day.newPeople]);

  if (!state || state.offer.length === 0) {
    return notice ? (
      <p className="visually-hidden" role="status">
        {notice}
      </p>
    ) : null;
  }

  function dismiss(person: NewPerson, forever: boolean) {
    const key = newPersonKey(person);
    void remember(forever ? NEVER_KEY : laterKey(day.id), key);
    setState((current) => current && { ...current, offer: current.offer.filter((p) => p !== person) });
    setNotice(forever ? `Comimo won't ask about ${person.name} again.` : `Not now. ${person.name} can join your cast another day.`);
  }

  return (
    <section className={styles.stack} aria-label="New people in your note">
      <p className="visually-hidden" role="status">
        {notice}
      </p>
      {state.offer.map((person) => (
        <NewPersonOffer
          key={newPersonKey(person)}
          person={person}
          day={day}
          cast={state.cast}
          onAdded={(character) => {
            setState((current) => current && { ...current, cast: [...current.cast, character] });
          }}
          onDismiss={(forever) => dismiss(person, forever)}
        />
      ))}
    </section>
  );
}

type Stage = "ask" | "form" | "drawing" | "done";

function NewPersonOffer({
  person,
  day,
  cast,
  onAdded,
  onDismiss,
}: {
  person: NewPerson;
  day: Day;
  cast: Character[];
  onAdded: (character: Character) => void;
  onDismiss: (forever: boolean) => void;
}) {
  const id = useId();
  const style = artStyleOf(day.artStyle);
  const [stage, setStage] = useState<Stage>("ask");
  const [character, setCharacter] = useState<Character | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [animating, setAnimating] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (stage !== "ask") headingRef.current?.focus();
  }, [stage]);

  async function add(added: Character, photo: WireImage | null): Promise<string | null> {
    if (!(await saveCharacter(added))) return "This browser isn't letting Comimo save right now. Try again in a normal (not private) window.";
    onAdded(added);
    setCharacter(added);
    setStage("drawing");
    setMessage(null);
    try {
      let drawn: Character;
      let refused = false;
      if (photo) {
        const result = await drawReferenceSheetFromPhoto(added, style, photo);
        drawn = result.character;
        refused = result.photoRefused;
      } else {
        drawn = await drawReferenceSheet(added, style);
      }
      setCharacter(drawn);
      setStage("done");
      setMessage({
        text: refused
          ? `Muse Image wouldn't draw from that photo, so ${drawn.name} was drawn from the description instead. The photo is gone.`
          : photo
            ? `${drawn.name} is in your cast, drawn from the photo. The photo is gone; only the drawing is kept.`
            : `${drawn.name} is in your cast and looks the same from now on.`,
      });
      setAnimating(true);
      const animated = await animateCharacter(drawn);
      setAnimating(false);
      if (animated) setCharacter(animated);
    } catch (problem) {
      setStage("done");
      setMessage({
        text: `${added.name} joined your cast, but the sheet didn't draw (${problem instanceof SheetError ? problem.message : "try again"}). Draw it from the cast screen, or let the next comic draw it.`,
        error: true,
      });
    }
    return null;
  }

  const titleId = `${id}-title`;
  const sprite = character ? spriteSheetFor(character) : null;
  const sheet = character ? referenceSheetFor(character, style) : null;
  const stillUrl = useImageUrl(sprite ? null : (sheet?.image ?? null));

  return (
    <article className={styles.card} aria-labelledby={titleId}>
      <h2 id={titleId} ref={headingRef} tabIndex={-1} className={styles.title}>
        {stage === "done" || stage === "drawing" ? (
          <>
            Welcome, <bdi>{character?.name ?? person.name}</bdi>
          </>
        ) : (
          <>
            Meet <bdi>{person.name}</bdi>?
          </>
        )}
      </h2>

      {stage === "ask" ? (
        <>
          <p className={styles.lede}>
            Add them to your cast so they look the same in every comic from now on.
            {person.mentionedAs.length > 1 ? (
              <>
                {" "}
                You called them{" "}
                {person.mentionedAs.map((form, i) => (
                  <span key={form}>
                    {i > 0 ? (i === person.mentionedAs.length - 1 ? " and " : ", ") : ""}
                    <bdi>{form}</bdi>
                  </span>
                ))}
                .
              </>
            ) : null}
          </p>
          <p className={styles.note}>Today they were drawn as a background figure.</p>
          <div className={styles.actions}>
            <button type="button" className="btn btn--accent" onClick={() => setStage("form")}>
              Add <bdi>{person.name}</bdi>
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => onDismiss(false)}>
              Not now
            </button>
            <button type="button" className={styles.textButton} onClick={() => onDismiss(true)}>
              Never for this name
            </button>
          </div>
        </>
      ) : stage === "form" ? (
        <QuickForm person={person} cast={cast} styleLabel={ART_STYLES[style].label} onSave={add} onCancel={() => setStage("ask")} />
      ) : (
        <div className={styles.result}>
          <div className={`sticker ${styles.portrait}`} aria-hidden={!sprite || undefined}>
            {sprite ? (
              <Sprite sheet={sprite} label={character?.name ?? ""} greet />
            ) : stillUrl ? (
              // A drawn sheet from this device; next/image can't optimise Blobs.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={stillUrl} alt="" className={styles.still} />
            ) : (
              <span className={styles.drawingTag}>{stage === "drawing" ? "Drawing…" : ""}</span>
            )}
          </div>
          <div className={styles.resultText}>
            <p role={message?.error ? "alert" : "status"} className={message?.error ? styles.error : styles.lede}>
              {stage === "drawing"
                ? `Drawing ${character?.name ?? person.name}'s ${ART_STYLES[style].label.toLowerCase()} sheet. This takes about a minute.`
                : message?.text}
            </p>
            {animating ? <p className={styles.note}>Bringing them to life for the cast screen…</p> : null}
            {stage === "done" ? (
              <Link href="/cast" className="link">
                See your cast
              </Link>
            ) : null}
          </div>
        </div>
      )}
    </article>
  );
}

const FIELDS: DraftField[] = ["name", "aliases", "role", "look"];

/** The prefilled quick form: name, other names, who they are, and how they look (typed or from a photo). */
function QuickForm({
  person,
  cast,
  styleLabel,
  onSave,
  onCancel,
}: {
  person: NewPerson;
  cast: Character[];
  styleLabel: string;
  onSave: (character: Character, photo: WireImage | null) => Promise<string | null>;
  onCancel: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<CharacterDraft>(() => ({
    name: person.name,
    aliases: person.mentionedAs.filter((form) => form !== person.name).join(", "),
    role: person.role,
    roleLabel: "",
    look: person.look,
    personality: "",
    line: "",
  }));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The person cut from a photo, in memory until the sheet is drawn; never stored. */
  const [crop, setCrop] = useState<WireImage | null>(null);
  const fieldId = (field: DraftField) => `${id}-${field}`;

  function set<K extends DraftField>(field: K, value: CharacterDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const found = validateDraft(draft, cast);
    setErrors(found);
    const first = FIELDS.find((field) => found[field]);
    if (first) {
      document.getElementById(fieldId(first))?.focus();
      return;
    }
    setBusy(true);
    const problem = await onSave(characterFromDraft(draft), crop);
    setCrop(null);
    setBusy(false);
    setSaveError(problem);
  }

  const error = (field: DraftField) =>
    errors[field] ? (
      <span id={`${fieldId(field)}-error`} className={styles.error}>
        {errors[field]}
      </span>
    ) : null;

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.row}>
        <label className={styles.field} htmlFor={fieldId("name")}>
          <span className={styles.label}>Name</span>
          <input
            id={fieldId("name")}
            value={draft.name}
            onChange={(event) => set("name", event.target.value)}
            dir="auto"
            autoComplete="off"
            maxLength={LIMITS.name + 8}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? `${fieldId("name")}-error` : undefined}
          />
          {error("name")}
        </label>
        <label className={styles.field} htmlFor={fieldId("role")}>
          <span className={styles.label}>Who they are to you</span>
          <select id={fieldId("role")} value={draft.role} onChange={(event) => set("role", event.target.value as CharacterRole)}>
            {ROLE_OPTIONS.filter((option) => option.value !== "self").map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className={styles.field} htmlFor={fieldId("aliases")}>
        <span className={styles.label}>
          Other names <span className={styles.optional}>(optional)</span>
        </span>
        <input
          id={fieldId("aliases")}
          value={draft.aliases}
          onChange={(event) => set("aliases", event.target.value)}
          placeholder={`Nicknames and spellings, with commas`}
          dir="auto"
          autoComplete="off"
          maxLength={LIMITS.aliases + 20}
          aria-invalid={errors.aliases ? true : undefined}
          aria-describedby={errors.aliases ? `${fieldId("aliases")}-error` : undefined}
        />
        {error("aliases")}
      </label>

      <PhotoLook
        name={draft.name}
        crop={crop}
        onDescribed={(look, cut) => {
          set("look", look);
          setCrop(cut);
        }}
        onCleared={() => setCrop(null)}
      />

      <label className={styles.field} htmlFor={fieldId("look")}>
        <span className={styles.label}>How they look</span>
        <span id={`${fieldId("look")}-hint`} className={styles.optional}>
          {crop ? "From the photo, so check it. " : person.look ? "From your note. " : ""}Hair, clothes, something they always carry.
        </span>
        <textarea
          id={fieldId("look")}
          value={draft.look}
          onChange={(event) => set("look", event.target.value)}
          rows={3}
          dir="auto"
          maxLength={LIMITS.look + 40}
          aria-invalid={errors.look ? true : undefined}
          aria-describedby={[`${fieldId("look")}-hint`, errors.look ? `${fieldId("look")}-error` : ""].filter(Boolean).join(" ")}
        />
        {error("look")}
      </label>

      {saveError ? (
        <p className={styles.error} role="alert">
          {saveError}
        </p>
      ) : null}

      <div className={styles.actions}>
        <button type="submit" className="btn btn--accent" aria-disabled={busy || undefined}>
          Add and draw their {styleLabel.toLowerCase()} sheet
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Back
        </button>
      </div>
      <p className={styles.note}>Role label: {defaultRoleLabel(draft.role)}. You can change anything later on the cast screen.</p>
    </form>
  );
}
