import { Art } from "@/art/Art";
import type { FacesSummary, FixedFace, PanelArt } from "./view";
import styles from "./comic.module.css";

function Portrait({ art }: { art: PanelArt }) {
  if (art.kind === "art") return <Art asset={art.asset} alt="" sizes="3rem" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={art.src} alt="" />;
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** "Karim, panel 4" / "Karim, panels 2 and 5". */
function where(face: FixedFace): string {
  return `${face.name}, ${face.panels.length === 1 ? "panel" : "panels"} ${list(face.panels.map(String))}`;
}

/** The note's first lines: exactly what SAM 3.1 and Muse Spark did, from the counts stored on the panels. */
function SamLede({ summary }: { summary: Extract<FacesSummary, { kind: "sam" }> }) {
  const fixedCount = summary.fixed.reduce((sum, face) => sum + face.panels.length, 0);
  const found =
    summary.sought > 0
      ? `SAM 3.1 found ${count(summary.found, "face")} across ${count(summary.panels, "panel")}${summary.found < summary.sought ? ` (it looked for ${summary.sought})` : ""}`
      : `SAM 3.1 looked at ${count(summary.panels, "panel")} and found none of the cast in them`;
  let rest: string;
  if (!summary.compared) {
    rest = "; it kept the lettering off them, and the face comparison was switched off for this comic.";
  } else if (fixedCount > 0) {
    rest = `; ${fixedCount} ${fixedCount === 1 ? "was" : "were"} redrawn: ${summary.fixed.map(where).join("; ")}.`;
  } else if (summary.unfixed > 0) {
    rest = `; Muse Spark saw ${count(summary.unfixed, "face")} drift from the cast sheets, but no redraw came closer, so ${summary.unfixed === 1 ? "that panel stays" : "those panels stay"} as first drawn.`;
  } else if (summary.judged > 0) {
    rest = `; Muse Spark compared ${summary.judged === 1 ? "it" : `all ${summary.judged}`} with the cast's reference sheets and nothing needed redrawing.`;
  } else {
    rest = ", and kept the lettering off them.";
  }
  return (
    <p className={styles.facesLede}>
      {found}
      {rest}
    </p>
  );
}

/**
 * "How Comimo kept faces the same": what SAM 3.1 found in this comic's panels
 * and which faces were redrawn, with links to those panels. Practice-mode
 * comics say so and never mention SAM; days made before the real check have
 * no note (see facesSummary).
 */
export function FacesNote({ summary }: { summary: FacesSummary }) {
  const faces = summary.fixed;
  return (
    <section className={styles.faces} aria-labelledby="faces-title">
      <h2 id="faces-title" className={styles.facesTitle}>
        How Comimo kept faces the same
      </h2>
      {summary.kind === "sam" ? (
        <SamLede summary={summary} />
      ) : (
        <p className={styles.facesLede}>
          {faces.length > 0
            ? "This comic was made in practice mode, so no model checked the faces. The fixes below are pretend, to show how the check works."
            : "This comic was made in practice mode, so no model checked the faces."}
        </p>
      )}
      {faces.length > 0 ? (
        <>
          <ul className={styles.facesList}>
            {faces.map((face) => (
              <li key={face.characterId} className={styles.faceItem}>
                <span className={styles.facePortrait} aria-hidden="true">
                  {face.portrait ? <Portrait art={face.portrait} /> : null}
                </span>
                <span>
                  <span className={styles.faceName} dir="auto">
                    {face.name}
                  </span>
                  <span className={styles.faceWhere}>
                    {summary.kind === "sam" ? "Redrawn in " : "Pretend fix in "}
                    {face.panels.map((n, i) => (
                      <span key={n}>
                        {i > 0 ? (i === face.panels.length - 1 ? " and " : ", ") : null}
                        <a className="link" href={`#panel-${n}`}>
                          panel {n}
                        </a>
                      </span>
                    ))}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className={styles.facesHint}>Press the pink stamp on a panel to see it before the fix.</p>
        </>
      ) : null}
    </section>
  );
}
