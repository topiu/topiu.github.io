import { describe, expect, it } from "vitest";
import { ceilingAt, ceilingCrossings } from "../src/domain/ceilings";

const room = (ceiling) => ({
  id: "R",
  points: [
    { x: 0, y: 0 },
    { x: 8000, y: 0 },
    { x: 8000, y: 5000 },
    { x: 0, y: 5000 },
  ],
  ceiling,
});
const gable = (ridge) => room({ mode: "gable", h: 2400, eaveH: 2000, ridgeH: 3600, axis: "x", ridge });
const at = (r, x) => ceilingAt(r, { x, y: 2500 });

describe("ceilings", () => {
  it("is flat at its height", () => {
    expect(at(room({ mode: "flat", h: 2400 }), 1234)).toBe(2400);
  });

  it("rises evenly under a shed roof", () => {
    const r = room({ mode: "shed", h: 2400, eaveH: 2000, ridgeH: 3000, axis: "x" });
    expect(at(r, 0)).toBe(2000);
    expect(at(r, 4000)).toBe(2500);
    expect(at(r, 8000)).toBe(3000);
  });

  it("puts a centred gable's ridge in the middle", () => {
    const r = gable(0.5);
    expect(at(r, 0)).toBe(2000);
    expect(at(r, 4000)).toBe(3600);
    expect(at(r, 8000)).toBe(2000);
  });

  it("keeps both eaves at the eaves height when the ridge is off centre", () => {
    // the review's case: one shared slope lifted the nearer eave
    const r = gable(0.25); // ridge at x = 2000
    expect(at(r, 0)).toBe(2000);
    expect(at(r, 2000)).toBe(3600);
    expect(at(r, 8000)).toBe(2000);
    expect(at(r, 1000)).toBe(2800); // halfway up the short slope
    expect(at(r, 5000)).toBe(2800); // halfway up the long one
  });

  it("crosses a height at the same fraction of each slope", () => {
    const r = gable(0.25);
    expect(ceilingCrossings(r, 2800)).toEqual([1000, 5000]);
    expect(ceilingCrossings(r, 3700)).toEqual([]); // above the ridge
    expect(ceilingCrossings(r, 1900)).toEqual([]); // below the eaves
  });
});
