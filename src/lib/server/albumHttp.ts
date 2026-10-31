import "server-only";
import type { LibraryResult } from "./library";
import { jsonNoStore, libraryError, logLibraryError } from "./libraryHttp";

/** Album answers: JSON, never cached; failures logged by kind only (no ids, no photos, no links). */
export function albumJson<T>(result: LibraryResult<T>, status = 200): Response {
  return result.ok ? jsonNoStore(result.value ?? { ok: true }, status) : libraryError(result);
}

export function albumFailure(where: string, error: unknown): Response {
  return logLibraryError(`album ${where}`, error);
}

export type AlbumContext = { params: Promise<{ id: string }> };
export type PhotoContext = { params: Promise<{ id: string; photoId: string }> };
