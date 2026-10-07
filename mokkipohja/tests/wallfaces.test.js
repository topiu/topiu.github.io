import { describe, expect, it } from "vitest";
import { pointInPoly } from "../src/domain/geometry";
import { faceParts } from "../src/domain/wallfaces";
import { wallPieces, wallTop } from "../src/domain/wallpieces";

const rect = (id, x0, y0, x1, y1, ceiling) => ({
  id,
  points: [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ],
  ceiling,
  autoWalls: { mode: "centre", t: 150 },
});

// a gable whose low eave runs along a lean-to sauna's wall, the sauna's roof
// higher than that eave; their shared wall runs on past the sauna's front
const gable = rect("A", 0, 0, 5000, 6000, {
  mode: "gable",
  h: 2400,
  eaveH: 2000,
  ridgeH: 3700,
  axis: "x",
  ridge: 0.5,
});
const sauna = rect("B", 5000, 0, 8000, 4000, {
  mode: "shed",
  h: 2400,
  eaveH: 2100,
  ridgeH: 2700,
  axis: "y",
  ridge: 0.5,
});
const doc = { rooms: [gable, sauna], walls: [], openings: [], items: [] };
for (const r of doc.rooms)
  r.points.forEach((q, i) => {
    const n = r.points[(i + 1) % 4];
    doc.walls.push({
      id: r.id + i,
      room: r.id,
      edge: i,
      x1: q.x,
      y1: q.y,
      x2: n.x,
      y2: n.y,
      t: 150,
    });
  });
const shared = wallPieces(doc).find((p) => p.id === "A1"); // x = 5000, y 0 → 6000

/* the face as buildWall draws it: along the piece, up to the wall's top */
function face(s) {
  const top = wallTop(shared, doc);
  const w = (s * shared.t) / 2;
  const at = (u) => ({
    x: shared.x1 - shared.uy * w + shared.ux * u,
    y: shared.y1 + shared.ux * w + shared.uy * u,
  });
  const us = [0, 2000, 4075, 4076, 6000];
  return [{ x: 0, y: 0 }, { x: 6000, y: 0 }, ...us.reverse().map((u) => ({ x: u, y: top(at(u)) }))];
}
const which = (parts, u, z) => {
  const hit = parts.filter(
    (p) =>
      pointInPoly({ x: u, y: z }, p.outer) && !p.holes.some((h) => pointInPoly({ x: u, y: z }, h)),
  );
  expect(hit).toHaveLength(1);
  return hit[0].indoor ? "in" : "out";
};

describe("which parts of a wall's face are indoors", () => {
  it("stands out of doors above the lower room's roof", () => {
    // the gable's side: indoors up to the gable's ceiling over the wall
    // (2051 at the face), out of doors above, up to the sauna's roof
    const parts = faceParts(shared, doc, 1, face(1));
    expect(which(parts, 3000, 1000)).toBe("in");
    expect(which(parts, 3000, 2000)).toBe("in");
    expect(which(parts, 3000, 2300)).toBe("out");
    expect(which(parts, 4000, 2650)).toBe("out");
    expect(which(parts, 5000, 1500)).toBe("in");
  });

  it("looks out of doors where the room on that side ends", () => {
    // the sauna's side: indoors along the sauna, out of doors past its front
    const parts = faceParts(shared, doc, -1, face(-1));
    expect(which(parts, 2000, 1500)).toBe("in");
    expect(which(parts, 2000, 2350)).toBe("in"); // the sauna is that high
    expect(which(parts, 5000, 1500)).toBe("out");
  });

  it("keeps a free wall out of doors in one piece, holes and all", () => {
    const wall = { id: "F", x1: 20000, y1: 0, x2: 23000, y2: 0, t: 100 };
    const [piece] = wallPieces({ ...doc, walls: [wall] });
    const outer = [
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 2400 },
      { x: 0, y: 2400 },
    ];
    const hole = [
      { x: 1000, y: 900 },
      { x: 2000, y: 900 },
      { x: 2000, y: 1500 },
      { x: 1000, y: 1500 },
    ];
    expect(faceParts(piece, doc, 1, outer, [hole])).toEqual([
      { outer, holes: [hole], indoor: false },
    ]);
  });

  it("keeps a window's hole in the part of the face it is in", () => {
    const parts = faceParts(shared, doc, -1, face(-1), [
      [
        { x: 1000, y: 900 },
        { x: 1800, y: 900 },
        { x: 1800, y: 1500 },
        { x: 1000, y: 1500 },
      ],
    ]);
    const inside = parts.filter((p) => p.indoor);
    expect(inside.some((p) => p.holes.length === 1)).toBe(true);
    expect(parts.some((p) => pointInPoly({ x: 1400, y: 1200 }, p.outer) && !p.holes.length)).toBe(
      false,
    );
  });
});
