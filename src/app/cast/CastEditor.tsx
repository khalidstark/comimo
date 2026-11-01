"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Art } from "@/art/Art";
import { Icon } from "@/art/Icon";
import { art, artAt } from "@/art/manifest";
import { BidiText } from "@/components/comic/BidiText";
import { Sprite } from "@/components/Sprite";
import { useTalkWhenShown } from "@/components/useTalkWhenShown";
import { PhotoLook } from "@/components/PhotoLook";
import { hasOwnFace, interestLabels, mannerChoices } from "@/lib/aboutYou";
import { ART_STYLE_IDS, ART_STYLES, DEFAULT_ART_STYLE, type ArtStyleId } from "@/lib/artStyles";
import { firstStrongDir } from "@/lib/bidi";
import {
  LIMITS,
  ROLE_OPTIONS,
  SheetError,
  animateCharacter,
  canAnimate,
  characterFromDraft,
  defaultRoleLabel,
  drawReferenceSheet,
  drawReferenceSheetFromPhoto,
  draftFrom,
  loadCast,
  referenceSheetFor,
  spriteSheetFor,
  validateDraft,
  type CharacterDraft,
  type DraftErrors,
  type DraftField,
} from "@/lib/cast";
import { deleteCharacter, getImage, saveCharacter } from "@/lib/store";
import type { Character, CharacterRole, ImageRef, WireImage } from "@/lib/types";
import styles from "./cast.module.css";

const TILTS = ["-3deg", "2deg", "-1.5deg", "3deg"];

type Editing = { kind: "new" } | { kind: "edit"; id: string } | null;

/**
 * The cast screen: the user's characters from this device, with add, edit
 * and remove. The starter cast is written to the store on the first run, so
 * it can be edited or removed like anyone else.
 */
export function CastEditor() {
  const [cast, setCast] = useState<Character[] | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  /** Work in progress or news per character (drawing from a photo, animating). */
  const [statuses, setStatuses] = useState<Record<string, CardStatus>>({});
  /** Where focus goes after the list re-renders (a card's edit button, or the add button). */
  const focusAfter = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadCast().then((loaded) => {
      if (!cancelled) setCast(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!focusAfter.current) return;
    document.getElementById(focusAfter.current)?.focus();
    focusAfter.current = null;
  });

  if (!cast) return <CastLoading />;

  const list = cast;

  async function save(character: Character, isNew: boolean, photo: WireImage | null) {
    const ok = await saveCharacter(character);
    if (!ok) return "This browser isn't letting Comimo save right now. Try again in a normal (not private) window.";
    setCast((current) => {
      const rest = (current ?? []).filter((member) => member.id !== character.id);
      return isNew ? [...rest, character] : (current ?? []).map((m) => (m.id === character.id ? character : m));
    });
    setEditing(null);
    setNotice(isNew ? `${character.name} joined your cast.` : `Saved ${character.name}.`);
    focusAfter.current = `edit-${character.id}`;
    if (photo) void drawFromPhoto(character, photo);
    return null;
  }

  function replace(character: Character) {
    setCast((current) => (current ?? []).map((m) => (m.id === character.id ? character : m)));
  }

  function setStatus(id: string, status: CardStatus | null) {
    setStatuses((current) => {
      const next = { ...current };
      if (status) next[id] = status;
      else delete next[id];
      return next;
    });
  }

  /** Draw the sheet from the photo's cut-out once; the cut-out is dropped when this returns. */
  async function drawFromPhoto(character: Character, photo: WireImage) {
    setStatus(character.id, { busy: true, text: `Drawing ${character.name} from the photo. This takes about a minute.` });
    try {
      const { character: drawn, photoRefused } = await drawReferenceSheetFromPhoto(character, DEFAULT_ART_STYLE, photo);
      replace(drawn);
      const text = photoRefused
        ? `Muse Image wouldn't draw from that photo, so ${drawn.name} was drawn from the description instead. The photo is gone.`
        : `Drew ${drawn.name} from the photo. The photo is gone; only the drawing is kept.`;
      setStatus(drawn.id, { busy: false, text });
      setNotice(text);
      void animate(drawn);
    } catch (problem) {
      const text = problem instanceof SheetError ? problem.message : "The sheet didn't draw. Try again from the card.";
      setStatus(character.id, { busy: false, text, error: true });
    }
  }

  /** Give a character their animated sprite once their first sheet exists. */
  async function animate(character: Character) {
    if (!canAnimate(character)) return;
    setStatus(character.id, { busy: true, text: `Bringing ${character.name} to life. This takes a couple of minutes.` });
    const animated = await animateCharacter(character);
    if (animated) {
      replace(animated);
      setStatus(character.id, null);
      setNotice(`${character.name} is animated now.`);
    } else {
      setStatus(character.id, { busy: false, text: `${character.name} keeps a still picture for now.` });
    }
  }

  async function remove(member: Character) {
    const ok = await deleteCharacter(member.id);
    if (!ok) {
      setNotice(`Couldn't remove ${member.name} right now.`);
      return;
    }
    const at = list.findIndex((m) => m.id === member.id);
    const neighbour = list[at + 1] ?? list[at - 1];
    setCast(list.filter((m) => m.id !== member.id));
    setConfirming(null);
    setNotice(`${member.name} left your cast. Comics you already made keep them.`);
    focusAfter.current = neighbour ? `edit-${neighbour.id}` : "add-character";
  }

  function sheetDrawn(character: Character) {
    replace(character);
    setNotice(`Drew a reference sheet for ${character.name}.`);
    void animate(character);
  }

  function cancel(returnTo: string) {
    setEditing(null);
    focusAfter.current = returnTo;
  }

  return (
    <>
      <p className="visually-hidden" role="status">
        {notice}
      </p>

      <ul className={styles.grid}>
        {list.map((member, i) =>
          editing?.kind === "edit" && editing.id === member.id ? (
            <li key={member.id} className={styles.editing}>
              <CharacterForm
                character={member}
                others={list.filter((m) => m.id !== member.id)}
                onSave={(character, photo) => save(character, false, photo)}
                onCancel={() => cancel(`edit-${member.id}`)}
              />
            </li>
          ) : (
            <CastCard
              key={member.id}
              member={member}
              tilt={TILTS[i % TILTS.length]}
              status={statuses[member.id] ?? null}
              onAnimate={() => void animate(member)}
              confirming={confirming === member.id}
              onEdit={() => {
                setConfirming(null);
                setEditing({ kind: "edit", id: member.id });
              }}
              onAskRemove={() => setConfirming(member.id)}
              onKeep={() => {
                setConfirming(null);
                focusAfter.current = `remove-${member.id}`;
              }}
              onRemove={() => void remove(member)}
              onSheetDrawn={sheetDrawn}
            />
          ),
        )}

        {editing?.kind === "new" ? (
          <li className={styles.editing}>
            <CharacterForm
              others={list}
              onSave={(character, photo) => save(character, true, photo)}
              onCancel={() => cancel("add-character")}
            />
          </li>
        ) : (
          <li className={styles.add}>
            <Art asset={art.empty.cast} className={styles.addArt} alt="" />
            <h2 className={styles.addTitle}>{list.length === 0 ? "Your cast is empty" : "Add someone from your life"}</h2>
            <p className={styles.addBody}>
              A name, how they look, how they talk. Comimo keeps them looking the same in every panel.
              {list.length === 0 ? " Until you add someone, comics use the starter cast." : ""}
            </p>
            <button
              id="add-character"
              type="button"
              className="btn btn--accent"
              onClick={() => {
                setConfirming(null);
                setEditing({ kind: "new" });
              }}
            >
              <Icon name="plus" size="1.1em" />
              Add a character
            </button>
          </li>
        )}
      </ul>
    </>
  );
}

/* ---------- One character ---------- */

/** What a card shows about work on its character: busy (drawing, animating) or news (a photo refused). */
interface CardStatus {
  busy: boolean;
  text: string;
  error?: boolean;
}

interface CastCardProps {
  member: Character;
  tilt: string;
  status: CardStatus | null;
  onAnimate: () => void;
  confirming: boolean;
  onEdit: () => void;
  onAskRemove: () => void;
  onKeep: () => void;
  onRemove: () => void;
  onSheetDrawn: (character: Character) => void;
}

/** The still picture of a drawn character without a sprite: their portrait, or the front view from a sheet. */
function stillFor(member: Character): { ref: ImageRef; fromSheet: boolean } | null {
  if (member.portrait.kind === "blob") return { ref: member.portrait, fromSheet: false };
  for (const style of ART_STYLE_IDS) {
    const sheet = referenceSheetFor(member, style);
    if (sheet) return { ref: sheet.image, fromSheet: true };
  }
  return null;
}

function CastCard({ member, tilt, status, onAnimate, confirming, onEdit, onAskRemove, onKeep, onRemove, onSheetDrawn }: CastCardProps) {
  const cardRef = useRef<HTMLLIElement>(null);
  const bubbleRef = useRef<HTMLParagraphElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const talking = useTalkWhenShown(bubbleRef, member.line ?? "");
  const sheet = spriteSheetFor(member);
  const still = sheet ? null : stillFor(member);
  const stillUrl = useSheetUrl(still?.ref ?? null);
  const nameId = `name-${member.id}`;

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  return (
    <li ref={cardRef} className={styles.member} style={{ "--tilt": tilt } as CSSProperties} aria-labelledby={nameId}>
      <div className={`sticker ${styles.sprite}`}>
        {sheet ? (
          <Sprite sheet={sheet} label={member.name} talking={talking} hostRef={cardRef} />
        ) : still && stillUrl ? (
          <div className={styles.undrawn}>
            {/* A stored Blob or a drawn sheet; next/image can't optimise Blobs. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={stillUrl} alt={member.name} className={still.fromSheet ? styles.stillSheet : styles.still} />
          </div>
        ) : (
          <div className={styles.undrawn}>
            {member.portrait.kind === "art" ? <Art asset={artAt(member.portrait.path)} alt="" /> : null}
            <span className={styles.undrawnTag}>Not drawn yet</span>
          </div>
        )}
      </div>
      <div className={styles.info}>
        <h2 id={nameId} className={styles.name} dir="auto">
          {member.name}
        </h2>
        <p className="chip" dir="auto">
          {member.roleLabel}
        </p>
        {member.aliases && member.aliases.length > 0 ? (
          <p className={styles.aliases}>
            Also called{" "}
            {member.aliases.map((alias, i) => (
              <span key={alias}>
                {i > 0 ? ", " : ""}
                <bdi>{alias}</bdi>
              </span>
            ))}
          </p>
        ) : null}
        {member.line ? (
          <p ref={bubbleRef} className={`bubble ${styles.line}`} dir={firstStrongDir(member.line) ?? "auto"}>
            <BidiText text={member.line} />
          </p>
        ) : null}

        {member.role === "self" ? <AboutYouNote member={member} /> : null}

        <ReferenceSheets member={member} onDrawn={onSheetDrawn} />

        <p
          className={status?.error ? styles.error : styles.sheetStatus}
          role={status?.error ? "alert" : "status"}
          aria-busy={status?.busy || undefined}
        >
          {status?.text ?? ""}
        </p>
        {!status?.busy && canAnimate(member) ? (
          <button type="button" className={styles.textButton} onClick={onAnimate}>
            Animate<span className="visually-hidden"> {member.name}</span>
          </button>
        ) : null}

        {confirming ? (
          <div className={styles.confirm} role="group" aria-labelledby={`confirm-${member.id}`}>
            <p id={`confirm-${member.id}`}>
              Remove <bdi>{member.name}</bdi> from your cast? Comics you already made keep them.
            </p>
            <div className={styles.actions}>
              <button ref={confirmRef} type="button" className="btn btn--ink" onClick={onRemove}>
                Remove
              </button>
              <button type="button" className="btn btn--ghost" onClick={onKeep}>
                Keep
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.actions}>
            <button id={`edit-${member.id}`} type="button" className={styles.textButton} onClick={onEdit}>
              Edit<span className="visually-hidden"> {member.name}</span>
            </button>
            <button id={`remove-${member.id}`} type="button" className={styles.textButton} onClick={onAskRemove}>
              Remove<span className="visually-hidden"> {member.name}</span>
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

/* ---------- You ---------- */

/** On the user's own card: their About-you chips, a nudge while they have a stand-in look, and the way back into the steps. */
function AboutYouNote({ member }: { member: Character }) {
  const about = member.about;
  const chips = about ? [...mannerChoices(about).map((m) => m.label), ...interestLabels(about, true)] : [];
  const standIn = !hasOwnFace(member);
  return (
    <div className={styles.about}>
      {chips.length > 0 ? (
        <ul className={styles.aboutChips} aria-label="About you">
          {chips.map((chip) => (
            <li key={chip} className="chip">
              <bdi>{chip}</bdi>
            </li>
          ))}
        </ul>
      ) : null}
      {standIn ? (
        <p className={styles.nudge}>
          {member.starter
            ? "Your comics still use a stand-in look. Add a photo and Comimo draws you instead."
            : "You aren't drawn from a photo yet. Add one and Comimo draws you from it."}
        </p>
      ) : null}
      <Link href="/welcome?next=/cast" className={standIn ? "btn btn--accent" : styles.aboutLink}>
        {standIn ? "Add my photo" : about ? "Edit about you" : "Tell Comimo about you"}
      </Link>
    </div>
  );
}

/* ---------- Reference sheet ---------- */

/** An object URL for a sheet: a Blob from the store or a manifest file. */
function useSheetUrl(ref: ImageRef | null): string | null {
  const [blobUrl, setBlobUrl] = useState<{ id: string; url: string } | null>(null);
  const blobId = ref?.kind === "blob" ? ref.id : null;

  useEffect(() => {
    if (!blobId) return;
    let url: string | null = null;
    let cancelled = false;
    void getImage(blobId).then((blob) => {
      if (cancelled || !blob) return;
      url = URL.createObjectURL(blob);
      setBlobUrl({ id: blobId, url });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [blobId]);

  if (!ref) return null;
  if (ref.kind === "art") return artAt(ref.path).src;
  return blobUrl?.id === ref.id ? blobUrl.url : null;
}

/** The character's reference sheets, one per art style. */
function ReferenceSheets({ member, onDrawn }: { member: Character; onDrawn: (character: Character) => void }) {
  return (
    <div className={styles.sheets} role="group" aria-label={`${member.name}'s reference sheets`}>
      {ART_STYLE_IDS.map((style) => (
        <ReferenceSheet key={style} member={member} style={style} onDrawn={onDrawn} />
      ))}
    </div>
  );
}

/**
 * One Muse Image reference sheet: a thumbnail when drawn, and a button that
 * draws (or redraws) it from their look in that style. Panels in that style
 * use the sheet to keep their face the same.
 */
function ReferenceSheet({
  member,
  style,
  onDrawn,
}: {
  member: Character;
  style: ArtStyleId;
  onDrawn: (character: Character) => void;
}) {
  const sheet = referenceSheetFor(member, style);
  const url = useSheetUrl(sheet?.image ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const statusId = `sheet-status-${member.id}-${style}`;
  const label = ART_STYLES[style].label;

  useEffect(() => () => controller.current?.abort(), []);

  async function draw() {
    if (busy) return;
    setBusy(true);
    setError(null);
    controller.current = new AbortController();
    try {
      onDrawn(await drawReferenceSheet(member, style, controller.current.signal));
    } catch (problem) {
      if (controller.current?.signal.aborted) return;
      setError(problem instanceof SheetError ? problem.message : "The sheet didn't draw. Try again.");
    } finally {
      setBusy(false);
      controller.current = null;
    }
  }

  return (
    <div className={styles.sheet}>
      <span className={styles.sheetLabel}>{label}</span>
      {url ? (
        // Object URLs and drawn sheets; next/image can't optimise Blobs.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={styles.sheetImage}
          src={url}
          alt={`${member.name}'s ${label.toLowerCase()} reference sheet, front and three-quarter views`}
        />
      ) : (
        <span className={styles.sheetEmpty}>Not drawn yet</span>
      )}
      <button
        type="button"
        className={styles.textButton}
        onClick={() => void draw()}
        aria-disabled={busy || undefined}
        aria-describedby={statusId}
      >
        {busy ? "Drawing…" : sheet ? "Redraw" : "Draw sheet"}
        <span className="visually-hidden">
          {" "}
          {label.toLowerCase()} sheet for {member.name}
        </span>
      </button>
      <p id={statusId} className={error ? styles.error : styles.sheetStatus} role={error ? "alert" : "status"}>
        {error ?? (busy ? `Drawing ${member.name}. This takes about a minute.` : "")}
      </p>
    </div>
  );
}

/* ---------- The form ---------- */

interface CharacterFormProps {
  character?: Character;
  others: Character[];
  /** `photo` is the cut-out from "Start from a photo", to draw their sheet from once; null without one. */
  onSave: (character: Character, photo: WireImage | null) => Promise<string | null>;
  onCancel: () => void;
}

const FIELD_ORDER: DraftField[] = ["name", "aliases", "role", "roleLabel", "look", "personality", "line"];

function CharacterForm({ character, others, onSave, onCancel }: CharacterFormProps) {
  const id = useId();
  const [draft, setDraft] = useState<CharacterDraft>(() => draftFrom(character));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The person cut from a photo, held in memory until the sheet is drawn; never stored. */
  const [crop, setCrop] = useState<WireImage | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const fieldId = (field: DraftField) => `${id}-${field}`;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  function set<K extends DraftField>(field: K, value: CharacterDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
    // Clear a field's message as soon as it's being fixed.
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const found = validateDraft(draft, others);
    setErrors(found);
    const first = FIELD_ORDER.find((field) => found[field]);
    if (first) {
      document.getElementById(fieldId(first))?.focus();
      return;
    }
    setBusy(true);
    const problem = await onSave(characterFromDraft(draft, character), crop);
    setBusy(false);
    setSaveError(problem);
    if (!problem) setCrop(null);
  }

  const describedBy = (field: DraftField, hint?: boolean) =>
    [hint ? `${fieldId(field)}-hint` : null, errors[field] ? `${fieldId(field)}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;

  const error = (field: DraftField) =>
    errors[field] ? (
      <span id={`${fieldId(field)}-error`} className={styles.error}>
        {errors[field]}
      </span>
    ) : null;

  return (
    <form className={styles.form} onSubmit={submit} noValidate aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} ref={headingRef} tabIndex={-1} className={styles.formTitle} dir="auto">
        {character ? `Edit ${character.name}` : "Add a character"}
      </h2>

      <div className={styles.fields}>
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
            aria-describedby={describedBy("name")}
          />
          {error("name")}
        </label>

        <label className={styles.field} htmlFor={fieldId("aliases")}>
          <span className={styles.label}>
            Other names <span className={styles.optional}>(optional)</span>
          </span>
          <span id={`${fieldId("aliases")}-hint`} className={styles.hint}>
            Nicknames and spellings you use in your voice notes, in Arabic or English, with commas between them.
          </span>
          <input
            id={fieldId("aliases")}
            value={draft.aliases}
            onChange={(event) => set("aliases", event.target.value)}
            placeholder="Teta, تيتا"
            dir="auto"
            autoComplete="off"
            maxLength={LIMITS.aliases + 20}
            aria-invalid={errors.aliases ? true : undefined}
            aria-describedby={describedBy("aliases", true)}
          />
          {error("aliases")}
        </label>

        <div className={styles.fieldRow}>
          <label className={styles.field} htmlFor={fieldId("role")}>
            <span className={styles.label}>Who they are to you</span>
            <select
              id={fieldId("role")}
              value={draft.role}
              onChange={(event) => set("role", event.target.value as CharacterRole)}
              aria-invalid={errors.role ? true : undefined}
              aria-describedby={describedBy("role")}
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {error("role")}
          </label>

          <label className={styles.field} htmlFor={fieldId("roleLabel")}>
            <span className={styles.label}>
              Label on their card <span className={styles.optional}>(optional)</span>
            </span>
            <input
              id={fieldId("roleLabel")}
              value={draft.roleLabel}
              onChange={(event) => set("roleLabel", event.target.value)}
              placeholder={defaultRoleLabel(draft.role)}
              dir="auto"
              autoComplete="off"
              maxLength={LIMITS.roleLabel + 8}
              aria-invalid={errors.roleLabel ? true : undefined}
              aria-describedby={describedBy("roleLabel")}
            />
            {error("roleLabel")}
          </label>
        </div>

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
          <span id={`${fieldId("look")}-hint`} className={styles.hint}>
            Hair, clothes, something they always carry. This is what keeps their face the same.
          </span>
          <textarea
            id={fieldId("look")}
            value={draft.look}
            onChange={(event) => set("look", event.target.value)}
            rows={3}
            dir="auto"
            maxLength={LIMITS.look + 40}
            aria-invalid={errors.look ? true : undefined}
            aria-describedby={describedBy("look", true)}
          />
          {error("look")}
        </label>

        <label className={styles.field} htmlFor={fieldId("personality")}>
          <span className={styles.label}>
            How they act and talk <span className={styles.optional}>(optional)</span>
          </span>
          <textarea
            id={fieldId("personality")}
            value={draft.personality}
            onChange={(event) => set("personality", event.target.value)}
            rows={2}
            dir="auto"
            maxLength={LIMITS.personality + 40}
            aria-invalid={errors.personality ? true : undefined}
            aria-describedby={describedBy("personality")}
          />
          {error("personality")}
        </label>

        <label className={styles.field} htmlFor={fieldId("line")}>
          <span className={styles.label}>
            A line they&apos;d say <span className={styles.optional}>(optional)</span>
          </span>
          <input
            id={fieldId("line")}
            value={draft.line}
            onChange={(event) => set("line", event.target.value)}
            dir="auto"
            autoComplete="off"
            maxLength={LIMITS.line + 20}
            aria-invalid={errors.line ? true : undefined}
            aria-describedby={describedBy("line")}
          />
          {error("line")}
        </label>

        <div className={styles.refSlot}>
          <span className={styles.label}>Reference sheet</span>
          <p>
            {crop
              ? "Comimo draws their zine sheet from the photo as soon as they're saved, then animates them. The other style is drawn the first time a comic needs it."
              : character && ART_STYLE_IDS.some((style) => referenceSheetFor(character, style))
                ? "Drawn. Comimo uses their sheets to keep their face the same. Changed how they look? Redraw the sheets from their card."
                : "Comimo draws a sheet in each art style the first time a comic needs one, or draw them now from their card. The sheets keep their face the same in every panel."}
          </p>
        </div>
      </div>

      {saveError ? (
        <p className={styles.error} role="alert">
          {saveError}
        </p>
      ) : null}

      <div className={styles.actions}>
        <button type="submit" className="btn btn--accent" aria-disabled={busy || undefined}>
          {character ? "Save changes" : "Add to my cast"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ---------- Loading ---------- */

function CastLoading() {
  return (
    <div aria-busy="true">
      <p className={styles.loading} role="status">
        Opening your cast…
      </p>
      <ul className={styles.grid} aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className={styles.ghost} />
        ))}
      </ul>
    </div>
  );
}
