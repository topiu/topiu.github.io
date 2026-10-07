import { describe, expect, it } from "vitest";
import {
  blockingSegments,
  fitDistance,
  fitPointsDistance,
  walkMove,
  walkStart,
} from "../src/domain/walk";

const RECT = [
  { x: 0, y: 0 },
  { x: 5000, y: 0 },
  { x: 5000, y: 7000 },
  { x: 0, y: 7000 },
];
const walls = RECT.map((p, i) => {
  const q = RECT[(i + 1) % 4];
  return { id: "W" + i, room: "R", edge: i, x1: p.x, y1: p.y, x2: q.x, y2: q.y, t: 150 };
});
const cabin = (openings = [], items = []) => ({
  rooms: [{ id: "R", points: RECT }],
  walls,
  openings,
  items,
});
const door = { id: "D", wallId: "W2", off: 1500, w: 900, kind: "door", flip: false, side: 1 }; // bottom wall, running right to left

describe("where walk mode starts", () => {
  it("stands just inside the front door, facing into the room", () => {
    const s = walkStart(cabin([door]));
    // the bottom wall runs from (5000,7000) to (0,7000); the door centre is 1950 mm along it
    expect(s.x).toBeCloseTo(3050);
    expect(s.y).toBeCloseTo(6300); // 700 mm inside
    expect(s.dir.x).toBeCloseTo(0);
    expect(s.dir.y).toBeCloseTo(-1); // looking up the room, away from the door
  });

  it("prefers a door in a room's wall to a door in a free wall", () => {
    const shed = { id: "F", x1: 8000, y1: 0, x2: 8000, y2: 3000, t: 150 };
    const d = {
      ...cabin([{ ...door, id: "X", wallId: "F", off: 500 }, door]),
      walls: [shed, ...walls],
    };
    expect(walkStart(d).y).toBeCloseTo(6300);
  });

  it("takes the door to the outside over a door between two rooms", () => {
    const B = [
      { x: 5000, y: 0 },
      { x: 8000, y: 0 },
      { x: 8000, y: 4000 },
      { x: 5000, y: 4000 },
    ];
    const inner = { id: "I", wallId: "W1", off: 1500, w: 800, kind: "door" }; // the shared side x = 5000
    const d = {
      ...cabin([inner, door]),
      rooms: [
        { id: "R", points: RECT },
        { id: "B", points: B },
      ],
    };
    const s = walkStart(d);
    expect(s.y).toBeCloseTo(6300); // the bottom door, listed second
    expect(s.dir.y).toBeCloseTo(-1);
  });

  it("in a small hall, looks through a door into the room beyond", () => {
    // a 1.9 m hall with its front door on the right; the big room through a door on its far side
    const hall = [
      { x: 0, y: 0 },
      { x: 1900, y: 0 },
      { x: 1900, y: 1400 },
      { x: 0, y: 1400 },
    ];
    const big = [
      { x: -1500, y: -5000 },
      { x: 3000, y: -5000 },
      { x: 3000, y: 0 },
      { x: -1500, y: 0 },
    ];
    const ring = (id, pts) =>
      pts.map((p, i) => ({
        id: id + i,
        room: id,
        edge: i,
        x1: p.x,
        y1: p.y,
        x2: pts[(i + 1) % 4].x,
        y2: pts[(i + 1) % 4].y,
        t: 100,
      }));
    const d = {
      rooms: [
        { id: "H", points: hall },
        { id: "B", points: big },
      ],
      walls: [...ring("H", hall), ...ring("B", big)],
      openings: [
        { id: "front", wallId: "H1", off: 300, w: 800, kind: "door" }, // the hall's right side
        { id: "in", wallId: "H0", off: 550, w: 800, kind: "door" }, // its top, into the big room
      ],
      items: [],
    };
    const s = walkStart(d);
    expect(s.x).toBeCloseTo(1200); // 700 mm in from the front door
    expect(s.dir.y).toBeLessThan(-0.4); // looking up into the big room, not at the hall's back wall
  });

  it("without doors, stands in the biggest room, clear of furniture", () => {
    const defs = { T: { id: "T", type: "rect", w: 1400, h: 800 } };
    const s = walkStart(cabin([], [{ id: "t", defId: "T", x: 2500, y: 3500, rot: 0 }]), defs);
    const onTable = Math.abs(s.x - 2500) < 700 && Math.abs(s.y - 3500) < 400;
    expect(onTable).toBe(false);
    expect(s.x > 0 && s.x < 5000 && s.y > 0 && s.y < 7000).toBe(true);
    expect(s.dir).toEqual({ x: 0, y: 1 }); // along the room's long side
  });
});

describe("walking into walls", () => {
  it("leaves a gap for doors but not for windows", () => {
    const segs = blockingSegments(
      cabin([door, { id: "Wi", wallId: "W0", off: 1000, w: 1200, kind: "window" }]),
    );
    const bottom = segs.filter((s) => s.y1 === 7000 && s.y2 === 7000);
    expect(bottom).toHaveLength(2); // split by the door
    const top = segs.filter((s) => s.y1 === 0 && s.y2 === 0);
    expect(top).toHaveLength(1); // the window does not let you through
  });

  it("stops at a wall and slides along it", () => {
    const segs = blockingSegments(cabin());
    const p = walkMove({ x: 2500, y: 500 }, 300, -1000, segs);
    expect(p.y).toBeGreaterThanOrEqual(250 + 75 - 1e-6); // radius plus half the wall
    expect(p.x).toBeCloseTo(2800); // the sideways part of the step still happens
  });

  it("walks out through the door", () => {
    const segs = blockingSegments(cabin([door]));
    let p = { x: 3050, y: 6300 };
    for (let i = 0; i < 20; i++) p = walkMove(p, 0, 100, segs);
    expect(p.y).toBeGreaterThan(7500);
  });

  it("does not tunnel through a wall in one long step", () => {
    const segs = blockingSegments(cabin());
    const p = walkMove({ x: 2500, y: 6500 }, 0, 3000, segs);
    expect(p.y).toBeLessThan(7000);
  });
});

describe("framing", () => {
  it("backs off further on a portrait screen than on a landscape one", () => {
    const fov = (50 * Math.PI) / 180;
    expect(fitDistance(10, fov, 390 / 844)).toBeGreaterThan(fitDistance(10, fov, 844 / 390) * 1.5);
  });

  it("fits a box exactly: a unit cube head on, with a 90° view", () => {
    const corners = [];
    for (const x of [-0.5, 0.5])
      for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) corners.push([x, y, z]);
    expect(fitPointsDistance(corners, [0, 0, 1], Math.PI / 2, 1, 1)).toBeCloseTo(1);
    // a wide screen has room to the sides, so only the height decides
    expect(fitPointsDistance(corners, [0, 0, 1], Math.PI / 2, 2, 1)).toBeCloseTo(1);
    // an upright one needs to stand back for the width
    expect(fitPointsDistance(corners, [0, 0, 1], Math.PI / 2, 0.5, 1)).toBeCloseTo(1.5);
  });

  it("puts the outermost corner of a cabin right at the edge of the view", () => {
    const corners = [];
    for (const x of [-4, 4])
      for (const y of [-1.5, 1.5]) for (const z of [-3, 3]) corners.push([x, y, z]);
    const fov = (45 * Math.PI) / 180,
      aspect = 390 / 760;
    const dir = [0.5, 0.7, 0.5].map((v) => v / Math.hypot(0.5, 0.7, 0.5));
    const d = fitPointsDistance(corners, dir, fov, aspect, 1);
    // project every corner from a camera at that distance: all inside, one on the edge
    const f = dir.map((v) => -v);
    const r = [f[2], 0, -f[0]].map((v) => v / Math.hypot(f[2], f[0]));
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const worst = Math.max(
      ...corners.map((p) => {
        const depth = d - dot(p, dir);
        return Math.max(
          Math.abs(dot(p, r)) / (depth * Math.tan(fov / 2) * aspect),
          Math.abs(dot(p, u)) / (depth * Math.tan(fov / 2)),
        );
      }),
    );
    expect(worst).toBeCloseTo(1, 6);
    expect(d).toBeLessThan(fitDistance(Math.hypot(4, 1.5, 3), fov, aspect, 1));
  });
});
