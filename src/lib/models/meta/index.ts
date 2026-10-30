import "server-only";
import type { ComicModels } from "../index";
import { mockModels } from "../mock";
import { transcribe } from "./transcribe";

/**
 * The Meta Model API implementation. Methods are connected one plan at a time;
 * until a method is built it answers from the mock, so the app keeps working
 * end to end. `sources` says which is which.
 */
export const metaModels: ComicModels = {
  mode: "meta",
  sources: { transcribe: "meta", writeScript: "mock", drawPanel: "mock", checkConsistency: "mock" },
  transcribe,
  writeScript: mockModels.writeScript,
  drawPanel: mockModels.drawPanel,
  checkConsistency: mockModels.checkConsistency,
};
