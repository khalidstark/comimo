"use client";

import { useEffect } from "react";
import { useAccount } from "./useAccount";

/**
 * For pages that need an account. The proxy already sends visitors without
 * a session cookie to sign-up; this catches a cookie that has expired or was
 * signed out elsewhere. Whoever holds one already has an account, so they go
 * to sign-in (then back here), not to "Start your comic book".
 */
export function RequireAccount() {
  const account = useAccount();
  useEffect(() => {
    if (account.status !== "signed-out") return;
    const here = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/signin?next=${encodeURIComponent(here)}`);
  }, [account.status]);
  return null;
}
