import type { Metadata } from "next";
import { Art } from "@/art/Art";
import { Icon } from "@/art/Icon";
import { art, artAt } from "@/art/manifest";
import { BidiText } from "@/components/comic/BidiText";
import { PageTurn } from "@/components/PageTurn";
import { starterCast } from "@/fixtures/cast";
import { firstStrongDir } from "@/lib/bidi";
import styles from "./cast.module.css";

export const metadata: Metadata = { title: "Your cast" };

const TILTS = ["-3deg", "2deg", "-1.5deg", "3deg"];

export default function CastPage() {
  return (
    <PageTurn>
      <main id="main" className="page">
        <header className="page-head">
          <h1>Your cast</h1>
          <p className="page-head__lede">
            Make them once and they star in every comic, looking the same in every panel. This starter cast is
            here until you make your own.
          </p>
        </header>

        <ul className={styles.grid}>
          {starterCast.map((member, i) => (
            <li key={member.id} className={styles.member} style={{ "--tilt": TILTS[i % TILTS.length] } as React.CSSProperties}>
              <div className={`sticker ${styles.sprite}`}>
                {member.portrait.kind === "art" ? (
                  <Art asset={artAt(member.portrait.path)} alt="" sizes="(min-width: 48rem) 16rem, 45vw" />
                ) : null}
              </div>
              <div className={styles.info}>
                <h2 className={styles.name} dir="auto">
                  {member.name}
                </h2>
                <p className="chip">{member.roleLabel}</p>
                <p className={`bubble ${styles.line}`} dir={firstStrongDir(member.line ?? "") ?? "auto"}>
                  {member.line ? <BidiText text={member.line} /> : null}
                </p>
              </div>
            </li>
          ))}

          <li className={styles.add}>
            <Art asset={art.empty.cast} className={styles.addArt} alt="" />
            <h2 className={styles.addTitle}>Add someone from your life</h2>
            <p className={styles.addBody}>
              A name, how they look, how they talk. Comimo draws a reference sheet so they stay recognisable.
            </p>
            <button type="button" className="btn btn--accent" aria-disabled="true" aria-describedby="add-note">
              <Icon name="plus" size="1.1em" />
              Add a character
            </button>
            <p id="add-note" className={styles.note}>
              The character maker opens in a later build.
            </p>
          </li>
        </ul>
      </main>
    </PageTurn>
  );
}
