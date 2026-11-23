import { describe, expect, it } from "vitest";
import { readBoundedBytes, readBoundedJson } from "./requestBody";

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/api", {
    method: "POST",
    body,
    headers: { "content-length": String(new TextEncoder().encode(body).byteLength), ...headers },
  });
}

describe("readBoundedBytes", () => {
  it("returns the body when it is within the limit", async () => {
    const res = await readBoundedBytes(post("hello"), 10);
    expect(res.ok).toBe(true);
    if (res.ok) expect(new TextDecoder().decode(res.value)).toBe("hello");
  });

  it("refuses a missing Content-Length with 411", async () => {
    const request = new Request("https://example.test/api", { method: "POST", body: "hi" });
    request.headers.delete("content-length");
    const res = await readBoundedBytes(request, 10);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(411);
  });

  it("refuses a non-numeric Content-Length with 411", async () => {
    const res = await readBoundedBytes(post("hi", { "content-length": "abc" }), 10);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(411);
  });

  it("refuses a declared length over the limit with 413", async () => {
    const res = await readBoundedBytes(post("0123456789ab"), 10);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(413);
  });
});

describe("readBoundedJson", () => {
  it("parses a JSON body", async () => {
    const res = await readBoundedJson(post('{"a":1}'), 100);
    expect(res).toEqual({ ok: true, value: { a: 1 } });
  });

  it("answers undefined when the body is not JSON", async () => {
    const res = await readBoundedJson(post("not json"), 100);
    expect(res).toEqual({ ok: true, value: undefined });
  });

  it("passes the size refusal through", async () => {
    const res = await readBoundedJson(post('{"a":"too long"}'), 5);
    expect(res.ok).toBe(false);
  });
});
