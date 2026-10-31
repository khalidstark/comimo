import { artAt } from "@/art/manifest";
import type { ArtStyleId } from "./artStyles";
import { AudioConvertError, toWav } from "./audio/toWav";
import { animateCharacter, drawReferenceSheet, loadCast, referenceFileTokenFor, referenceSheetFor, withReferenceFile } from "./cast";
import { layoutPages, localPanels, pageLayoutChain } from "./layout/comicPages";
import { panelFrames } from "./layout/frames";
import { detectLanguages } from "./languages";
import { applyFaceChoices, isOneOffId, newPersonKey, type FaceChoice } from "./newPeople";
import { neverAskKeys, rememberNever } from "./newPeopleChoices";
import { getDay, getImage, listDays, newId, putImage, saveCharacter, saveDay } from "./store";
import { blobToWire, wireToBlob } from "./wireImage";
import type {
  ApiError,
  CastBrief,
  Character,
  ComicPage,
  ComicScript,
  Day,
  ImageRef,
  LanguageHint,
  NewPerson,
  OneOff,
  Panel,
  PanelRequest,
  PanelResponse,
  ScriptPanel,
  ScriptRequest,
  ScriptResponse,
  StoryMode,
  TranscribeResponse,
  Transcript,
  UnitBox,
  WireImage,
  WireReference,
} from "./types";

/**
 * The client side of "make my comic": voice note -> transcript -> script ->
 * panels -> a Day saved on this device.
 *
 * Every result is kept as it arrives, so after a failure `start()` resumes at
 * the failed step (and only redraws the panels that failed). The progress
 * screen reads the state through `subscribe` / `getSnapshot`
 * (useSyncExternalStore).
 */

export const PIPELINE_STEPS = ["listen", "write", "meet", "draw", "check", "save"] as const;
export type PipelineStep = (typeof PIPELINE_STEPS)[number];
export type StepStatus = "waiting" | "active" | "done" | "skipped" | "error";

export type PanelStatus = "waiting" | "drawing" | "done" | "error";

export interface PanelProgress {
  index: number;
  /** Zero-based page the panel is on. */
  page: number;
  status: PanelStatus;
  /** Object URL of the final panel. */
  imageUrl?: string;
  /** Object URL of the panel before its face fix, when one was needed. */
  beforeUrl?: string;
  /** Names of the characters whose faces were fixed. */
  fixedNames: string[];
  /** How the panel was checked, once drawn: SAM 3.1 or practice mode. */
  method?: "sam" | "mock";
  /** With SAM: cast members looked for, found and compared with their sheet. */
  sought?: number;
  found?: number;
  judged?: number;
  error?: string;
}

export type PipelineStatus = "idle" | "running" | "error" | "cancelled" | "done";

export interface PipelineState {
  status: PipelineStatus;
  steps: Record<PipelineStep, StepStatus>;
  error: { step: PipelineStep; message: string } | null;
  transcript: Transcript | null;
  /** The script, its panels carrying the frame each is drawn for. */
  script: ComicScript | null;
  /** The pages and their layouts, picked right after the script so each page builds in its final shape. */
  pages: ComicPage[] | null;
  panels: PanelProgress[];
  /** Local date of the day being made (YYYY-MM-DD). */
  date: string;
  /** Set once the day is saved and read back from the store. */
  dayId: string | null;
  /**
   * New faces (03-06): the people in the script who aren't in the cast, while
   * the run waits for the user to say who they are (before any panel is drawn).
   */
  meeting: NewPerson[] | null;
  /** Once settled: who joined the cast and who is a one-off in this story. */
  faces: { joined: string[]; oneOffs: string[] } | null;
}

export interface PipelineInput {
  /** The voice note; null when the day was typed instead. */
  audio: Blob | null;
  /** The day written out, used instead of a voice note (no transcription). */
  text?: string;
  language: LanguageHint;
  /** How the story is told: narration, dialogue or both. */
  storyMode: StoryMode;
  /** The comic's art style; panels use each character's sheet in this style. */
  style: ArtStyleId;
}

/** Panels drawn at the same time (across all pages). */
const PANEL_CONCURRENCY = 2;
/** A typed day is cut to what /api/script accepts. */
const MAX_TYPED = 20_000;

/** A failure the progress screen can show as-is. */
class StepError extends Error {
  constructor(
    readonly step: PipelineStep,
    message: string,
    /** The API's machine-readable reason, when it gave one. */
    readonly code?: string,
  ) {
    super(message);
    this.name = "StepError";
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Today in the speaker's own time zone. */
export function localIsoDate(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* ---------- Requests ---------- */

async function request<T>(step: PipelineStep, url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new StepError(step, "Couldn't reach Comimo. Check your connection and try again.");
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Handled below.
  }
  if (!response.ok || body === null) {
    const error = body as ApiError | null;
    throw new StepError(step, error?.error || `Something went wrong (${response.status}). Try again.`, error?.code);
  }
  return body as T;
}

/* ---------- Images ---------- */

/** A character's reference sheet as a wire image: a stored Blob or a manifest file. */
async function loadReference(ref: ImageRef | null, signal: AbortSignal): Promise<WireImage | undefined> {
  if (!ref) return undefined;
  try {
    if (ref.kind === "blob") {
      const blob = await getImage(ref.id);
      return blob ? blobToWire(blob) : undefined;
    }
    const response = await fetch(artAt(ref.path).src, { signal });
    return response.ok ? blobToWire(await response.blob()) : undefined;
  } catch (error) {
    if (isAbort(error)) throw error;
    // Draw from the written look alone rather than failing the panel.
    return undefined;
  }
}

/** The template of the last page of the most recent comic on this device, so today's first page is different. */
async function previousTemplate(): Promise<string | null> {
  try {
    const days = (await listDays()).filter((day) => !day.sample && day.safety !== "crisis");
    const chain = pageLayoutChain(days);
    const last = [...days].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)).at(-1);
    return last ? (chain.get(last.id)?.at(-1)?.template ?? null) : null;
  } catch {
    return null;
  }
}

/* ---------- Cast ---------- */

function toBrief({ id, name, aliases, role, look, personality }: Character): CastBrief {
  return { id, name, role, look, personality, ...(aliases?.length ? { aliases } : {}) };
}

/** The names a panel's characters and speakers had when it was made (ISS-007), one-offs included. */
function nameSnapshot(panel: ScriptPanel, cast: Character[], oneOffs: OneOff[]): Record<string, string> {
  const names: Record<string, string> = {};
  for (const id of new Set([...panel.characterIds, ...panel.dialogue.map((line) => line.speakerId)])) {
    const member = cast.find((character) => character.id === id) ?? oneOffs.find((oneOff) => oneOff.id === id);
    if (member) names[id] = member.name;
  }
  return names;
}

/** The first panel (by index) each one-off appears in. */
function firstAppearances(script: ComicScript): Map<string, number> {
  const first = new Map<string, number>();
  for (const panel of script.panels) {
    for (const id of panel.characterIds) if (isOneOffId(id) && !first.has(id)) first.set(id, panel.index);
  }
  return first;
}

/* ---------- Pipeline ---------- */

function initialState(): PipelineState {
  return {
    status: "idle",
    steps: { listen: "waiting", write: "waiting", meet: "waiting", draw: "waiting", check: "waiting", save: "waiting" },
    error: null,
    transcript: null,
    script: null,
    pages: null,
    panels: [],
    date: localIsoDate(),
    dayId: null,
    meeting: null,
    faces: null,
  };
}

/** How a one-off looked in the panel they first appeared in: the reference for their later panels. */
interface Appearance {
  image?: WireImage;
  /** The server's signature over that panel (PanelResponse.imageToken). */
  imageToken?: string;
  /** Where SAM found them in it. */
  box?: UnitBox;
  /** Their cut-out, once the server uploaded it. */
  fileToken?: string;
}

export class ComicPipeline {
  private state: PipelineState = initialState();
  private readonly listeners = new Set<() => void>();
  private controller: AbortController | null = null;
  /** The new day's id; also seeds its page layout. */
  readonly dayId = newId();
  private readonly createdAt = new Date().toISOString();
  private cast: Character[] | null = null;
  private readonly references = new Map<string, Promise<WireImage | undefined>>();
  /** What each finished panel came back with, for building the Day. */
  private readonly drawn = new Map<number, Pick<Panel, "consistency" | "figures">>();
  private readonly urls = new Set<string>();
  /** The voice note as 16 kHz mono WAV, kept so a retry doesn't convert again. */
  private wav: Blob | null = null;
  /** True when the day was typed: there is nothing to transcribe. */
  private readonly typed: boolean;
  /** Answers the new-faces question the run is waiting on. */
  private answerFaces: ((choices: Record<string, FaceChoice>) => void) | null = null;
  /** Each one-off's first appearance, once drawn. */
  private readonly appearances = new Map<string, Appearance>();
  /** Settles when a one-off's first panel is done (or failed), so later panels can wait for it. */
  private readonly appeared = new Map<string, Promise<void>>();

  constructor(private readonly input: PipelineInput) {
    this.typed = !input.audio && Boolean(input.text?.trim());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): PipelineState => this.state;

  private set(patch: Partial<PipelineState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private setStep(step: PipelineStep, status: StepStatus) {
    this.set({ steps: { ...this.state.steps, [step]: status } });
  }

  private setPanel(index: number, patch: Partial<PanelProgress>) {
    this.set({ panels: this.state.panels.map((panel) => (panel.index === index ? { ...panel, ...patch } : panel)) });
  }

  private characterName(id: string): string {
    return this.cast?.find((member) => member.id === id)?.name ?? this.oneOff(id)?.name ?? id;
  }

  private oneOff(id: string): OneOff | undefined {
    return this.state.script?.oneOffs?.find((oneOff) => oneOff.id === id);
  }

  /**
   * The new-faces step's answer: for each person (by `NewPerson.id`), who they
   * are. People added to the cast must already be saved (their sheet drawn or
   * failed); anyone missing from `choices` is skipped (a one-off today).
   */
  chooseFaces(choices: Record<string, FaceChoice>) {
    this.answerFaces?.(choices);
  }

  /**
   * Run (or resume) the pipeline. Steps that already finished are skipped,
   * so calling this after an error retries only the failed step.
   */
  async start(): Promise<void> {
    if (this.controller || this.state.status === "done") return;
    const controller = new AbortController();
    this.controller = controller;
    const { signal } = controller;
    let step: PipelineStep = "listen";

    const steps = { ...this.state.steps };
    for (const key of PIPELINE_STEPS) if (steps[key] === "error" || steps[key] === "active") steps[key] = "waiting";
    this.set({ status: "running", error: null, steps });

    try {
      step = "listen";
      const transcript = this.state.transcript ?? (await this.transcribe(signal));

      step = "write";
      const written = this.state.script ?? (await this.writeScript(transcript, signal));

      // New faces are settled before any panel is drawn.
      step = "meet";
      const script = await this.meetNewFaces(written, signal);

      if (script.safety === "crisis") {
        this.set({ steps: { ...this.state.steps, meet: "skipped", draw: "skipped", check: "skipped" } });
      } else {
        step = "draw";
        await this.drawPanels(script, signal);
      }

      step = "save";
      await this.save(transcript, script);
      if (signal.aborted) return;
      this.set({ status: "done" });
    } catch (error) {
      if (this.controller !== controller || signal.aborted || isAbort(error)) return;
      const failed = error instanceof StepError ? error.step : step;
      const message =
        error instanceof StepError ? error.message : "Something went wrong on this step. Try again.";
      if (!(error instanceof StepError)) console.error("Comimo: pipeline step failed", error);
      const steps = { ...this.state.steps, [failed]: "error" as const };
      if (failed === "draw" && steps.check === "active") steps.check = "waiting";
      this.set({ status: "error", error: { step: failed, message }, steps });
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }

  /** Stop any request in flight. Finished work is kept, so `start()` picks up from here. */
  cancel() {
    if (!this.controller) return;
    this.controller.abort();
    this.controller = null;
    this.answerFaces = null;
    const steps = { ...this.state.steps };
    for (const key of PIPELINE_STEPS) if (steps[key] === "active") steps[key] = "waiting";
    const panels = this.state.panels.map((panel) =>
      panel.status === "drawing" ? { ...panel, status: "waiting" as const } : panel,
    );
    this.set({ status: "cancelled", steps, panels, meeting: null });
  }

  /** Cancel and free the object URLs behind the panel previews. */
  dispose() {
    this.cancel();
    this.urls.forEach((url) => URL.revokeObjectURL(url));
    this.urls.clear();
  }

  private objectUrl(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this.urls.add(url);
    return url;
  }

  /* ---------- Steps ---------- */

  /** Muse Voice Transcribe takes WAV only, so every voice note is converted here, in the browser. */
  private async voiceNoteWav(): Promise<Blob> {
    if (this.wav) return this.wav;
    if (!this.input.audio) throw new StepError("listen", "There's no voice note to listen to. Record one or type your day.");
    try {
      this.wav = (await toWav(this.input.audio)).wav;
      return this.wav;
    } catch (error) {
      if (error instanceof AudioConvertError) throw new StepError("listen", error.message);
      throw error;
    }
  }

  private async transcribe(signal: AbortSignal): Promise<Transcript> {
    this.setStep("listen", "active");
    if (this.typed) {
      // A typed day skips transcription: the text is the transcript, its languages counted here.
      const text = this.input.text!.replace(/\r\n?/g, "\n").trim().slice(0, MAX_TYPED);
      const transcript: Transcript = { text, languages: detectLanguages(text, this.input.language) };
      this.set({ transcript, steps: { ...this.state.steps, listen: "done" } });
      return transcript;
    }
    const wav = await this.voiceNoteWav();
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    this.cast ??= await loadCast();
    const form = new FormData();
    form.append("audio", wav, "voice-note.wav");
    form.append("language", this.input.language);
    // Cast names help the transcriber spell them the way the script needs them.
    // Names first, then the other names they go by, within the transcriber's 20.
    const names = [...this.cast.map((member) => member.name), ...this.cast.flatMap((member) => member.aliases ?? [])];
    form.append("keywords", JSON.stringify([...new Set(names)].slice(0, 20)));
    const { transcript } = await request<TranscribeResponse>("listen", "/api/transcribe", {
      method: "POST",
      body: form,
      signal,
    });
    this.set({ transcript, steps: { ...this.state.steps, listen: "done" } });
    return transcript;
  }

  private async writeScript(transcript: Transcript, signal: AbortSignal): Promise<ComicScript> {
    this.setStep("write", "active");
    this.cast ??= await loadCast();
    // An emptied cast is left out, so the server falls back to the starter cast instead of refusing the request.
    const cast = this.cast.slice(0, 20).map(toBrief);
    const body: ScriptRequest = {
      transcript: transcript.text,
      ...(cast.length > 0 ? { cast } : {}),
      storyMode: this.input.storyMode,
    };
    const { script } = await request<ScriptResponse>("write", "/api/script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    // Lay out every page before drawing: each panel is drawn for its slot's shape and lettering zone.
    let pages: ComicPage[] | null = null;
    let laidOut = script;
    const pageOf = new Map<number, number>();
    if (script.safety !== "crisis" && script.panels.length > 0) {
      const result = layoutPages(script.panels, script.pages, this.dayId, await previousTemplate());
      pages = result.pages;
      const framed: ScriptPanel[] = [];
      for (const slice of result.slices) {
        const frames = panelFrames(slice.layout, localPanels(slice.panels), slice.seed);
        slice.panels.forEach((panel, i) => {
          framed.push({ ...panel, frame: frames[i] });
          pageOf.set(panel.index, slice.number);
        });
      }
      laidOut = { ...script, panels: framed, pages };
    }
    const panels: PanelProgress[] = laidOut.panels.map((panel) => ({
      index: panel.index,
      page: pageOf.get(panel.index) ?? 0,
      status: "waiting",
      fixedNames: [],
    }));
    this.set({ script: laidOut, pages, panels, steps: { ...this.state.steps, write: "done" } });
    return laidOut;
  }

  /**
   * New faces (03-06): when the script has people who aren't in the cast,
   * wait for the user to say who each one is (add to the cast, a one-off for
   * this story, or never ask), then swap their placeholders in the script.
   * Names the user said "never ask" to before are one-offs without asking.
   */
  private async meetNewFaces(script: ComicScript, signal: AbortSignal): Promise<ComicScript> {
    const { meet } = this.state.steps;
    if (meet === "done" || meet === "skipped") return script;
    const people = script.safety === "crisis" ? [] : (script.newPeople ?? []);
    if (people.length === 0) {
      this.setStep("meet", "skipped");
      return script;
    }
    this.setStep("meet", "active");
    const never = await neverAskKeys().catch(() => new Set<string>());
    const keyOf = (person: NewPerson, i: number) => person.id ?? `new${i + 1}`;
    const choices: Record<string, FaceChoice> = {};
    const ask = people.filter((person, i) => {
      if (!never.has(newPersonKey(person))) return true;
      choices[keyOf(person, i)] = { kind: "never" };
      return false;
    });

    if (ask.length > 0) {
      const answered = await new Promise<Record<string, FaceChoice>>((resolve, reject) => {
        const stop = () => reject(new DOMException("Cancelled", "AbortError"));
        if (signal.aborted) return stop();
        signal.addEventListener("abort", stop, { once: true });
        this.answerFaces = (value) => {
          signal.removeEventListener("abort", stop);
          this.answerFaces = null;
          resolve(value);
        };
        this.set({ meeting: ask });
      });
      for (const person of ask) {
        const key = keyOf(person, people.indexOf(person));
        const choice = answered[key];
        if (choice) choices[key] = choice;
        if (choice?.kind === "never") void rememberNever(person).catch(() => undefined);
      }
    }

    // People who joined the cast are in the store now, with their sheets.
    this.cast = await loadCast();
    this.references.clear();
    const settled = applyFaceChoices(script, choices);
    const joined = Object.values(choices).flatMap((choice) => (choice.kind === "cast" ? [choice.name] : []));
    this.set({
      script: settled,
      meeting: null,
      faces: { joined, oneOffs: (settled.oneOffs ?? []).map((oneOff) => oneOff.name) },
      steps: { ...this.state.steps, meet: "done" },
    });
    return settled;
  }

  /** A character's sheet as an inline image, loaded once per run. */
  private referenceFor(characterId: string, signal: AbortSignal): Promise<WireImage | undefined> {
    let pending = this.references.get(characterId);
    if (!pending) {
      const character = this.cast?.find((member) => member.id === characterId);
      pending = loadReference(character ? (referenceSheetFor(character, this.input.style)?.image ?? null) : null, signal);
      this.references.set(characterId, pending);
      // Don't cache a failure caused by cancelling.
      pending.catch(() => this.references.delete(characterId));
    }
    return pending;
  }

  /** Keep (or forget, with null) the uploaded-sheet token on a character, here and in the store. */
  private async rememberReferenceFile(characterId: string, token: string | null) {
    const appearance = this.appearances.get(characterId);
    if (appearance) {
      // A one-off's uploaded cut-out lives for this comic only.
      if (token) appearance.fileToken = token;
      else delete appearance.fileToken;
      return;
    }
    const character = this.cast?.find((member) => member.id === characterId);
    const { style } = this.input;
    if (!character || (token ?? undefined) === referenceFileTokenFor(character, style)) return;
    const updated = withReferenceFile(character, style, token);
    this.cast = this.cast!.map((member) => (member.id === characterId ? updated : member));
    // Best effort: without it the next comic just uploads the sheet again.
    await saveCharacter(updated);
  }

  /** What the panel request carries for each character: an uploaded sheet's token, else the sheet itself. */
  private async referencesFor(panel: ScriptPanel, signal: AbortSignal, inline: boolean): Promise<WireReference[]> {
    const references: WireReference[] = [];
    for (const id of panel.characterIds) {
      const oneOff = this.oneOff(id);
      if (oneOff) {
        references.push(this.oneOffReference(oneOff, inline));
        continue;
      }
      const character = this.cast?.find((member) => member.id === id);
      if (!character) continue;
      const base = { characterId: id, name: character.name, look: character.look, role: character.role };
      const token = inline ? undefined : referenceFileTokenFor(character, this.input.style);
      if (token) {
        references.push({ ...base, fileToken: token });
        continue;
      }
      const image = await this.referenceFor(id, signal);
      // Drawn sheets carry the server's signature; shipped starter sheets are recognised by the server.
      const sheetToken = referenceSheetFor(character, this.input.style)?.sheetToken;
      references.push({ ...base, ...(image ? { image, ...(sheetToken ? { sheetToken } : {}) } : {}) });
    }
    return references;
  }

  /**
   * A one-off for the panel request: their look from the note and, after
   * their first panel, that panel (signed, with where they are in it) or the
   * cut-out the server uploaded from it. In their first panel they are drawn freely.
   */
  private oneOffReference(oneOff: OneOff, inline: boolean): WireReference {
    const base: WireReference = { characterId: oneOff.id, name: oneOff.name, look: oneOff.look, role: oneOff.role, oneOff: true };
    const seen = this.appearances.get(oneOff.id);
    if (!seen) return base;
    if (seen.fileToken && !inline) return { ...base, fileToken: seen.fileToken };
    if (seen.image && seen.imageToken) return { ...base, image: seen.image, sheetToken: seen.imageToken, ...(seen.box ? { box: seen.box } : {}) };
    return base;
  }

  /** Later panels with a one-off wait for their first panel, so it can be their reference. */
  private async waitForAppearances(panel: ScriptPanel, first: Map<string, number>, signal: AbortSignal) {
    const waits = panel.characterIds.flatMap((id) => (isOneOffId(id) && first.get(id) !== panel.index ? [this.appeared.get(id)] : []));
    if (waits.length === 0) return;
    await new Promise<void>((resolve, reject) => {
      const stop = () => reject(new DOMException("Cancelled", "AbortError"));
      if (signal.aborted) return stop();
      signal.addEventListener("abort", stop, { once: true });
      void Promise.all(waits).then(() => {
        signal.removeEventListener("abort", stop);
        resolve();
      });
    });
  }

  /**
   * Cast by name (03-05): a character in this comic without a sheet in its
   * style gets one drawn once, before any panel, and kept (each sheet is a
   * guarded, metered call). Their animated sprite follows in the background.
   * A sheet that fails isn't fatal: the panels draw from the written look.
   */
  private async ensureSheets(script: ComicScript, signal: AbortSignal) {
    const ids = new Set(script.panels.flatMap((panel) => panel.characterIds));
    const missing = (this.cast ?? []).filter(
      (member) => ids.has(member.id) && !referenceSheetFor(member, this.input.style) && member.look.trim().length >= 12,
    );
    await Promise.all(
      missing.map(async (member) => {
        try {
          const drawn = await drawReferenceSheet(member, this.input.style, signal);
          this.cast = (this.cast ?? []).map((m) => (m.id === drawn.id ? drawn : m));
          this.references.delete(drawn.id);
          void animateCharacter(drawn);
        } catch (error) {
          if (signal.aborted || isAbort(error)) throw error;
        }
      }),
    );
  }

  private async drawPanels(script: ComicScript, signal: AbortSignal) {
    this.cast ??= await loadCast();
    await this.ensureSheets(script, signal);
    const queue = script.panels.filter((panel) => this.state.panels.find((p) => p.index === panel.index)?.status !== "done");
    for (const panel of queue) this.setPanel(panel.index, { status: "waiting", error: undefined });

    // One-offs: a first panel still to draw settles its promise when done (or failed); otherwise there is nothing to wait for.
    const first = firstAppearances(script);
    const settle = new Map<string, () => void>();
    for (const [id, index] of first) {
      if (queue.some((panel) => panel.index === index)) {
        this.appeared.set(id, new Promise<void>((resolve) => settle.set(id, resolve)));
      } else {
        this.appeared.set(id, Promise.resolve());
      }
    }
    this.set({ steps: { ...this.state.steps, draw: "active", check: "active" } });

    let failed = 0;
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        if (signal.aborted) return;
        const firstOf = [...first].filter(([, index]) => index === next!.index).map(([id]) => id);
        try {
          await this.waitForAppearances(next, first, signal);
          await this.drawPanel(next, signal);
        } catch (error) {
          if (signal.aborted || isAbort(error)) throw error;
          failed += 1;
          const message = error instanceof StepError ? error.message : "This panel didn't draw.";
          this.setPanel(next.index, { status: "error", error: message });
        } finally {
          // Later panels go ahead either way: from this first appearance, or from the description if it failed.
          for (const id of firstOf) settle.get(id)?.();
        }
      }
    };
    await Promise.all(Array.from({ length: PANEL_CONCURRENCY }, worker));
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");

    if (failed > 0) {
      throw new StepError("draw", failed === 1 ? "One panel didn't draw. Try it again." : `${failed} panels didn't draw. Try them again.`);
    }
    this.set({ steps: { ...this.state.steps, draw: "done", check: "done" } });
  }

  private async drawPanel(panel: ComicScript["panels"][number], signal: AbortSignal) {
    this.setPanel(panel.index, { status: "drawing", error: undefined });

    const send = async (inline: boolean) => {
      const body: PanelRequest = {
        panel,
        references: await this.referencesFor(panel, signal, inline),
        style: this.input.style,
      };
      return request<PanelResponse>("draw", "/api/panel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    };

    let result: PanelResponse;
    try {
      result = await send(false);
    } catch (error) {
      if (!(error instanceof StepError && error.code === "stale-reference")) throw error;
      // An uploaded sheet expired: forget the tokens and send the sheets themselves once.
      for (const id of panel.characterIds) await this.rememberReferenceFile(id, null);
      result = await send(true);
    }
    for (const { characterId, fileToken } of result.uploaded ?? []) await this.rememberReferenceFile(characterId, fileToken);

    const image = wireToBlob(result.image);
    const before = result.consistency.before ? wireToBlob(result.consistency.before) : null;
    const imageId = `${this.dayId}-panel-${panel.index}`;
    const beforeId = `${imageId}-before`;
    const stored = (await putImage(imageId, image)) && (!before || (await putImage(beforeId, before)));
    if (!stored) {
      throw new StepError("draw", "Couldn't keep the panels on this device. Private windows can block storage.");
    }

    // A one-off's first panel becomes their reference for the rest of the comic.
    for (const id of panel.characterIds) {
      if (!isOneOffId(id) || this.appearances.has(id) || !result.imageToken) continue;
      const box = result.figures?.items.find((figure) => figure.characterId === id)?.box;
      this.appearances.set(id, { image: result.image, imageToken: result.imageToken, ...(box ? { box } : {}) });
    }

    const { method, sam } = result.consistency;
    this.drawn.set(panel.index, {
      consistency: {
        checked: method === "sam" ? sam?.checked !== false : true,
        driftedCharacterIds: result.consistency.driftedCharacterIds,
        fixedCharacterIds: result.consistency.fixedCharacterIds,
        beforeImage: before ? { kind: "blob", id: beforeId } : null,
        ...(method ? { method } : {}),
        ...(sam ? { sam } : {}),
      },
      ...(result.figures ? { figures: result.figures } : {}),
    });
    this.setPanel(panel.index, {
      status: "done",
      imageUrl: this.objectUrl(image),
      beforeUrl: before ? this.objectUrl(before) : undefined,
      fixedNames: result.consistency.fixedCharacterIds.map((id) => this.characterName(id)),
      ...(method ? { method } : {}),
      ...(sam ? { sought: sam.sought.length, found: sam.found.length, judged: sam.judged.length } : {}),
    });
  }

  private async save(transcript: Transcript, script: ComicScript) {
    this.setStep("save", "active");
    const crisis = script.safety === "crisis";
    const day: Day = {
      id: this.dayId,
      date: this.state.date,
      title: script.title.trim() || "Today",
      transcript: transcript.text,
      languages: transcript.languages,
      panels: crisis
        ? []
        : script.panels.map((panel) => ({
            ...panel,
            image: { kind: "blob", id: `${this.dayId}-panel-${panel.index}` },
            consistency: this.drawn.get(panel.index)?.consistency ?? {
              checked: false,
              driftedCharacterIds: [],
              fixedCharacterIds: [],
              beforeImage: null,
            },
            ...(this.drawn.get(panel.index)?.figures ? { figures: this.drawn.get(panel.index)!.figures } : {}),
          })),
      mood: script.mood,
      heavy: script.heavy,
      ...(script.heavy && script.checkInQuestions.length > 0
        ? { checkIn: { questions: script.checkInQuestions, answers: [] } }
        : {}),
      safety: script.safety,
      artStyle: this.input.style,
      storyMode: script.storyMode ?? this.input.storyMode,
      ...(this.state.pages?.[0]?.layout ? { layout: this.state.pages[0].layout } : {}),
      ...(this.state.pages && this.state.pages.length > 0 ? { pages: this.state.pages } : {}),
      createdAt: this.createdAt,
    };

    // Cast by name (03-05): keep each panel's names as they are today (ISS-007), and the new people to offer once.
    // New faces (03-06): one-offs are kept with the day; only people skipped before drawing are offered afterwards.
    const cast = this.cast ?? [];
    const oneOffs = crisis ? [] : (script.oneOffs ?? []);
    day.panels = day.panels.map((panel) => ({ ...panel, names: nameSnapshot(panel, cast, oneOffs) }));
    if (oneOffs.length > 0) day.oneOffs = oneOffs;
    if (!crisis && script.newPeople?.length) day.newPeople = script.newPeople;

    // Read it back: only route to the day once it is really on the device.
    const saved = (await saveDay(day)) && (await getDay(day.id));
    if (!saved) {
      throw new StepError("save", "Couldn't keep this day on this device. Private windows can block storage.");
    }
    this.set({ dayId: day.id, steps: { ...this.state.steps, save: "done" } });
  }
}
