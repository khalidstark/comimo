import { describe, expect, it } from "vitest";
import { safeNext } from "./safeNext";

describe("safeNext", () => {
  it("allows the in-app pages", () => {
    expect(safeNext("/")).toBe("/");
    expect(safeNext("/record")).toBe("/record");
    expect(safeNext("/cast")).toBe("/cast");
    expect(safeNext("/welcome")).toBe("/welcome");
    expect(safeNext("/account")).toBe("/account");
    expect(safeNext("/welcome/x")).toBe("/");
    expect(safeNext("/month")).toBe("/month");
    expect(safeNext("/day/2026-10-31-ab12")).toBe("/day/2026-10-31-ab12");
  });

  it("returns the normalised path only, without query or hash", () => {
    expect(safeNext("/record?x=1#top")).toBe("/record");
    expect(safeNext("/cast/../month")).toBe("/month");
  });

  it("refuses anything that leaves the site or isn't a page", () => {
    const bad = [
      "/.//evil.com",
      "/%2F%2Fevil.com",
      "/\\evil.com",
      "\\\\evil.com",
      "//evil.com",
      "///evil.com",
      "/./\\evil.com",
      "https://evil.com",
      "javascript:alert(1)",
      "/api/auth/signout",
      "/record/../api/auth/me",
      "/signin",
      "/day/../../evil",
      "/day/a b",
      "",
      null,
      undefined,
    ];
    for (const raw of bad) expect(safeNext(raw, "/fallback"), String(raw)).toBe("/fallback");
  });
});
