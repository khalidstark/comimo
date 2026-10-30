import type { ArtAsset } from "@/art/manifest";
import type { Panel, TextDir } from "@/lib/types";

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
  caption?: string;
  bubbles: BubbleView[];
  image: PanelArt | null;
  /** The panel before SAM's face fix; null when nothing was fixed. */
  before: PanelArt | null;
  /** Names of the characters whose faces were fixed in this panel. */
  fixedNames: string[];
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
    .map((panel) => {
      const before = panel.consistency.beforeImage ? resolve(panel, "before") : null;
      return {
        index: panel.index,
        scene: panel.scene,
        caption: panel.caption,
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
