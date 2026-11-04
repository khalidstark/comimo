import { describe, expect, it } from "vitest";
import { SpendCapError } from "@/lib/guard";
import { ModelInputError } from "./index";
import { modelErrorResponse } from "./wire";

/** Error responses carry a code when the progress screen should offer something other than Try again. */
describe("modelErrorResponse", () => {
  it("passes on an input error's code, so a voice note with no words offers Record again", async () => {
    const response = modelErrorResponse(new ModelInputError("Comimo couldn't hear any words in that voice note.", "audio"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Comimo couldn't hear any words in that voice note.", code: "audio" });
    expect(await modelErrorResponse(new ModelInputError("Missing `audio` file.")).json()).toEqual({ error: "Missing `audio` file." });
  });

  it("marks a daily cap hit mid-request as \"cap\"", async () => {
    const response = modelErrorResponse(new SpendCapError());
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBeTruthy();
    expect(await response.json()).toMatchObject({ code: "cap" });
  });
});
