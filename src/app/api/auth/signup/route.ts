import { checkEmail, checkName, checkNewPassword, createAccount, isProblem } from "@/lib/server/auth";
import { authError, authJson, logStoreError, readAuthBody, storeDown } from "@/lib/server/authHttp";
import { setSessionCookie } from "@/lib/server/cookie";
import { getKV } from "@/lib/server/kv";
import { hit, minutesText } from "@/lib/server/rateLimit";
import { ipTag } from "@/lib/server/request";
import { createSession } from "@/lib/server/session";

function envInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * POST /api/auth/signup
 * JSON: { name, email, password }
 * Creates the account (no email verification, by the user's choice), signs it
 * in and answers { user: { name } }. Sign-ups are capped per IP
 * (COMIMO_SIGNUPS_PER_IP_HOUR, default 5; COMIMO_SIGNUPS_PER_IP_DAY, default 20)
 * so nobody can mint accounts to get around the per-account limits.
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
    const ip = ipTag(request);
    const hourly = await hit(kv, `signup:ip:${ip}:hour`, envInt("COMIMO_SIGNUPS_PER_IP_HOUR", 5), 3600);
    if (!hourly.ok) {
      return authError(429, `Lots of new accounts from here. Try again in ${minutesText(hourly.retryAfterSec)}.`, { retryAfterSec: hourly.retryAfterSec });
    }
    const daily = await hit(kv, `signup:ip:${ip}:day`, envInt("COMIMO_SIGNUPS_PER_IP_DAY", 20), 86_400);
    if (!daily.ok) {
      await hourly.undo();
      return authError(429, "Lots of new accounts from here today. Try again tomorrow.", { retryAfterSec: daily.retryAfterSec });
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
