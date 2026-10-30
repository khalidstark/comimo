"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "@/art/Icon";

const STORAGE_KEY = "comimo-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function isDarkNow(): boolean {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "dark") return true;
  if (chosen === "light") return false;
  return window.matchMedia(DARK_QUERY).matches;
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}

export function ThemeToggle({ className }: { className?: string }) {
  const dark = useSyncExternalStore(subscribe, isDarkNow, () => false);

  function toggle() {
    const next = isDarkNow() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode: the choice simply lasts for this visit.
    }
  }

  return (
    <button type="button" className={className} aria-pressed={dark} onClick={toggle}>
      <Icon name="theme" size="1.25em" />
      <span className="visually-hidden">Dark theme</span>
    </button>
  );
}
