"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Art } from "@/art/Art";
import { art } from "@/art/manifest";
import { safeNext, useAccount } from "@/components/account/useAccount";
import {
  INTERESTS,
  MANNERS,
  OWN_INTERESTS_MAX,
  OWN_INTEREST_LENGTH,
  PRONOUN_LABELS,
  cleanOwnInterests,
  hasOwnFace,
  type DrawnFace,
} from "@/lib/aboutYou";
import { ART_STYLE_IDS, ART_STYLES, DEFAULT_ART_STYLE, artStyleOf, type ArtStyleId } from "@/lib/artStyles";
import { ABOUT_ASKED_KEY, SheetError, draftFrom, drawSheet, loadSelf, referenceSheetFor, saveSelf, validateDraft } from "@/lib/cast";
import { namesOf, normalizeName, parseAliases } from "@/lib/names";
import { PhotoError, describePhoto, preparePhoto } from "@/lib/photo";
import { deleteCharacter, getImage, setMeta } from "@/lib/store";
import { PRONOUNS, type Character, type Pronouns } from "@/lib/types";
import styles from "./welcome.module.css";

const STEPS = ["photo", "interests", "manner", "name"] as const;
type Step = (typeof STEPS)[number];

/** Shared with the record page's style picker, so the first comic is drawn in the style they were drawn in. */
const STYLE_KEY = "comimo.artStyle";

function storedStyle(): ArtStyleId {
  try {
    return artStyleOf(window.localStorage.getItem(STYLE_KEY));
  } catch {
    return DEFAULT_ART_STYLE;
  }
}

function rememberStyle(style: ArtStyleId) {
  try {
    window.localStorage.setItem(STYLE_KEY, style);
  } catch {
    // Private mode: the record page falls back to the default.
  }
}

const noSubscribe = () => () => {};
const readSearch = () => window.location.search;

/** The photo step's work: finding the person, then drawing them. The photo itself is never held here. */
type Drawing =
  | { phase: "idle" }
  | { phase: "finding" }
  | { phase: "drawing"; crop: string }
  | { phase: "done"; crop: string | null; refused: boolean }
  | { phase: "error"; message: string };

const COPY: Record<Step, { title: string; lede: string; bubble: string }> = {
  photo: {
    title: "Put your face in it",
    lede: "One photo of you and Comimo draws you as a comic character, the star of every page.",
    bubble: "Say cheese! I'll draw you.",
  },
  interests: {
    title: "What are you into?",
    lede: "Pick as many as you like. Your comics only use them as flavour, never to make things up.",
    bubble: "What gets you talking?",
  },
  manner: {
    title: "How are you with people?",
    lede: "Pick everything that sounds like you. Your lines in the comic will sound like this.",
    bubble: "Be honest. I won't tell.",
  },
  name: {
    title: "What do your people call you?",
    lede: "The name in your comics, and the nicknames you hear in your voice notes.",
    bubble: "Nice to meet you, properly.",
  },
};

/**
 * "About you": four short steps after sign-up (photo, interests, how you are
 * with people, names), saved onto the account's self character. Every step
 * can be skipped; the manner step needs one chip only when not skipped.
 *
 * The photo is shrunk on this device, sent once to find and describe the
 * person (/api/character/photo) and once to draw their sheet (/api/character),
 * then dropped: only the drawing is kept. The sheet is saved onto the self
 * character as soon as it is drawn, so leaving early never loses it.
 */
export function AboutYouFlow() {
  const router = useRouter();
  const account = useAccount();
  const id = useId();
  const search = useSyncExternalStore(noSubscribe, readSearch, () => "");
  const rawNext = safeNext(new URLSearchParams(search).get("next"), "/record");
  const next = rawNext === "/welcome" ? "/record" : rawNext;

  const [loaded, setLoaded] = useState<{ self: Character | null; others: Character[] } | null>(null);
  const [step, setStep] = useState<Step>("photo");
  const [style, setStyle] = useState<ArtStyleId>(DEFAULT_ART_STYLE);
  const [consent, setConsent] = useState(false);
  const [drawing, setDrawing] = useState<Drawing>({ phase: "idle" });
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [ownInterests, setOwnInterests] = useState<string[]>([]);
  const [ownDraft, setOwnDraft] = useState("");
  const [manner, setManner] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [pronouns, setPronouns] = useState<Pronouns | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [nameErrors, setNameErrors] = useState<{ name?: string; aliases?: string; clash?: Character }>({});
  const [finishing, setFinishing] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  /** The sheet being drawn, so Finish can wait for it. */
  const pending = useRef<Promise<unknown> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const prefilledName = useRef(false);

  // Load the self character and prefill from earlier answers.
  useEffect(() => {
    let cancelled = false;
    void loadSelf().then(({ self, cast }) => {
      if (cancelled) return;
      setLoaded({ self, others: cast.filter((member) => member.id !== self?.id) });
      setStyle(storedStyle());
      if (self?.about) {
        setInterests(self.about.interests);
        setOwnInterests(self.about.ownInterests);
        setManner(self.about.manner);
        setPronouns(self.about.pronouns ?? null);
        setName(self.name);
        setAliases((self.aliases ?? []).join(", "));
        prefilledName.current = true;
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // New accounts: the name they signed up with.
  useEffect(() => {
    if (prefilledName.current || !loaded || account.status !== "signed-in") return;
    prefilledName.current = true;
    setName(account.name);
  }, [account, loaded]);

  // Their drawn sheet (now or from before), as an object URL.
  const shownSheet = loaded?.self && hasOwnFace(loaded.self) ? (referenceSheetFor(loaded.self, style) ?? Object.values(loaded.self.referenceSheets ?? {})[0] ?? null) : null;
  const shownBlob = shownSheet?.image.kind === "blob" ? shownSheet.image.id : null;
  useEffect(() => {
    if (!shownBlob) return;
    let url: string | null = null;
    let cancelled = false;
    void getImage(shownBlob).then((blob) => {
      if (cancelled || !blob) return;
      url = URL.createObjectURL(blob);
      setSheetUrl(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [shownBlob]);

  useEffect(() => () => controller.current?.abort(), []);

  // Each new step's heading takes focus (not on first load).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const index = STEPS.indexOf(step);
  const copy = COPY[step];
  const busyDrawing = drawing.phase === "finding" || drawing.phase === "drawing";

  function go(to: Step) {
    setStepError(null);
    setStep(to);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** The name and other names, checked like the cast form (no clash with anyone else in the cast). */
  function checkName(): { name?: string; aliases?: string; clash?: Character } {
    if (!loaded) return {};
    const draft = { ...draftFrom(loaded.self ?? undefined), name, aliases, role: "self" as const, roleLabel: "You" };
    const errors = validateDraft(draft, loaded.others);
    // A clash with an invented starter character can be solved by taking them out.
    const wanted = [name, ...parseAliases(aliases, name)].map(normalizeName).filter(Boolean);
    const clash = errors.name || errors.aliases ? loaded.others.find((m) => m.starter && namesOf(m).some((n) => wanted.includes(n))) : undefined;
    return { name: errors.name, aliases: errors.aliases, clash };
  }

  /** The name to save with a drawing before the name step: the typed one if it fits, else the current one. */
  function safeName(): { name: string; aliases: string[] } {
    const problems = checkName();
    const keepName = problems.name ? (loaded?.self?.name ?? "") : name;
    const keepAliases = problems.aliases ? (loaded?.self?.aliases ?? []) : parseAliases(aliases, keepName);
    return { name: keepName, aliases: keepAliases };
  }

  async function pickPhoto(file: File | undefined) {
    if (!file || busyDrawing) return;
    if (!consent) {
      setDrawing({ phase: "error", message: "Tick the box first: it's you in the photo and Comimo may draw you from it." });
      return;
    }
    controller.current = new AbortController();
    const signal = controller.current.signal;
    setDrawing({ phase: "finding" });
    const work = (async () => {
      try {
        const photo = await preparePhoto(file);
        const { look, crop } = await describePhoto(photo, signal);
        const cropUrl = `data:${crop.mimeType};base64,${crop.base64}`;
        setDrawing({ phase: "drawing", crop: cropUrl });
        const self = loaded?.self;
        const who = safeName();
        const subject: Character = {
          ...(self ?? draftCharacter()),
          name: who.name || "You",
          role: "self",
          look,
        };
        const { sheet, photoRefused } = await drawSheet(subject, style, crop, signal);
        const face: DrawnFace = { look, style, sheet };
        const saved = await saveSelf({ ...who, face });
        if (!saved) throw new SheetError("Couldn't keep your drawing on this device. Private windows can block storage.");
        setLoaded((current) => (current ? { ...current, self: saved } : current));
        // Same image id as before when redrawn: show the new one.
        setSheetUrl(null);
        setDrawing({ phase: "done", crop: null, refused: photoRefused });
      } catch (problem) {
        if (signal.aborted) return;
        const message =
          problem instanceof PhotoError || problem instanceof SheetError ? problem.message : "That photo didn't work. Try another one.";
        setDrawing({ phase: "error", message });
      } finally {
        controller.current = null;
      }
    })();
    pending.current = work;
    await work;
    if (pending.current === work) pending.current = null;
  }

  function toggle(list: string[], value: string, set: (next: string[]) => void) {
    set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
    setStepError(null);
  }

  function addOwnInterest() {
    const cleaned = cleanOwnInterests([...ownInterests, ownDraft]);
    if (cleaned.length === ownInterests.length) {
      const text = ownDraft.trim();
      setStepError(
        !text
          ? "Type something first."
          : ownInterests.length >= OWN_INTERESTS_MAX
            ? `Up to ${OWN_INTERESTS_MAX} of your own.`
            : text.length > OWN_INTEREST_LENGTH
              ? `Keep it under ${OWN_INTEREST_LENGTH} characters.`
              : "Use letters and spaces, and nothing that's already a chip.",
      );
      return;
    }
    setOwnInterests(cleaned);
    setOwnDraft("");
    setStepError(null);
  }

  async function removeStarter(member: Character) {
    if (!(await deleteCharacter(member.id))) {
      setNameErrors((current) => ({ ...current, clash: undefined, name: `Couldn't take ${member.name} out right now. Try another name.` }));
      return;
    }
    setLoaded((current) => (current ? { ...current, others: current.others.filter((m) => m.id !== member.id) } : current));
    setNameErrors({});
  }

  async function finish(skipName: boolean) {
    if (finishing) return;
    let who: { name: string; aliases: string[] };
    if (skipName) {
      who = safeName();
    } else {
      const problems = checkName();
      setNameErrors(problems);
      if (problems.name || problems.aliases) {
        document.getElementById(`${id}-${problems.name ? "name" : "aliases"}`)?.focus();
        return;
      }
      who = { name, aliases: parseAliases(aliases, name) };
    }
    if (pending.current) {
      setFinishing("Finishing your drawing…");
      await pending.current;
    }
    setFinishing("Saving…");
    const saved = await saveSelf({
      ...who,
      about: {
        interests,
        ownInterests,
        manner,
        ...(pronouns ? { pronouns } : {}),
        answeredAt: new Date().toISOString(),
      },
    });
    if (!saved) {
      setFinishing(null);
      setStepError("This browser isn't letting Comimo save right now. Try again in a normal (not private) window.");
      return;
    }
    await setMeta(ABOUT_ASKED_KEY, true);
    router.replace(next);
  }

  async function later() {
    await setMeta(ABOUT_ASKED_KEY, true);
    router.replace(next);
  }

  if (!loaded) {
    return (
      <p className={styles.loading} role="status">
        Getting your page ready…
      </p>
    );
  }

  const ownFace = loaded.self ? hasOwnFace(loaded.self) : false;
  const showSheet = sheetUrl && ownFace;

  let body: ReactNode;
  if (step === "photo") {
    body = (
      <PhotoStep
        id={id}
        style={style}
        onStyle={(value) => {
          setStyle(value);
          rememberStyle(value);
        }}
        consent={consent}
        onConsent={(value) => {
          setConsent(value);
          if (value && drawing.phase === "error") setDrawing({ phase: "idle" });
        }}
        drawing={drawing}
        hasFace={ownFace}
        onPick={(file) => void pickPhoto(file)}
        onNeedConsent={() =>
          setDrawing({ phase: "error", message: "Tick the box first: it's you in the photo and Comimo may draw you from it." })
        }
      />
    );
  } else if (step === "interests") {
    body = (
      <div className={styles.stepBody}>
        <fieldset className={styles.group}>
          <legend className="visually-hidden">Interests</legend>
          <div className={styles.chips}>
            {INTERESTS.map((choice) => (
              <label key={choice.id} className={styles.chip}>
                <input
                  type="checkbox"
                  checked={interests.includes(choice.id)}
                  onChange={() => toggle(interests, choice.id, setInterests)}
                />
                <span>{choice.label}</span>
              </label>
            ))}
            {ownInterests.map((text) => (
              <span key={text} className={styles.ownChip}>
                <bdi>{text}</bdi>
                <button
                  type="button"
                  className={styles.ownRemove}
                  onClick={() => setOwnInterests(ownInterests.filter((item) => item !== text))}
                  aria-label={`Remove ${text}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </fieldset>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${id}-own`}>
            Something else? <span className={styles.optional}>(up to {OWN_INTERESTS_MAX})</span>
          </label>
          <div className={styles.addRow}>
            <input
              id={`${id}-own`}
              value={ownDraft}
              onChange={(event) => setOwnDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addOwnInterest();
                }
              }}
              placeholder="Padel, poetry, plants…"
              dir="auto"
              autoComplete="off"
              maxLength={OWN_INTEREST_LENGTH + 4}
              aria-describedby={stepError ? `${id}-step-error` : undefined}
            />
            <button type="button" className="btn btn--ghost" onClick={addOwnInterest} aria-disabled={ownInterests.length >= OWN_INTERESTS_MAX || undefined}>
              Add
            </button>
          </div>
        </div>
      </div>
    );
  } else if (step === "manner") {
    body = (
      <fieldset className={styles.group} aria-describedby={stepError ? `${id}-step-error` : undefined}>
        <legend className="visually-hidden">How you are with people (pick at least one)</legend>
        <div className={styles.mannerGrid}>
          {MANNERS.map((choice) => (
            <label key={choice.id} className={styles.manner}>
              <input type="checkbox" checked={manner.includes(choice.id)} onChange={() => toggle(manner, choice.id, setManner)} />
              <span className={styles.mannerCard}>
                <span className={styles.mannerLabel}>{choice.label}</span>
                <span className={styles.mannerHint}>{choice.voice.replace(/^./, (c) => c.toUpperCase())}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  } else {
    body = (
      <div className={styles.stepBody}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${id}-name`}>
            Your name in the comics
          </label>
          <input
            id={`${id}-name`}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameErrors({});
            }}
            dir="auto"
            autoComplete="given-name"
            maxLength={40}
            aria-invalid={nameErrors.name ? true : undefined}
            aria-describedby={nameErrors.name ? `${id}-name-error` : undefined}
          />
          {nameErrors.name ? (
            <p id={`${id}-name-error`} className={styles.error} role="alert">
              {nameErrors.name}
            </p>
          ) : null}
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${id}-aliases`}>
            Nicknames and other spellings <span className={styles.optional}>(optional)</span>
          </label>
          <p id={`${id}-aliases-hint`} className={styles.hint}>
            How friends say your name in your voice notes, in Arabic or English, with commas between them.
          </p>
          <input
            id={`${id}-aliases`}
            value={aliases}
            onChange={(event) => {
              setAliases(event.target.value);
              setNameErrors({});
            }}
            placeholder="Yoyo, يوسف"
            dir="auto"
            autoComplete="off"
            maxLength={220}
            aria-invalid={nameErrors.aliases ? true : undefined}
            aria-describedby={[`${id}-aliases-hint`, nameErrors.aliases ? `${id}-aliases-error` : ""].join(" ").trim()}
          />
          {nameErrors.aliases ? (
            <p id={`${id}-aliases-error`} className={styles.error} role="alert">
              {nameErrors.aliases}
            </p>
          ) : null}
        </div>
        {nameErrors.clash ? (
          <div className={styles.clash}>
            <p>
              <bdi>{nameErrors.clash.name}</bdi> is from the starter cast Comimo made up. Take them out so the name is yours?
              Comics you already made keep them.
            </p>
            <button type="button" className="btn btn--ink" onClick={() => void removeStarter(nameErrors.clash!)}>
              Take <bdi>{nameErrors.clash.name}</bdi> out of my cast
            </button>
          </div>
        ) : null}
        <fieldset className={styles.group}>
          <legend className={styles.label}>
            In the story, you are <span className={styles.optional}>(optional)</span>
          </legend>
          <div className={styles.chips}>
            {PRONOUNS.map((value) => (
              <label key={value} className={styles.chip}>
                <input
                  type="radio"
                  name={`${id}-pronouns`}
                  checked={pronouns === value}
                  onChange={() => setPronouns(value)}
                  onClick={() => {
                    // A second tap clears the choice.
                    if (pronouns === value) setPronouns(null);
                  }}
                />
                <span>{PRONOUN_LABELS[value]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    );
  }

  const last = index === STEPS.length - 1;

  function primary() {
    if (step === "manner" && manner.length === 0) {
      setStepError("Pick at least one, or skip this step.");
      return;
    }
    if (last) void finish(false);
    else go(STEPS[index + 1]);
  }

  function skip() {
    if (last) void finish(true);
    else go(STEPS[index + 1]);
  }

  return (
    <div className={styles.layout}>
      <figure className={`panel halftone ${styles.artPanel}`} aria-hidden={showSheet ? undefined : true}>
        {showSheet ? (
          // An object URL of their drawn sheet; next/image can't optimise Blobs.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sheetUrl} alt="You, drawn by Comimo: front and three-quarter views" className={styles.sheet} />
        ) : (
          <Art asset={art.brand.mascot} className={styles.art} alt="" sizes="(min-width: 48rem) 22rem, 8.5rem" priority />
        )}
        <p className={`bubble bubble--tail-end ${styles.bubble}`} aria-hidden="true">
          {showSheet && step === "photo" ? "That's you! Looking good." : copy.bubble}
        </p>
      </figure>

      <section className={`panel ${styles.card}`} aria-labelledby={`${id}-title`}>
        <div className={styles.top}>
          <p className={`caption ${styles.kicker}`}>About you</p>
          <button type="button" className={styles.textButton} onClick={() => void later()}>
            Do this later
          </button>
        </div>
        <ol className={styles.dots} aria-label={`Step ${index + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <li key={s} className={i === index ? styles.dotNow : i < index ? styles.dotDone : styles.dot} aria-hidden="true" />
          ))}
        </ol>
        <h1 id={`${id}-title`} ref={headingRef} tabIndex={-1} className={styles.title}>
          {copy.title}
        </h1>
        <p className={styles.lede}>{copy.lede}</p>

        {body}

        {busyDrawing && step !== "photo" ? (
          <p className={styles.background} role="status">
            Still drawing you in the background. Keep going.
          </p>
        ) : null}

        {stepError ? (
          <p id={`${id}-step-error`} className={styles.error} role="alert">
            {stepError}
          </p>
        ) : null}

        <div className={styles.actions}>
          {index > 0 ? (
            <button type="button" className="btn btn--ghost" onClick={() => go(STEPS[index - 1])}>
              Back
            </button>
          ) : null}
          <button type="button" className={`btn btn--accent ${styles.primary}`} onClick={primary} aria-disabled={finishing ? true : undefined}>
            {finishing ?? (last ? "Start my comic book" : "Next")}
          </button>
        </div>
        <button type="button" className={styles.skip} onClick={skip} aria-disabled={finishing ? true : undefined}>
          {step === "photo" ? (ownFace ? "Keep my drawing" : "Skip for now") : last ? "Skip and finish" : "Skip this step"}
        </button>
        {step === "photo" && !ownFace && !busyDrawing ? (
          <p className={styles.hint}>Skipping keeps a stand-in look in your comics until you add a photo from your cast page.</p>
        ) : null}
      </section>
    </div>
  );
}

/** A self character for an account whose cast has none (only for the sheet request). */
function draftCharacter(): Character {
  return {
    id: "you",
    name: "You",
    role: "self",
    roleLabel: "You",
    look: "",
    personality: "",
    portrait: { kind: "art", path: "empty.cast" },
    spriteSheet: null,
    starter: false,
    createdAt: new Date().toISOString(),
  };
}

/* ---------- Step 1: the photo ---------- */

interface PhotoStepProps {
  id: string;
  style: ArtStyleId;
  onStyle: (style: ArtStyleId) => void;
  consent: boolean;
  onConsent: (value: boolean) => void;
  drawing: Drawing;
  hasFace: boolean;
  onPick: (file: File | undefined) => void;
  onNeedConsent: () => void;
}

function PhotoStep({ id, style, onStyle, consent, onConsent, drawing, hasFace, onPick, onNeedConsent }: PhotoStepProps) {
  const busy = drawing.phase === "finding" || drawing.phase === "drawing";

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // The picked file isn't kept: the input is cleared at once.
    event.target.value = "";
    onPick(file);
  }

  /** The file pickers open only once the box is ticked. */
  function guardPick(event: React.MouseEvent) {
    if (!consent || busy) {
      event.preventDefault();
      if (!consent) onNeedConsent();
    }
  }

  return (
    <div className={styles.stepBody}>
      <p id={`${id}-privacy`} className={styles.privacy}>
        <strong>Your photo isn&apos;t kept.</strong> It&apos;s shrunk on this device, used once to draw you, then thrown away.
        Only the drawing is saved.
      </p>

      <fieldset className={styles.group}>
        <legend className={styles.label}>Draw me as</legend>
        <div className={styles.chips}>
          {ART_STYLE_IDS.map((value) => (
            <label key={value} className={styles.chip}>
              <input type="radio" name={`${id}-style`} checked={style === value} onChange={() => onStyle(value)} disabled={busy} />
              <span>{ART_STYLES[value].label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className={styles.consent} htmlFor={`${id}-consent`}>
        <input id={`${id}-consent`} type="checkbox" checked={consent} onChange={(event) => onConsent(event.target.checked)} />
        <span>It&apos;s me in the photo, and Comimo may draw me from it.</span>
      </label>

      <div className={styles.pickers} aria-describedby={`${id}-privacy`}>
        <label className={`btn btn--accent ${styles.picker}`} onClick={guardPick} aria-disabled={!consent || busy || undefined}>
          <input type="file" accept="image/*" capture="user" className="visually-hidden" onChange={onChange} disabled={busy} />
          Take a selfie
        </label>
        <label className={`btn btn--ghost ${styles.picker}`} onClick={guardPick} aria-disabled={!consent || busy || undefined}>
          <input type="file" accept="image/*" className="visually-hidden" onChange={onChange} disabled={busy} />
          {hasFace ? "Use a new photo" : "Choose a photo"}
        </label>
      </div>

      <div className={styles.progress} role="status" aria-busy={busy || undefined}>
        {drawing.phase === "finding" ? (
          <p className={styles.working}>
            <span className={styles.spinner} aria-hidden="true" />
            Finding you in the photo…
          </p>
        ) : drawing.phase === "drawing" ? (
          <div className={styles.found}>
            {/* The in-memory cut-out; next/image can't optimise data URLs. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={drawing.crop} alt="You, cut out of the photo" className={styles.crop} />
            <p className={styles.working}>
              <span className={styles.spinner} aria-hidden="true" />
              Drawing you in {ART_STYLES[style].label.toLowerCase()}. This takes about a minute; you can keep going.
            </p>
          </div>
        ) : drawing.phase === "done" ? (
          <p className={styles.done}>
            {drawing.refused
              ? "Muse Image wouldn't draw from that photo, so you were drawn from its description. The photo is gone."
              : "Drawn! That's you in every comic from now on. The photo is gone; only the drawing is kept."}
          </p>
        ) : hasFace ? (
          <p className={styles.hint}>You&apos;re already drawn. Pick a new photo to redraw yourself.</p>
        ) : null}
      </div>
      {drawing.phase === "error" ? (
        <p className={styles.error} role="alert">
          {drawing.message}
        </p>
      ) : null}
    </div>
  );
}
