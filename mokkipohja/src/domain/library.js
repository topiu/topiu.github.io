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
