import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkCredentials,
  checkEmail,
  checkName,
  checkNewPassword,
  createAccount,
  findAccountByEmail,
  hashPassword,
  isProblem,
  verifyPassword,
} from "./auth";
import { FileKV } from "./kv";

describe("password hashing", () => {
  it("verifies the right password and refuses a wrong one", async () => {
    const hash = await hashPassword("tea on the roof");
    expect(hash.startsWith("scrypt$32768$8$1$")).toBe(true);
    expect(hash).not.toContain("tea on the roof");
    expect(await verifyPassword("tea on the roof", hash)).toBe(true);
    expect(await verifyPassword("tea on the roof ", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("salts every hash", async () => {
    const [a, b] = await Promise.all([hashPassword("same password"), hashPassword("same password")]);
    expect(a).not.toBe(b);
  });

  it("matches the same password typed in another Unicode form", async () => {
    const hash = await hashPassword("café-1234");
    expect(await verifyPassword("café-1234", hash)).toBe(true);
  });

  it("never matches a malformed or tampered hash", async () => {
    const hash = await hashPassword("password-1");
    const parts = hash.split("$");
    expect(await verifyPassword("password-1", "plain-text")).toBe(false);
    expect(await verifyPassword("password-1", ["bcrypt", ...parts.slice(1)].join("$"))).toBe(false);
    // Absurd cost parameters are refused instead of run.
    expect(await verifyPassword("password-1", ["scrypt", String(2 ** 30), ...parts.slice(2)].join("$"))).toBe(false);
    expect(await verifyPassword("password-1", ["scrypt", "1000", ...parts.slice(2)].join("$"))).toBe(false);
    // A truncated hash.
    expect(await verifyPassword("password-1", [...parts.slice(0, 5), parts[5].slice(0, 20)].join("$"))).toBe(false);
  });
});

describe("input rules", () => {
  it("normalises emails and refuses odd ones", () => {
    expect(checkEmail("  Nour@Example.COM ")).toEqual({ email: "nour@example.com" });
    for (const bad of ["", "nour", "nour@", "@example.com", "nour@example", "no ur@example.com", 42, null]) {
      expect(isProblem(checkEmail(bad) as object)).toBe(true);
    }
  });

  it("asks for at least 8 characters", () => {
    expect(isProblem(checkNewPassword("1234567"))).toBe(true);
    expect(checkNewPassword("12345678")).toEqual({ password: "12345678" });
    expect(isProblem(checkNewPassword("x".repeat(201)))).toBe(true);
  });

  it("tidies names in any script and refuses direction overrides", () => {
    expect(checkName("  Nour   Hassan ")).toEqual({ name: "Nour Hassan" });
    expect(checkName("نور")).toEqual({ name: "نور" });
    expect(isProblem(checkName("   "))).toBe(true);
    expect(isProblem(checkName("x".repeat(41)))).toBe(true);
    expect(isProblem(checkName("evil‮eman"))).toBe(true);
  });
});

describe("accounts", () => {
  let dir: string;
  let kv: FileKV;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "comimo-auth-"));
    kv = new FileKV(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("creates an account once per email", async () => {
    const account = await createAccount({ email: "nour@example.com", name: "Nour", password: "password-1" }, kv);
    expect(account?.name).toBe("Nour");
    expect(account?.passwordHash).not.toContain("password-1");
    expect(await createAccount({ email: "NOUR@example.com", name: "Other", password: "password-2" }, kv)).toBeNull();
    expect((await findAccountByEmail("nour@example.com", kv))?.id).toBe(account?.id);
  });

  it("lets only one of two racing sign-ups have the email", async () => {
    const results = await Promise.all([
      createAccount({ email: "race@example.com", name: "A", password: "password-1" }, kv),
      createAccount({ email: "race@example.com", name: "B", password: "password-1" }, kv),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("checks credentials with the same answer for a wrong email and a wrong password", async () => {
    await createAccount({ email: "nour@example.com", name: "Nour", password: "password-1" }, kv);
    expect((await checkCredentials("nour@example.com", "password-1", kv))?.name).toBe("Nour");
    expect(await checkCredentials("nour@example.com", "password-2", kv)).toBeNull();
    expect(await checkCredentials("nobody@example.com", "password-1", kv)).toBeNull();
  });
});
