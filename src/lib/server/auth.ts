import "server-only";
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { getKV, type KV } from "./kv";

/**
 * Accounts: email + password, no email verification (the user's choice).
 *
 * Passwords are hashed with Node's scrypt (random 16-byte salt per password,
 * cost parameters stored with the hash so they can be raised later) and
 * compared in constant time. Nothing reversible is ever stored, and neither
 * emails nor passwords are logged.
 */

/* ---------- Password hashing ---------- */

/** scrypt cost: N = 2^15, r = 8 (32 MiB, about 50 to 100 ms on a server core). */
const COST = { N: 1 << 15, r: 8, p: 1 } as const;
const KEY_BYTES = 64;
const SALT_BYTES = 16;
/** Bounds for stored parameters, so a damaged record can't make one check take minutes. */
const MAX_N = 1 << 20;

function derive(password: string, salt: Buffer, cost: { N: number; r: number; p: number }): Promise<Buffer> {
  const options: ScryptOptions = { ...cost, maxmem: 256 * cost.N * cost.r };
  return new Promise((done, fail) => {
    scrypt(password.normalize("NFKC"), salt, KEY_BYTES, options, (error, key) => (error ? fail(error) : done(key)));
  });
}

/** `scrypt$N$r$p$salt$hash` (base64url), never the password itself. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, COST);
  return ["scrypt", COST.N, COST.r, COST.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

/** True when `password` matches the stored hash. Malformed hashes never match. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [N, r, p] = parts.slice(1, 4).map((part) => Number(part));
  if (!Number.isInteger(N) || N < 2 || N > MAX_N || (N & (N - 1)) !== 0) return false;
  if (!Number.isInteger(r) || r < 1 || r > 32 || !Number.isInteger(p) || p < 1 || p > 4) return false;
  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");
  if (salt.length < SALT_BYTES || expected.length !== KEY_BYTES) return false;
  const actual = await derive(password, salt, { N, r, p });
  return timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | null = null;

/**
 * Spend the same time as a real check when the email has no account, so the
 * response time doesn't reveal which emails are registered.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword(randomBytes(12).toString("base64url"));
  await verifyPassword(password, await dummyHash);
}

/* ---------- Input rules ---------- */

export const PASSWORD_MIN = 8;
/** Long enough for any passphrase; short enough that hashing stays cheap. */
export const PASSWORD_MAX = 200;
export const NAME_MAX = 40;
const EMAIL_MAX = 254;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/;

export type AuthField = "email" | "password" | "name";

export interface FieldProblem {
  field: AuthField;
  error: string;
}

/** Lower-case, trimmed, NFC: the one form an email is stored and looked up in. */
export function normalizeEmail(email: string): string {
  return email.normalize("NFC").trim().toLowerCase();
}

export function checkEmail(raw: unknown): FieldProblem | { email: string } {
  const email = typeof raw === "string" ? normalizeEmail(raw) : "";
  if (!email) return { field: "email", error: "Add your email." };
  if (email.length > EMAIL_MAX || !EMAIL_SHAPE.test(email) || CONTROL.test(email)) {
    return { field: "email", error: "That doesn't look like an email address." };
  }
  return { email };
}

export function checkNewPassword(raw: unknown): FieldProblem | { password: string } {
  const password = typeof raw === "string" ? raw : "";
  if (password.length < PASSWORD_MIN) return { field: "password", error: `Use at least ${PASSWORD_MIN} characters.` };
  if (password.length > PASSWORD_MAX) return { field: "password", error: `Keep it under ${PASSWORD_MAX} characters.` };
  return { password };
}

/** A display name: trimmed, single spaces, any script, no control or direction-override characters. */
export function checkName(raw: unknown): FieldProblem | { name: string } {
  const name = typeof raw === "string" ? raw.normalize("NFC").replace(/\s+/g, " ").trim() : "";
  if (!name) return { field: "name", error: "What should Comimo call you?" };
  if ([...name].length > NAME_MAX) return { field: "name", error: `Keep your name under ${NAME_MAX} characters.` };
  if (CONTROL.test(name)) return { field: "name", error: "Use letters, numbers and spaces." };
  return { name };
}

export function isProblem(value: object): value is FieldProblem {
  return "field" in value;
}

/* ---------- Accounts ---------- */

export interface Account {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

/** What the browser may see about an account. */
export interface PublicAccount {
  name: string;
}

/** Index key for an email. Hashed so the key list alone doesn't list addresses. */
function emailKey(email: string): string {
  return `email:${createHash("sha256").update(normalizeEmail(email)).digest("hex")}`;
}

function accountKey(id: string): string {
  return `account:${id}`;
}

export async function getAccount(id: string, kv: KV = getKV()): Promise<Account | null> {
  const raw = await kv.get(accountKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Account;
  } catch {
    return null;
  }
}

export async function findAccountByEmail(email: string, kv: KV = getKV()): Promise<Account | null> {
  const id = await kv.get(emailKey(email));
  return id ? getAccount(id, kv) : null;
}

/**
 * Create an account, or `null` when the email is taken. Claiming the email
 * index is a single set-if-new, so two sign-ups racing for one address can't
 * both win.
 */
export async function createAccount(
  input: { email: string; name: string; password: string },
  kv: KV = getKV(),
): Promise<Account | null> {
  const account: Account = {
    id: randomUUID(),
    email: normalizeEmail(input.email),
    name: input.name,
    passwordHash: await hashPassword(input.password),
    createdAt: new Date().toISOString(),
  };
  await kv.set(accountKey(account.id), JSON.stringify(account));
  if (!(await kv.set(emailKey(account.email), account.id, { onlyIfNew: true }))) {
    await kv.del(accountKey(account.id));
    return null;
  }
  return account;
}

/** The account for this email and password, or `null` either way it fails (same time, same answer). */
export async function checkCredentials(email: string, password: string, kv: KV = getKV()): Promise<Account | null> {
  const account = await findAccountByEmail(email, kv);
  if (!account) {
    await burnPasswordCheck(password);
    return null;
  }
  return (await verifyPassword(password, account.passwordHash)) ? account : null;
}

/** Remove the account record and free its email (only if the email still points at this account). */
export async function deleteAccountRecord(account: Account, kv: KV = getKV()): Promise<void> {
  if ((await kv.get(emailKey(account.email))) === account.id) await kv.del(emailKey(account.email));
  await kv.del(accountKey(account.id));
}
