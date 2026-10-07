import { bbox, itemPoly, pointInPoly, polyArea } from "./geometry";
import { wallPieces } from "./wallpieces";

/* Walking through the plan in 3D. Everything here is in plan millimetres
   (x right, y down); the 3D view converts. */

const unitOf = (w) => {
  const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
  return { L, ux: (w.x2 - w.x1) / L, uy: (w.y2 - w.y1) / L };
};
const insideAnyRoom = (doc, p) =>
  doc.rooms.some((r) => r.points.length > 2 && pointInPoly(p, r.points));

/* Where walk mode starts: just inside the front door, looking in. The walk
   view used to start at the plan's centre facing a fixed way, which in a
   furnished cabin meant standing in the dining table looking at a wall.
   The front door is the first door with the outside on one side and a room
   on the other; failing that, the first door in a room's wall, then any
   door. Without doors, the middle of the biggest room, looking along it.
   Returns { x, y, dir: {x, y} } with dir a unit vector. */
export function walkStart(doc, defs = {}) {
  const doors = doc.openings
    .filter((o) => o.kind === "door")
    .map((o) => {
      const w = doc.walls.find((x) => x.id === o.wallId);
      if (!w) return null;
      const { ux, uy } = unitOf(w);
      const c = { x: w.x1 + ux * (o.off + o.w / 2), y: w.y1 + uy * (o.off + o.w / 2) };
      const n = { x: -uy, y: ux };
      const ahead = insideAnyRoom(doc, { x: c.x + n.x * 400, y: c.y + n.y * 400 });
      const behind = insideAnyRoom(doc, { x: c.x - n.x * 400, y: c.y - n.y * 400 });
      // face into the house: the side with a room on it, if only one has
      const dir = !ahead && behind ? { x: -n.x, y: -n.y } : n;
      return { c, dir, outside: ahead !== behind, onRoom: !!w.room };
    })
    .filter(Boolean);
  const door = doors.find((d) => d.outside) || doors.find((d) => d.onRoom) || doors[0];
  if (door)
    return { x: door.c.x + door.dir.x * 700, y: door.c.y + door.dir.y * 700, dir: door.dir };
  const rooms = [...doc.rooms]
    .filter((r) => r.points.length > 2)
    .sort((a, b) => Math.abs(polyArea(b.points)) - Math.abs(polyArea(a.points)));
  if (rooms.length) {
    const r = rooms[0];
    const b = bbox(r.points);
    let p = { x: b.cx, y: b.cy };
    if (!pointInPoly(p, r.points)) p = { ...r.points[0] }; // a concave room's middle can be outside it
    p = clearOfFurniture(doc, defs, p, r.points);
    return { ...p, dir: b.w >= b.h ? { x: 1, y: 0 } : { x: 0, y: 1 } };
  }
  return { x: 0, y: 0, dir: { x: 0, y: 1 } };
}

/* Nudge a point off furniture, staying in the room, by searching outward. */
function clearOfFurniture(doc, defs, p, roomPts) {
  const polys = doc.items.filter((it) => defs[it.defId]).map((it) => itemPoly(it, defs[it.defId]));
  const free = (q) => !polys.some((pl) => pointInPoly(q, pl)) && pointInPoly(q, roomPts);
  if (free(p)) return p;
  for (let r = 250; r <= 4000; r += 250)
    for (let a = 0; a < 16; a++) {
      const q = {
        x: p.x + Math.cos((a / 16) * 2 * Math.PI) * r,
        y: p.y + Math.sin((a / 16) * 2 * Math.PI) * r,
      };
      if (free(q)) return q;
    }
  return p;
}

/* The walls a walker bumps into: every wall as segments, with the door
   openings taken out so the walker can pass through doors. Windows stay
   solid. Each segment carries its wall thickness. Built from the wall pieces
   the 3D view draws, so a door in one of two walls on the same line opens
   both, as it does on screen. */
export function blockingSegments(doc) {
  const out = [];
  for (const p of wallPieces(doc)) {
    const gaps = p.ops
      .filter((o) => o.kind === "door" && o.sill < 300 && o.head > 1500)
      .map((o) => [o.a, o.b]);
    let from = 0;
    for (const [a, b] of [...gaps, [p.L, p.L]]) {
      if (a > from + 1)
        out.push({
          x1: p.x1 + p.ux * from,
          y1: p.y1 + p.uy * from,
          x2: p.x1 + p.ux * a,
          y2: p.y1 + p.uy * a,
          t: p.t,
        });
      from = Math.max(from, b);
    }
  }
  return out;
}

function closestOnSeg(p, s) {
  const dx = s.x2 - s.x1,
    dy = s.y2 - s.y1;
  const L2 = dx * dx + dy * dy || 1;
  const k = Math.max(0, Math.min(1, ((p.x - s.x1) * dx + (p.y - s.y1) * dy) / L2));
  return { x: s.x1 + dx * k, y: s.y1 + dy * k };
}

/* Move from p by (dx, dy), stopping at walls and sliding along them, so
   walking into a wall at an angle glides along it rather than sticking.
   The walker is a circle of the given radius. Long moves (a tap on the
   floor far away) go in short steps, so they slide too instead of stopping
   dead at the first wall in the way. */
export function walkMove(p, dx, dy, segments, radius = 250) {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 100));
  let cur = p;
  for (let i = 0; i < n; i++) cur = walkStep(cur, dx / n, dy / n, segments, radius);
  return cur;
}

function walkStep(p, dx, dy, segments, radius) {
  let q = { x: p.x + dx, y: p.y + dy };
  // a few relaxation passes settle corners where two walls push back
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const s of segments) {
      const c = closestOnSeg(q, s);
      const min = radius + s.t / 2;
      const ex = q.x - c.x,
        ey = q.y - c.y;
      const d = Math.hypot(ex, ey);
      if (d >= min) continue;
      if (d < 1e-6) {
        // exactly on the line: push back the way we came
        const bx = p.x - q.x,
          by = p.y - q.y,
          bl = Math.hypot(bx, by) || 1;
        q = { x: c.x + (bx / bl) * min, y: c.y + (by / bl) * min };
      } else q = { x: c.x + (ex / d) * min, y: c.y + (ey / d) * min };
      moved = true;
    }
    if (!moved) break;
  }
  // never tunnel through a thin wall in one big step
  for (const s of segments) if (segmentsCross(p, q, s)) return { ...p };
  return q;
}

function segmentsCross(a, b, s) {
  const d = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const c = { x: s.x1, y: s.y1 },
    e = { x: s.x2, y: s.y2 };
  return d(a, b, c) * d(a, b, e) < 0 && d(c, e, a) * d(c, e, b) < 0;
}

/* How far back to put a camera so a sphere of the given radius fills the
   view with some margin, whatever the screen's shape: on a portrait phone the
   horizontal field of view is the narrow one. vfov in radians. */
export function fitDistance(radius, vfov, aspect, margin = 1.12) {
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  return (radius * margin) / Math.sin(Math.min(vfov, hfov) / 2);
}

/* How far back a camera must stand to see every one of a set of points,
   tighter than a bounding sphere: a sphere round a long low cabin leaves it
   small in the middle of a phone screen. dir is the unit vector from the
   point the camera looks at towards the camera; points are relative to that
   point; [x, y, z] with y up. vfov in radians. */
export function fitPointsDistance(points, dir, vfov, aspect, margin = 1.08) {
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const f = [-dir[0], -dir[1], -dir[2]];
  let r = cross(f, [0, 1, 0]);
  const rl = Math.hypot(...r);
  r = rl < 1e-6 ? [1, 0, 0] : r.map((v) => v / rl);
  const u = cross(r, f);
  const tv = Math.tan(vfov / 2) / margin,
    th = (Math.tan(vfov / 2) * aspect) / margin;
  let d = 0;
  for (const p of points) {
    const z = dot(p, dir); // how far towards the camera the point stands out
    d = Math.max(d, z + Math.abs(dot(p, r)) / th, z + Math.abs(dot(p, u)) / tv);
  }
  return d;
}
