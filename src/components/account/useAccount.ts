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

/** Longest wait for the offline copy to be sent and cleared before signing out anyway (another tab can hold it open). */
const CACHE_CLOSE_MS = 8_000;

/**
 * Sign out everywhere this session is used, then start fresh on the landing
 * page, signed out. Resolves false, staying on the page, when the server
 * couldn't be reached to clear the session cookie (with the cookie still
 * there, `/` would open the signed-in home again).
 */
export async function signOut(): Promise<boolean> {
  // Send anything not yet sent, then clear this account's offline copy from the browser
  // (kept when something couldn't be sent, so nothing is lost).
  await Promise.race([
    closeAccountCache().catch(() => false),
    new Promise<false>((resolve) => window.setTimeout(() => resolve(false), CACHE_CLOSE_MS)),
  ]);

  let cleared: boolean;
  try {
    const response = await fetch("/api/auth/signout", { method: "POST", credentials: "same-origin" });
    // A 503 means the store kept the session for now, but the cookie was expired all the same.
    cleared = response.ok || response.status === 503;
  } catch {
    cleared = false;
  }
  if (!cleared) return false;

  // This device's cache of the account stays when it wasn't cleared (it opens again at the next sign-in); the store stops using it now.
  rememberCacheKey(null);
  // Nothing announces "signed out" to this page first: pages that need an account would send the visitor to sign-up instead.
  // A full load on purpose: nothing from the signed-in page (router cache, prefetched routes) survives, and with the
  // cookie gone `/` is the landing page.
  window.location.replace("/");
  return true;
}
