import { Art } from "@/art/Art";
import type { ArtAsset } from "@/art/manifest";
import { PageTurn } from "@/components/PageTurn";
import { AuthForm } from "./AuthForm";
import styles from "./auth.module.css";

interface AuthShellProps {
  mode: "signin" | "signup";
  kicker: string;
  title: string;
  lede: string;
  art: ArtAsset;
  bubble: string;
}

/**
 * One screen: a comic panel with a picture and a speech bubble beside a
 * printed form card. On phones the panel shrinks to a strip above the form.
 */
export function AuthShell({ mode, kicker, title, lede, art, bubble }: AuthShellProps) {
  return (
    <PageTurn>
      <main id="main" className={`page ${styles.main}`}>
        <div className={styles.layout}>
          <figure className={`panel halftone ${styles.artPanel}`} aria-hidden="true">
            <Art asset={art} className={styles.art} alt="" sizes="(min-width: 48rem) 40vw, 60vw" priority />
            <p className={`bubble bubble--tail-end ${styles.bubble}`}>{bubble}</p>
          </figure>

          <section className={`panel ${styles.card}`} aria-labelledby="auth-title">
            <p className={`caption ${styles.kicker}`}>{kicker}</p>
            <h1 id="auth-title" className={styles.title}>
              {title}
            </h1>
            <p className={styles.lede}>{lede}</p>
            <AuthForm mode={mode} />
          </section>
        </div>
      </main>
    </PageTurn>
  );
}
