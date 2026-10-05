/* Typed and imported input: doses, step dates and step files. */
import { describe, it, expect } from "vitest";
import { parseSteps, toDateKey, toNum } from "../src/domain";

describe("input parsing", () => {
  it("takes the leading number rather than gluing every digit together", () => {
    expect(toNum("8-12")).toBe(8);
    expect(toNum("2.5")).toBe(2);
    expect(toNum(" 10 ")).toBe(10);
    expect(toNum("abc")).toBe(null);
    expect(toNum(30)).toBe(30);
  });

  it("rejects impossible dates instead of storing a junk key", () => {
    expect(toDateKey("2026-20-07")).toBe(null);
    expect(toDateKey("31.2.2026")).not.toBe("2026-02-31");
    expect(toDateKey("20.7.2026")).toBe("2026-07-20");
  });

  it("reads a zoned timestamp as the local day of that instant", () => {
    const k = toDateKey("2026-07-19T21:00:00Z");
    const local = new Date("2026-07-19T21:00:00Z");
    const expected = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
    expect(k).toBe(expected);
    expect(toDateKey("2026-07-19T21:00:00")).toBe("2026-07-19"); /* no zone: literal */
  });

  it("keeps a quoted step count with a thousands separator whole", () => {
    const r: any = parseSteps('"2026-07-20","8,432"');
    expect(r.ok).toBe(true);
    expect(r.rows).toEqual([{ date: "2026-07-20", steps: 8432 }]);
  });
});
