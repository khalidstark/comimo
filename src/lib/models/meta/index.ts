import "server-only";
import type { ComicModels } from "../index";
import { checkConsistency } from "./consistency";
import { drawPanel, drawReferenceSheet, uploadReference } from "./image";
import { writeScript } from "./script";
import { transcribe } from "./transcribe";

/**
 * The Meta Model API implementation. Methods are connected one plan at a time;
 * until a method is built it answers from the mock, so the app keeps working
 * end to end. `sources` says which is which.
 */
export const metaModels: ComicModels = {
  mode: "meta",
  sources: { transcribe: "meta", writeScript: "meta", drawReferenceSheet: "meta", drawPanel: "meta", checkConsistency: "meta" },
  transcribe,
  writeScript,
  drawReferenceSheet,
  uploadReference,
  drawPanel,
  checkConsistency,
};
