import { describe, expect, it } from "vitest";
import { backEdges, seedL, seedLibrary } from "../src/domain/library";

const lib = Object.fromEntries(seedLibrary().map((d) => [d.key, d]));

describe("which way pieces face", () => {
  it("puts a sofa's back along its top edge, as its 3D model has it", () => {
    expect(backEdges(lib.sofa)).toEqual([
      [
        { x: -1050, y: -450 },
        { x: 1050, y: -450 },
      ],
    ]);
    expect(backEdges(lib.bedDouble)[0][0].y).toBe(-1000); // the head end
  });

  it("gives a corner piece its two outer edges", () => {
    const L = seedL(lib.cornerSofa);
    expect(L).toEqual({ x0: -1200, x1: 1200, y0: -1000, y1: 1000, ix: -300, iy: -100 });
    expect(backEdges(lib.cornerSofa)).toEqual([
      [
        { x: -1200, y: 1000 },
        { x: -1200, y: -1000 },
      ],
      [
        { x: -1200, y: -1000 },
        { x: 1200, y: -1000 },
      ],
    ]);
  });

  it("leaves pieces with no front, edited corners and custom shapes alone", () => {
    expect(backEdges(lib.diningTable)).toEqual([]);
    expect(backEdges(lib.roundTable)).toEqual([]);
    const edited = { ...lib.laude, points: lib.laude.points.map((p) => ({ x: -p.x, y: p.y })) };
    expect(seedL(edited)).toBe(null);
    expect(backEdges(edited)).toEqual([]);
    expect(backEdges({ id: "x", name: "Desk", type: "rect", w: 1200, h: 600 })).toEqual([]);
  });
});
