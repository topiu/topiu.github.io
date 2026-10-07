import { describe, expect, it } from "vitest";
import { CHAR_W, fitLabel, labelForms, labelRect, placeRoomLabel } from "../src/domain/labels";

describe("label forms", () => {
  it("drops a trailing size, then keeps the first word", () => {
    expect(labelForms("Kitchen base 1200")).toEqual(["Kitchen base 1200", "Kitchen base", "Kitchen"]);
    expect(labelForms("Suihku 900×900")).toEqual(["Suihku 900×900", "Suihku"]);
    expect(labelForms("Sofa")).toEqual(["Sofa"]);
    expect(labelForms("Double bed")).toEqual(["Double bed", "Double"]);
  });
});

describe("fitting a label", () => {
  it("uses the whole name when it fits", () => {
    expect(fitLabel("Sofa", 120, 40)).toEqual({ t: "Sofa", s: 10, rot: 0 });
  });

  it("never draws text wider than the box", () => {
    for (const name of ["Kitchen base 1200", "Coffee table", "Armchair", "Kiuas", "Lauteet"])
      for (const w of [30, 45, 60, 80, 120])
        for (const h of [14, 20, 40]) {
          const f = fitLabel(name, w, h);
          if (!f) continue;
          const [len, cross] = f.rot ? [h, w] : [w, h];
          expect(f.t.length * CHAR_W * f.s).toBeLessThanOrEqual(len - 6 + 1e-9);
          expect(f.s * 1.25).toBeLessThanOrEqual(cross + 1e-9);
        }
  });

  it("shortens a long name rather than letting it run out of the outline", () => {
    // the review screenshot: "Kitchen base 1200" in a 1200 x 600 mm box at FIT zoom
    const f = fitLabel("Kitchen base 1200", 72, 36);
    expect(f.t).not.toBe("Kitchen base 1200");
    expect(["Kitchen base", "Kitchen"]).toContain(f.t);
  });

  it("turns the label along a tall narrow piece", () => {
    const f = fitLabel("Kitchen base 1200", 30, 160);
    expect(f.rot).toBe(-90);
    expect(f.t).toBe("Kitchen base 1200");
  });

  it("cuts a long word short with an ellipsis as a last resort, keeping four letters", () => {
    expect(fitLabel("Wardrobe", 40, 20).t).toMatch(/^Ward.*…$/);
    expect(fitLabel("Wardrobe", 20, 20)).toBeNull();
  });

  it("leaves a short word out rather than cutting it down", () => {
    expect(fitLabel("Chair", 28, 28)).toBeNull(); // not "Cha…"
  });
});

describe("placing a room label", () => {
  const room = [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 400 },
    { x: 0, y: 400 },
  ];

  it("stays in the centre when that is free", () => {
    expect(placeRoomLabel(room, 80, 30, [])).toEqual({ x: 150, y: 200, crowded: false });
  });

  it("moves off furniture in the middle of the room, to the nearest free spot", () => {
    const table = { x0: 100, y0: 160, x1: 200, y1: 240 };
    const p = placeRoomLabel(room, 80, 30, [table]);
    expect(p.crowded).toBe(false);
    const r = { x0: p.x - 40, y0: p.y - 15, x1: p.x + 40, y1: p.y + 15 };
    expect(r.x1 <= table.x0 || r.x0 >= table.x1 || r.y1 <= table.y0 || r.y0 >= table.y1).toBe(true);
    expect(Math.hypot(p.x - 150, p.y - 200)).toBeLessThan(80); // nearby, not in a corner
  });

  it("stays inside an L-shaped room", () => {
    const L = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 300 },
      { x: 0, y: 300 },
    ];
    const p = placeRoomLabel(L, 60, 24, []);
    expect(p.crowded).toBe(false);
    // the bounding box centre (150, 150) is outside the L
    expect(p.x <= 100 || p.y <= 100).toBe(true);
  });

  it("falls back to the centre, marked crowded, when nothing is free", () => {
    const p = placeRoomLabel(room, 80, 30, [{ x0: -10, y0: -10, x1: 310, y1: 410 }]);
    expect(p).toEqual({ x: 150, y: 200, crowded: true });
  });

  it("measures a label's rectangle, turned or not", () => {
    const r = labelRect(100, 50, "Sofa", 10);
    expect(r.x1 - r.x0).toBeCloseTo(4 * CHAR_W * 10 + 6);
    const up = labelRect(100, 50, "Sofa", 10, -90);
    expect(up.y1 - up.y0).toBeCloseTo(4 * CHAR_W * 10 + 6);
  });
});
