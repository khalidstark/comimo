"use client";

import { useSyncExternalStore } from "react";

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
  fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" })
    .then((response) => response.json() as Promise<{ user?: { name?: unknown } | null }>)
    .then((body) => {
      const name = body.user?.name;
      publish(typeof name === "string" ? { status: "signed-in", name } : SIGNED_OUT);
    })
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
    await fetch("/api/auth/signout", { method: "POST", credentials: "same-origin" });
  } finally {
    publish(SIGNED_OUT);
    // A full load on purpose: nothing from the signed-in page (router cache, prefetched routes) survives.
    window.location.replace("/");
  }
}
