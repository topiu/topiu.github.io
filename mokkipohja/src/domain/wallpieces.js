import { ceilingAt, defaultCeiling, roomAt } from "./ceilings";
import { bbox } from "./geometry";
import { DEF_WALL_H, openHead, openSill } from "./openings";

/* The walls as solid things, for the 3D view and for walking into them.

   Two rooms side by side with centred walls each get a wall on their shared
   edge, in the same place. Drawn twice, the two flicker through each other;
   and a door put in one of them is still blocked by the other. So a wall
   lying along one already placed only adds the part not yet covered, and
   hands its doors and windows in the covered part to the wall covering it.

   A piece: { id, wall, room, x1, y1, x2, y2, L, ux, uy, t, ops, shared },
   with ops its openings as { a, b, sill, head, kind, flip, side } in mm
   along the piece, sorted, clamped to it and not overlapping. flip and side
   are a door's hinge end and swing side, as on the opening. shared lists the
   other rooms whose walls it stands in for, as { room, lo, hi } (mm along
   the piece): there it must also reach up to their roofs. */

const SAME_LINE_MM = 10;
const SAME_DIR = 0.01; // sine of the angle, about 0.6°

export function wallPieces(doc) {
  const pieces = [];
  for (const w of doc.walls) {
    const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    if (L < 1) continue;
    const ux = (w.x2 - w.x1) / L,
      uy = (w.y2 - w.y1) / L;
    const own = doc.openings
      .filter((o) => o.wallId === w.id)
      .map((o) => ({
        a: o.off,
        b: o.off + o.w,
        sill: openSill(o),
        head: openHead(o),
        kind: o.kind,
        flip: !!o.flip,
        side: o.side || 1,
      }));
    const covered = [];
    for (const p of pieces) {
      if (Math.abs(ux * p.uy - uy * p.ux) > SAME_DIR) continue;
      if (Math.abs((p.x1 - w.x1) * -uy + (p.y1 - w.y1) * ux) > SAME_LINE_MM) continue;
      const pa = (p.x1 - w.x1) * ux + (p.y1 - w.y1) * uy,
        pb = (p.x2 - w.x1) * ux + (p.y2 - w.y1) * uy;
      const lo = Math.max(0, Math.min(pa, pb)),
        hi = Math.min(L, Math.max(pa, pb));
      if (hi - lo > 1) covered.push({ lo, hi, p, pa, dir: pb > pa ? 1 : -1 });
    }
    // a room wall merged into another stands in for that room along the overlap
    if (w.room)
      for (const c of covered)
        if (c.p.room !== w.room) {
          const ta = (c.lo - c.pa) * c.dir,
            tb = (c.hi - c.pa) * c.dir;
          c.p.shared.push({ room: w.room, lo: Math.min(ta, tb) + 0, hi: Math.max(ta, tb) + 0 }); // + 0: no -0
        }
    const keep = [];
    for (const op of own) {
      const mid = (op.a + op.b) / 2;
      const c = covered.find((k) => mid > k.lo && mid < k.hi);
      if (!c) {
        keep.push(op);
        continue;
      }
      const ta = (op.a - c.pa) * c.dir,
        tb = (op.b - c.pa) * c.dir;
      // on a wall running the other way the hinge end and the swing side turn round too
      const turned = c.dir < 0 ? { flip: !op.flip, side: -op.side } : {};
      c.p.ops.push({ ...op, ...turned, a: Math.min(ta, tb), b: Math.max(ta, tb) });
    }
    const left = subtract(
      [0, L],
      covered.map((k) => [k.lo, k.hi]),
    ).filter(([lo, hi]) => hi - lo >= 1);
    for (const [lo, hi] of left) {
      const whole = lo === 0 && hi === L;
      pieces.push({
        id: whole ? w.id : `${w.id}:${Math.round(lo)}`,
        wall: w,
        room: w.room || null,
        x1: w.x1 + ux * lo,
        y1: w.y1 + uy * lo,
        x2: w.x1 + ux * hi,
        y2: w.y1 + uy * hi,
        L: hi - lo,
        ux,
        uy,
        t: w.t || 150,
        ops: keep
          .filter((op) => (op.a + op.b) / 2 > lo && (op.a + op.b) / 2 < hi)
          .map((op) => ({ ...op, a: op.a - lo, b: op.b - lo })),
        shared: [],
      });
    }
  }
  for (const p of pieces) p.ops = tidyOpenings(p.ops, p.L);
  return pieces;
}

/* an interval minus a set of intervals */
function subtract([a, b], cuts) {
  let out = [[a, b]];
  for (const [c, d] of cuts)
    out = out.flatMap(([x, y]) => {
      if (d <= x || c >= y) return [[x, y]];
      const r = [];
      if (c > x) r.push([x, c]);
      if (d < y) r.push([d, y]);
      return r;
    });
  return out;
}

/* Clamp openings to the wall, drop slivers, and merge any that overlap (two
   rooms' doors in the same shared wall become one opening). */
function tidyOpenings(ops, L) {
  const out = [];
  for (const op of ops
    .map((o) => ({ ...o, a: Math.max(0, o.a), b: Math.min(L, o.b) }))
    .filter((o) => o.b - o.a >= 50 && o.head > o.sill)
    .sort((p, q) => p.a - q.a)) {
    const prev = out[out.length - 1];
    if (prev && op.a < prev.b) {
      prev.b = Math.max(prev.b, op.b);
      prev.sill = Math.min(prev.sill, op.sill);
      prev.head = Math.max(prev.head, op.head);
      if (op.kind === "door") prev.kind = "door";
    } else out.push({ ...op });
  }
  return out;
}

/* How each piece ends. Where exactly two pieces meet at an end they are
   mitred: each face runs on to where it meets the matching face of the
   other, so a corner closes instead of leaving a square notch outside. Ends
   that meet nothing, or three or more pieces, are cut square.

   For each piece: { plus: [u0, u1], minus: [u0, u1], mitre: [bool, bool] },
   the extent along the piece (mm from x1, y1) of its face on the +n side,
   n = (-uy, ux), and of its face on the -n side. */
export function pieceEnds(pieces) {
  const ends = [];
  pieces.forEach((p, i) => {
    ends.push({ i, k: 0, x: p.x1, y: p.y1, dx: p.ux, dy: p.uy, t: p.t });
    ends.push({ i, k: 1, x: p.x2, y: p.y2, dx: -p.ux, dy: -p.uy, t: p.t });
  });
  const out = pieces.map((p) => ({ plus: [0, p.L], minus: [0, p.L], mitre: [false, false] }));
  for (const A of ends) {
    const meet = ends.filter((B) => B.i !== A.i && Math.hypot(B.x - A.x, B.y - A.y) < 3);
    if (meet.length !== 1) continue;
    const B = meet[0];
    const m = mitre(A, B);
    if (!m) continue;
    const p = pieces[A.i];
    const u = (q) => (q.x - p.x1) * p.ux + (q.y - p.y1) * p.uy;
    const e = out[A.i];
    // at the start the +nA face is the piece's +n face; at the far end it is the -n face
    if (A.k === 0) {
      e.plus[0] = u(m[0]);
      e.minus[0] = u(m[1]);
    } else {
      e.minus[1] = u(m[0]);
      e.plus[1] = u(m[1]);
    }
    e.mitre[A.k] = true;
  }
  return out;
}

/* Where A's two faces end against B's, both ends leaving the joint point
   along (dx, dy). A's face on its left (+nA) meets B's face on its right:
   both face the angle between the two walls. Null for a straight run or a
   corner so sharp the mitre would run far out of the joint. */
function mitre(A, B) {
  const nA = { x: -A.dy, y: A.dx },
    nB = { x: -B.dy, y: B.dx };
  const cross = A.dx * B.dy - A.dy * B.dx;
  if (Math.abs(cross) < 1e-6) return null;
  const meet = (sa, sb) => {
    const ax = A.x + nA.x * sa,
      ay = A.y + nA.y * sa;
    const bx = B.x + nB.x * sb,
      by = B.y + nB.y * sb;
    const s = ((bx - ax) * B.dy - (by - ay) * B.dx) / cross;
    return { x: ax + A.dx * s, y: ay + A.dy * s };
  };
  const p1 = meet(A.t / 2, -B.t / 2),
    p2 = meet(-A.t / 2, B.t / 2);
  const far = 4 * Math.max(A.t, B.t);
  if (Math.hypot(p1.x - A.x, p1.y - A.y) > far || Math.hypot(p2.x - A.x, p2.y - A.y) > far)
    return null;
  return [p1, p2];
}

/* The roof's underside over a point, carried on past the room in the same
   slope so the eaves can overhang. Inside the room it is ceilingAt; ceilingAt
   itself stops a shed's slope at the walls. */
export function roofHeightAt(room, p) {
  const c = room.ceiling || defaultCeiling();
  if (c.mode === "flat") return c.h;
  const b = bbox(room.points);
  const v = c.axis === "x" ? p.x : p.y;
  const a0 = c.axis === "x" ? b.x0 : b.y0,
    a1 = c.axis === "x" ? b.x1 : b.y1;
  const span = Math.max(a1 - a0, 1);
  if (c.mode === "shed") return c.eaveH + ((c.ridgeH - c.eaveH) * (v - a0)) / span;
  const rp = a0 + span * (c.ridge ?? 0.5);
  const run = Math.max(v < rp ? rp - a0 : a1 - rp, 1);
  return c.ridgeH - ((c.ridgeH - c.eaveH) * Math.abs(v - rp)) / run;
}

/* a gable ceiling's ridge line: x = value (axis "x") or y = value */
export function ridgeOf(room) {
  const c = room.ceiling || defaultCeiling();
  if (c.mode !== "gable" || room.points.length < 3) return null;
  const b = bbox(room.points);
  const a0 = c.axis === "x" ? b.x0 : b.y0,
    a1 = c.axis === "x" ? b.x1 : b.y1;
  return { axis: c.axis, value: a0 + (a1 - a0) * (c.ridge ?? 0.5) };
}

/* How high a piece of wall reaches at a point. A room's wall meets its
   ceiling, and so the underside of its roof. A free wall stands at its own
   height, but never through the ceiling of a room it stands in. Where a piece
   stands in for another room's wall too, it reaches the higher of the two
   roofs, or there would be a gap under the higher one. Never less than
   200 mm, so a mistyped ceiling does not make walls vanish. */
export function wallTop(piece, doc) {
  const roomOf = (id) => doc.rooms.find((r) => r.id === id && r.points && r.points.length > 2);
  const room = piece.room ? roomOf(piece.room) : null;
  let own;
  if (room) own = (p) => roofHeightAt(room, p);
  else {
    const h = piece.wall.h || doc.wallH || DEF_WALL_H;
    own = (p) => {
      const r = roomAt(doc, p);
      return r ? Math.min(h, ceilingAt(r, p)) : h;
    };
  }
  const extra = (piece.shared || [])
    .map((s) => ({ ...s, room: roomOf(s.room) }))
    .filter((s) => s.room);
  return (p) => {
    let h = own(p);
    if (extra.length) {
      const u = (p.x - piece.x1) * piece.ux + (p.y - piece.y1) * piece.uy;
      for (const s of extra) if (u >= s.lo && u <= s.hi) h = Math.max(h, roofHeightAt(s.room, p));
    }
    return Math.max(200, h);
  };
}

/* the places along a piece where its height can step or bend: where the
   rooms it stands in for begin and end, and where their ridges cross it */
export function topBreaks(piece, doc, w = 0) {
  const out = [];
  const rooms = [piece.room, ...(piece.shared || []).map((s) => s.room)]
    .map((id) => doc.rooms.find((r) => r.id === id))
    .filter(Boolean);
  for (const s of piece.shared || []) out.push(s.lo - 1, s.lo, s.hi, s.hi + 1);
  const nx = -piece.uy,
    ny = piece.ux;
  for (const r of rooms) {
    const ridge = ridgeOf(r);
    if (!ridge) continue;
    const k = ridge.axis === "x" ? piece.ux : piece.uy;
    const s0 = ridge.axis === "x" ? piece.x1 + nx * w : piece.y1 + ny * w;
    if (Math.abs(k) > 1e-6) out.push((ridge.value - s0) / k);
  }
  return out;
}
