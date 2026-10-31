"use client";

import Link from "next/link";
import { PAGE_TURN } from "../PageTurn";
import { useAccount } from "./useAccount";

/** "Start your comic book" for visitors without an account; nothing once signed in. */
export function StartNudge({ className }: { className?: string }) {
  const account = useAccount();
  if (account.status !== "signed-out") return null;
  return (
    <Link href="/signup?next=%2Frecord" className={className} transitionTypes={PAGE_TURN}>
      Start your comic book
    </Link>
  );
}
