import { checkCredentials, checkEmail, isProblem, PASSWORD_MAX } from "@/lib/server/auth";
import { authError, authJson, logStoreError, readAuthBody, storeDown } from "@/lib/server/authHttp";
import { setSessionCookie } from "@/lib/server/cookie";
import { getKV } from "@/lib/server/kv";
import { clearAttempts, EMAIL_LOCKOUT, IP_LOCKOUT, minutesText, releaseAttempt, reserveAttempt } from "@/lib/server/rateLimit";
import { hashTag, ipTag } from "@/lib/server/request";
import { createSession } from "@/lib/server/session";

const WRONG = "That email or password is wrong.";

/**
 * POST /api/auth/signin
 * JSON: { email, password }
 * Answers { user: { name } } and sets the session cookie. A wrong email and
 * a wrong password get the same answer in about the same time. Each try is
 * reserved per email and per IP before the password is checked; past the
 * free tries that email or IP gets one try per lock, and the locks double
 * (1, 2, 4 ... 60 minutes). Locked tries get 429.
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
    // Reserve the try before checking the password, so parallel guesses can't race past a lock.
    const byIp = await reserveAttempt(kv, ipSubject, IP_LOCKOUT);
    const byEmail = byIp.ok ? await reserveAttempt(kv, emailSubject, EMAIL_LOCKOUT) : null;
    const blocked = !byIp.ok ? byIp : byEmail && !byEmail.ok ? byEmail : null;
    if (blocked) {
      return authError(429, `Too many tries. Wait ${minutesText(blocked.retryAfterSec)}, then try again.`, {
        retryAfterSec: blocked.retryAfterSec,
      });
    }

    const account = await checkCredentials(email.email, password, kv);
    if (!account) return authError(401, WRONG);

    await Promise.all([clearAttempts(kv, emailSubject), releaseAttempt(kv, ipSubject)]);
    await setSessionCookie(await createSession(account, kv));
    return authJson({ user: { name: account.name } });
  } catch (error) {
    logStoreError("sign-in", error);
    return storeDown();
  }
}
