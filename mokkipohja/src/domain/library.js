import { uid } from "../core";
import { bbox } from "./geometry";

/* ---------------- seed library ---------------- */

export const seedLibrary = () => {
  const R = (key, w, h, hz, groupKey) => ({
    id: uid(),
    key,
    type: "rect",
    w,
    h,
    hz,
    groupKey,
  });
  const CI = (key, r, hz, groupKey) => ({
    id: uid(),
    key,
    type: "circle",
    r,
    hz,
    groupKey,
  });
  const L = (key, pts, hz, groupKey) => {
    const b = bbox(pts);
    return {
      id: uid(),
      key,
      type: "poly",
      groupKey,
      hz,
      points: pts.map((p) => ({
        x: p.x - b.cx,
        y: p.y - b.cy,
      })),
    };
  };
  return [
    R("bedDouble", 1600, 2000, 550, "sleep"),
    R("bedSingle", 900, 2000, 550, "sleep"),
    R("bunk", 900, 2000, 1650, "sleep"),
    R("wardrobe", 600, 600, 2000, "sleep"),
    R("sofa", 2100, 900, 850, "live"),
    L(
      "cornerSofa",
      [
        {
          x: 0,
          y: 0,
        },
        {
          x: 2400,
          y: 0,
        },
        {
          x: 2400,
          y: 900,
        },
        {
          x: 900,
          y: 900,
        },
        {
          x: 900,
          y: 2000,
        },
        {
          x: 0,
          y: 2000,
        },
      ],
      850,
      "live",
    ),
    R("armchair", 800, 800, 950, "live"),
    R("coffeeTable", 1100, 600, 420, "live"),
    R("diningTable", 1400, 800, 750, "live"),
    CI("roundTable", 450, 750, "live"),
    R("chair", 450, 450, 900, "live"),
    R("shelf", 800, 300, 1800, "live"),
    R("fireplace", 1000, 1000, 2200, "heat"),
    R("stove", 600, 500, 700, "heat"),
    R("woodbox", 500, 400, 400, "heat"),
    R("kitchen600", 600, 600, 900, "kitchen"),
    R("kitchen1200", 1200, 600, 900, "kitchen"),
    R("sink", 1200, 600, 900, "kitchen"),
    R("cooker", 600, 600, 900, "kitchen"),
    R("fridge", 600, 600, 850, "kitchen"),
    L(
      "cornerTop",
      [
        {
          x: 0,
          y: 0,
        },
        {
          x: 1800,
          y: 0,
        },
        {
          x: 1800,
          y: 600,
        },
        {
          x: 600,
          y: 600,
        },
        {
          x: 600,
          y: 1800,
        },
        {
          x: 0,
          y: 1800,
        },
      ],
      900,
      "kitchen",
    ),
    R("kiuas", 600, 500, 900, "sauna"),
    L(
      "laude",
      [
        {
          x: 0,
          y: 0,
        },
        {
          x: 2000,
          y: 0,
        },
        {
          x: 2000,
          y: 600,
        },
        {
          x: 600,
          y: 600,
        },
        {
          x: 600,
          y: 1200,
        },
        {
          x: 0,
          y: 1200,
        },
      ],
      1100,
      "sauna",
    ),
    R("shower", 900, 900, 2100, "sauna"),
    R("wc", 400, 700, 800, "sauna"),
    R("basin", 550, 450, 850, "sauna"),
    R("storage", 1000, 400, 1900, "store"),
  ];
};

/* Seed pieces that face one way, their back meant for a wall. Unrotated,
   the 3D models face plan +y (down the screen), and the plan draws their back
   edge bold, so a piece can be turned the right way round on the plan. */
const FACING = new Set([
  "bedDouble",
  "bedSingle",
  "bunk",
  "wardrobe",
  "sofa",
  "armchair",
  "chair",
  "shelf",
  "fireplace",
  "stove",
  "kitchen600",
  "kitchen1200",
  "sink",
  "cooker",
  "fridge",
  "kiuas",
  "wc",
  "basin",
  "storage",
]);
const CORNER_PIECES = new Set(["cornerSofa", "cornerTop", "laude"]);

/* The seed's L shapes (corner sofa, corner counter, sauna bench): an arm
   along the back edge and one down the left side. Returns the outer box and
   the inner corner, in the piece's own mm, or null if the outline was edited
   into anything else. */
export function seedL(def) {
  if (def.type !== "poly" || !def.points || def.points.length !== 6) return null;
  const b = bbox(def.points);
  const [p0, p1, p2, p3, p4, p5] = def.points;
  const near = (a, v) => Math.abs(a - v) < 1;
  const ok =
    near(p0.x, b.x0) &&
    near(p0.y, b.y0) &&
    near(p1.x, b.x1) &&
    near(p1.y, b.y0) &&
    near(p2.x, b.x1) &&
    near(p3.y, p2.y) &&
    near(p4.x, p3.x) &&
    near(p4.y, b.y1) &&
    near(p5.x, b.x0) &&
    near(p5.y, b.y1) &&
    p3.x > b.x0 + 50 &&
    p3.x < b.x1 - 50 &&
    p3.y > b.y0 + 50 &&
    p3.y < b.y1 - 50;
  return ok ? { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, ix: p3.x, iy: p3.y } : null;
}

/* the edges a piece's back runs along, in its own mm: [[a, b], ...] */
export function backEdges(def) {
  if (!def || !def.key) return [];
  if (FACING.has(def.key) && def.type === "rect")
    return [
      [
        { x: -def.w / 2, y: -def.h / 2 },
        { x: def.w / 2, y: -def.h / 2 },
      ],
    ];
  const L = CORNER_PIECES.has(def.key) && seedL(def);
  if (!L)
    return [];
  return [
    [
      { x: L.x0, y: L.y1 },
      { x: L.x0, y: L.y0 },
    ],
    [
      { x: L.x0, y: L.y0 },
      { x: L.x1, y: L.y0 },
    ],
  ];
}
