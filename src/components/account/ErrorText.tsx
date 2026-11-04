"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { SIGN_IN_ERROR, needsSignIn } from "@/lib/signIn";

const noSubscribe = () => () => {};
const readHere = () => `${window.location.pathname}${window.location.search}`;

/**
 * An error message from an API call. When the session ran out mid-flow,
 * "Sign in" becomes a link to sign-in that comes back to this page after.
 */
export function ErrorText({ message }: { message: string }) {
  const here = useSyncExternalStore(noSubscribe, readHere, () => "/");
  if (!needsSignIn(message)) return message;
  return (
    <>
      <Link href={`/signin?next=${encodeURIComponent(here)}`} className="link">
        Sign in
      </Link>
      {SIGN_IN_ERROR.slice("Sign in".length)}
    </>
  );
}
