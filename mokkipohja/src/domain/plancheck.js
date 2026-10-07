import { itemPolyTest, polysIntersect, wallPolyTest } from "./geometry";

/* Pieces whose seat or frame goes under another's top. A chair half under a
   dining table is how a dining set looks, not a clash, and flagging it made
   every table read as an error. Seed pieces are identified by their key. */
const TUCKS_UNDER = {
  chair: ["diningTable", "roundTable"],
};
export function tucks(a, b) {
  const ok = (x, y) => !!(x && y && x.key && y.key && (TUCKS_UNDER[x.key] || []).includes(y.key));
  return ok(a, b) || ok(b, a);
}

/* The area a door leaf sweeps: the hinge and its 90° arc, as a polygon.
   Same geometry as the swing drawn on the plan. */
export function doorSwing(o, w, steps = 12) {
  const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
  const ux = (w.x2 - w.x1) / L,
    uy = (w.y2 - w.y1) / L;
  const nx = -uy,
    ny = ux;
  const hinge = o.flip ? o.off + o.w : o.off;
  const dir = o.flip ? -1 : 1;
  const sw = o.side || 1;
  const H = { x: w.x1 + ux * hinge, y: w.y1 + uy * hinge };
  const a1 = Math.atan2(ny * sw, nx * sw);
  let da = Math.atan2(uy * dir, ux * dir) - a1;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  const arc = [];
  for (let i = 0; i <= steps; i++) {
    const a = a1 + (da * i) / steps;
    arc.push({ x: H.x + Math.cos(a) * o.w, y: H.y + Math.sin(a) * o.w });
  }
  return [H, ...arc];
}

/* What is wrong with where the furniture stands:
     overlap  pieces overlapping a wall or each other (unless one tucks under)
     swing    pieces standing where a door swings
     doors    the doors whose swing something is in the way of */
export function planConflicts(doc, defs) {
  const overlap = new Set(),
    swing = new Set(),
    doors = new Set();
  const pieces = doc.items
    .map((it) => ({ it, def: defs[it.defId] }))
    .filter((x) => x.def)
    .map((x) => ({ ...x, p: itemPolyTest(x.it, x.def) }));
  const walls = doc.walls.map(wallPolyTest);
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++)
      if (!tucks(pieces[i].def, pieces[j].def) && polysIntersect(pieces[i].p, pieces[j].p)) {
        overlap.add(pieces[i].it.id);
        overlap.add(pieces[j].it.id);
      }
    for (const w of walls) if (polysIntersect(pieces[i].p, w)) overlap.add(pieces[i].it.id);
  }
  for (const o of doc.openings) {
    if (o.kind !== "door") continue;
    const w = doc.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const sector = doorSwing(o, w);
    for (const x of pieces)
      if (polysIntersect(x.p, sector)) {
        swing.add(x.it.id);
        doors.add(o.id);
      }
  }
  return { overlap, swing, doors };
}
