import { describe, expect, it } from "vitest";
import { offsetEdges, roomEdgeShares } from "../src/domain/rooms";
import { blockingSegments } from "../src/domain/walk";
import { pieceEnds, ridgeOf, roofHeightAt, wallPieces, wallTop } from "../src/domain/wallpieces";

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

describe("rooms next to each other", () => {
  const rect = (id, x0, y0, x1, y1) => ({
    id,
    points: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
  });

  it("finds the edge two rooms share, and only that one", () => {
    const g = roomEdgeShares(
      plan({ rooms: [rect("A", 0, 0, 4000, 3000), rect("B", 4000, 0, 7000, 3000)] }),
    );
    expect(g.get("A")).toEqual([[], [{ a: 0, b: 3000, gap: 0 }], [], []]);
    expect(g.get("B")).toEqual([[], [], [], [{ a: 0, b: 3000, gap: 0 }]]);
  });

  it("finds the part of a long side a smaller room is built against", () => {
    const g = roomEdgeShares(
      plan({ rooms: [rect("A", 0, 0, 5000, 6000), rect("B", 5000, 0, 8000, 4000)] }),
    );
    expect(g.get("A")[1]).toEqual([{ a: 0, b: 4000, gap: 0 }]);
  });

  it("measures the gap between rooms drawn a wall's width apart", () => {
    const g = roomEdgeShares(
      plan({ rooms: [rect("A", 0, 0, 4000, 3000), rect("B", 4150, 1000, 6000, 4000)] }),
    );
    expect(g.get("A")[1]).toEqual([{ a: 1000, b: 3000, gap: 150 }]);
    expect(g.get("B")[3]).toEqual([{ a: 1000, b: 3000, gap: 150 }]);
  });

  it("ignores a room beyond a corridor", () => {
    const g = roomEdgeShares(
      plan({ rooms: [rect("A", 0, 0, 4000, 3000), rect("B", 5200, 0, 7000, 3000)] }),
    );
    expect(g.get("A")).toEqual([[], [], [], []]);
  });

  it("steps an outline square where an edge's offset changes part-way", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 2000 }, // the right side, in two parts
      { x: 4000, y: 3000 },
      { x: 0, y: 3000 },
    ];
    const out = offsetEdges(pts, [500, 0, 500, 500, 500]);
    expect(out.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([
      [-500, -500],
      [4000, -500],
      [4000, 2000],
      [4500, 2000],
      [4500, 3500],
      [-500, 3500],
    ]);
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
});
