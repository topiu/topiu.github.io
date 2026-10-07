import { clamp } from "../core";

/* ============================================================
   3D — flat-shaded painter's algorithm straight onto canvas 2D.
   No WebGL, no three.js: the scene is a few hundred convex faces,
   which sorts and fills fast and keeps the standalone file small.
   Plan Y points south; 3D world negates it so Z-up is right-handed.
   ============================================================ */

export const C3 = {
  sky1: "#9FB4C2",
  sky2: "#D7DFE2",
  ground: "#AFB79C",
  floor: "#CBBFA2",
  roof: "#7E8A80",
  wall: "#DBD6C7",
  wallTop: "#BFB9A6",
  reveal: "#C6C0AE",
  grp: {
    sleep: "#7C93A8",
    live: "#C3924F",
    kitchen: "#8FA86B",
    heat: "#B4602F",
    sauna: "#A87F52",
    store: "#8C8C7A",
    custom: "#9A8FB0",
  },
  bad: "#B4402F",
};
export function hex2rgb(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
export function shadeCss(hex, k) {
  const [r, g, b] = hex2rgb(hex);
  const f = (v) => Math.round(clamp(v * k, 0, 255));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
/* keep the part of a polygon on one side of an axis-aligned line */
export function clipHalf(poly, axis, value, keepBelow) {
  const inside = (p) =>
    keepBelow ? (axis === "x" ? p.x : p.y) <= value : (axis === "x" ? p.x : p.y) >= value;
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    const ai = inside(a),
      bi = inside(b);
    if (ai) out.push(a);
    if (ai !== bi) {
      const av = axis === "x" ? a.x : a.y,
        bv = axis === "x" ? b.x : b.y;
      const tt = (value - av) / (bv - av || 1);
      out.push({
        x: a.x + (b.x - a.x) * tt,
        y: a.y + (b.y - a.y) * tt,
      });
    }
  }
  return out;
}
export function faceNormal(pts) {
  let nx = 0,
    ny = 0,
    nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length];
    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
  }
  const L = Math.hypot(nx, ny, nz) || 1;
  return {
    x: nx / L,
    y: ny / L,
    z: nz / L,
  };
}
export const SUN = (() => {
  const v = {
    x: -0.35,
    y: -0.55,
    z: 0.76,
  };
  const L = Math.hypot(v.x, v.y, v.z);
  return {
    x: v.x / L,
    y: v.y / L,
    z: v.z / L,
  };
})();
export function litFace(pts, hex, layer) {
  const n = faceNormal(pts);
  const d = Math.abs(n.x * SUN.x + n.y * SUN.y + n.z * SUN.z);
  const k = 0.62 + 0.5 * d;
  const [r, g, b] = hex2rgb(hex);
  const rr = clamp(r * k, 0, 255),
    gg = clamp(g * k, 0, 255),
    bb = clamp(b * k, 0, 255);
  return {
    pts,
    layer: layer || 1,
    css: `rgb(${Math.round(rr)},${Math.round(gg)},${Math.round(bb)})`,
    rgb: [rr / 255, gg / 255, bb / 255],
  };
}
