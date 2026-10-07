import { describe, expect, it } from "vitest";
import { rebuildRoomWalls, snapRoomVertex } from "../src/domain/rooms";

const RECT = [
  { x: 0, y: 0 },
  { x: 5000, y: 0 },
  { x: 5000, y: 7000 },
  { x: 0, y: 7000 },
];
function planWith(mode) {
  const room = { id: "R", points: RECT, autoWalls: { mode, t: 150 } };
  return rebuildRoomWalls({ walls: [], rooms: [room], openings: [], items: [] }, room);
}

describe("snapping a dragged room corner (review finding 6)", () => {
  it("ignores the room's own inside walls", () => {
    // the inside wall ends sit 75 mm in from the corner on both axes; the corner
    // used to snap onto them and jitter there on alternate moves
    const d = planWith("inside");
    const sn = snapRoomVertex({ x: 4930, y: 6930 }, d.rooms[0].points, 2, d, 0, 18);
    expect([sn.x, sn.y]).not.toEqual([4925, 6925]);
  });

  it("ignores the room's own centre walls, which end exactly on its corners", () => {
    const d = planWith("centre");
    // just off corner 2: the old code snapped to the room's own wall ends there,
    // so the corner stuck until the finger was 18 px away
    const sn = snapRoomVertex({ x: 5008, y: 7008 }, d.rooms[0].points, 2, d, 0, 18);
    expect(sn.kind).not.toBe("vertex");
  });

  it("still snaps to another room's walls", () => {
    const d = planWith("centre");
    const other = { id: "W", x1: 6000, y1: 7500, x2: 9000, y2: 7500, t: 150 };
    const doc = { ...d, walls: [...d.walls, other] };
    const sn = snapRoomVertex({ x: 6008, y: 7495 }, doc.rooms[0].points, 2, doc, 0, 18);
    expect([sn.x, sn.y, sn.kind]).toEqual([6000, 7500, "vertex"]);
  });
});
