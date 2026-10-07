import { describe, expect, it } from "vitest";
import { seedLibrary } from "../src/domain/library";
import { nameOf, STR, tr } from "../src/i18n";

const keysOf = (o, prefix = "") =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" ? keysOf(v, prefix + k + ".") : [prefix + k],
  );

describe("translations", () => {
  it("has the same keys in English and Finnish", () => {
    const en = keysOf(STR.en).sort();
    const fi = keysOf(STR.fi).sort();
    expect(fi.filter((k) => !en.includes(k))).toEqual([]);
    expect(en.filter((k) => !fi.includes(k))).toEqual([]);
  });

  it("falls back to English, then to the key itself", () => {
    expect(tr("xx", "undo")).toBe(STR.en.undo);
    expect(tr("fi", "noSuchKey")).toBe("noSuchKey");
  });

  it("names every seed library piece in both languages", () => {
    for (const def of seedLibrary()) {
      expect(nameOf(def, "en")).not.toBe(def.key);
      expect(nameOf(def, "fi")).not.toBe(def.key);
    }
  });
});

describe("seed library", () => {
  it("has unique keys and a height for every piece", () => {
    const lib = seedLibrary();
    expect(new Set(lib.map((d) => d.key)).size).toBe(lib.length);
    for (const d of lib) expect(d.hz).toBeGreaterThan(0);
  });
});
