import { describe, expect, it } from "vitest";
import { pointInPoly, polyArea } from "../src/domain/geometry";
import { EAVES, onRoof, planRoofs } from "../src/domain/roofs";

const flat = (h = 2400) => ({ mode: "flat", h, eaveH: 1300, ridgeH: 2900, axis: "x", ridge: 0.5 });
const room = (id, pts, ceiling = flat(), autoWalls = { mode: "centre", t: 95 }) => ({
  id,
  points: pts.map(([x, y]) => ({ x, y })),
  ceiling,
  autoWalls,
});
const plan = (rooms) => ({ rooms, walls: [], openings: [], items: [] });

/* does a closed ring cross itself? */
function crosses(ring) {
  const n = ring.length;
  const d = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [a, b, c, e] = [ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n]];
      if (d(a, b, c) * d(a, b, e) < 0 && d(c, e, a) * d(c, e, b) < 0) return true;
    }
  return false;
}

// a hall between a big room and a bedroom with a notch, drawn with walls in
// different modes, so the rooms are a few centimetres apart and some of their
// edges only partly face each other: the layout that broke the roofs up
const bedroom = room(
  "B",
  [
    [-6000, 7150],
    [-6000, 4200],
    [-7870, 4200],
    [-7870, 3530],
    [-9110, 3530],
    [-9110, 7150],
  ],
  flat(),
  { mode: "outside", t: 95 },
);
const hall = room("H", [
  [-5900, 2720],
  [-5900, 4100],
  [-7820, 4100],
  [-7820, 2720],
]);
const big = room("R", [
  [-5900, -2000],
  [-9150, -2000],
  [-9150, 3480],
  [-7820, 3480],
  [-7820, 2720],
  [-5900, 2720],
]);

describe("roofs over rooms that stand together", () => {
  it("covers three flat rooms of one height with one roof, without folds", () => {
    const { roofs } = planRoofs(plan([bedroom, hall, big]));
    expect(roofs).toHaveLength(1);
    const r = roofs[0];
    expect(r.rooms.sort()).toEqual(["B", "H", "R"]);
    expect(r.holes).toHaveLength(0);
    expect(crosses(r.outer)).toBe(false);
    // every corner of every room is under it
    for (const rm of [bedroom, hall, big])
      for (const p of rm.points) expect(onRoof(r, p)).toBe(true);
    // and it reaches no further than the walls plus the eaves
    const lim = EAVES + 95 + 1;
    for (const p of r.outer) {
      expect(p.x).toBeGreaterThanOrEqual(-9150 - lim);
      expect(p.x).toBeLessThanOrEqual(-5900 + lim);
      expect(p.y).toBeGreaterThanOrEqual(-2000 - lim);
      expect(p.y).toBeLessThanOrEqual(7150 + lim);
    }
    const rooms = [bedroom, hall, big].reduce((a, rm) => a + Math.abs(polyArea(rm.points)), 0);
    expect(Math.abs(polyArea(r.outer))).toBeGreaterThan(rooms);
    expect(r.height({ x: -7000, y: 0 })).toBe(2400);
  });

  it("gives rooms of different heights roofs that stop at their shared wall", () => {
    const low = room("L", [
      [0, 0],
      [4000, 0],
      [4000, 3000],
      [0, 3000],
    ]);
    const high = room(
      "U",
      [
        [4000, 0],
        [7000, 0],
        [7000, 3000],
        [4000, 3000],
      ],
      flat(2700),
    );
    const { roofs } = planRoofs(plan([low, high]));
    expect(roofs).toHaveLength(2);
    const [a, b] = roofs;
    // the shared wall (x 3952..4048) rises to the high roof, which covers it;
    // the low roof stops at its face, and neither reaches into the other room
    expect(onRoof(a, { x: 3940, y: 1500 })).toBe(true);
    expect(onRoof(a, { x: 3960, y: 1500 })).toBe(false);
    expect(onRoof(b, { x: 3960, y: 1500 })).toBe(true);
    expect(onRoof(b, { x: 3940, y: 1500 })).toBe(false);
    expect(onRoof(a, { x: -400, y: 1500 })).toBe(true); // both overhang outside
    expect(onRoof(b, { x: 7400, y: 1500 })).toBe(true);
    // in front of the house each one's eaves end on the line of the shared
    // wall: the low eaves do not wrap round under the high room's
    expect(onRoof(a, { x: 3800, y: -300 })).toBe(true);
    expect(onRoof(a, { x: 4200, y: -300 })).toBe(false);
    expect(onRoof(b, { x: 4200, y: -300 })).toBe(true);
    expect(onRoof(b, { x: 3800, y: -300 })).toBe(false);
  });

  it("lets a small room built against a long side take over the eaves there", () => {
    const main = room("M", [
      [0, 0],
      [4000, 0],
      [4000, 8000],
      [0, 8000],
    ]);
    const shed = room(
      "S",
      [
        [4000, 3000],
        [6500, 3000],
        [6500, 5000],
        [4000, 5000],
      ],
      { mode: "shed", h: 2400, eaveH: 1900, ridgeH: 2200, axis: "x", ridge: 0.5 },
    );
    const { roofs } = planRoofs(plan([main, shed]));
    const [m, s] = roofs;
    expect(onRoof(m, { x: 4300, y: 1000 })).toBe(true); // the main eaves run on along the side
    expect(onRoof(m, { x: 4300, y: 7000 })).toBe(true);
    expect(onRoof(m, { x: 4300, y: 2800 })).toBe(false); // but the shed's take over near it
    expect(onRoof(s, { x: 4300, y: 2800 })).toBe(true);
    expect(onRoof(s, { x: 3800, y: 4000 })).toBe(false); // which keeps off the main room
  });
});

describe("a roof of its own", () => {
  it("overhangs a shed room's walls all round, whatever its rounding", () => {
    const shed = room(
      "S",
      [
        [-700.0000001, 7699.9999999],
        [2469.9999999, 7700.0000001],
        [2470.0000001, -1439.9999999],
        [-699.9999999, -1440.0000001],
      ],
      { mode: "shed", h: 2400, eaveH: 1900, ridgeH: 2200, axis: "x", ridge: 0.5 },
      { mode: "outside", t: 95 },
    );
    const { roofs } = planRoofs(plan([shed]));
    expect(roofs).toHaveLength(1);
    const xs = roofs[0].outer.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(-700 - 95 - EAVES, 0);
    expect(Math.max(...xs)).toBeCloseTo(2470 + 95 + EAVES, 0);
    expect(roofs[0].height({ x: -700, y: 0 })).toBeCloseTo(1900);
    expect(roofs[0].height({ x: 2470, y: 0 })).toBeCloseTo(2200);
  });

  it("splits a gable at its ridge and caps it along the whole roof", () => {
    const g = room(
      "G",
      [
        [0, 0],
        [6000, 0],
        [6000, 4000],
        [0, 4000],
      ],
      { mode: "gable", h: 2400, eaveH: 1500, ridgeH: 3500, axis: "y", ridge: 0.5 },
    );
    const { roofs, caps } = planRoofs(plan([g]));
    expect(roofs).toHaveLength(2);
    expect(roofs.every((r) => r.ridge && r.ridge.value === 2000)).toBe(true);
    expect(caps).toEqual([
      { axis: "y", value: 2000, from: -47.5 - EAVES, to: 6047.5 + EAVES, h: 3500 },
    ]);
  });

  it("keeps an L-shaped room's roof in one piece round its inner corner", () => {
    const L = room(
      "L",
      [
        [0, 0],
        [5000, 0],
        [5000, 2000],
        [2000, 2000],
        [2000, 6000],
        [0, 6000],
      ],
      flat(),
      { mode: "outside", t: 150 },
    );
    const { roofs } = planRoofs(plan([L]));
    expect(roofs).toHaveLength(1);
    expect(crosses(roofs[0].outer)).toBe(false);
    expect(
      pointInPoly({ x: 2000 + 150 + EAVES + 50, y: 2000 + 150 + EAVES + 50 }, roofs[0].outer),
    ).toBe(false); // the inner corner stays open
  });

  it("has no roof without rooms", () => {
    expect(planRoofs(plan([]))).toEqual({ roofs: [], caps: [] });
  });
});

describe("a low eave against a higher roof", () => {
  // a gable whose low eave runs along the wall of a lean-to sauna that is
  // higher than that eave, though lower than the gable's ridge; the gable's
  // wall runs on past the sauna's front wall
  const main = room(
    "M",
    [
      [0, 0],
      [5000, 0],
      [5000, 6000],
      [0, 6000],
    ],
    { mode: "gable", h: 2400, eaveH: 2000, ridgeH: 3700, axis: "x", ridge: 0.5 },
  );
  const sauna = room(
    "S",
    [
      [5000, 0],
      [8000, 0],
      [8000, 4000],
      [5000, 4000],
    ],
    { mode: "shed", h: 2400, eaveH: 2100, ridgeH: 2700, axis: "y", ridge: 0.5 },
  );

  it("gives the shared wall to the roof that is higher along it, not the one with the higher ridge", () => {
    const { roofs } = planRoofs(plan([main, sauna]));
    const s = roofs.find((r) => r.rooms.includes("S"));
    const m = roofs.filter((r) => r.rooms.includes("M"));
    expect(onRoof(s, { x: 4970, y: 2000 })).toBe(true); // the sauna roof covers the wall top
    expect(m.some((r) => onRoof(r, { x: 4970, y: 2000 }))).toBe(false);
    expect(m.some((r) => onRoof(r, { x: 4940, y: 2000 }))).toBe(true); // the gable runs up to it
  });

  it("carries the higher eave straight on over the corner of the lower roof", () => {
    // the sauna's front eave passes well above the gable's wall where that
    // runs on past the sauna, so it runs on over it instead of stepping round
    const { roofs } = planRoofs(plan([main, sauna]));
    const s = roofs.find((r) => r.rooms.includes("S"));
    const m = roofs.filter((r) => r.rooms.includes("M"));
    for (const y of [4100, 4300, 4450]) expect(onRoof(s, { x: 4960, y })).toBe(true);
    expect(onRoof(s, { x: 4940, y: 4300 })).toBe(false); // it ends on the shared line
    expect(m.some((r) => onRoof(r, { x: 4960, y: 4300 }))).toBe(true); // the gable runs on beneath
  });

  it("steps round that corner when the eave would not clear the lower roof", () => {
    const lowSauna = { ...sauna, ceiling: { ...sauna.ceiling, ridgeH: 2200 } };
    const { roofs } = planRoofs(plan([main, lowSauna]));
    const s = roofs.find((r) => r.rooms.includes("S"));
    expect(onRoof(s, { x: 5100, y: 4300 })).toBe(true);
    expect(onRoof(s, { x: 4960, y: 4300 })).toBe(false);
  });
});
