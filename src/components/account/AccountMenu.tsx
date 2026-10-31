"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/art/Icon";
import { PAGE_TURN } from "../PageTurn";
import { signOut, useAccount } from "./useAccount";
import styles from "./AccountMenu.module.css";

/** First letter of the name for the little avatar sticker (Arabic or Latin). */
function initial(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? "?";
}

/**
 * The account corner of the nav: "Sign in" when signed out; the person's name
 * with a small menu (My comics, Sign out) when signed in. A disclosure, not
 * an ARIA menu: it holds a link and a button, reached with Tab, closed with
 * Escape or a click outside.
 */
export function AccountMenu() {
  const account = useAccount();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Close after navigating (adjusting state during render, not in an effect).
  if (open && openedAt !== pathname) {
    setOpen(false);
    setOpenedAt(pathname);
  }

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (account.status === "loading") return <span className={styles.placeholder} aria-hidden="true" />;

  if (account.status === "signed-out") {
    const here = pathname === "/signin" || pathname === "/signup";
    return (
      <Link href="/signin" className={styles.signIn} transitionTypes={PAGE_TURN} aria-current={here ? "page" : undefined}>
        Sign in
      </Link>
    );
  }

  return (
    <div ref={rootRef} className={styles.root} onBlur={(event) => {
      if (open && !rootRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          setOpenedAt(pathname);
          setOpen((value) => !value);
        }}
      >
        <span className={styles.avatar} aria-hidden="true">
          {initial(account.name)}
        </span>
        <span className={styles.name} dir="auto">
          {account.name}
        </span>
        <span className="visually-hidden">, account menu</span>
        <span className={styles.caret} aria-hidden="true" />
      </button>

      <div id={menuId} className={styles.menu} hidden={!open}>
        <p className={styles.who} dir="auto">
          Signed in as <strong>{account.name}</strong>
        </p>
        <ul className={styles.items}>
          <li>
            <Link href="/month" className={styles.item} transitionTypes={PAGE_TURN} onClick={() => setOpen(false)}>
              <Icon name="bookOpen" size="1.2em" />
              My comics
            </Link>
          </li>
          <li>
            <button
              type="button"
              className={styles.item}
              disabled={leaving}
              onClick={() => {
                setLeaving(true);
                void signOut();
              }}
            >
              <span className={styles.exit} aria-hidden="true" />
              {leaving ? "Signing out…" : "Sign out"}
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
