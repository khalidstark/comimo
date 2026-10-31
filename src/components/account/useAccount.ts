"use client";

import { useSyncExternalStore } from "react";
import { closeAccountCache } from "@/lib/store";
import { rememberCacheKey, whoAmI } from "@/lib/whoami";

/**
 * Who is signed in, shared by every component on the page. The session
 * cookie is httpOnly, so the browser asks /api/auth/me once per page load.
 */
export type AccountState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; name: string };

const LOADING: AccountState = { status: "loading" };
const SIGNED_OUT: AccountState = { status: "signed-out" };

let state: AccountState = LOADING;
let requested = false;
const listeners = new Set<() => void>();

function publish(next: AccountState) {
  state = next;
  for (const listener of listeners) listener();
}

function load() {
  if (requested) return;
  requested = true;
  whoAmI()
    .then((me) => publish(me ? { status: "signed-in", name: me.name } : SIGNED_OUT))
    .catch(() => publish(SIGNED_OUT));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  load();
  return () => listeners.delete(listener);
}

export function useAccount(): AccountState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => LOADING,
  );
}

/** `?next=` checking lives in a plain module so it can be tested on its own. */
export { safeNext } from "@/lib/safeNext";

/** Sign out everywhere this session is used, then start fresh on the home page. */
export async function signOut(): Promise<void> {
  try {
    // Send anything not yet sent, then clear this account's offline copy from the browser
    // (kept when something couldn't be sent, so nothing is lost).
    await closeAccountCache().catch(() => false);
    await fetch("/api/auth/signout", { method: "POST", credentials: "same-origin" });
  } finally {
    // This device's cache of the account stays (it opens again at the next sign-in); the store stops using it now.
    rememberCacheKey(null);
    publish(SIGNED_OUT);
    // A full load on purpose: nothing from the signed-in page (router cache, prefetched routes) survives.
    window.location.replace("/");
  }
}
