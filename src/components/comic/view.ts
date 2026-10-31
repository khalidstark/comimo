import type { ArtAsset } from "@/art/manifest";
import type { Panel, PanelFigures, TextDir } from "@/lib/types";

/**
 * What the comic components draw: a Day's panels with names looked up and
 * image refs resolved to something an <img> can show. Built on the server for
 * the sample days and in the browser for days kept in IndexedDB.
 */

export type PanelArt =
  /** A manifest slot (sample days, placeholders). */
  | { kind: "art"; asset: ArtAsset }
  /** An object URL for a Blob from the on-device store. */
  | { kind: "url"; src: string };

/** Physical side of the panel the speaker stands on; the bubble's tail points there. */
export type TailSide = "left" | "right";

export interface BubbleView {
  speakerId: string;
  speaker: string;
  text: string;
  dir: TextDir;
  tail: TailSide;
}

export interface PanelView {
  index: number;
  scene: string;
  /** The caption box's text: the panel's narration when it has one, else its caption. */
  caption?: string;
  /** True when the caption box holds first-person narration (lettered like a graphic novel). */
  narrated: boolean;
  /** A memory: tinted and framed as a flashback. */
  flashback: boolean;
  /** The first panel back in the present after a flashback. */
  returning: boolean;
  bubbles: BubbleView[];
  image: PanelArt | null;
  /** The panel before SAM's face fix; null when nothing was fixed. */
  before: PanelArt | null;
  /** Names of the characters whose faces were fixed in this panel. */
  fixedNames: string[];
  /** What checked the panel: SAM 3.1, practice mode, or nothing recorded (days before 03-03). */
  checkedBy: "sam" | "mock" | null;
  /** People and animals SAM found, for placing the lettering; null on older days. */
  figures: PanelFigures | null;
  /** Width over height of the drawn image, when known. */
  aspect: number | null;
}

/** One character SAM redrew somewhere in the day. */
export interface FixedFace {
  characterId: string;
  name: string;
  portrait: PanelArt | null;
  /** One-based panel numbers. */
  panels: number[];
}

/**
 * Characters are drawn left to right in `characterIds` order, so a speaker in
 * the first half stands on the left. A lone or off-panel speaker (a phone
 * call, a voice from the next room) alternates sides by bubble order.
 */
export function tailSide(speakerId: string, characterIds: string[], bubbleIndex: number): TailSide {
  const at = characterIds.indexOf(speakerId);
  const alternate: TailSide = bubbleIndex % 2 === 0 ? "left" : "right";
  if (at === -1 || characterIds.length < 2) return alternate;
  const position = (at + 0.5) / characterIds.length;
  if (position === 0.5) return alternate;
  return position < 0.5 ? "left" : "right";
}

export function toPanelViews(
  panels: Panel[],
  nameOf: (characterId: string) => string,
  resolve: (panel: Panel, which: "image" | "before") => PanelArt | null,
): PanelView[] {
  return [...panels]
    .sort((a, b) => a.index - b.index)
    .map((panel, i, sorted) => {
      const before = panel.consistency.beforeImage ? resolve(panel, "before") : null;
      return {
        index: panel.index,
        scene: panel.scene,
        caption: panel.narration || panel.caption,
        narrated: Boolean(panel.narration),
        flashback: panel.flashback === true,
        returning: panel.flashback !== true && i > 0 && sorted[i - 1].flashback === true,
        bubbles: panel.dialogue.map((line, i) => ({
          speakerId: line.speakerId,
          speaker: nameOf(line.speakerId),
          text: line.text,
          dir: line.dir,
          tail: tailSide(line.speakerId, panel.characterIds, i),
        })),
        image: panel.image ? resolve(panel, "image") : null,
        before,
        fixedNames: before ? panel.consistency.fixedCharacterIds.map(nameOf) : [],
        checkedBy: panel.consistency.method ?? null,
        figures: panel.figures ?? null,
        aspect: panel.figures?.aspect ?? panel.frame?.aspect ?? null,
      };
    });
}

/** Every character SAM fixed in the day, with the panels it fixed them in. */
export function fixedFaces(
  panels: Panel[],
  nameOf: (characterId: string) => string,
  portraitOf: (characterId: string) => PanelArt | null,
): FixedFace[] {
  const faces = new Map<string, FixedFace>();
  for (const panel of [...panels].sort((a, b) => a.index - b.index)) {
    if (!panel.consistency.beforeImage) continue;
    for (const id of panel.consistency.fixedCharacterIds) {
      const face = faces.get(id) ?? { characterId: id, name: nameOf(id), portrait: portraitOf(id), panels: [] };
      face.panels.push(panel.index + 1);
      faces.set(id, face);
    }
  }
  return [...faces.values()];
}

/**
 * What the "How Comimo kept faces the same" note may truthfully say about a day:
 * - "sam": SAM 3.1 really looked (counts are what it found on the final panels);
 * - "practice": made in practice mode (the fixes are pretend), or made before
 *   03-03 with fixes, which only practice mode could make;
 * - null: made before 03-03 with nothing to show, so the note is left out.
 */
export type FacesSummary =
  | {
      kind: "sam";
      /** Panels SAM looked at. */
      panels: number;
      /** Cast faces SAM looked for and found. */
      sought: number;
      found: number;
      /** Faces Muse Spark compared with their sheet. */
      judged: number;
      /** False when the comparison was switched off (COMIMO_SAM_CHECK=0). */
      compared: boolean;
      /** Faces that drifted but no redraw got closer. */
      unfixed: number;
      fixed: FixedFace[];
    }
  | { kind: "practice"; fixed: FixedFace[] };

export function facesSummary(panels: Panel[], fixed: FixedFace[]): FacesSummary | null {
  const sam = panels.filter((panel) => panel.consistency.method === "sam" && panel.consistency.sam);
  if (sam.length > 0) {
    const reports = sam.map((panel) => panel.consistency.sam!);
    const fixedCount = sam.reduce((sum, panel) => sum + (panel.consistency.beforeImage ? panel.consistency.fixedCharacterIds.length : 0), 0);
    const drifted = sam.reduce((sum, panel) => sum + panel.consistency.driftedCharacterIds.length, 0);
    return {
      kind: "sam",
      panels: sam.length,
      sought: reports.reduce((sum, r) => sum + r.sought.length, 0),
      found: reports.reduce((sum, r) => sum + r.found.length, 0),
      judged: reports.reduce((sum, r) => sum + r.judged.length, 0),
      compared: reports.some((r) => r.checked),
      unfixed: Math.max(0, drifted - fixedCount),
      fixed,
    };
  }
  if (panels.some((panel) => panel.consistency.method === "mock") || fixed.length > 0) return { kind: "practice", fixed };
  return null;
}
