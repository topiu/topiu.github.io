import { clamp } from "../core";
import { bbox, itemPoly, pointInPoly } from "./geometry";

/* ---------------- ceilings & headroom ---------------- */

export const defaultCeiling = () => ({
  mode: "flat",
  h: 2400,
  eaveH: 1300,
  ridgeH: 2900,
  axis: "x",
  ridge: 0.5,
});
export function ceilingAt(room, p) {
  const c = room.ceiling || defaultCeiling();
  if (c.mode === "flat") return c.h;
  const b = bbox(room.points);
  const v = c.axis === "x" ? p.x : p.y;
  const a0 = c.axis === "x" ? b.x0 : b.y0;
  const a1 = c.axis === "x" ? b.x1 : b.y1;
  const span = Math.max(a1 - a0, 1);
  if (c.mode === "shed") {
    const t = clamp((v - a0) / span, 0, 1);
    return c.eaveH + (c.ridgeH - c.eaveH) * t;
  }
  const rp = a0 + span * (c.ridge ?? 0.5);
  const half = Math.max(rp - a0, a1 - rp, 1);
  return Math.max(0, c.ridgeH - (c.ridgeH - c.eaveH) * (Math.abs(v - rp) / half));
}
/* axis positions where the ceiling crosses a given height */
export function ceilingCrossings(room, T) {
  const c = room.ceiling || defaultCeiling();
  if (c.mode === "flat") return [];
  const b = bbox(room.points);
  const a0 = c.axis === "x" ? b.x0 : b.y0;
  const a1 = c.axis === "x" ? b.x1 : b.y1;
  const span = Math.max(a1 - a0, 1);
  const rise = c.ridgeH - c.eaveH;
  if (Math.abs(rise) < 1) return [];
  if (c.mode === "shed") {
    const t = (T - c.eaveH) / rise;
    return t > 0.02 && t < 0.98 ? [a0 + span * t] : [];
  }
  const rp = a0 + span * (c.ridge ?? 0.5);
  const half = Math.max(rp - a0, a1 - rp, 1);
  const d = (half * (c.ridgeH - T)) / rise;
  if (d <= 0 || d >= half) return [];
  return [rp - d, rp + d].filter((v) => v > a0 + 20 && v < a1 - 20);
}
export function roomAt(doc, p) {
  for (let i = doc.rooms.length - 1; i >= 0; i--)
    if (pointInPoly(p, doc.rooms[i].points)) return doc.rooms[i];
  return null;
}
/* lowest ceiling anywhere over a piece's footprint */
export function headroomFor(item, def, doc) {
  const room = roomAt(doc, {
    x: item.x,
    y: item.y,
  });
  if (!room) return null;
  const poly = itemPoly(item, def);
  let lo = Infinity;
  for (const p of [
    ...poly,
    {
      x: item.x,
      y: item.y,
    },
  ])
    lo = Math.min(lo, ceilingAt(room, p));
  return {
    room,
    mm: lo,
  };
}
