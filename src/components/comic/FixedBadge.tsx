"use client";

import styles from "./comic.module.css";

interface FixedBadgeProps {
  /** Characters whose faces were redrawn in this panel (SAM 3.1 found them, Muse Spark judged, Muse Image redrew). */
  names: string[];
  /** True while the panel shows the before image. */
  showingBefore: boolean;
  /** Only a panel SAM 3.1 really checked says so; practice-mode fixes say "practice". */
  bySam: boolean;
  onToggle: () => void;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "a character";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * The pink "Face fixed, spotted by SAM 3.1" stamp on a panel ("Face fixed, practice" in practice mode). SAM only finds
 * the faces; Muse Spark judges them and Muse Image redraws. It is a toggle button:
 * pressing it flips the panel to the image before the fix and back.
 */
export function FixedBadge({ names, showingBefore, bySam, onToggle }: FixedBadgeProps) {
  return (
    <button
      type="button"
      className={styles.stamp}
      aria-pressed={showingBefore}
      data-before={showingBefore || undefined}
      onClick={onToggle}
    >
      <span className={styles.stampTitle}>Face fixed</span> <span className={styles.stampBy}>{bySam ? "spotted by SAM 3.1" : "practice"}</span>
      <span className="visually-hidden">: show {joinNames(names)} before the fix</span>
      <span className={styles.stampHint} aria-hidden="true">
        {showingBefore ? "Back to after" : "See before"}
      </span>
    </button>
  );
}
