"use client";

import { useEffect, useId, useRef, useState } from "react";
import { NewPersonForm } from "@/components/NewPeopleCard";
import { ART_STYLES, type ArtStyleId } from "@/lib/artStyles";
import { animateCharacter, joinCast, loadCast } from "@/lib/cast";
import type { FaceChoice } from "@/lib/newPeople";
import type { Character, NewPerson, WireImage } from "@/lib/types";
import styles from "./NewFacesStep.module.css";

const COUNT_WORDS = ["no one", "one person", "two people", "three people", "four people"];

/** The key the pipeline knows a new person by (their placeholder in the script). */
function keyOf(person: NewPerson, index: number): string {
  return person.id ?? `new${index + 1}`;
}

/** What a settled row says, in a stamp. */
function stampFor(choice: FaceChoice): string {
  switch (choice.kind) {
    case "cast":
      return "In your cast";
    case "never":
      return "Just this story · won't ask again";
    default:
      return "Just this story";
  }
}

interface NewFacesStepProps {
  /** The people to ask about, in the order the note met them. */
  people: NewPerson[];
  /** The comic's art style: a new cast member's sheet is drawn in it. */
  style: ArtStyleId;
  /** Everyone settled (or skipped): the comic goes on. */
  onDone: (choices: Record<string, FaceChoice>) => void;
}

/**
 * "New faces in this story" (03-06): the progress screen pauses before any
 * panel is drawn to ask who the people the note mentions are. Each can join
 * the cast (the quick form, typed or from a photo, then their sheet is drawn),
 * be a one-off drawn just for this story, or be a one-off whose name is never
 * asked about again. "Skip all" keeps everyone left as one-offs.
 */
export function NewFacesStep({ people, style, onDone }: NewFacesStepProps) {
  const id = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [cast, setCast] = useState<Character[]>([]);
  const [choices, setChoices] = useState<Record<string, FaceChoice>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [drawing, setDrawing] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, { text: string; error?: boolean }>>({});
  const [notice, setNotice] = useState("");

  useEffect(() => {
    headingRef.current?.focus();
    let cancelled = false;
    void loadCast().then((loaded) => {
      if (!cancelled) setCast(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const keys = people.map(keyOf);
  const left = keys.filter((key) => !choices[key]).length;
  const styleLabel = ART_STYLES[style].label.toLowerCase();

  function choose(key: string, person: NewPerson, choice: FaceChoice) {
    setChoices((current) => ({ ...current, [key]: choice }));
    setOpen(null);
    setNotice(
      choice.kind === "never"
        ? `${person.name} is just for this story, and Comimo won't ask about them again.`
        : choice.kind === "oneoff"
          ? `${person.name} is just for this story.`
          : "",
    );
  }

  function undo(key: string) {
    setChoices(({ [key]: _gone, ...rest }) => {
      void _gone;
      return rest;
    });
  }

  async function add(key: string, character: Character, photo: WireImage | null): Promise<string | null> {
    setDrawing(key);
    setOpen(null);
    setNotice(`Drawing ${character.name}'s ${styleLabel} sheet.`);
    const joined = await joinCast(character, style, photo);
    setDrawing(null);
    if (!joined) {
      setOpen(key);
      return "This browser isn't letting Comimo save right now. Try again in a normal (not private) window.";
    }
    setCast((current) => [...current.filter((member) => member.id !== joined.character.id), joined.character]);
    setChoices((current) => ({ ...current, [key]: { kind: "cast", characterId: joined.character.id, name: joined.character.name } }));
    setNotes((current) => ({
      ...current,
      [key]: joined.sheetFailed ? { text: `${joined.message} The comic will try again.`, error: true } : { text: joined.message },
    }));
    setNotice(joined.message);
    if (!joined.sheetFailed) void animateCharacter(joined.character);
    return null;
  }

  function skipAll() {
    const all = { ...choices };
    for (const key of keys) all[key] ??= { kind: "skip" };
    onDone(all);
  }

  const busy = drawing !== null;

  return (
    <section className={styles.step} aria-labelledby={`${id}-title`}>
      <header className={styles.head}>
        <p className={styles.tag}>Before I draw</p>
        <h3 id={`${id}-title`} ref={headingRef} tabIndex={-1} className={styles.title}>
          New faces in this story
        </h3>
        <p className={styles.lede}>
          Your note has {COUNT_WORDS[people.length] ?? `${people.length} people`} I haven&apos;t drawn before. Who {people.length === 1 ? "is it" : "are they"}?
        </p>
      </header>

      <p className="visually-hidden" role="status">
        {notice}
      </p>

      <ol className={styles.people}>
        {people.map((person, i) => {
          const key = keys[i];
          const choice = choices[key];
          const note = notes[key];
          return (
            <li key={key} className={styles.person} data-choice={choice?.kind} data-open={open === key || undefined}>
              <span className={styles.mug} aria-hidden="true">
                {choice?.kind === "cast" ? "★" : "?"}
              </span>
              <div className={styles.body}>
                <h4 className={styles.name}>
                  <bdi>{choice?.kind === "cast" ? choice.name : person.name}</bdi>
                </h4>
                <p className={styles.said}>
                  {person.look ? (
                    <>
                      Your note: <span dir="auto">{person.look}</span>
                    </>
                  ) : (
                    "Your note doesn't say how they look."
                  )}
                </p>

                {drawing === key ? (
                  <p className={styles.drawing}>
                    Drawing their {styleLabel} sheet<span aria-hidden="true">…</span> about a minute.
                  </p>
                ) : choice ? (
                  <div className={styles.settled}>
                    <span className={styles.stamp}>{stampFor(choice)}</span>
                    {choice.kind !== "cast" ? (
                      <button type="button" className={styles.textButton} onClick={() => undo(key)} disabled={busy}>
                        Change
                      </button>
                    ) : null}
                  </div>
                ) : open === key ? null : (
                  <div className={styles.actions}>
                    <button type="button" className="btn btn--accent" onClick={() => setOpen(key)} disabled={busy}>
                      Add to cast
                    </button>
                    <button type="button" className="btn btn--ink" onClick={() => choose(key, person, { kind: "oneoff" })} disabled={busy}>
                      Just this story
                    </button>
                    <button type="button" className={styles.textButton} onClick={() => choose(key, person, { kind: "never" })} disabled={busy}>
                      Never ask for this name
                    </button>
                  </div>
                )}

                {note ? (
                  <p className={note.error ? styles.error : styles.note} role={note.error ? "alert" : undefined}>
                    {note.text}
                  </p>
                ) : null}

                {open === key && !choice ? (
                  <div className={styles.form}>
                    <NewPersonForm
                      person={person}
                      cast={cast}
                      styleLabel={ART_STYLES[style].label}
                      onSave={(character, photo) => add(key, character, photo)}
                      onCancel={() => setOpen(null)}
                    />
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <footer className={styles.foot}>
        <button type="button" className="btn btn--accent" onClick={() => onDone(choices)} disabled={left > 0 || busy}>
          Draw the comic
        </button>
        {left > 0 ? (
          <button type="button" className="btn btn--ghost" onClick={skipAll} disabled={busy}>
            Skip all
          </button>
        ) : null}
        <p className={styles.hint}>
          {busy
            ? "The comic waits for the sheet, then carries on."
            : left > 0
              ? "Skip all keeps everyone left just for this story."
              : "All set. One-offs stay the same within this comic."}
        </p>
      </footer>
    </section>
  );
}
