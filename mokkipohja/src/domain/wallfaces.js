import { roomAt } from "./ceilings";
import { meet, minus, polygons, toPath } from "./polyclip";
import { ridgeOf, roofHeightAt } from "./wallpieces";

/* Which parts of a wall's face are indoors, for dressing them as inside or
   outside wall.

   A face is indoors where a room lies on that side of it, and only up to that
   room's ceiling. A wall between rooms of different heights rises past the
   lower room's ceiling to the higher room's roof, and above the lower roof it
   stands out of doors. One face of a wall can also look into a room along part
   of its length and out of doors along the rest. Deciding a whole face by
   what lies off its middle dressed both of those as inside walls. */

const PROBE = 300; // mm out from a face to look for the room it faces

/* The face on side s (+1 or -1, along n = (-uy, ux)) of a wall piece, given
   as a polygon in the face's own terms (x: mm along the piece, y: mm up) with
   its holes, split into the parts indoors and out: [{ outer, holes, indoor }]
   in the same terms. */
export function faceParts(piece, doc, s, contour, holes = []) {
  const nx = -piece.uy,
    ny = piece.ux;
  const w = (s * piece.t) / 2,
    d = s * (piece.t / 2 + PROBE);
  const at = (u, off) => ({
    x: piece.x1 + piece.ux * u + nx * off,
    y: piece.y1 + piece.uy * u + ny * off,
  });
  const us = contour.map((p) => p.x);
  const u0 = Math.min(...us),
    u1 = Math.max(...us);
  if (!(u1 > u0)) return [];

  // where the line a little way out from the face crosses rooms' edges
  const a = at(u0, d),
    b = at(u1, d);
  const cuts = [u0, u1];
  for (const r of doc.rooms) {
    const pts = r.points || [];
    pts.forEach((p, i) => {
      const t = crossAt(a, b, p, pts[(i + 1) % pts.length]);
      if (t != null) cuts.push(u0 + (u1 - u0) * t);
    });
  }
  cuts.sort((x, y) => x - y);

  // indoors: each stretch with a room off it, up to that room's ceiling over
  // the face, bending where a gable's ridge crosses it
  const indoor = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const ua = cuts[i],
      ub = cuts[i + 1];
    if (ub - ua < 1) continue;
    const room = roomAt(doc, at((ua + ub) / 2, d));
    if (!room || !room.points || room.points.length < 3) continue;
    // run on past the face's ends, so its edges there are not traced twice
    const lo = ua === u0 ? u0 - 1000 : ua,
      hi = ub === u1 ? u1 + 1000 : ub;
    const bends = [lo, hi];
    const ridge = ridgeOf(room);
    if (ridge) {
      const k = ridge.axis === "x" ? piece.ux : piece.uy;
      const s0 = ridge.axis === "x" ? piece.x1 + nx * w : piece.y1 + ny * w;
      if (Math.abs(k) > 1e-6) bends.push((ridge.value - s0) / k);
    }
    const top = bends.filter((u) => u >= lo && u <= hi).sort((x, y) => y - x);
    indoor.push(
      toPath([
        { x: lo, y: -1000 },
        { x: hi, y: -1000 },
        ...top.map((u) => ({ x: u, y: roofHeightAt(room, at(u, w)) })),
      ]),
    );
  }
  if (!indoor.length) return [{ outer: contour, holes, indoor: false }];

  const face = [toPath(contour), ...holes.map((h) => toPath(h, false))];
  return [
    ...polygons(meet(face, indoor), 1).map((p) => ({ ...p, indoor: true })),
    ...polygons(minus(face, indoor), 1).map((p) => ({ ...p, indoor: false })),
  ];
}

/* where segment ab crosses segment pq, as a fraction of the way along ab;
   null if they do not cross or run parallel */
function crossAt(a, b, p, q) {
  const rx = b.x - a.x,
    ry = b.y - a.y,
    sx = q.x - p.x,
    sy = q.y - p.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((p.x - a.x) * sy - (p.y - a.y) * sx) / den;
  const v = ((p.x - a.x) * ry - (p.y - a.y) * rx) / den;
  return t >= 0 && t <= 1 && v >= 0 && v <= 1 ? t : null;
}
