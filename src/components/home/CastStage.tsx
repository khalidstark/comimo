"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BidiText } from "@/components/comic/BidiText";
import { Sprite } from "@/components/Sprite";
import { starterCast } from "@/fixtures/cast";
import { firstStrongDir } from "@/lib/bidi";
import type { Character } from "@/lib/types";
import styles from "./CastStage.module.css";

const TILTS = ["-4deg", "3deg", "-2deg", "5deg"];
/** How long a sticker keeps talking after a tap. */
const TALK_MS = 2600;

function Sticker({ character, tilt, speaking, onSpeak }: { character: Character; tilt: string; speaking: boolean; onSpeak: () => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  if (!character.spriteSheet) return null;
  return (
    <li className={styles.item} style={{ "--tilt": tilt } as CSSProperties}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.sticker}
        aria-pressed={speaking}
        aria-label={`Say hi to ${character.name}`}
        onClick={onSpeak}
      >
        <Sprite sheet={character.spriteSheet} label="" hostRef={buttonRef} talking={speaking} className={styles.sprite} />
      </button>
      <p className={styles.name}>{character.name}</p>
      <p className={styles.role}>{character.roleLabel}</p>
      {character.line ? (
        <p className={`bubble ${styles.line}`} data-on={speaking || undefined} aria-hidden={!speaking || undefined}>
          <span className={styles.text} dir={firstStrongDir(character.line) ?? "ltr"}>
            <BidiText text={character.line} />
          </span>
        </p>
      ) : null}
    </li>
  );
}

/**
 * The starter cast as die-cut stickers. Hover or tap and they wave; tap and
 * they say their line in a bubble, talking while it shows.
 */
export function CastStage() {
  const [speaker, setSpeaker] = useState<string | null>(null);

  useEffect(() => {
    if (!speaker) return;
    const timer = setTimeout(() => setSpeaker(null), TALK_MS);
    return () => clearTimeout(timer);
  }, [speaker]);

  const current = starterCast.find((c) => c.id === speaker);

  return (
    <>
      <ul className={styles.stage}>
        {starterCast.map((character, i) => (
          <Sticker
            key={character.id}
            character={character}
            tilt={TILTS[i % TILTS.length]}
            speaking={speaker === character.id}
            onSpeak={() => setSpeaker(character.id)}
          />
        ))}
      </ul>
      <p className="visually-hidden" aria-live="polite">
        {current?.line ? `${current.name}: ${current.line}` : ""}
      </p>
    </>
  );
}
