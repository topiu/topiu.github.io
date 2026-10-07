import { describe, expect, it } from "vitest";
import { deleteRoomCorner, insertRoomCorner, rebuildRoomWalls } from "../src/domain/rooms";

/* Regression tests for doors and windows jumping walls when a corner is added
   or deleted (review finding 2): walls follow edges by index, so changing the
   number of corners must renumber them, not just splice the points. */

const RECT = [
  { x: 0, y: 0 },
  { x: 5000, y: 0 },
  { x: 5000, y: 7000 },
  { x: 0, y: 7000 },
];
const L = [
  { x: 0, y: 0 },
  { x: 6000, y: 0 },
  { x: 6000, y: 3000 },
  { x: 3000, y: 3000 },
  { x: 3000, y: 6000 },
  { x: 0, y: 6000 },
];

function planWith(points, mode, openingsByEdge) {
  const room = { id: "R", name: "Room", points, autoWalls: { mode, t: 150 } };
  const d = rebuildRoomWalls({ id: "P", walls: [], rooms: [room], openings: [], items: [] }, room);
  const wallOf = (e) => d.walls.find((w) => w.edge === e);
  return {
    ...d,
    openings: openingsByEdge.map(([edge, off, w, kind], i) => ({
      id: "O" + i,
      wallId: wallOf(edge).id,
      off,
      w,
      kind,
      flip: false,
      side: 1,
    })),
  };
}
/* where an opening's centre is in the room */
function centreOf(doc, o) {
  const w = doc.walls.find((x) => x.id === o.wallId);
  const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
  const t = (o.off + o.w / 2) / L;
  return { x: w.x1 + (w.x2 - w.x1) * t, y: w.y1 + (w.y2 - w.y1) * t };
}
const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 1;

describe.each(["centre", "inside", "outside"])("corners with %s walls", (mode) => {
  it("adding a corner on the top edge leaves every opening where it was", () => {
    // the review's case: doors on the right and bottom walls, a window on the left
    const d = planWith(RECT, mode, [
      [1, 3000, 900, "door"],
      [2, 1500, 900, "door"],
      [3, 2000, 1200, "window"],
    ]);
    const before = d.openings.map((o) => centreOf(d, o));
    const d2 = insertRoomCorner(d, "R", 0, { x: 2500, y: 0 });
    expect(d2.rooms[0].points).toHaveLength(5);
    expect(d2.openings).toHaveLength(3);
    d2.openings.forEach((o, i) => expect(near(centreOf(d2, o), before[i])).toBe(true));
    // and the walls of later edges kept their ids
    for (const o of d2.openings) expect(o.wallId).toBe(d.openings.find((x) => x.id === o.id).wallId);
  });

  it("an opening on the split edge goes to the half it sits on", () => {
    const d = planWith(RECT, mode, [
      [0, 500, 900, "window"],
      [0, 3500, 900, "door"],
    ]);
    const before = d.openings.map((o) => centreOf(d, o));
    const d2 = insertRoomCorner(d, "R", 0, { x: 2500, y: 0 });
    const [win, door] = d2.openings;
    expect(win.wallId).toBe(d.openings[0].wallId); // first half keeps the old wall
    expect(door.wallId).not.toBe(d.openings[1].wallId); // second half is the new wall
    expect(d2.walls.find((w) => w.id === door.wallId).edge).toBe(1);
    d2.openings.forEach((o, i) => expect(near(centreOf(d2, o), before[i])).toBe(true));
  });

  it("adding a corner on the last edge keeps its openings", () => {
    const d = planWith(RECT, mode, [[3, 2000, 900, "door"]]);
    const before = centreOf(d, d.openings[0]);
    const d2 = insertRoomCorner(d, "R", 3, { x: 0, y: 3500 });
    expect(d2.openings).toHaveLength(1);
    expect(near(centreOf(d2, d2.openings[0]), before)).toBe(true);
  });

  it("deleting a corner of an L room keeps every opening", () => {
    // the review's case: deleting corner 4 dropped the west door and moved the
    // south window onto the west wall
    const d = planWith(L, mode, [
      [4, 1000, 1200, "window"], // south
      [5, 2500, 900, "door"], // west
      [0, 2000, 1200, "window"], // north
    ]);
    const before = d.openings.map((o) => centreOf(d, o));
    const d2 = deleteRoomCorner(d, "R", 4);
    expect(d2.rooms[0].points).toHaveLength(5);
    expect(d2.openings).toHaveLength(3);
    const [south, west, north] = d2.openings;
    expect(near(centreOf(d2, west), before[1])).toBe(true);
    expect(near(centreOf(d2, north), before[2])).toBe(true);
    // the south window now sits on the merged diagonal wall, which kept the
    // id of the edge before the deleted corner
    expect(south.wallId).toBe(d.walls.find((w) => w.edge === 3).id);
  });

  it("deleting corner 0 merges the last and first edges", () => {
    const d = planWith(RECT, mode, [
      [1, 3000, 900, "door"],
      [3, 2000, 900, "window"],
    ]);
    const before = centreOf(d, d.openings[0]);
    const d2 = deleteRoomCorner(d, "R", 0);
    expect(d2.walls.filter((w) => w.room === "R").map((w) => w.edge).sort()).toEqual([0, 1, 2]);
    expect(d2.openings).toHaveLength(2);
    expect(near(centreOf(d2, d2.openings[0]), before)).toBe(true);
  });
});

it("a room without automatic walls only changes its points", () => {
  const room = { id: "R", points: RECT, autoWalls: null };
  const d = { walls: [{ id: "W" }], rooms: [room], openings: [{ id: "O", wallId: "W" }] };
  expect(insertRoomCorner(d, "R", 0, { x: 2500, y: 0 }).walls).toBe(d.walls);
  expect(deleteRoomCorner(d, "R", 1).rooms[0].points).toHaveLength(3);
  expect(deleteRoomCorner(d, "R", 1).openings).toBe(d.openings);
});

it("never deletes below three corners", () => {
  const tri = { id: "R", points: RECT.slice(0, 3), autoWalls: null };
  const d = { walls: [], rooms: [tri], openings: [] };
  expect(deleteRoomCorner(d, "R", 0)).toBe(d);
});
