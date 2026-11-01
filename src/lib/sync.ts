/**
 * Deciding what to fetch and what to send when this device's copy of the
 * comic book meets the account's copy on the server. Pure functions (the
 * store does the reading and writing), so the rules can be tested alone.
 *
 * The rules, per day or character:
 * - The newer stamp wins (updatedAt, or createdAt for records made before stamps).
 * - A deletion is a stamped tombstone on either side; it wins over an older
 *   copy and loses to a newer one (an edit after a delete brings it back).
 * - Equal stamps: nothing to do.
 */

export type RecordKind = "days" | "cast";

/** What the server says it has (GET /api/me/library). */
export interface RemoteIndex {
  days: Record<string, { u: string; d?: 1 }>;
  cast: Record<string, { u: string; d?: 1 }>;
  /** Synced setting key -> stamp. */
  meta: Record<string, string>;
  images: string[];
  /** dayId -> album id. */
  albums: Record<string, string>;
}

export interface LocalSide {
  /** Live records on this device: id -> stamp. */
  records: Map<string, string>;
  /** Deletions made on this device that the server hasn't heard about: id -> when. */
  tombstones: Map<string, string>;
}

export interface RecordPlan {
  /** Fetch these from the server and keep them. */
  pull: string[];
  /** Send these to the server. */
  push: string[];
  /** Drop these from this device (deleted elsewhere). */
  drop: string[];
  /** Tell the server these were deleted here: id -> when. */
  deleteRemote: [string, string][];
  /** Local tombstones the server already agrees with (or never had the record): forget them. */
  forget: string[];
}

function later(a: string, b: string): boolean {
  return Date.parse(a) > Date.parse(b);
}

export function planRecords(local: LocalSide, remote: Record<string, { u: string; d?: 1 }>): RecordPlan {
  const plan: RecordPlan = { pull: [], push: [], drop: [], deleteRemote: [], forget: [] };
  const ids = new Set([...local.records.keys(), ...local.tombstones.keys(), ...Object.keys(remote)]);
  for (const id of ids) {
    const mine = local.records.get(id);
    const deletedHere = local.tombstones.get(id);
    const theirs = Object.hasOwn(remote, id) ? remote[id] : undefined;

    if (mine !== undefined) {
      if (!theirs) plan.push.push(id);
      else if (theirs.d) {
        if (later(mine, theirs.u)) plan.push.push(id);
        else plan.drop.push(id);
      } else if (later(mine, theirs.u)) plan.push.push(id);
      else if (later(theirs.u, mine)) plan.pull.push(id);
      continue;
    }
    if (deletedHere !== undefined) {
      if (!theirs || theirs.d) plan.forget.push(id);
      else if (later(theirs.u, deletedHere)) {
        plan.pull.push(id);
        plan.forget.push(id);
      } else plan.deleteRemote.push([id, deletedHere]);
      continue;
    }
    if (theirs && !theirs.d) plan.pull.push(id);
  }
  return plan;
}

/** Synced settings: newer stamp wins; a setting only one side has goes to the other. */
export function planMeta(local: Map<string, string>, remote: Record<string, string>): { pull: string[]; push: string[] } {
  const pull: string[] = [];
  const push: string[] = [];
  for (const key of new Set([...local.keys(), ...Object.keys(remote)])) {
    const mine = local.get(key);
    const theirs = Object.hasOwn(remote, key) ? remote[key] : undefined;
    if (mine === undefined) pull.push(key);
    else if (theirs === undefined || later(mine, theirs)) push.push(key);
    else if (later(theirs, mine)) pull.push(key);
  }
  return { pull, push };
}

/** Images this device has that the server doesn't (the server's are fetched when first shown). */
export function imagesToPush(local: Iterable<string>, remote: string[]): string[] {
  const there = new Set(remote);
  return [...local].filter((id) => !there.has(id));
}

/** A record's stamp: when it last changed, or when it was made. */
export function stampOf(record: { updatedAt?: string; createdAt?: string }): string {
  return record.updatedAt ?? record.createdAt ?? "1970-01-01T00:00:00.000Z";
}

/** The image ids a record points at ({ kind: "blob", id } anywhere inside it). */
export function blobIdsIn(value: unknown, found = new Set<string>(), depth = 0): Set<string> {
  if (depth > 12 || typeof value !== "object" || value === null) return found;
  if (Array.isArray(value)) {
    for (const item of value) blobIdsIn(item, found, depth + 1);
    return found;
  }
  const record = value as Record<string, unknown>;
  if (record.kind === "blob" && typeof record.id === "string") found.add(record.id);
  for (const item of Object.values(record)) blobIdsIn(item, found, depth + 1);
  return found;
}

/** Settings that follow the account (everything else in `meta` stays on the device). */
export function isSyncedMetaKey(key: string): boolean {
  return /^(cover:\d{4}-(0[1-9]|1[0-2])|starterCastSeeded|newPeople:never|aboutYou:asked)$/.test(key);
}
