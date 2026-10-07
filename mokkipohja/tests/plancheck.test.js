import { describe, expect, it } from "vitest";
import { doorSwing, planConflicts, tucks } from "../src/domain/plancheck";

const defs = {
  T: { id: "T", key: "diningTable", type: "rect", w: 1400, h: 800, hz: 750 },
  C: { id: "C", key: "chair", type: "rect", w: 450, h: 450, hz: 900 },
  S: { id: "S", key: "sofa", type: "rect", w: 2100, h: 900, hz: 850 },
  B: { id: "B", key: "bedDouble", type: "rect", w: 1600, h: 2000, hz: 550 },
};
const plan = (extra) => ({ walls: [], rooms: [], openings: [], items: [], ...extra });

describe("furniture overlaps", () => {
  it("lets a chair tuck under a dining table, either way round", () => {
    expect(tucks(defs.C, defs.T)).toBe(true);
    expect(tucks(defs.T, defs.C)).toBe(true);
    expect(tucks(defs.S, defs.T)).toBe(false);
    expect(tucks({ name: "My chair" }, defs.T)).toBe(false); // custom shapes have no key
  });

  it("does not flag chairs pushed under the table, but does flag a sofa through it", () => {
    const d = plan({
      items: [
        { id: "t", defId: "T", x: 0, y: 0, rot: 0 },
        { id: "c1", defId: "C", x: -400, y: 450, rot: 0 }, // half under the long side
        { id: "s", defId: "S", x: 0, y: -600, rot: 0 }, // through the far side
      ],
    });
    const { overlap } = planConflicts(d, defs);
    expect([...overlap].sort()).toEqual(["s", "t"]);
  });

  it("still flags a piece through a wall", () => {
    const d = plan({
      walls: [{ id: "W", x1: -2000, y1: 0, x2: 2000, y2: 0, t: 150 }],
      items: [{ id: "c", defId: "C", x: 0, y: 100, rot: 0 }],
    });
    expect([...planConflicts(d, defs).overlap]).toEqual(["c"]);
  });
});

describe("door swings", () => {
  const wall = { id: "W", x1: 0, y1: 0, x2: 4000, y2: 0, t: 150 };
  const door = { id: "D", wallId: "W", off: 1000, w: 900, kind: "door", flip: false, side: 1 };

  it("sweeps a quarter circle from the hinge on the chosen side", () => {
    const s = doorSwing(door, wall);
    expect(s[0]).toEqual({ x: 1000, y: 0 }); // hinge
    for (const p of s.slice(1)) expect(Math.hypot(p.x - 1000, p.y)).toBeCloseTo(900);
    expect(s.slice(1).every((p) => p.y >= -1e-9)).toBe(true); // side 1 is +y here
    const flipped = doorSwing({ ...door, side: -1 }, wall);
    expect(flipped.slice(1).every((p) => p.y <= 1e-9)).toBe(true);
  });

  it("flags a piece standing in the swing, and the door it blocks", () => {
    // the plan the review screenshot showed: a bed where the door opens
    const d = plan({
      walls: [wall],
      openings: [door],
      items: [
        { id: "bed", defId: "B", x: 1300, y: 1200, rot: 0 },
        { id: "far", defId: "C", x: 3500, y: 1500, rot: 0 },
      ],
    });
    const { swing, doors } = planConflicts(d, defs);
    expect([...swing]).toEqual(["bed"]);
    expect([...doors]).toEqual(["D"]);
  });

  it("ignores windows", () => {
    const d = plan({
      walls: [wall],
      openings: [{ ...door, kind: "window" }],
      items: [{ id: "bed", defId: "B", x: 1300, y: 1200, rot: 0 }],
    });
    expect(planConflicts(d, defs).swing.size).toBe(0);
  });
});
