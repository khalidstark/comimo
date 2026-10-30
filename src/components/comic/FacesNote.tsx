import { Art } from "@/art/Art";
import type { FixedFace, PanelArt } from "./view";
import styles from "./comic.module.css";

function Portrait({ art }: { art: PanelArt }) {
  if (art.kind === "art") return <Art asset={art.asset} alt="" sizes="3rem" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={art.src} alt="" />;
}

/**
 * "How Comimo kept faces the same": which characters SAM 3.1 redrew today and
 * where, with links to those panels. Shown only for days that were checked.
 */
export function FacesNote({ faces }: { faces: FixedFace[] }) {
  return (
    <section className={styles.faces} aria-labelledby="faces-title">
      <h2 id="faces-title" className={styles.facesTitle}>
        How Comimo kept faces the same
      </h2>
      {faces.length > 0 ? (
        <>
          <p className={styles.facesLede}>
            After each panel was drawn, SAM 3.1 compared every face with the cast&apos;s reference sheets. Where a face
            had drifted, it was redrawn to match.
          </p>
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
                    Fixed in{" "}
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
      ) : (
        <p className={styles.facesLede}>
          After each panel was drawn, SAM 3.1 compared every face with the cast&apos;s reference sheets. Every face
          already matched, so nothing needed redrawing.
        </p>
      )}
    </section>
  );
}
