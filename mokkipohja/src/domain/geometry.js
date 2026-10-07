import { D2R, clamp } from "../core";
import { polySigned } from "./rooms";

/* ---------------- geometry ---------------- */

export function rotP(p, a) {
  const c = Math.cos(a),
    s = Math.sin(a);
  return {
    x: p.x * c - p.y * s,
    y: p.x * s + p.y * c,
  };
}
export function bbox(pts) {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  return {
    x0,
    y0,
    x1,
    y1,
    w: x1 - x0,
    h: y1 - y0,
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
  };
}
export function defOutline(def) {
  if (def.type === "rect")
    return [
      {
        x: -def.w / 2,
        y: -def.h / 2,
      },
      {
        x: def.w / 2,
        y: -def.h / 2,
      },
      {
        x: def.w / 2,
        y: def.h / 2,
      },
      {
        x: -def.w / 2,
        y: def.h / 2,
      },
    ];
  if (def.type === "circle") {
    const n = 36;
    return Array.from(
      {
        length: n,
      },
      (_, i) => {
        const a = (i / n) * 2 * Math.PI;
        return {
          x: Math.cos(a) * def.r,
          y: Math.sin(a) * def.r,
        };
      },
    );
  }
  return def.points || [];
}
export function itemPoly(item, def) {
  const a = (item.rot || 0) * D2R;
  return defOutline(def).map((p) => {
    const r = rotP(p, a);
    return {
      x: r.x + item.x,
      y: r.y + item.y,
    };
  });
}
export function wallPoly(w) {
  const dx = w.x2 - w.x1,
    dy = w.y2 - w.y1;
  const L = Math.hypot(dx, dy) || 1;
  const nx = (-dy / L) * (w.t / 2),
    ny = (dx / L) * (w.t / 2);
  return [
    {
      x: w.x1 + nx,
      y: w.y1 + ny,
    },
    {
      x: w.x2 + nx,
      y: w.y2 + ny,
    },
    {
      x: w.x2 - nx,
      y: w.y2 - ny,
    },
    {
      x: w.x1 - nx,
      y: w.y1 - ny,
    },
  ];
}
export function distToSeg(p, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  if (L2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
  t = clamp(t, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
export function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}
export function segCross(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999;
}
export function polysIntersect(A, B) {
  for (let i = 0; i < A.length; i++)
    for (let j = 0; j < B.length; j++)
      if (segCross(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true;
  return pointInPoly(A[0], B) || pointInPoly(B[0], A);
}
/* inset an axis-aligned outline so touching edges don't count as overlap */
export function shrinkAA(poly, mm) {
  const b = bbox(poly);
  const kx = b.w > 2 * mm ? (b.w - 2 * mm) / b.w : 1;
  const ky = b.h > 2 * mm ? (b.h - 2 * mm) / b.h : 1;
  return poly.map((p) => ({
    x: b.cx + (p.x - b.cx) * kx,
    y: b.cy + (p.y - b.cy) * ky,
  }));
}
export function wallPolyTest(w) {
  const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
  const ux = (w.x2 - w.x1) / L,
    uy = (w.y2 - w.y1) / L;
  return wallPoly({
    x1: w.x1 + ux * 5,
    y1: w.y1 + uy * 5,
    x2: w.x2 - ux * 5,
    y2: w.y2 - uy * 5,
    t: Math.max(8, w.t - 10),
  });
}
export function itemPolyTest(item, def) {
  const a = (item.rot || 0) * D2R;
  return shrinkAA(defOutline(def), 5).map((p) => {
    const r = rotP(p, a);
    return {
      x: r.x + item.x,
      y: r.y + item.y,
    };
  });
}
export function polyArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
    a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  return Math.abs(a / 2);
}
/* nearest wall face along an axis ray */
export function raySpan(origin, axis, sign, walls) {
  let best = Infinity;
  for (const w of walls) {
    const poly = wallPoly(w);
    for (let i = 0; i < 4; i++) {
      const p = poly[i],
        q = poly[(i + 1) % 4];
      if (axis === "x") {
        if (p.y === q.y) continue;
        if ((p.y - origin.y) * (q.y - origin.y) > 0) continue;
        const t = (origin.y - p.y) / (q.y - p.y);
        const d = (p.x + t * (q.x - p.x) - origin.x) * sign;
        if (d > 1 && d < best) best = d;
      } else {
        if (p.x === q.x) continue;
        if ((p.x - origin.x) * (q.x - origin.x) > 0) continue;
        const t = (origin.x - p.x) / (q.x - p.x);
        const d = (p.y + t * (q.y - p.y) - origin.y) * sign;
        if (d > 1 && d < best) best = d;
      }
    }
  }
  return best === Infinity ? null : best;
}
export function pointInTri(p, a, b, c) {
  const d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
  const d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
  const d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
  const neg = d1 < 0 || d2 < 0 || d3 < 0,
    pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}
/* ear clipping; simple polygons, either winding, concave allowed */
export function triangulate(poly) {
  const n = poly.length;
  if (n < 3) return [];
  if (n === 3) return [[0, 1, 2]];
  const s = polySigned(poly) > 0 ? 1 : -1;
  const idx = [...Array(n).keys()];
  const tris = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 5000) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const m = idx.length;
      const ia = idx[(i - 1 + m) % m],
        ib = idx[i],
        ic = idx[(i + 1) % m];
      const A = poly[ia],
        B = poly[ib],
        Cc = poly[ic];
      const cross = (B.x - A.x) * (Cc.y - A.y) - (B.y - A.y) * (Cc.x - A.x);
      if (cross * s <= 0) continue; // reflex vertex: not an ear
      let ok = true;
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue;
        if (pointInTri(poly[j], A, B, Cc)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      tris.push([ia, ib, ic]);
      idx.splice(i, 1);
      cut = true;
      break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return tris;
}

/* The part of a polygon on one side of a line x = value (axis "x") or
   y = value (axis "y"); keepBelow keeps the smaller side. Splitting a room
   along its ridge gives the two halves of a gable roof, each one plane. */
export function clipHalf(poly, axis, value, keepBelow) {
  const coord = (p) => (axis === "x" ? p.x : p.y);
  const inside = (p) => (keepBelow ? coord(p) <= value : coord(p) >= value);
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    const ai = inside(a),
      bi = inside(b);
    if (ai) out.push(a);
    if (ai !== bi) {
      const t = (value - coord(a)) / (coord(b) - coord(a) || 1);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}
