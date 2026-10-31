import type { RecordKind, RemoteIndex } from "./sync";

/**
 * The browser side of /api/me/*: the signed-in account's comic book on the
 * server. Every call is same-origin with the session cookie; none of them
 * throws (a failure is `null` / `false`), so the on-device store keeps
 * working offline and the next sync catches up.
 */

const OPTIONS: RequestInit = { credentials: "same-origin", cache: "no-store" };

function path(kind: RecordKind, id: string): string {
  return `/api/me/${kind}/${encodeURIComponent(id)}`;
}

export async function fetchLibrary(): Promise<RemoteIndex | null> {
  try {
    const response = await fetch("/api/me/library", OPTIONS);
    return response.ok ? ((await response.json()) as RemoteIndex) : null;
  } catch {
    return null;
  }
}

export async function fetchRecord<T>(kind: RecordKind, id: string): Promise<T | null> {
  try {
    const response = await fetch(path(kind, id), OPTIONS);
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

/** "ok" when saved, "stale" when the server has a newer copy, "failed" otherwise. */
export async function pushRecord(kind: RecordKind, record: { id: string }): Promise<"ok" | "stale" | "failed"> {
  try {
    const response = await fetch(path(kind, record.id), {
      ...OPTIONS,
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    if (response.ok) return "ok";
    return response.status === 409 ? "stale" : "failed";
  } catch {
    return "failed";
  }
}

export async function deleteRemoteRecord(kind: RecordKind, id: string, at: string): Promise<boolean> {
  try {
    const response = await fetch(`${path(kind, id)}?at=${encodeURIComponent(at)}`, { ...OPTIONS, method: "DELETE" });
    // 404: the server never had it, which is as good as deleted.
    return response.ok || response.status === 404 || response.status === 409;
  } catch {
    return false;
  }
}

export async function fetchMeta(key: string): Promise<{ u: string; v: string | number | boolean } | null> {
  try {
    const response = await fetch(`/api/me/meta/${encodeURIComponent(key)}`, OPTIONS);
    return response.ok ? ((await response.json()) as { u: string; v: string | number | boolean }) : null;
  } catch {
    return null;
  }
}

export async function pushMeta(key: string, u: string, v: string | number | boolean): Promise<boolean> {
  try {
    const response = await fetch(`/api/me/meta/${encodeURIComponent(key)}`, {
      ...OPTIONS,
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ u, v }),
    });
    return response.ok || response.status === 409;
  } catch {
    return false;
  }
}

export async function fetchImage(id: string): Promise<Blob | null> {
  try {
    const response = await fetch(`/api/me/images/${encodeURIComponent(id)}`, OPTIONS);
    return response.ok ? await response.blob() : null;
  } catch {
    return null;
  }
}

export async function pushImage(id: string, blob: Blob): Promise<boolean> {
  try {
    const response = await fetch(`/api/me/images/${encodeURIComponent(id)}`, {
      ...OPTIONS,
      method: "PUT",
      headers: { "Content-Type": blob.type || "application/octet-stream" },
      body: blob,
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Run tasks at most `limit` at a time; resolves when all have settled. */
export async function inBatches<T>(items: T[], limit: number, task: (item: T) => Promise<unknown>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await task(item).catch(() => {});
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
