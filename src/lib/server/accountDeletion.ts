import "server-only";
import { deleteAllAlbums } from "./album";
import { deleteAccountRecord, getAccount, type Account } from "./auth";
import { getBlobStore, type BlobStore } from "./blob";
import { getKV, type KV } from "./kv";
import { deleteLibrary } from "./library";
import { deletingKey, destroyAllSessions } from "./session";

/**
 * Deleting an account, in an order that can be finished later if a step fails:
 *
 * 1. A "deleting" mark (account:<id>:deleting) and an entry in the pending
 *    list. From this moment every session of the account is refused, no new
 *    one can start, and its public albums answer 404 (isAccountLive).
 * 2. Albums, then the library (days, cast, settings, every image and photo).
 * 3. Sessions, the account record and its email.
 * 4. The mark and the pending entry, last.
 *
 * If anything throws part way, the mark stays and the account stays unusable.
 * The cleanup is finished by the next sign-in attempt with the right password
 * for that email, or by the maintenance sweep (/api/maintenance/deletions).
 */

const PENDING = "deletions:pending";

/** Step 1: mark the account as being deleted. */
export async function startAccountDeletion(account: Account, kv: KV = getKV()): Promise<void> {
  await kv.set(deletingKey(account.id), JSON.stringify({ startedAt: new Date().toISOString() }));
  await kv.hset(PENDING, account.id, new Date().toISOString());
}

/** Steps 2 to 4. Safe to run again: every step skips what is already gone. */
export async function finishAccountDeletion(accountId: string, kv: KV = getKV(), blobs: BlobStore = getBlobStore()): Promise<void> {
  await deleteAllAlbums(accountId, kv, blobs);
  await deleteLibrary(accountId, kv, blobs);
  await destroyAllSessions(accountId, kv);
  const account = await getAccount(accountId, kv);
  if (account) await deleteAccountRecord(account, kv);
  // Once more for anything that raced the teardown, then the mark goes.
  await destroyAllSessions(accountId, kv);
  await kv.del(deletingKey(accountId));
  await kv.hdel(PENDING, accountId);
}

/** True when this account has a deletion that hasn't finished. */
export async function isBeingDeleted(accountId: string, kv: KV = getKV()): Promise<boolean> {
  return (await kv.get(deletingKey(accountId))) !== null;
}

/** Finish every deletion that stopped part way; returns how many finished and how many failed again. */
export async function sweepDeletions(kv: KV = getKV(), blobs: BlobStore = getBlobStore()): Promise<{ finished: number; failed: number }> {
  let finished = 0;
  let failed = 0;
  for (const accountId of Object.keys(await kv.hgetall(PENDING))) {
    try {
      await finishAccountDeletion(accountId, kv, blobs);
      finished += 1;
    } catch (error) {
      failed += 1;
      console.error(`Comimo: account deletion sweep step failed (${error instanceof Error ? error.name : "unknown"})`);
    }
  }
  return { finished, failed };
}
