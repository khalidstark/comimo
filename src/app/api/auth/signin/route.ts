import { checkCredentials, checkEmail, isProblem, PASSWORD_MAX } from "@/lib/server/auth";
import { authError, authJson, logStoreError, readAuthBody, storeDown } from "@/lib/server/authHttp";
import { setSessionCookie } from "@/lib/server/cookie";
import { getKV } from "@/lib/server/kv";
import { clearFailures, EMAIL_LOCKOUT, IP_LOCKOUT, lockedFor, minutesText, recordFailure } from "@/lib/server/rateLimit";
import { hashTag, ipTag } from "@/lib/server/request";
import { createSession } from "@/lib/server/session";

const WRONG = "That email or password is wrong.";

/**
 * POST /api/auth/signin
 * JSON: { email, password }
 * Answers { user: { name } } and sets the session cookie. A wrong email and
 * a wrong password get the same answer in about the same time. Failed tries
 * are counted per email and per IP; past the free tries each one locks that
 * email or IP for longer (1, 2, 4 ... 60 minutes), answered with 429.
 */
export async function POST(request: Request) {
  const read = await readAuthBody(request);
  if (!read.ok) return read.response;

  const email = checkEmail(read.body.email);
  if (isProblem(email)) return authError(400, email.error, { field: "email" });
  const password = typeof read.body.password === "string" ? read.body.password : "";
  if (!password) return authError(400, "Add your password.", { field: "password" });
  // Longer than any password we accept: wrong, without spending a hash on it.
  if (password.length > PASSWORD_MAX) return authError(401, WRONG);

  const kv = getKV();
  const emailSubject = `login:email:${hashTag("email", email.email)}`;
  const ipSubject = `login:ip:${ipTag(request)}`;
  try {
    const wait = Math.max(await lockedFor(kv, emailSubject), await lockedFor(kv, ipSubject));
    if (wait > 0) {
      return authError(429, `Too many tries. Wait ${minutesText(wait)}, then try again.`, { retryAfterSec: wait });
    }

    const account = await checkCredentials(email.email, password, kv);
    if (!account) {
      await Promise.all([recordFailure(kv, emailSubject, EMAIL_LOCKOUT), recordFailure(kv, ipSubject, IP_LOCKOUT)]);
      return authError(401, WRONG);
    }

    await clearFailures(kv, emailSubject);
    await setSessionCookie(await createSession(account, kv));
    return authJson({ user: { name: account.name } });
  } catch (error) {
    logStoreError("sign-in", error);
    return storeDown();
  }
}
