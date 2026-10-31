import "server-only";
import { ART_STYLES } from "@/lib/artStyles";
import type { CharacterRole } from "@/lib/types";
import type { ModelCallContext, ModelImage } from "../index";
import { baseRequest, dataUrl, requestImage } from "./image";
import type { SpritePoses } from "@/lib/sprites/assemble";

/**
 * Five Muse Image poses for a character's animated sprite: a full-body idle
 * pose drawn from their reference sheet, then small edits of it (eyes
 * closed, mouth open, a hand up, the hand tilted). Each is one metered image
 * call ($0.01), five per character. Everything sits on a flat chroma colour
 * that src/lib/sprites/assemble.ts keys out.
 */

const NO_TEXT = "No text anywhere in the image: no letters, words, numbers, signs, labels, logos, captions or speech bubbles.";

/** The zine look without its paper, since the sprite is cut out and laid on the page. */
const CUTOUT_STYLE = ART_STYLES.zine.prompt.replace(" on cool newsprint off-white paper #eceff2", "").replace(" a little paper grain,", "");

const KEEP = "Change nothing else: identical character, pose, position, size, framing, colours, line work and background.";

/** Portrait aspect for a standing figure (the generator picks the pixels). */
const POSE_SIZE = "1000x1200";

export interface SpriteSubject {
  name: string;
  role: CharacterRole;
  look: string;
}

/** Green when the character wears pink or magenta, so the key never eats their clothes. */
function keyColour(look: string): { name: string; hex: string } {
  return /pink|magenta|fuchsia|rose|purple|violet|lilac/i.test(look) ? { name: "green", hex: "#00FF00" } : { name: "magenta", hex: "#FF00FF" };
}

function backdrop({ name, hex }: { name: string; hex: string }): string {
  return `Background: one perfectly flat, solid, pure ${name} (${hex}) colour filling the whole image edge to edge, like a chroma-key screen: no floor, no ground shadow, no cast shadow, no gradient, no texture, no vignette, no frame or border. Never use this ${name} anywhere on the character.`;
}

/** How much of the figure, from the top, the blink and talk frames may change. */
export function headRegionFor(role: CharacterRole): number {
  return role === "pet" ? 0.5 : 0.33;
}

export async function drawSpritePoses(subject: SpriteSubject, sheet: ModelImage, context?: ModelCallContext): Promise<SpritePoses> {
  const pet = subject.role === "pet";
  const key = keyColour(subject.look);
  const pose = pet
    ? "sitting upright and facing the viewer, slightly turned, front paws together, tail curled around the paws, eyes open, mouth closed in a content little smile"
    : "standing in a relaxed pose and facing the viewer, turned very slightly, both arms relaxed down at the sides, eyes open, mouth closed in a friendly smile";

  const idlePrompt = [
    `A single character sprite of ${subject.name} (reference image 1) for an animated sticker, full body, ${pose}.`,
    "The reference image is a character sheet showing this character from the front and from three-quarters. Draw them exactly as on the sheet: same face, hair, glasses, clothes, colours and body shape. Do not copy the sheet's layout.",
    `Look: ${subject.look}`,
    "Exactly one character, centred, the whole body visible with wide empty margins on every side: the character fills only about 70% of the image height and nothing touches the edges. Nothing else in the picture: no props, no scenery, no floor.",
    CUTOUT_STYLE,
    backdrop(key),
    NO_TEXT,
  ].join("\n");

  const base = { ...baseRequest(context), size: POSE_SIZE };
  const idle = await requestImage("/images/edits", { ...base, prompt: idlePrompt, images: [{ image_url: dataUrl(sheet) }] }, context);

  // Small edits of the idle pose: one pass each is enough and quicker (same price).
  const edit = (change: string, from: ModelImage) =>
    requestImage(
      "/images/edits",
      { ...base, reasoning_strength: "low", prompt: [`Edit this image: ${change}`, KEEP, backdrop(key), NO_TEXT].join("\n"), images: [{ image_url: dataUrl(from) }] },
      context,
    );

  const [blink, talk, wave1] = await Promise.all([
    edit("close the character's eyes in a relaxed blink, drawn as two soft curved lines.", idle),
    edit(pet ? "open the animal's mouth in a small happy sound." : "open the character's mouth wide as if cheerfully saying a word mid-sentence.", idle),
    edit(
      pet
        ? "the animal lifts one front paw up beside its face as if waving hello; the rest of its body stays sitting exactly where it is."
        : "the character raises one hand up beside the head with an open palm, waving hello; feet, legs, body and the other arm stay exactly where they are.",
      idle,
    ),
  ]);
  const wave2 = await edit("tilt the raised waving hand the other way at the wrist, mid-wave, as the next moment of the same wave.", wave1);

  return { idle: idle.data, blink: blink.data, talk: talk.data, wave1: wave1.data, wave2: wave2.data };
}
