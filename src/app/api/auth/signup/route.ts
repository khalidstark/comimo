import { checkEmail, checkName, checkNewPassword, createAccount, isProblem } from "@/lib/server/auth";
import { authError, authJson, logStoreError, readAuthBody, storeDown } from "@/lib/server/authHttp";
import { setSessionCookie } from "@/lib/server/cookie";
import { getKV } from "@/lib/server/kv";
import { hit, minutesText, signupBuckets, type Hit } from "@/lib/server/rateLimit";
import { ipTag } from "@/lib/server/request";
import { createSession } from "@/lib/server/session";

/**
 * POST /api/auth/signup
 * JSON: { name, email, password }
 * Creates the account (no email verification, by the user's choice), signs it
 * in and answers { user: { name } }. Sign-ups are capped per trusted IP
 * (COMIMO_SIGNUPS_PER_IP_HOUR, default 5; COMIMO_SIGNUPS_PER_IP_DAY, default 20),
 * or globally when no trusted IP is known (COMIMO_SIGNUPS_GLOBAL_HOUR, default 30;
 * COMIMO_SIGNUPS_GLOBAL_DAY, default 150), so nobody can mint accounts to get
 * around the per-account limits.
 */
export async function POST(request: Request) {
  const read = await readAuthBody(request);
  if (!read.ok) return read.response;

  const name = checkName(read.body.name);
  if (isProblem(name)) return authError(400, name.error, { field: name.field });
  const email = checkEmail(read.body.email);
  if (isProblem(email)) return authError(400, email.error, { field: email.field });
  const password = checkNewPassword(read.body.password);
  if (isProblem(password)) return authError(400, password.error, { field: password.field });

  const kv = getKV();
  try {
    // Per trusted IP (Vercel, or COMIMO_TRUSTED_IP_HEADER), or conservative global
    // buckets when no trusted IP is known: account creation always hits a ceiling.
    const taken: Extract<Hit, { ok: true }>[] = [];
    for (const bucket of signupBuckets(ipTag(request))) {
      const slot = await hit(kv, bucket.key, bucket.limit, bucket.windowSec);
      if (!slot.ok) {
        await Promise.all(taken.map((earlier) => earlier.undo()));
        return authError(429, `Lots of new accounts right now. Try again in ${minutesText(slot.retryAfterSec)}.`, {
          retryAfterSec: slot.retryAfterSec,
        });
      }
      taken.push(slot);
    }

    const account = await createAccount({ name: name.name, email: email.email, password: password.password }, kv);
    if (!account) return authError(409, "That email already has a Comimo. Sign in instead.", { field: "email" });

    await setSessionCookie(await createSession(account, kv));
    return authJson({ user: { name: account.name } }, 201);
  } catch (error) {
    logStoreError("sign-up", error);
    return storeDown();
  }
}
