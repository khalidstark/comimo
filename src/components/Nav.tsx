"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Art } from "@/art/Art";
import { Icon } from "@/art/Icon";
import { art, type IconKey } from "@/art/manifest";
import { AccountMenu } from "./account/AccountMenu";
import { PAGE_TURN } from "./PageTurn";
import { ThemeToggle } from "./ThemeToggle";
import styles from "./Nav.module.css";

interface Tab {
  href: string;
  label: string;
  icon: IconKey;
  primary?: boolean;
}

const TABS: Tab[] = [
  { href: "/", label: "Home", icon: "today" },
  { href: "/cast", label: "Cast", icon: "cast" },
  { href: "/month", label: "Month", icon: "month" },
  { href: "/record", label: "Record", icon: "record", primary: true },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Nav() {
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} transitionTypes={PAGE_TURN}>
          <Art asset={art.brand.logoMark} className={styles.brandMark} alt="" priority />
          <span className={styles.wordmark}>comimo</span>
          <span className="visually-hidden">, home</span>
        </Link>

        <nav aria-label="Main" className={styles.nav}>
          <ul className={styles.tabs}>
            {TABS.map((tab) => {
              const active = isActive(pathname, tab.href);
              return (
                <li key={tab.href} className={tab.primary ? styles.primaryItem : undefined}>
                  <Link
                    href={tab.href}
                    transitionTypes={PAGE_TURN}
                    aria-current={active ? "page" : undefined}
                    className={tab.primary ? styles.recordTab : styles.tab}
                  >
                    <span className={styles.tabIcon}>
                      <Icon name={tab.icon} />
                    </span>
                    <span className={styles.tabLabel}>{tab.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className={styles.corner}>
          <AccountMenu />
          <ThemeToggle className={styles.themeToggle} />
        </div>
      </div>
    </header>
  );
}
