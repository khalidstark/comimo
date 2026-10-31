import { readBoundedJson } from "@/lib/requestBody";
import { finishAccountDeletion, startAccountDeletion } from "@/lib/server/accountDeletion";
import { burnPasswordCheck, getAccount, verifyPassword } from "@/lib/server/auth";
import { getKV } from "@/lib/server/kv";
import { jsonNoStore, logLibraryError } from "@/lib/server/libraryHttp";
import { hit, minutesText } from "@/lib/server/rateLimit";
import { requireSession, sessionCookieName, sessionCookieOptions } from "@/lib/server/session";

/** An expired session cookie with the attributes it was set with (written here so the route needs no request scope). */
function expiredCookie(): string {
  const options = sessionCookieOptions();
  return [`${sessionCookieName()}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax", ...(options.secure ? ["Secure"] : [])].join("; ");
}

/**
 * DELETE /api/me/account { password }
 * Deletes the signed-in account and everything in it: days, cast, settings,
 * every image and album photo (blob folder a/<account>/), every album (their
 * links stop working), every session on every device, the account record and
 * its email. Asks for the password again; 5 tries an hour per account.
 */
export async function DELETE(request: Request) {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const body = await readBoundedJson(request, 4 * 1024);
  if (!body.ok) return body.response;
  const password = (body.value as { password?: unknown } | undefined)?.password;
  if (typeof password !== "string" || !password || password.length > 200) {
    return jsonNoStore({ error: "Type your password to delete your account.", field: "password" }, 400);
  }

  const kv = getKV();
  const accountId = session.account.id;
  try {
    const slot = await hit(kv, `delete-account:${accountId}`, 5, 3600);
    if (!slot.ok) return jsonNoStore({ error: `Too many tries. Try again in ${minutesText(slot.retryAfterSec)}.` }, 429, { "Retry-After": String(slot.retryAfterSec) });
    const account = await getAccount(accountId, kv);
    if (!account) {
      // Nothing is deleted unless the password was checked against a loaded account.
      await burnPasswordCheck(password);
      return jsonNoStore({ error: "That password isn't right.", field: "password" }, 401);
    }
    if (!(await verifyPassword(password, account.passwordHash))) {
      return jsonNoStore({ error: "That password isn't right.", field: "password" }, 401);
    }

    // Mark first (every session is refused from here, public albums go dark),
    // then tear down; a failure part way is finished later (accountDeletion.ts).
    await startAccountDeletion(account, kv);
    await finishAccountDeletion(account.id, kv);
  } catch (error) {
    // The account is already unusable; the rest is finished at the next sign-in attempt or by the sweep.
    return logLibraryError("account deletion", error);
  }
  return jsonNoStore({ ok: true }, 200, { "Set-Cookie": expiredCookie() });
}
