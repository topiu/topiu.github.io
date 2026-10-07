import { describe, expect, it } from "vitest";
import { blockingSegments } from "../src/domain/walk";
import {
  groupCentres,
  lyingAgainst,
  pieceEnds,
  ridgeOf,
  roofHeightAt,
  topBreaks,
  wallPieces,
  wallTop,
} from "../src/domain/wallpieces";

const W = (id, x1, y1, x2, y2, extra = {}) => ({ id, x1, y1, x2, y2, t: 150, ...extra });
const plan = (extra) => ({ walls: [], rooms: [], openings: [], items: [], ...extra });

describe("walls on the same line", () => {
  it("draws two coincident walls once, keeping both walls' openings", () => {
    // two rooms' centred walls on their shared edge, running opposite ways
    const d = plan({
      walls: [W("A", 0, 0, 4000, 0), W("B", 4000, 0, 0, 0)],
      openings: [
        { id: "d", wallId: "B", off: 500, w: 900, kind: "door" }, // 2600..3500 along A
        { id: "w", wallId: "A", off: 1000, w: 1000, kind: "window" },
      ],
    });
    const ps = wallPieces(d);
    expect(ps).toHaveLength(1);
    expect(ps[0].id).toBe("A");
    expect(ps[0].ops.map((o) => [o.kind, o.a, o.b])).toEqual([
      ["window", 1000, 2000],
      ["door", 2600, 3500],
    ]);
  });

  it("keeps the part of a wall that runs on past the one it overlaps", () => {
    const d = plan({
      walls: [W("A", 0, 0, 3000, 0), W("B", 2000, 0, 6000, 0)],
      openings: [{ id: "w", wallId: "B", off: 2000, w: 1000, kind: "window" }],
    });
    const ps = wallPieces(d);
    expect(ps.map((p) => [p.id, p.x1, p.x2])).toEqual([
      ["A", 0, 3000],
      ["B:1000", 3000, 6000],
    ]);
    expect(ps[1].ops.map((o) => [o.a, o.b])).toEqual([[1000, 2000]]); // 4000..5000 overall
  });

  it("leaves parallel walls a wall's width apart alone", () => {
    const d = plan({ walls: [W("A", 0, 0, 4000, 0), W("B", 0, 150, 4000, 150)] });
    expect(wallPieces(d)).toHaveLength(2);
  });

  it("merges two rooms' doors in the same place into one opening", () => {
    const d = plan({
      walls: [W("A", 0, 0, 4000, 0), W("B", 0, 0, 4000, 0)],
      openings: [
        { id: "a", wallId: "A", off: 1000, w: 900, kind: "door" },
        { id: "b", wallId: "B", off: 1100, w: 900, kind: "door" },
      ],
    });
    expect(wallPieces(d)[0].ops.map((o) => [o.a, o.b])).toEqual([[1000, 2000]]);
  });

  it("cuts a window that runs into a door back to the door, not into one big hole", () => {
    const d = plan({
      walls: [W("A", 0, 0, 9000, 0)],
      openings: [
        { id: "d", wallId: "A", off: 3000, w: 800, kind: "door" },
        { id: "w", wallId: "A", off: 3600, w: 1800, kind: "window" }, // 200 into the door
        { id: "v", wallId: "A", off: 6000, w: 2400, kind: "window" },
        { id: "e", wallId: "A", off: 7000, w: 800, kind: "door" }, // in the middle of that one
      ],
    });
    expect(wallPieces(d)[0].ops.map((o) => [o.kind, o.a, o.b, o.sill])).toEqual([
      ["door", 3000, 3800, 0],
      ["window", 3800, 5400, 900],
      ["window", 6000, 7000, 900],
      ["door", 7000, 7800, 0],
      ["window", 7800, 8400, 900],
    ]);
  });

  it("lets the walker through a door put in either of two coincident walls", () => {
    const d = plan({
      walls: [W("A", 0, 0, 4000, 0), W("B", 4000, 0, 0, 0)],
      openings: [{ id: "d", wallId: "B", off: 500, w: 900, kind: "door" }],
    });
    const segs = blockingSegments(d);
    expect(segs).toHaveLength(2);
    expect(segs.map((s) => [s.x1, s.x2])).toEqual([
      [0, 2600],
      [3500, 4000],
    ]);
  });
});

describe("wall corners", () => {
  it("mitres an L corner so the outside face runs on to the corner", () => {
    const ps = wallPieces(plan({ walls: [W("A", 0, 0, 4000, 0), W("B", 0, 0, 0, 3000)] }));
    const [a, b] = pieceEnds(ps);
    // A runs along +x; its +n side is +y, the inside of the corner
    expect(a.plus[0]).toBeCloseTo(75);
    expect(a.minus[0]).toBeCloseTo(-75);
    expect(a.mitre).toEqual([true, false]);
    expect(a.plus[1]).toBe(4000); // the free end is square
    // B runs along +y; its +n side is -x, the outside
    expect(b.plus[0]).toBeCloseTo(-75);
    expect(b.minus[0]).toBeCloseTo(75);
  });

  it("closes a rectangle of walls at every corner", () => {
    const pts = [
      [0, 0],
      [5000, 0],
      [5000, 4000],
      [0, 4000],
    ];
    const walls = pts.map((p, i) => W("W" + i, ...p, ...pts[(i + 1) % 4]));
    const ends = pieceEnds(wallPieces(plan({ walls })));
    for (const e of ends) {
      expect(e.mitre).toEqual([true, true]);
      expect(Math.abs(e.plus[0] - e.minus[0])).toBeCloseTo(150);
    }
  });

  it("joins walls of different thickness where their faces meet", () => {
    const ps = wallPieces(
      plan({ walls: [W("A", 0, 0, 4000, 0), W("B", 0, 0, 0, 3000, { t: 300 })] }),
    );
    const [a, b] = pieceEnds(ps);
    expect(a.plus[0]).toBeCloseTo(150); // inside face of A stops at B's inside face
    expect(a.minus[0]).toBeCloseTo(-150);
    expect(b.minus[0]).toBeCloseTo(75);
    expect(b.plus[0]).toBeCloseTo(-75);
  });

  it("cuts square where three walls meet and where a wall runs straight on", () => {
    const ps = wallPieces(
      plan({
        walls: [
          W("A", 0, 0, 4000, 0),
          W("B", 4000, 0, 8000, 0, { t: 200 }),
          W("C", 0, 0, 0, 3000),
          W("D", 0, 0, -3000, 0),
        ],
      }),
    );
    const ends = pieceEnds(ps);
    expect(ends[0].mitre).toEqual([false, false]); // A meets C and D at its start, B straight on at its end
    expect(ends[1].plus[0]).toBe(0);
  });
});

describe("roof heights", () => {
  const room = (ceiling) => ({
    id: "R",
    points: [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 4000 },
      { x: 0, y: 4000 },
    ],
    ceiling: {
      mode: "flat",
      h: 2400,
      eaveH: 1500,
      ridgeH: 3500,
      axis: "x",
      ridge: 0.5,
      ...ceiling,
    },
  });

  it("carries a shed slope on past the walls", () => {
    const r = room({ mode: "shed" });
    expect(roofHeightAt(r, { x: 0, y: 0 })).toBeCloseTo(1500);
    expect(roofHeightAt(r, { x: 6000, y: 0 })).toBeCloseTo(3500);
    expect(roofHeightAt(r, { x: -600, y: 0 })).toBeCloseTo(1300); // the low eave overhang
    expect(roofHeightAt(r, { x: 6600, y: 0 })).toBeCloseTo(3700);
  });

  it("drops both gable slopes from the ridge, past the eaves too", () => {
    const r = room({ mode: "gable", ridge: 0.25 });
    expect(roofHeightAt(r, { x: 1500, y: 2000 })).toBeCloseTo(3500);
    expect(roofHeightAt(r, { x: 0, y: 2000 })).toBeCloseTo(1500);
    expect(roofHeightAt(r, { x: 6000, y: 2000 })).toBeCloseTo(1500);
    expect(roofHeightAt(r, { x: -300, y: 2000 })).toBeCloseTo(1100); // steep short side
    expect(ridgeOf(r)).toEqual({ axis: "x", value: 1500 });
    expect(ridgeOf(room({}))).toBe(null);
  });

  it("stops a free wall at the ceiling of the room it stands in", () => {
    const r = room({ mode: "gable" });
    const d = plan({
      rooms: [r],
      walls: [W("F", 3000, 500, 3000, 3500, { h: 3000 }), W("G", 8000, 0, 8000, 3000)],
    });
    const [f, g] = wallPieces(d);
    expect(wallTop(f, d)({ x: 3000, y: 1000 })).toBe(3000); // under the 3.5 m ridge
    const off = { ...d, walls: [W("F", 1000, 500, 1000, 3500, { h: 3000 })] };
    expect(wallTop(wallPieces(off)[0], off)({ x: 1000, y: 1000 })).toBeCloseTo(2166.67, 1);
    expect(wallTop(g, d)({ x: 8000, y: 1000 })).toBe(2500); // outside: the default wall height
  });
});

describe("a smaller room built against a bigger one", () => {
  const A = {
    id: "A",
    points: [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 6000 },
      { x: 0, y: 6000 },
    ],
    ceiling: { mode: "flat", h: 2200 },
  };
  const B = {
    id: "B",
    points: [
      { x: 5000, y: 0 },
      { x: 8000, y: 0 },
      { x: 8000, y: 4000 },
      { x: 5000, y: 4000 },
    ],
    ceiling: { mode: "flat", h: 2600 },
  };
  const walls = [
    W("A1", 5000, 0, 5000, 6000, { room: "A", edge: 1 }),
    W("B3", 5000, 4000, 5000, 0, { room: "B", edge: 3 }),
  ];

  it("lets the shared wall reach the higher roof, only where the rooms share it", () => {
    const d = plan({ rooms: [A, B], walls });
    const ps = wallPieces(d);
    expect(ps).toHaveLength(1);
    expect(ps[0].shared).toEqual([{ room: "B", lo: 0, hi: 4000 }]);
    const top = wallTop(ps[0], d);
    expect(top({ x: 5000, y: 2000 })).toBe(2600); // up to the sauna's ceiling
    expect(top({ x: 5000, y: 5000 })).toBe(2200); // past it, the room's own
  });

  it("rises to the higher roof as far as that room's walls reach past the shared stretch", () => {
    // the sauna's front wall stands on, astride or outside its edge; its
    // roof, and so the shared wall, reach on to the wall's outer face
    for (const [mode, end] of [
      ["inside", 4000],
      ["centre", 4075],
      ["outside", 4150],
    ]) {
      const d = plan({ rooms: [A, { ...B, autoWalls: { mode, t: 150 } }], walls });
      const [p] = wallPieces(d);
      const top = wallTop(p, d);
      expect(top({ x: 5000, y: end - 5 })).toBe(2600);
      expect(top({ x: 5000, y: end + 5e-13 })).toBe(2600); // a corner found by interpolating
      expect(top({ x: 5000, y: end + 5 })).toBe(2200);
      expect(topBreaks(p, d)).toEqual(expect.arrayContaining([end, end + 1]));
    }
  });
});

describe("doors between rooms with a wall each", () => {
  // a hall's centred wall and the bedroom's own wall outside its edge, side
  // by side along the edge the two rooms share, their thicknesses overlapping
  const hallWall = W("H", 0, 4100, 1920, 4100, { t: 95 });
  const bedWall = W("B", 1905, 4155, 0, 4155, { t: 95 });
  const door = { id: "d", wallId: "H", off: 500, w: 800, kind: "door", side: -1 };

  it("knows which walls lie against each other", () => {
    const k = lyingAgainst(hallWall, bedWall);
    expect(k.d).toBeCloseTo(55);
    expect(k.lo).toBe(0);
    expect(k.hi).toBe(1905);
    expect(k.dir).toBe(-1);
    expect(lyingAgainst(hallWall, W("C", 0, 4400, 1920, 4400, { t: 95 }))).toBe(null); // a gap between
    expect(lyingAgainst(hallWall, W("D", 0, 4100, 0, 6000))).toBe(null); // across, not along
  });

  it("puts a door in one through the other as a plain hole", () => {
    const ps = wallPieces(plan({ walls: [hallWall, bedWall], openings: [door] }));
    const [h, b] = ps;
    expect(h.ops).toHaveLength(1);
    expect(h.ops[0].through).toBeFalsy(); // the door itself, with its frame and leaf
    expect(b.ops).toHaveLength(1);
    expect(b.ops[0].through).toBe(true);
    // the same stretch, measured along the bedroom wall, a millimetre wider each side
    expect(b.ops[0].a).toBeCloseTo(1905 - 1300 - 1);
    expect(b.ops[0].b).toBeCloseTo(1905 - 500 + 1);
  });

  it("lets the walker through both walls", () => {
    const segs = blockingSegments(plan({ walls: [hallWall, bedWall], openings: [door] }));
    expect(segs).toHaveLength(4); // each wall split by the doorway
    const blocking = segs.filter((s) => Math.min(s.x1, s.x2) < 900 && Math.max(s.x1, s.x2) > 900);
    expect(blocking).toHaveLength(0);
  });

  it("does the same for rooms with walls inside them, back to back", () => {
    const a = W("A", 0, 2925, 4000, 2925, { t: 150 }),
      b = W("B", 4000, 3075, 0, 3075, { t: 150 });
    const ps = wallPieces(
      plan({
        walls: [a, b],
        openings: [{ id: "w", wallId: "B", off: 1000, w: 1200, kind: "window" }],
      }),
    );
    expect(ps[0].ops.map((o) => [o.kind, !!o.through])).toEqual([["window", true]]);
  });

  it("keeps one opening where both rooms put a door in their wall", () => {
    const ps = wallPieces(
      plan({
        walls: [hallWall, bedWall],
        openings: [door, { id: "e", wallId: "B", off: 1905 - 1300, w: 800, kind: "door", side: 1 }],
      }),
    );
    for (const p of ps) {
      expect(p.ops).toHaveLength(1);
      expect(p.ops[0].through).toBe(false); // each wall keeps its own door
    }
  });
});

describe("buildings drawn with free walls", () => {
  it("finds the middle of each building, not of the whole plan", () => {
    const box = (id, x0, y0, x1, y1) => [
      W(id + 0, x0, y0, x1, y0),
      W(id + 1, x1, y0, x1, y1),
      W(id + 2, x1, y1, x0, y1),
      W(id + 3, x0, y1, x0, y0),
    ];
    const walls = [
      ...box("a", 0, 0, 4000, 3000),
      ...box("b", 10000, 0, 13000, 9000),
      W("p", 10004, 5000, 11400, 5000),
    ];
    const c = groupCentres(wallPieces(plan({ walls })));
    expect(c[0]).toEqual({ x: 2000, y: 1500 });
    expect(c[4]).toEqual({ x: 11500, y: 4500 });
    expect(c[8]).toEqual({ x: 11500, y: 4500 }); // the partition belongs to its building
  });
});
