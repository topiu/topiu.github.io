import { clamp } from "../core";
import { ceilingAt, defaultCeiling, headroomFor } from "../domain/ceilings";
import { bbox, itemPoly, triangulate, wallPoly } from "../domain/geometry";
import { DEF_WALL_H, openHead, openSill } from "../domain/openings";
import { C3, clipHalf, litFace } from "./common";

/* ---- scene assembly ---- */

export function wallTopFn(wall, doc) {
  const room = wall.room ? doc.rooms.find((r) => r.id === wall.room) : null;
  if (room) {
    const c = room.ceiling || defaultCeiling();
    if (c.mode !== "flat")
      return {
        f: (p) => ceilingAt(room, p),
        sloped: true,
      };
    return {
      f: () => c.h,
      sloped: false,
    };
  }
  const h = wall.h || doc.wallH || DEF_WALL_H;
  return {
    f: () => h,
    sloped: false,
  };
}
export function buildScene(doc, defs, opts) {
  const faces = [];
  const W = (p, z) => ({
    x: p.x,
    y: -p.y,
    z,
  });
  const push = (pts, hex, layer) => {
    if (pts.length >= 3) faces.push(litFace(pts, hex, layer));
  };

  // ground plane, so there is a horizon to orient against
  const all = [];
  for (const w of doc.walls) all.push(...wallPoly(w));
  for (const r of doc.rooms) all.push(...r.points);
  const b = all.length
    ? bbox(all)
    : {
        cx: 0,
        cy: 0,
        w: 6000,
        h: 6000,
      };
  const pad = Math.max(b.w, b.h) * 1.5 + 6000;
  push(
    [
      W(
        {
          x: b.cx - pad,
          y: b.cy - pad,
        },
        0,
      ),
      W(
        {
          x: b.cx + pad,
          y: b.cy - pad,
        },
        0,
      ),
      W(
        {
          x: b.cx + pad,
          y: b.cy + pad,
        },
        0,
      ),
      W(
        {
          x: b.cx - pad,
          y: b.cy + pad,
        },
        0,
      ),
    ],
    C3.ground,
    -1,
  );

  // floors
  for (const r of doc.rooms) {
    for (const tri of triangulate(r.points))
      push(
        tri.map((i) => W(r.points[i], 1)),
        C3.floor,
        0,
      );
  }

  // ceiling / roof surface
  if (opts.roof) {
    for (const r of doc.rooms) {
      const c = r.ceiling || defaultCeiling();
      let parts = [r.points];
      if (c.mode === "gable") {
        const rb = bbox(r.points);
        const a0 = c.axis === "x" ? rb.x0 : rb.y0,
          a1 = c.axis === "x" ? rb.x1 : rb.y1;
        const rp = a0 + (a1 - a0) * (c.ridge ?? 0.5);
        parts = [clipHalf(r.points, c.axis, rp, true), clipHalf(r.points, c.axis, rp, false)];
      }
      for (const poly of parts) {
        if (poly.length < 3) continue;
        for (const tri of triangulate(poly))
          push(
            tri.map((i) => W(poly[i], ceilingAt(r, poly[i]))),
            C3.roof,
          );
      }
    }
  }

  // walls, with real openings cut through them
  if (opts.walls) {
    for (const wl of doc.walls) {
      const L = Math.hypot(wl.x2 - wl.x1, wl.y2 - wl.y1);
      if (L < 1) continue;
      const ux = (wl.x2 - wl.x1) / L,
        uy = (wl.y2 - wl.y1) / L;
      const nx = -uy,
        ny = ux,
        t = wl.t;
      const { f: topAt, sloped } = wallTopFn(wl, doc);
      const H = (u) =>
        Math.max(
          200,
          topAt({
            x: wl.x1 + ux * u,
            y: wl.y1 + uy * u,
          }),
        );
      const P = (u, v, z) => ({
        x: wl.x1 + ux * u + nx * v,
        y: -(wl.y1 + uy * u + ny * v),
        z,
      });
      const ops = doc.openings
        .filter((o) => o.wallId === wl.id)
        .map((o) => {
          const a = clamp(o.off, 0, L),
            b2 = clamp(o.off + o.w, 0, L);
          // a low eave wall can be shorter than the opening wants to be
          const roof = Math.min(H(a), H(b2), H((a + b2) / 2));
          return {
            a,
            b: b2,
            s: openSill(o),
            h: Math.min(openHead(o), roof - 20),
          };
        })
        .filter((o) => o.b - o.a > 1 && o.h > o.s + 10)
        .sort((p, q) => p.a - q.a);
      const panel = (u0, u1, zb, topOf, capTop) => {
        const K = opts.subdiv ? clamp(Math.ceil((u1 - u0) / opts.subdiv), 1, 30) : 1;
        for (let k = 0; k < K; k++) {
          const a = u0 + ((u1 - u0) * k) / K,
            c2 = u0 + ((u1 - u0) * (k + 1)) / K;
          const ha = Math.max(zb, topOf(a)),
            hb = Math.max(zb, topOf(c2));
          if (ha - zb < 0.5 && hb - zb < 0.5) continue;
          push([P(a, t / 2, zb), P(c2, t / 2, zb), P(c2, t / 2, hb), P(a, t / 2, ha)], C3.wall);
          push([P(a, -t / 2, zb), P(c2, -t / 2, zb), P(c2, -t / 2, hb), P(a, -t / 2, ha)], C3.wall);
          if (capTop)
            push(
              [P(a, t / 2, ha), P(c2, t / 2, hb), P(c2, -t / 2, hb), P(a, -t / 2, ha)],
              C3.wallTop,
            );
        }
      };
      const cuts = [0];
      for (const o of ops) cuts.push(o.a, o.b);
      cuts.push(L);
      // land a vertex exactly on the ridge, or the gable peak comes out flattened
      const rm = wl.room ? doc.rooms.find((r) => r.id === wl.room) : null;
      const rc = rm && rm.ceiling && rm.ceiling.mode === "gable" ? rm.ceiling : null;
      if (rc) {
        const rb = bbox(rm.points);
        const a0 = rc.axis === "x" ? rb.x0 : rb.y0,
          a1 = rc.axis === "x" ? rb.x1 : rb.y1;
        const rp = a0 + (a1 - a0) * (rc.ridge ?? 0.5);
        const dd = rc.axis === "x" ? ux : uy;
        const s0 = rc.axis === "x" ? wl.x1 : wl.y1;
        if (Math.abs(dd) > 1e-6) {
          const ur = (rp - s0) / dd;
          // but never inside an opening, or the hole would be sealed back up
          if (ur > 1 && ur < L - 1 && !ops.some((o) => ur > o.a - 0.5 && ur < o.b + 0.5))
            cuts.push(ur);
        }
      }
      cuts.sort((p, q) => p - q);
      for (let i = 0; i < cuts.length - 1; i++) {
        const u0 = cuts[i],
          u1 = cuts[i + 1];
        if (u1 - u0 < 0.5) continue;
        const op = ops.find((o) => Math.abs(o.a - u0) < 0.5 && Math.abs(o.b - u1) < 0.5);
        if (!op) {
          panel(u0, u1, 0, H, true);
          continue;
        }
        if (op.s > 1) panel(u0, u1, 0, () => op.s, false);
        panel(u0, u1, op.h, H, true);
        // reveals: the depth of the hole
        if (op.s > 1)
          push(
            [
              P(op.a, t / 2, op.s),
              P(op.b, t / 2, op.s),
              P(op.b, -t / 2, op.s),
              P(op.a, -t / 2, op.s),
            ],
            C3.reveal,
          );
        push(
          [
            P(op.a, t / 2, op.h),
            P(op.b, t / 2, op.h),
            P(op.b, -t / 2, op.h),
            P(op.a, -t / 2, op.h),
          ],
          C3.reveal,
        );
        for (const u of [op.a, op.b])
          push(
            [P(u, t / 2, op.s), P(u, t / 2, op.h), P(u, -t / 2, op.h), P(u, -t / 2, op.s)],
            C3.reveal,
          );
      }
      for (const u of [0, L])
        push([P(u, t / 2, 0), P(u, -t / 2, 0), P(u, -t / 2, H(u)), P(u, t / 2, H(u))], C3.wallTop);
    }
  }

  // furniture
  if (opts.furniture) {
    for (const it of doc.items) {
      const def = defs[it.defId];
      if (!def) continue;
      const poly = itemPoly(it, def);
      const hz = def.hz ?? 700;
      const hr = headroomFor(it, def, doc);
      const base = hr && hz > hr.mm ? C3.bad : C3.grp[def.groupKey] || C3.grp.custom;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i],
          c2 = poly[(i + 1) % poly.length];
        push([W(a, 0), W(c2, 0), W(c2, hz), W(a, hz)], base);
      }
      for (const tri of triangulate(poly))
        push(
          tri.map((i) => W(poly[i], hz)),
          base,
        );
    }
  }
  return faces;
}
