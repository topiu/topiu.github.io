import { D2R, clamp, uid } from "../core";

/* ---------------- room shape helpers ---------------- */

export function polySigned(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
    a += pts[j].x * pts[i].y - pts[i].x * pts[j].y;
  return a / 2;
}
/* interior angle at corner i, in degrees (reflex corners read above 180) */
export function interiorAngle(pts, i) {
  const n = pts.length;
  const a = pts[(i - 1 + n) % n],
    b = pts[i],
    c = pts[(i + 1) % n];
  let ang = (Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x)) / D2R;
  while (ang < 0) ang += 360;
  while (ang >= 360) ang -= 360;
  return polySigned(pts) > 0 ? 360 - ang : ang;
}
export const nearMultiple = (deg, step, tol) => Math.abs(deg - Math.round(deg / step) * step) < tol;

/* mitred parallel offset; d>0 and d<0 give the two sides */
export function offsetPoly(pts, d) {
  const n = pts.length,
    out = [];
  const unit = (a, b) => {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      L = Math.hypot(dx, dy) || 1;
    return {
      x: dx / L,
      y: dy / L,
    };
  };
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n],
      p1 = pts[i],
      p2 = pts[(i + 1) % n];
    const u1 = unit(p0, p1),
      u2 = unit(p1, p2);
    const n1 = {
        x: -u1.y,
        y: u1.x,
      },
      n2 = {
        x: -u2.y,
        y: u2.x,
      };
    const cross = u1.x * u2.y - u1.y * u2.x;
    if (Math.abs(cross) < 1e-9) {
      out.push({
        x: p1.x + n1.x * d,
        y: p1.y + n1.y * d,
      });
      continue;
    }
    const a1 = {
      x: p0.x + n1.x * d,
      y: p0.y + n1.y * d,
    };
    const a2 = {
      x: p1.x + n2.x * d,
      y: p1.y + n2.y * d,
    };
    const t = ((a2.x - a1.x) * u2.y - (a2.y - a1.y) * u2.x) / cross;
    const q = {
      x: a1.x + u1.x * t,
      y: a1.y + u1.y * t,
    };
    // a very sharp corner can throw the mitre miles away; fall back to a plain offset
    const far = Math.hypot(q.x - p1.x, q.y - p1.y) > Math.abs(d) * 6 + 1;
    out.push(
      far
        ? {
            x: p1.x + n1.x * d,
            y: p1.y + n1.y * d,
          }
        : q,
    );
  }
  return out;
}
/* centrelines for walls wrapped around a room */
export function roomWallLines(room, t, mode) {
  const pts = room.points;
  if (!pts || pts.length < 3) return [];
  if (mode === "centre") return pts;
  const A = offsetPoly(pts, t / 2),
    B = offsetPoly(pts, -t / 2);
  const inner = Math.abs(polySigned(A)) < Math.abs(polySigned(B)) ? A : B;
  const outer = inner === A ? B : A;
  return mode === "inside" ? inner : outer;
}
/* Regenerate the walls belonging to a room. Wall ids are reused per edge so
   doors and windows stay attached while the room is being reshaped. */
export function rebuildRoomWalls(doc, room) {
  const mine = doc.walls.filter((w) => w.room === room.id);
  const others = doc.walls.filter((w) => w.room !== room.id);
  const cfg = room.autoWalls;
  if (!cfg || !cfg.mode || cfg.mode === "none") {
    const gone = new Set(mine.map((w) => w.id));
    return {
      ...doc,
      walls: others,
      openings: doc.openings.filter((o) => !gone.has(o.wallId)),
    };
  }
  const line = roomWallLines(room, cfg.t, cfg.mode);
  const made = line.map((p, i) => {
    const q = line[(i + 1) % line.length];
    const prev = mine.find((w) => w.edge === i);
    return {
      id: prev ? prev.id : uid(),
      room: room.id,
      edge: i,
      x1: p.x,
      y1: p.y,
      x2: q.x,
      y2: q.y,
      t: cfg.t,
    };
  });
  const live = new Map(made.map((w) => [w.id, w]));
  const openings = doc.openings
    .filter((o) => live.has(o.wallId) || !mine.some((w) => w.id === o.wallId))
    .map((o) => {
      const w = live.get(o.wallId);
      if (!w) return o;
      const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      const wid = Math.min(o.w, Math.max(L - 20, 100));
      return {
        ...o,
        w: wid,
        off: clamp(o.off, 0, Math.max(0, L - wid)),
      };
    });
  return {
    ...doc,
    walls: [...others, ...made],
    openings,
  };
}
export const withAutoWalls = (doc, roomId) => {
  const r = doc.rooms.find((x) => x.id === roomId);
  return r && r.autoWalls ? rebuildRoomWalls(doc, r) : doc;
};

/* Snap a room corner. Angle candidates win over the plain grid, so corners
   settle onto 45° and 90° rather than near them. */
export function snapRoomVertex(p, pts, i, doc, grid, tol) {
  const n = pts.length;
  const A = pts[(i - 1 + n) % n],
    B = pts[(i + 1) % n];

  // 1. existing corners and wall ends snap exactly
  const verts = [];
  for (const w of doc.walls)
    verts.push(
      {
        x: w.x1,
        y: w.y1,
      },
      {
        x: w.x2,
        y: w.y2,
      },
    );
  for (const r of doc.rooms)
    r.points.forEach((v, k) => {
      if (!(r.points === pts && k === i)) verts.push(v);
    });
  let best = null,
    bd = tol;
  for (const v of verts) {
    const d = Math.hypot(v.x - p.x, v.y - p.y);
    if (d < bd) {
      bd = d;
      best = {
        x: v.x,
        y: v.y,
        kind: "vertex",
      };
    }
  }
  if (best) return best;

  // 2. where a 15° direction off each neighbour crosses — both edges land square
  const dirs = [];
  for (let a = 0; a < 360; a += 15)
    dirs.push({
      x: Math.cos(a * D2R),
      y: Math.sin(a * D2R),
    });
  let pick = null,
    pd = tol;
  for (const d1 of dirs)
    for (const d2 of dirs) {
      const cross = d1.x * d2.y - d1.y * d2.x;
      if (Math.abs(cross) < 1e-6) continue;
      const t = ((B.x - A.x) * d2.y - (B.y - A.y) * d2.x) / cross;
      if (t < 1) continue;
      const q = {
        x: A.x + d1.x * t,
        y: A.y + d1.y * t,
      };
      if ((q.x - B.x) * d2.x + (q.y - B.y) * d2.y < 1) continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < pd) {
        pd = d;
        pick = q;
      }
    }
  if (pick)
    return {
      x: pick.x,
      y: pick.y,
      kind: "angle",
    };

  // 3. failing that, line up just one edge
  pd = tol;
  for (const base of [A, B]) {
    for (const d of dirs) {
      const t = (p.x - base.x) * d.x + (p.y - base.y) * d.y;
      if (t < 1) continue;
      const q = {
        x: base.x + d.x * t,
        y: base.y + d.y * t,
      };
      const dd = Math.hypot(q.x - p.x, q.y - p.y);
      if (dd < pd) {
        pd = dd;
        pick = q;
      }
    }
  }
  if (pick)
    return {
      x: pick.x,
      y: pick.y,
      kind: "angle",
    };

  // 4. plain grid
  if (grid)
    return {
      x: Math.round(p.x / grid) * grid,
      y: Math.round(p.y / grid) * grid,
      kind: "grid",
    };
  return {
    x: p.x,
    y: p.y,
    kind: null,
  };
}
