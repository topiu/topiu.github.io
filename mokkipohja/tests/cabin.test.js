import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { GROUP } from "../src/core";
import { seedLibrary } from "../src/domain/library";
import { rebuildRoomWalls } from "../src/domain/rooms";
import { buildCabin } from "../src/view3d/cabin";
import { furnitureModel } from "../src/view3d/furniture";
import { makeMaterials } from "../src/view3d/materials";

const mats = makeMaterials();
const rect = (id, x0, y0, x1, y1, ceiling = { mode: "flat", h: 2400 }) => ({
  id,
  name: id,
  points: [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ],
  ceiling: { h: 2400, eaveH: 1500, ridgeH: 3500, axis: "x", ridge: 0.5, ...ceiling },
  autoWalls: { mode: "centre", t: 150 },
});
/* a plan the way the app makes one: rooms with their walls built round them */
function plan(rooms, openings = [], items = []) {
  let d = { walls: [], rooms, openings: [], items };
  for (const r of rooms) d = rebuildRoomWalls(d, r);
  const wallOf = (room, edge) => d.walls.find((w) => w.room === room && w.edge === edge).id;
  return {
    ...d,
    openings: openings.map((o) => ({ id: o.id, wallId: wallOf(o.room, o.edge), ...o })),
  };
}
const defsOf = (list) => Object.fromEntries(list.map((d) => [d.id, d]));

/* does a horizontal ray from (x, y, z) towards dir hit the wall itself (not its joinery)? */
function hits(cabin, wallIndex, from, dir) {
  cabin.group.updateMatrixWorld(true);
  const mesh = cabin.walls[wallIndex].obj.children[0];
  const ray = new THREE.Raycaster(
    new THREE.Vector3(...from),
    new THREE.Vector3(...dir).normalize(),
  );
  return ray.intersectObject(mesh, false).length > 0;
}

describe("walls in 3D", () => {
  const d = plan(
    [rect("R", 0, 0, 5000, 4000)],
    [
      { id: "door", room: "R", edge: 2, off: 1500, w: 900, kind: "door", side: 1 }, // bottom wall, x 2600..3500
      { id: "win", room: "R", edge: 0, off: 1000, w: 1200, kind: "window" }, // top wall, x 1000..2200
    ],
  );
  const cabin = buildCabin(d, {}, mats);
  const wi = (edge) => d.walls.findIndex((w) => w.edge === edge);

  it("cuts the door out of the wall, and closes the wall above it", () => {
    expect(hits(cabin, wi(2), [3.05, 1.0, 6], [0, 0, -1])).toBe(false);
    expect(hits(cabin, wi(2), [3.05, 1.0, 2], [0, 0, 1])).toBe(false); // from inside too
    expect(hits(cabin, wi(2), [3.05, 2.25, 6], [0, 0, -1])).toBe(true); // above the 2050 head
    expect(hits(cabin, wi(2), [1.5, 1.0, 6], [0, 0, -1])).toBe(true); // beside it
  });

  it("puts a hole through for a window, with wall below the sill", () => {
    expect(hits(cabin, wi(0), [1.6, 1.3, -2], [0, 0, 1])).toBe(false);
    expect(hits(cabin, wi(0), [1.6, 0.5, -2], [0, 0, 1])).toBe(true);
    expect(hits(cabin, wi(0), [1.6, 2.1, -2], [0, 0, 1])).toBe(true);
  });

  it("closes the corners: the outside face runs on to the corner", () => {
    // just inside the outer corner, where square-ended walls left a notch
    expect(hits(cabin, wi(0), [-0.05, 1.0, -2], [0, 0, 1])).toBe(true);
  });

  it("marks which way each outside wall faces, for cutting it away", () => {
    const top = cabin.walls[wi(0)];
    expect(top.out.x).toBeCloseTo(0);
    expect(top.out.z).toBeCloseTo(-1);
    const right = cabin.walls[wi(1)];
    expect(right.out.x).toBeCloseTo(1);
  });

  it("raises a gable wall to the ridge and keeps the eave walls low", () => {
    const g = plan([rect("G", 0, 0, 5000, 4000, { mode: "gable" })]);
    const c = buildCabin(g, {}, mats);
    const top = (edge) => {
      const mesh = c.walls[g.walls.findIndex((w) => w.edge === edge)].obj.children[0];
      mesh.geometry.computeBoundingBox();
      return mesh.geometry.boundingBox.max.y;
    };
    expect(top(0)).toBeCloseTo(3.5, 3); // runs along x, under the ridge at x 2500
    expect(top(1)).toBeCloseTo(1.56, 2); // the inside face of the eave wall at x 4925
  });
});

describe("roofs", () => {
  const box = (o) => new THREE.Box3().setFromObject(o);

  it("overhangs the outside walls", () => {
    const c = buildCabin(plan([rect("R", 0, 0, 5000, 4000)]), {}, mats);
    const b = box(c.roof);
    expect(b.min.x).toBeCloseTo(-0.525); // half the 150 wall, then 450 of eaves
    expect(b.max.z).toBeCloseTo(4.525);
    expect(b.max.y).toBeCloseTo(2.62); // 2400 ceiling + 220 of roof
  });

  it("meets the next room's roof over the wall they share, without overlapping it", () => {
    const c = buildCabin(
      plan([rect("A", 0, 0, 4000, 3000), rect("B", 4000, 0, 7000, 3000)]),
      {},
      mats,
    );
    const [a, b] = c.roof.children.filter((o) => o.isGroup).map(box);
    expect(a.max.x).toBeCloseTo(4.0);
    expect(b.min.x).toBeCloseTo(4.0);
    expect(a.min.x).toBeCloseTo(-0.525);
  });
});

describe("furniture in 3D", () => {
  const lib = seedLibrary();
  const ACCESSORIES = new Set(["sink", "basin"]); // a tap rises above the counter

  it("fills each seed piece's footprint and stays under its height", () => {
    for (const def of lib) {
      const b = new THREE.Box3().setFromObject(furnitureModel(def, mats));
      const s = b.getSize(new THREE.Vector3());
      const W =
        def.type === "circle" ? (2 * def.r) / 1000 : def.type === "rect" ? def.w / 1000 : null;
      if (W != null) {
        expect(s.x, def.key).toBeCloseTo(W, 1);
        expect(s.z, def.key).toBeCloseTo(def.type === "circle" ? W : def.h / 1000, 1);
        expect(b.min.x, def.key).toBeGreaterThanOrEqual(-W / 2 - 0.011);
        expect(b.max.x, def.key).toBeLessThanOrEqual(W / 2 + 0.011);
      } else {
        const xs = def.points.map((p) => p.x / 1000),
          zs = def.points.map((p) => p.y / 1000);
        expect(b.min.x, def.key).toBeGreaterThanOrEqual(Math.min(...xs) - 0.011);
        expect(b.max.x, def.key).toBeLessThanOrEqual(Math.max(...xs) + 0.011);
        expect(b.min.z, def.key).toBeGreaterThanOrEqual(Math.min(...zs) - 0.011);
        expect(b.max.z, def.key).toBeLessThanOrEqual(Math.max(...zs) + 0.011);
      }
      expect(b.min.y, def.key).toBeGreaterThanOrEqual(-0.001);
      expect(b.max.y, def.key).toBeLessThanOrEqual(
        def.hz / 1000 + (ACCESSORIES.has(def.key) ? 0.3 : 0.011),
      );
    }
  });

  it("gives every seed piece a model of its own", () => {
    for (const def of lib) {
      // a piece without a model is its outline raised, in its plain group colour
      const plain = mats.paint(GROUP[def.groupKey], 1.0, 0.7);
      const used = [];
      furnitureModel(def, mats).traverse((o) => o.isMesh && used.push(o.material));
      expect(used.includes(plain), def.key).toBe(false);
    }
  });

  it("raises a custom shape's outline to its height", () => {
    const def = {
      id: "c",
      name: "Desk",
      type: "poly",
      hz: 740,
      groupKey: "custom",
      points: [
        { x: -600, y: -300 },
        { x: 600, y: -300 },
        { x: 600, y: 300 },
        { x: -100, y: 300 },
      ],
    };
    const b = new THREE.Box3().setFromObject(furnitureModel(def, mats));
    expect(b.min.x).toBeCloseTo(-0.6, 2);
    expect(b.max.z).toBeCloseTo(0.3, 2); // plan +y is +z, not mirrored
    expect(b.max.y).toBeCloseTo(0.74, 3);
  });

  it("falls back to the outline when a seed piece's shape was edited", () => {
    const sofa = { ...lib.find((x) => x.key === "cornerSofa") };
    sofa.points = sofa.points.slice(0, 5); // no longer the seed L
    const used = [];
    furnitureModel(sofa, mats).traverse((o) => o.isMesh && used.push(o.material));
    expect(used).toEqual([mats.paint(GROUP.live, 1.0, 0.7)]);
  });

  it("turns a piece red where it does not fit under the ceiling, and stands it where the plan does", () => {
    const wardrobe = lib.find((x) => x.key === "wardrobe"); // 2000 high
    const room = rect("R", 0, 0, 4000, 3000, { mode: "flat", h: 1800 });
    const d = plan([room], [], [{ id: "w", defId: wardrobe.id, x: 1000, y: 500, rot: 90 }]);
    const c = buildCabin(d, defsOf(lib), mats);
    const model = c.furniture.children[0];
    const used = new Set();
    model.traverse((o) => o.isMesh && o.material !== mats.shadow && used.add(o.material));
    expect([...used]).toEqual([mats.bad]);
    expect(model.position.x).toBeCloseTo(1.0);
    expect(model.position.z).toBeCloseTo(0.5);
    expect(model.rotation.y).toBeCloseTo(-Math.PI / 2);
  });
});

describe("odd plans", () => {
  it("builds an empty plan", () => {
    const c = buildCabin({ walls: [], rooms: [], openings: [], items: [] }, {}, mats);
    expect(c.walls).toHaveLength(0);
    expect(c.bounds.radius).toBeGreaterThanOrEqual(2);
  });

  it("builds walls with no rooms, and knows which side is out", () => {
    const pts = [
      [0, 0],
      [4000, 0],
      [4000, 3000],
      [0, 3000],
    ];
    const walls = pts.map((p, i) => ({
      id: "W" + i,
      x1: p[0],
      y1: p[1],
      x2: pts[(i + 1) % 4][0],
      y2: pts[(i + 1) % 4][1],
      t: 150,
    }));
    const c = buildCabin({ walls, rooms: [], openings: [], items: [] }, {}, mats);
    expect(c.walls).toHaveLength(4);
    expect(c.walls[0].out.z).toBeCloseTo(-1); // the top wall faces up the plan, away from the middle
  });
});
