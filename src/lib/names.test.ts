import { describe, expect, it } from "vitest";
import { findByName, normalizeName, parseAliases } from "./names";

const cast = [
  { id: "nour", name: "Nour", aliases: ["نور"] },
  { id: "teta", name: "Teta Samia", aliases: ["Teta", "تيتا", "تيتا سامية", "Samia"] },
  { id: "karim", name: "Karim", aliases: ["كريم", "Kimo"] },
  { id: "omar-k", name: "Omar Khaled" },
  { id: "omar-h", name: "Omar Hany" },
];

describe("normalizeName", () => {
  it("folds case, accents and Arabic spelling variants", () => {
    expect(normalizeName("  TETA   samia ")).toBe("teta samia");
    expect(normalizeName("Zoë")).toBe("zoe");
    expect(normalizeName("أحمد")).toBe(normalizeName("احمد"));
    expect(normalizeName("سامِيَة")).toBe(normalizeName("ساميه"));
    expect(normalizeName("مُنى")).toBe(normalizeName("مني"));
  });
});

describe("findByName", () => {
  it("maps Teta and تيتا to Teta Samia", () => {
    expect(findByName(cast, "Teta")?.id).toBe("teta");
    expect(findByName(cast, "تيتا")?.id).toBe("teta");
    expect(findByName(cast, "teta samia")?.id).toBe("teta");
    expect(findByName(cast, "تيتا ساميه")?.id).toBe("teta");
    expect(findByName(cast, "Samia")?.id).toBe("teta");
  });

  it("finds aliases in both scripts", () => {
    expect(findByName(cast, "كريم")?.id).toBe("karim");
    expect(findByName(cast, "kimo")?.id).toBe("karim");
    expect(findByName(cast, "نور")?.id).toBe("nour");
  });

  it("refuses an ambiguous partial name and unknown people", () => {
    expect(findByName(cast, "Omar")).toBeNull();
    expect(findByName(cast, "Omar Hany")?.id).toBe("omar-h");
    expect(findByName(cast, "Youssef")).toBeNull();
    expect(findByName(cast, "  ")).toBeNull();
  });
});

describe("parseAliases", () => {
  it("splits on Latin and Arabic commas and drops duplicates and the own name", () => {
    expect(parseAliases("Teta, تيتا، teta ,Samia\nTeta Samia", "Teta Samia")).toEqual(["Teta", "تيتا", "Samia"]);
  });
});
