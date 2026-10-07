import { defaultCeiling } from "./ceilings";
import { pointInPoly } from "./geometry";
import {
  K,
  clipLine,
  inside,
  meet,
  minus,
  offset,
  polygons,
  regions,
  toPath,
  union,
} from "./polyclip";
import { ridgeOf, roofHeightAt, wallFaces } from "./wallpieces";

/* The roofs over a plan, as outlines in plan millimetres.

   Rooms with a flat ceiling at one height that stand together share one
   roof: their outlines are joined, the gaps a wall's width or two between
   them closed, so the roof runs on over every wall between them, without a
   seam. A room with a sloping ceiling has a roof of its own, split at a
   gable's ridge into its two planes. Every roof overhangs the outer face of
   its walls by EAVES, but never reaches over another roof's rooms. The wall
   two roofs share goes to the one higher along it, as that wall rises to
   it: the lower roof stops at the wall's face, the higher covers its top. Where
   two roofs meet, each one's eaves end on the line of the wall they share,
   carried on outward, and the other's take over from there. Eaves keep off
   another roof's ground, unless they pass well clear above it: where the
   lower building's wall runs on past the higher one's corner, the higher
   eave carries straight on over it instead of stepping round it.

   The outlines are worked out with polygon arithmetic (polyclip.js).
   Offsetting an outline by hand folds it over itself wherever an edge is
   shorter than the overhang, and the roof breaks up. */

export const EAVES = 450; // mm a roof overhangs the outer face of its walls
export const ROOF_BUILDUP = 220; // mm from a roof's underside (the ceiling) to its top
const JOIN = EAVES; // flat roofs of one height closer than twice this become one
const CLEAR = ROOF_BUILDUP + 50; // eaves run on over a lower roof only this far above it
const MIN_AREA = 0.01e6; // mm²: pieces smaller than this are slivers

/* a piece's outline, with points every 250 mm along its edges, where one
   roof's height can be weighed against another's */
function samples(region) {
  const out = [];
  for (const path of region)
    path.forEach((a, i) => {
      const b = path[(i + 1) % path.length];
      const n = Math.max(1, Math.ceil(Math.hypot(b.X - a.X, b.Y - a.Y) / (250 * K)));
      for (let k = 0; k < n; k++)
        out.push({ x: (a.X + ((b.X - a.X) * k) / n) / K, y: (a.Y + ((b.Y - a.Y) * k) / n) / K });
    });
  return out;
}

const flatHeight = (room) => {
  const c = room.ceiling || defaultCeiling();
  return c.mode === "flat" ? c.h : null;
};

/* The roofs: [{ rooms, outer, holes, height(p), axis, ridge }], one entry
   per flat piece of roof. height gives the underside of the roof in mm at a
   plan point; axis is the way the roof slopes ("x" or "y", for flat roofs
   the outline's longer side), so a roof's seams can run downhill; ridge is
   the gable line the piece was cut at, or null. And caps: one per gable,
   { axis, value, from, to, h }, the ridge's extent and height. */
export function planRoofs(doc) {
  const rooms = doc.rooms.filter((r) => r.points && r.points.length > 2);
  const foot = rooms.map((r) => union(offset([toPath(r.points)], wallFaces(r).outer)));
  const inner = rooms.map((r) => union(offset([toPath(r.points)], wallFaces(r).inner)));

  // flat rooms of one height whose footprints come close share a roof
  const parent = rooms.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const grown = foot.map((f) => offset(f, JOIN));
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++) {
      const hi = flatHeight(rooms[i]),
        hj = flatHeight(rooms[j]);
      if (hi == null || hj == null || Math.abs(hi - hj) > 5) continue;
      if (meet(grown[i], grown[j]).length) parent[find(i)] = find(j);
    }
  const groups = new Map();
  rooms.forEach((_, i) => {
    const g = find(i);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(i);
  });

  const roofs = [],
    caps = [];
  const list = [...groups.values()];
  // what each roof covers for certain: its rooms with their walls, gaps
  // between them closed; never another roof's rooms; and a wall two roofs
  // share goes to the one that is higher along it, as the wall rises to it
  const heightOf = (gi, p) => {
    const r = rooms[list[gi][0]];
    return flatHeight(r) ?? roofHeightAt(r, p);
  };
  const base = list.map((members, gi) => {
    let own = union(members.flatMap((i) => foot[i]));
    if (members.length > 1) own = offset(union(offset(own, JOIN)), -JOIN);
    const theirRooms = list.flatMap((m, gj) => (gj === gi ? [] : m.flatMap((i) => inner[i])));
    return minus(own, theirRooms);
  });
  for (let gi = 0; gi < list.length; gi++)
    for (let gj = gi + 1; gj < list.length; gj++) {
      const band = meet(base[gi], base[gj]);
      if (!band.length) continue;
      const pts = band.flat().map((q) => ({ x: q.X / K, y: q.Y / K }));
      const mean = (g) => pts.reduce((sum, p) => sum + heightOf(g, p), 0) / pts.length;
      if (mean(gi) >= mean(gj)) base[gj] = minus(base[gj], band);
      else base[gi] = minus(base[gi], band);
    }

  list.forEach((members, gi) => {
    const ids = members.map((i) => rooms[i].id);
    // eaves all round, square at the corners, except past where it meets
    // another roof; over another roof's ground only where they pass well
    // above it, as a higher eave runs on over the corner of a lower roof
    const others = union(list.flatMap((_, gj) => (gj === gi ? [] : base[gj])));
    let eaves = minus(offset(base[gi], EAVES), base[gi]);
    if (others.length) {
      eaves = minus(eaves, meetingShadows(base[gi], others));
      const below = [];
      list.forEach((_, gj) => {
        if (gj === gi) return;
        for (const part of regions(meet(eaves, base[gj])))
          if (!samples(part).every((p) => heightOf(gi, p) - heightOf(gj, p) >= CLEAR))
            below.push(...part);
      });
      eaves = minus(eaves, below);
    }
    const outline = union(base[gi], eaves);
    const room = rooms[members[0]];
    const h = flatHeight(room);
    if (h != null) {
      for (const pg of polygons(outline, MIN_AREA)) {
        const xs = pg.outer.map((p) => p.x),
          ys = pg.outer.map((p) => p.y);
        const axis =
          Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? "y" : "x";
        roofs.push({ rooms: ids, ...pg, height: () => h, axis, ridge: null });
      }
      return;
    }
    const c = room.ceiling || defaultCeiling();
    const ridge = ridgeOf(room);
    const height = (p) => roofHeightAt(room, p);
    const halves = ridge ? splitAt(outline, ridge) : [outline];
    const onRidge = [];
    for (const half of halves)
      for (const pg of polygons(half, MIN_AREA)) {
        roofs.push({ rooms: ids, ...pg, height, axis: c.axis, ridge });
        if (ridge)
          for (const p of pg.outer)
            if (Math.abs((ridge.axis === "x" ? p.x : p.y) - ridge.value) < 0.5)
              onRidge.push(ridge.axis === "x" ? p.y : p.x);
      }
    if (ridge && onRidge.length >= 2)
      caps.push({
        axis: ridge.axis,
        value: ridge.value,
        from: Math.min(...onRidge),
        to: Math.max(...onRidge),
        h: c.ridgeH,
      });
  });
  return { roofs, caps };
}

/* Where a roof meets another, the ground past the line they meet on: for
   each stretch of the roof's edge along the other's, the band beyond it,
   carried on along the line past both ends as far as the eaves reach. The
   other roof's eaves cover that corner; without this, both would. */
function meetingShadows(own, others) {
  const near = offset(others, 3);
  const E = EAVES * K,
    F = 2 * EAVES * K;
  const out = [];
  for (const ring of own)
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length];
      for (const seg of clipLine(a, b, near)) {
        const p = seg[0],
          q = seg[seg.length - 1];
        const L = Math.hypot(q.X - p.X, q.Y - p.Y);
        if (L < 400 * K) continue; // the end of a wall, or a touch at a corner: not a shared side
        const ux = (q.X - p.X) / L,
          uy = (q.Y - p.Y) / L;
        let nx = -uy,
          ny = ux; // outward: away from this roof's own ground
        const mid = {
          X: Math.round((p.X + q.X) / 2 + nx * 2 * K),
          Y: Math.round((p.Y + q.Y) / 2 + ny * 2 * K),
        };
        if (inside(own, mid)) {
          nx = -nx;
          ny = -ny;
        }
        const pt = (x, y) => ({ X: Math.round(x), Y: Math.round(y) });
        out.push([
          pt(p.X - ux * E, p.Y - uy * E),
          pt(q.X + ux * E, q.Y + uy * E),
          pt(q.X + ux * E + nx * F, q.Y + uy * E + ny * F),
          pt(p.X - ux * E + nx * F, p.Y - uy * E + ny * F),
        ]);
      }
    });
  return out;
}

/* an outline cut along a ridge line into the parts either side of it */
function splitAt(paths, ridge) {
  const B = 1e9;
  const v = Math.round(ridge.value * K);
  const box = (x0, y0, x1, y1) => [
    [
      { X: x0, Y: y0 },
      { X: x1, Y: y0 },
      { X: x1, Y: y1 },
      { X: x0, Y: y1 },
    ],
  ];
  return ridge.axis === "x"
    ? [meet(paths, box(-B, -B, v, B)), meet(paths, box(v, -B, B, B))]
    : [meet(paths, box(-B, -B, B, v)), meet(paths, box(-B, v, B, B))];
}

/* whether a plan point is on a roof piece: inside its outline, not in a hole */
export function onRoof(piece, p) {
  return pointInPoly(p, piece.outer) && !piece.holes.some((h) => pointInPoly(p, h));
}
