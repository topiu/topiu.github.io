import { describe, expect, it } from "vitest";
import {
  bbox,
  distToSeg,
  itemPoly,
  pointInPoly,
  polyArea,
  polysIntersect,
  rotP,
  triangulate,
  wallPoly,
} from "../src/domain/geometry";

const rect = (x0, y0, x1, y1) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const L = [
  { x: 0, y: 0 },
  { x: 6000, y: 0 },
  { x: 6000, y: 3000 },
  { x: 3000, y: 3000 },
  { x: 3000, y: 6000 },
  { x: 0, y: 6000 },
];
const triArea = ([a, b, c]) => Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;

describe("geometry", () => {
  it("rotates a point about the origin", () => {
    const p = rotP({ x: 1000, y: 0 }, Math.PI / 2);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1000);
  });

  it("measures bounding boxes and areas", () => {
    const b = bbox(L);
    expect([b.x0, b.y0, b.x1, b.y1, b.w, b.h, b.cx, b.cy]).toEqual([0, 0, 6000, 6000, 6000, 6000, 3000, 3000]);
    expect(Math.abs(polyArea(L))).toBe(27e6);
  });

  it("tests points against concave polygons", () => {
    expect(pointInPoly({ x: 1000, y: 5000 }, L)).toBe(true);
    expect(pointInPoly({ x: 5000, y: 5000 }, L)).toBe(false); // the notch of the L
  });

  it("triangulates concave polygons without losing area, in either winding", () => {
    for (const poly of [L, [...L].reverse()]) {
      const tris = triangulate(poly);
      expect(tris).toHaveLength(poly.length - 2);
      const sum = tris.reduce((s, t) => s + triArea(t.map((i) => poly[i])), 0);
      expect(sum).toBeCloseTo(27e6, 0);
    }
  });

  it("gives a wall its thickness as a quad", () => {
    const q = wallPoly({ x1: 0, y1: 0, x2: 4000, y2: 0, t: 150 });
    expect(q).toHaveLength(4);
    const ys = q.map((p) => p.y).sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(-75);
    expect(ys[3]).toBeCloseTo(75);
  });

  it("places a rotated rectangular item", () => {
    const def = { type: "rect", w: 2000, h: 1000 };
    const p = itemPoly({ x: 0, y: 0, rot: 90 }, def);
    const b = bbox(p);
    expect(b.w).toBeCloseTo(1000);
    expect(b.h).toBeCloseTo(2000);
  });

  it("detects overlapping and separate polygons", () => {
    expect(polysIntersect(rect(0, 0, 1000, 1000), rect(500, 500, 1500, 1500))).toBe(true);
    expect(polysIntersect(rect(0, 0, 1000, 1000), rect(2000, 0, 3000, 1000))).toBe(false);
  });

  it("measures the distance from a point to a segment", () => {
    expect(distToSeg({ x: 500, y: 300 }, { x: 0, y: 0 }, { x: 1000, y: 0 })).toBeCloseTo(300);
    expect(distToSeg({ x: 1300, y: 400 }, { x: 0, y: 0 }, { x: 1000, y: 0 })).toBeCloseTo(500);
  });
});
