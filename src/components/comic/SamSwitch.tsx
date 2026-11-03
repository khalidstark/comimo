"use client";

import { useEffect, useState } from "react";
import styles from "./comic.module.css";

/**
 * "Show what SAM 3.1 saw": draws the boxes SAM found on every panel of the
 * comic (from what is stored with each panel), names the cast it matched,
 * and marks heads, then takes the reader up to the first panel.
 */
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
        if (!on) document.getElementById("panel-1")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
    >
      <span className={styles.samSwitchKnob} aria-hidden="true" />
      {on ? "Hide what SAM 3.1 saw" : "Show what SAM 3.1 saw on the panels"}
    </button>
  );
}
