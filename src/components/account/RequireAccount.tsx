"use client";

import { useEffect } from "react";
import { useAccount } from "./useAccount";

const LANDING_TRY_KEY = "comimo-landing-try";

/**
 * True the first time in a minute: /api/auth/me has just expired the dead
 * cookie, so loading `/` again shows the landing page. A second try that soon
 * means the cookie stayed (the store couldn't be reached), so it goes to
 * sign-in instead of round and round.
 */
function firstLandingTry(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(LANDING_TRY_KEY));
    if (Number.isFinite(last) && Date.now() - last < 60_000) {
      window.sessionStorage.removeItem(LANDING_TRY_KEY);
      return false;
    }
    window.sessionStorage.setItem(LANDING_TRY_KEY, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

/**
 * For pages that need an account. The proxy already sends visitors without
 * a session cookie to sign-up; this catches a cookie that has expired or was
 * signed out elsewhere. Whoever holds one already has an account, so they go
 * to sign-in (then back here), not to "Start your comic book". At `/` they
 * get the landing page back instead, like any visitor.
 */
export function RequireAccount() {
  const account = useAccount();
  useEffect(() => {
    if (account.status !== "signed-out") return;
    if (window.location.pathname === "/" && firstLandingTry()) {
      window.location.replace("/");
      return;
    }
    const here = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/signin?next=${encodeURIComponent(here)}`);
  }, [account.status]);
  return null;
}
