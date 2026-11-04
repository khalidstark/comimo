"use client";

import { useEffect, useState } from "react";
import styles from "./comic.module.css";

/**
 * "Show what SAM 3.1 saw": draws the boxes SAM found on every panel of the
 * comic (from what is stored with each panel), names the cast it matched,
 * and marks heads, then takes the reader up to the first panel.
 */
/**
 * Up to the first panel. On a later page it isn't on screen, so go by
 * "#panel-1", which the comic book follows by turning back to page 1.
 */
function toFirstPanel() {
  const first = document.getElementById("panel-1");
  if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
  else if (window.location.hash === "#panel-1") window.dispatchEvent(new HashChangeEvent("hashchange"));
  else window.location.hash = "#panel-1";
}

export function SamSwitch() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    if (on) root.dataset.sam = "on";
    else delete root.dataset.sam;
    return () => {
      delete root.dataset.sam;
    };
  }, [on]);
  return (
    <button
      type="button"
      className={styles.samSwitch}
      aria-pressed={on}
      onClick={() => {
        setOn((value) => !value);
        if (!on) toFirstPanel();
      }}
    >
      <span className={styles.samSwitchKnob} aria-hidden="true" />
      {on ? "Hide what SAM 3.1 saw" : "Show what SAM 3.1 saw on the panels"}
    </button>
  );
}
