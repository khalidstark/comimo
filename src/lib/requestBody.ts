import "server-only";

/**
 * Bounded request bodies for every API route. The body is read as a stream
 * with a running byte count and abandoned the moment it passes the route's
 * limit, so a chunked or lying request can't push an unbounded body into
 * memory. A missing or non-numeric Content-Length is refused up front, and a
 * declared length over the limit is refused before reading anything.
 * Multipart and JSON are parsed only from the bounded buffer.
 */

export type Bounded<T> = { ok: true; value: T } | { ok: false; response: Response };

function refuse(status: number, error: string): { ok: false; response: Response } {
  return { ok: false, response: Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } }) };
}

function tooLarge(maxBytes: number) {
  const mb = maxBytes / (1024 * 1024);
  return refuse(413, `That request is too big (the limit is ${mb >= 1 ? `${Math.floor(mb)} MB` : `${Math.ceil(maxBytes / 1024)} KB`}).`);
}

/** The raw body, at most `maxBytes`. */
export async function readBoundedBytes(request: Request, maxBytes: number): Promise<Bounded<Uint8Array>> {
  const header = request.headers.get("content-length");
  if (header === null || !/^\d{1,12}$/.test(header.trim())) return refuse(411, "Send the request with a Content-Length.");
  const declared = Number(header);
  if (declared > maxBytes) return tooLarge(maxBytes);
  if (!request.body) return { ok: true, value: new Uint8Array(0) };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      // Past the limit, or past what the client declared: stop reading now.
      if (total > maxBytes || total > declared) {
        await reader.cancel().catch(() => {});
        return tooLarge(maxBytes);
      }
      chunks.push(value);
    }
  } catch {
    return refuse(400, "The request body couldn't be read.");
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, value: bytes };
}

/** Multipart form data parsed from a body of at most `maxBytes`. */
export async function readBoundedForm(request: Request, maxBytes: number, badForm: string): Promise<Bounded<FormData>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data;/i.test(contentType)) return refuse(415, badForm);
  const body = await readBoundedBytes(request, maxBytes);
  if (!body.ok) return body;
  try {
    const form = await new Response(new Blob([body.value as Uint8Array<ArrayBuffer>]), { headers: { "content-type": contentType } }).formData();
    return { ok: true, value: form };
  } catch {
    return refuse(415, badForm);
  }
}

/** JSON parsed from a body of at most `maxBytes`; `undefined` when it isn't JSON (the route answers that). */
export async function readBoundedJson(request: Request, maxBytes: number): Promise<Bounded<unknown>> {
  const body = await readBoundedBytes(request, maxBytes);
  if (!body.ok) return body;
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(body.value)) as unknown };
  } catch {
    return { ok: true, value: undefined };
  }
}

/** Body limits per route: each is what the route can legitimately need, plus room for the envelope. */
export const BODY_LIMITS = {
  /** A 4 MB WAV plus the form fields. */
  transcribe: 4 * 1024 * 1024 + 64 * 1024,
  /** Transcript (20k characters) and up to 20 cast briefs. */
  script: 512 * 1024,
  /** A panel and up to three inline sheets (each well under 1 MB). */
  panel: 8 * 1024 * 1024,
  /** A character, plus an optional photo cut-out (at most 5 MB as base64). */
  character: 8 * 1024 * 1024,
  /** A character and their reference sheet (at most 5 MB as base64). */
  sprite: 8 * 1024 * 1024,
  /** A photo of at most 5 MB plus the form fields. */
  photo: 5 * 1024 * 1024 + 64 * 1024,
} as const;
