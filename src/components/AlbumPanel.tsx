"use client";

import { useAccount } from "@/components/account/useAccount";
import { AlbumEditor } from "@/components/album/AlbumEditor";

/**
 * The day page's photo album: for the signed-in owner of a stored day. Sample
 * days and signed-out visitors don't get one.
 */
export function AlbumPanel({ dayId, title }: { dayId: string; title: string }) {
  const account = useAccount();
  if (account.status !== "signed-in") return null;
  return <AlbumEditor dayId={dayId} title={title} />;
}
