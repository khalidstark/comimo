"use client";

import { useRouter } from "next/navigation";
import { AlbumEditor } from "@/components/album/AlbumEditor";
import type { OwnedAlbumView } from "@/lib/albumClient";
import styles from "./albumPage.module.css";

/** The owner's controls under their album: the same editor as on the day page. */
export function AlbumOwner({ album }: { album: OwnedAlbumView }) {
  const router = useRouter();
  return (
    <div className={styles.owner}>
      <p className={styles.ownerNote}>
        This is your album. Only you see these controls. <a className="link" href={`/day/${album.dayId}`}>Back to the comic</a>
      </p>
      <AlbumEditor
        dayId={album.dayId}
        title={album.title}
        initial={album}
        onRelinked={(next) => router.replace(`/album/${next.id}`)}
        onDeleted={() => router.push(`/day/${album.dayId}`)}
      />
    </div>
  );
}
