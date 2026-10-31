"use client";

import { useEffect } from "react";
import { useAccount } from "./useAccount";

/**
 * For pages that need an account. The proxy already sends visitors without
 * a session cookie to sign-up; this catches a cookie that has expired or was
 * signed out elsewhere, and sends them the same way (then back here).
 */
export function RequireAccount() {
  const account = useAccount();
  useEffect(() => {
    if (account.status !== "signed-out") return;
    const here = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/signup?next=${encodeURIComponent(here)}`);
  }, [account.status]);
  return null;
}
