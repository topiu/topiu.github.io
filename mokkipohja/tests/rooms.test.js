import { describe, expect, it } from "vitest";
import { polyArea } from "../src/domain/geometry";
import { offsetPoly, rebuildRoomWalls, roomWallLines } from "../src/domain/rooms";

const room = (mode = "centre") => ({
  id: "R",
  name: "Room",
  points: [
    { x: 0, y: 0 },
    { x: 5000, y: 0 },
    { x: 5000, y: 7000 },
    { x: 0, y: 7000 },
  ],
  autoWalls: { mode, t: 150 },
});
const doc = (r) => ({ id: "P", walls: [], rooms: [r], openings: [], items: [], wallT: 150 });

describe("room walls", () => {
  it("builds one wall per edge, tagged with its room and edge", () => {
    const r = room();
    const d = rebuildRoomWalls(doc(r), r);
    expect(d.walls).toHaveLength(4);
    expect(d.walls.map((w) => [w.room, w.edge])).toEqual([
      ["R", 0],
      ["R", 1],
      ["R", 2],
      ["R", 3],
    ]);
  });

  it("keeps wall ids while the room is reshaped, so openings stay attached", () => {
    const r = room();
    const d1 = rebuildRoomWalls(doc(r), r);
    const right = d1.walls.find((w) => w.edge === 1);
    const withDoor = { ...d1, openings: [{ id: "O", wallId: right.id, off: 3000, w: 900, kind: "door" }] };
    const wider = { ...r, points: r.points.map((p) => (p.x > 0 ? { ...p, x: 6000 } : p)) };
    const d2 = rebuildRoomWalls({ ...withDoor, rooms: [wider] }, wider);
    expect(d2.walls.find((w) => w.edge === 1).id).toBe(right.id);
    expect(d2.openings).toEqual(withDoor.openings);
  });

  it("puts inside walls inside the outline and outside walls outside it", () => {
    const r = room();
    const area = (mode) => Math.abs(polyArea(roomWallLines(r, 150, mode)));
    expect(area("inside")).toBeLessThan(35e6);
    expect(area("outside")).toBeGreaterThan(35e6);
    expect(area("centre")).toBe(35e6);
  });

  it("offsets a polygon by exactly the distance on every side", () => {
    const pts = room().points;
    const areas = [100, -100].map((d) => Math.abs(polyArea(offsetPoly(pts, d)))).sort();
    expect(areas[0]).toBeCloseTo(4800 * 6800, 0);
    expect(areas[1]).toBeCloseTo(5200 * 7200, 0);
  });

  it("drops a room's walls and their openings when auto walls are turned off", () => {
    const r = room();
    const d1 = rebuildRoomWalls(doc(r), r);
    const withDoor = { ...d1, openings: [{ id: "O", wallId: d1.walls[0].id, off: 100, w: 900 }] };
    const off = { ...r, autoWalls: { mode: "none", t: 150 } };
    const d2 = rebuildRoomWalls({ ...withDoor, rooms: [off] }, off);
    expect(d2.walls).toEqual([]);
    expect(d2.openings).toEqual([]);
  });
});
