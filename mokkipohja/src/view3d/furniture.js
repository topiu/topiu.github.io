import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GROUP } from "../core";
import { bbox, defOutline } from "../domain/geometry";
import { seedL } from "../domain/library";

/* Furniture as 3D models, in metres, centred on the piece's origin with y
   up. A model fills its piece's footprint and stays within its height (hz),
   so the 3D view shows what the plan and the headroom check assume. Taps,
   faucets and the like may rise above a counter's height, as they would.

   The front of a piece faces +z, which is plan +y while the piece is not
   rotated: a sofa drawn along the top wall faces down into the room, a bed
   has its pillows at the top. The plan draws the back edge bold
   (backEdges in domain/library.js).

   Seed pieces (by key) get a model of their own, scaled to the piece's size.
   Anything else, and a seed piece whose shape was edited into something its
   model cannot follow, is its outline raised to its height. Parts are merged
   into one mesh per material, to keep the draw calls down. */

export function furnitureModel(def, mats, { bad = false, seed = "" } = {}) {
  const P = new Parts();
  const out = defOutline(def);
  const b = out.length ? bbox(out) : { w: 500, h: 500 };
  const d = {
    def,
    W: Math.max(0.05, b.w / 1000),
    D: Math.max(0.05, b.h / 1000),
    Hz: Math.max(0.05, (def.hz ?? 700) / 1000),
    col: GROUP[def.groupKey] || GROUP.custom,
    rnd: rng(hash(seed || def.id || def.key || "x")),
  };
  const make = MODELS[def.key];
  if (!make || make(P, mats, d) === false) {
    P.clear();
    raised(P, mats, def, d);
  }
  const g = new THREE.Group();
  for (const mesh of P.meshes()) {
    g.add(mesh);
    if (!bad) continue;
    // too tall for where it stands: a red shell and red edges over the model
    const shell = new THREE.Mesh(mesh.geometry, mats.badShell);
    shell.userData.shared = true; // the geometry is the mesh's
    shell.renderOrder = 2;
    g.add(shell);
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 35), mats.badEdge));
  }
  return g;
}

/* ---------- building blocks ---------- */

export class Parts {
  constructor() {
    this.by = new Map();
  }
  clear() {
    for (const list of this.by.values()) list.forEach((g) => g.dispose());
    this.by.clear();
  }
  add(mat, g) {
    const m = mat;
    if (!this.by.has(m)) this.by.set(m, []);
    if (g.index) {
      const flat = g.toNonIndexed();
      g.dispose();
      g = flat;
    }
    this.by.get(m).push(g);
  }
  box(mat, x0, x1, y0, y1, z0, z1) {
    const w = x1 - x0,
      h = y1 - y0,
      d = z1 - z0;
    if (w <= 1e-4 || h <= 1e-4 || d <= 1e-4) return;
    const g = new THREE.BoxGeometry(w, h, d);
    metricUV(g, w, h, d);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.add(mat, g);
  }
  /* a box with rounded edges: cushions, mattresses, porcelain */
  soft(mat, x0, x1, y0, y1, z0, z1, r = 0.03) {
    const w = x1 - x0,
      h = y1 - y0,
      d = z1 - z0;
    const rr = Math.min(r, w / 2, h / 2, d / 2) - 1e-4;
    if (rr < 0.003) return this.box(mat, x0, x1, y0, y1, z0, z1);
    const g = new RoundedBoxGeometry(w, h, d, 2, rr);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.add(mat, g);
  }
  /* an upright cylinder */
  cyl(mat, x, z, r, y0, y1, seg = 24) {
    if (y1 - y0 <= 1e-4 || r <= 0) return;
    const g = new THREE.CylinderGeometry(r, r, y1 - y0, seg);
    g.translate(x, (y0 + y1) / 2, z);
    this.add(mat, g);
  }
  /* a cylinder from point a to point b */
  rod(mat, a, b, r, seg = 10) {
    const A = new THREE.Vector3(...a),
      B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    if (len <= 1e-4) return;
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    g.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        B.clone().sub(A).normalize(),
      ),
    );
    g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
    this.add(mat, g);
  }
  geo(mat, g) {
    this.add(mat, g);
  }
  meshes() {
    const out = [];
    for (const [mat, list] of this.by) {
      const g = list.length === 1 ? list[0] : mergeGeometries(list);
      if (list.length > 1) list.forEach((x) => x.dispose());
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = !mat.transparent;
      mesh.receiveShadow = true;
      out.push(mesh);
    }
    this.by.clear();
    return out;
  }
}

/* box UVs in metres, so a texture keeps its scale whatever the box's size.
   BoxGeometry's faces come in the order +x, -x, +y, -y, +z, -z. */
function metricUV(g, w, h, d) {
  const uv = g.attributes.uv;
  const size = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++)
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * size[f][0], uv.getY(i) * size[f][1]);
    }
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const edges = ({ W, D }) => ({ x0: -W / 2, x1: W / 2, z0: -D / 2, z1: D / 2 });

function legs(P, mat, x0, x1, z0, z1, h, s, inset = 0) {
  for (const [lx, lz] of [
    [x0 + inset, z0 + inset],
    [x1 - inset - s, z0 + inset],
    [x0 + inset, z1 - inset - s],
    [x1 - inset - s, z1 - inset - s],
  ])
    P.box(mat, lx, lx + s, 0, h, lz, lz + s);
}

/* the seed L outline in metres, z for plan y */
function lShape(def) {
  const L = seedL(def);
  return (
    L && {
      x0: L.x0 / 1000,
      x1: L.x1 / 1000,
      z0: L.y0 / 1000,
      z1: L.y1 / 1000,
      ix: L.ix / 1000,
      iz: L.iy / 1000,
    }
  );
}

/* ---------- the models ---------- */

const MODELS = {
  bedDouble: (P, m, d) => d.def.type === "rect" && bed(P, m, d),
  bedSingle: (P, m, d) => d.def.type === "rect" && bed(P, m, d),
  bunk: (P, m, d) => d.def.type === "rect" && (d.Hz >= 1.2 ? bunk(P, m, d) : bed(P, m, d)),
  wardrobe: (P, m, d) => d.def.type === "rect" && tallCabinet(P, m, d),
  sofa: (P, m, d) => d.def.type === "rect" && sofa(P, m, d),
  armchair: (P, m, d) => d.def.type === "rect" && sofa(P, m, d, 1),
  cornerSofa: (P, m, d) => cornerSofa(P, m, d),
  coffeeTable: (P, m, d) => d.def.type === "rect" && table(P, m, d, { shelf: true, apron: false }),
  diningTable: (P, m, d) => d.def.type === "rect" && table(P, m, d, {}),
  roundTable: (P, m, d) => d.def.type === "circle" && roundTable(P, m, d),
  chair: (P, m, d) => d.def.type === "rect" && chair(P, m, d),
  shelf: (P, m, d) => d.def.type === "rect" && bookshelf(P, m, d),
  fireplace: (P, m, d) => d.def.type === "rect" && fireplace(P, m, d),
  stove: (P, m, d) => d.def.type === "rect" && cookStove(P, m, d),
  woodbox: (P, m, d) => d.def.type === "rect" && woodbox(P, m, d),
  kitchen600: (P, m, d) => d.def.type === "rect" && counter(P, m, d),
  kitchen1200: (P, m, d) => d.def.type === "rect" && counter(P, m, d),
  sink: (P, m, d) => d.def.type === "rect" && counter(P, m, d, { sink: true }),
  cooker: (P, m, d) => d.def.type === "rect" && cooker(P, m, d),
  fridge: (P, m, d) => d.def.type === "rect" && fridge(P, m, d),
  cornerTop: (P, m, d) => cornerCounter(P, m, d),
  kiuas: (P, m, d) => d.def.type === "rect" && kiuas(P, m, d),
  laude: (P, m, d) => laude(P, m, d),
  shower: (P, m, d) => d.def.type === "rect" && shower(P, m, d),
  wc: (P, m, d) => d.def.type === "rect" && wc(P, m, d),
  basin: (P, m, d) => d.def.type === "rect" && basin(P, m, d),
  storage: (P, m, d) => d.def.type === "rect" && storage(P, m, d),
};

/* a bed: frame, mattress, a duvet over the foot end, pillows at the head */
function bed(P, m, d) {
  const { W, D, Hz, col } = d;
  const { x0, x1, z0, z1 } = edges(d);
  const top = Math.min(0.32, Hz * 0.55);
  P.box(m.woodDark, x0 + 0.06, x1 - 0.06, 0, 0.07, z0 + 0.06, z1 - 0.06);
  P.box(m.wood, x0, x1, 0.07, top, z0, z1);
  P.soft(m.mattress, x0 + 0.02, x1 - 0.02, top - 0.02, Hz - 0.035, z0 + 0.02, z1 - 0.02, 0.05);
  P.soft(m.fabric(col), x0 + 0.01, x1 - 0.01, Hz - 0.1, Hz - 0.01, z0 + D * 0.3, z1 - 0.01, 0.035);
  const n = W >= 1.2 ? 2 : 1;
  const pw = (W - 0.1) / n;
  for (let i = 0; i < n; i++) {
    const a = x0 + 0.05 + i * pw;
    P.soft(
      m.pillow,
      a + 0.03,
      a + pw - 0.03,
      Hz - 0.1,
      Hz,
      z0 + 0.06,
      z0 + 0.06 + Math.min(0.45, D * 0.22),
      0.05,
    );
  }
}

/* two berths between corner posts, a guard rail and a ladder at the foot */
function bunk(P, m, d) {
  const { D, Hz, col } = d;
  const { x0, x1, z0, z1 } = edges(d);
  const post = 0.06;
  legs(P, m.wood, x0, x1, z0, z1, Hz, post);
  for (const yb of [0.18, Math.max(0.75, Hz * 0.6)]) {
    P.box(m.wood, x0, x1, yb, yb + 0.1, z0, z1);
    P.soft(m.mattress, x0 + 0.04, x1 - 0.04, yb + 0.09, yb + 0.23, z0 + 0.07, z1 - 0.07, 0.04);
    P.soft(
      m.fabric(col),
      x0 + 0.035,
      x1 - 0.035,
      yb + 0.18,
      yb + 0.25,
      z0 + D * 0.3,
      z1 - 0.07,
      0.03,
    );
    P.soft(m.pillow, x0 + 0.1, x1 - 0.1, yb + 0.2, yb + 0.3, z0 + 0.09, z0 + 0.48, 0.045);
  }
  P.box(m.wood, x0, x0 + 0.04, Hz - 0.09, Hz - 0.01, z0, z1);
  P.box(m.wood, x1 - 0.04, x1, Hz - 0.09, Hz - 0.01, z0, z1);
  P.box(m.wood, x0, x1, Hz - 0.09, Hz - 0.01, z0, z0 + 0.04);
  const la = x1 - 0.4,
    lb = x1 - 0.08;
  for (const lx of [la, lb]) P.box(m.wood, lx, lx + 0.035, 0, Hz - 0.09, z1 - 0.035, z1);
  for (let y = 0.3; y < Hz * 0.6; y += 0.28)
    P.rod(m.wood, [la, y, z1 - 0.018], [lb + 0.035, y, z1 - 0.018], 0.014);
}

/* a wardrobe or a tall cupboard: carcass, painted doors, handles */
function tallCabinet(P, m, d) {
  const { W, Hz, col } = d;
  const { x0, x1, z0, z1 } = edges(d);
  const plinth = 0.08;
  P.box(m.woodDark, x0 + 0.03, x1 - 0.03, 0, plinth, z0 + 0.02, z1 - 0.06);
  P.box(m.white, x0, x1, plinth, Hz, z0, z1 - 0.022);
  const n = W < 0.5 ? 1 : Math.max(2, Math.round(W / 0.5));
  const fw = W / n;
  const front = m.paint(col, 1.18);
  for (let i = 0; i < n; i++) {
    const a = x0 + i * fw;
    P.box(front, a + 0.002, a + fw - 0.002, plinth + 0.004, Hz - 0.004, z1 - 0.022, z1 - 0.004);
    const hx = n === 1 ? x1 - 0.05 : i % 2 === 0 ? a + fw - 0.04 : a + 0.03;
    const hm = Math.min(1.05, Hz * 0.55);
    P.box(m.steel, hx, hx + 0.012, hm - 0.15, hm + 0.15, z1 - 0.004, z1);
  }
}

/* a sofa or an armchair: base, arms, back, seat and back cushions */
function sofa(P, m, d, seats) {
  const { W, D, Hz, col } = d;
  const { x0, x1, z0, z1 } = edges(d);
  const arm = Math.min(0.17, W * 0.13),
    back = Math.min(0.22, D * 0.27);
  const seatH = Math.min(0.45, Hz * 0.52),
    armH = Math.min(0.64, Hz * 0.75);
  const F = m.fabric(col),
    F2 = m.fabric(col, 1.07);
  legs(P, m.woodDark, x0, x1, z0, z1, 0.08, 0.045, 0.04);
  P.soft(F, x0, x1, 0.08, seatH - 0.09, z0, z1, 0.03);
  P.soft(F, x0, x0 + arm, 0.08, armH, z0, z1, 0.05);
  P.soft(F, x1 - arm, x1, 0.08, armH, z0, z1, 0.05);
  P.soft(F, x0, x1, 0.08, Hz - 0.05, z0, z0 + back, 0.05);
  const n = seats || Math.max(1, Math.round((W - 2 * arm) / 0.7));
  const sw = (W - 2 * arm) / n;
  for (let i = 0; i < n; i++) {
    const a = x0 + arm + i * sw;
    P.soft(F2, a + 0.005, a + sw - 0.005, seatH - 0.11, seatH, z0 + back, z1 - 0.01, 0.05);
    P.soft(F2, a + 0.01, a + sw - 0.01, seatH - 0.02, Hz, z0 + back - 0.03, z0 + back + 0.16, 0.06);
  }
}

/* the seed corner sofa: backs along the outer edges, arms at the open ends */
function cornerSofa(P, m, d) {
  const L = lShape(d.def);
  if (!L) return false;
  const { Hz, col } = d;
  const { x0, x1, z0, z1, ix, iz } = L;
  const arm = 0.17,
    back = 0.22;
  const seatH = Math.min(0.45, Hz * 0.52),
    armH = Math.min(0.64, Hz * 0.75);
  const F = m.fabric(col),
    F2 = m.fabric(col, 1.07);
  for (const [lx, lz] of [
    [x0 + 0.04, z0 + 0.04],
    [x1 - 0.085, z0 + 0.04],
    [x1 - 0.085, iz - 0.085],
    [ix - 0.085, z1 - 0.085],
    [x0 + 0.04, z1 - 0.085],
  ])
    P.box(m.woodDark, lx, lx + 0.045, 0, 0.08, lz, lz + 0.045);
  P.soft(F, x0, x1, 0.08, seatH - 0.09, z0, iz, 0.03);
  P.soft(F, x0, ix, 0.08, seatH - 0.09, iz - 0.06, z1, 0.03);
  P.soft(F, x0, x1, 0.08, Hz - 0.05, z0, z0 + back, 0.05);
  P.soft(F, x0, x0 + back, 0.08, Hz - 0.05, z0, z1, 0.05);
  P.soft(F, x1 - arm, x1, 0.08, armH, z0, iz, 0.05);
  P.soft(F, x0, ix, 0.08, armH, z1 - arm, z1, 0.05);
  // seats along the back, from the corner to the arm
  const ra = x0 + back,
    rb = x1 - arm;
  const n = Math.max(1, Math.round((rb - ra) / 0.7));
  for (let i = 0; i < n; i++) {
    const a = ra + ((rb - ra) * i) / n,
      b = ra + ((rb - ra) * (i + 1)) / n;
    P.soft(F2, a + 0.005, b - 0.005, seatH - 0.11, seatH, z0 + back, iz - 0.01, 0.05);
    P.soft(F2, a + 0.01, b - 0.01, seatH - 0.02, Hz, z0 + back - 0.03, z0 + back + 0.16, 0.06);
  }
  // seats down the side, from the corner seat to the end arm
  const sa = iz,
    sb = z1 - arm;
  const k = Math.max(1, Math.round((sb - sa) / 0.7));
  for (let i = 0; i < k; i++) {
    const a = sa + ((sb - sa) * i) / k,
      b = sa + ((sb - sa) * (i + 1)) / k;
    P.soft(F2, x0 + back, ix - 0.01, seatH - 0.11, seatH, a + 0.005, b - 0.005, 0.05);
    P.soft(F2, x0 + back - 0.03, x0 + back + 0.16, seatH - 0.02, Hz, a + 0.01, b - 0.01, 0.06);
  }
}

/* a table: top, legs, an apron or a shelf below */
function table(P, m, d, { apron = true, shelf = false }) {
  const { W, D, Hz } = d;
  const { x0, x1, z0, z1 } = edges(d);
  const top = 0.035,
    leg = Math.min(0.06, W * 0.08, D * 0.08);
  const ix = Math.min(0.05, W * 0.06),
    iz = Math.min(0.05, D * 0.06);
  P.box(m.wood, x0, x1, Hz - top, Hz, z0, z1);
  legs(P, m.wood, x0 + ix, x1 - ix, z0 + iz, z1 - iz, Hz - top, leg);
  if (apron) P.box(m.wood, x0 + ix, x1 - ix, Hz - top - 0.08, Hz - top, z0 + iz, z1 - iz);
  if (shelf) P.box(m.wood, x0 + ix, x1 - ix, 0.12, 0.14, z0 + iz, z1 - iz);
}

function roundTable(P, m, d) {
  const r = d.W / 2,
    Hz = d.Hz;
  P.cyl(m.wood, 0, 0, r, Hz - 0.035, Hz, 48);
  P.cyl(m.wood, 0, 0, 0.045, 0.03, Hz - 0.035, 16);
  P.cyl(m.woodDark, 0, 0, Math.min(r * 0.55, 0.3), 0, 0.03, 32);
}

/* a chair, its back at the back (-z) and a cushion on the seat */
function chair(P, m, d) {
  const { Hz, col } = d;
  const { x0, x1, z0, z1 } = edges(d);
  const seat = Math.min(0.46, Hz * 0.52),
    leg = 0.035;
  P.box(m.wood, x0, x1, seat - 0.035, seat, z0, z1);
  legs(P, m.wood, x0, x1, z0, z1, seat - 0.035, leg, 0.01);
  P.box(m.wood, x0 + 0.01, x0 + 0.01 + leg, seat, Hz, z0 + 0.01, z0 + 0.01 + leg);
  P.box(m.wood, x1 - 0.01 - leg, x1 - 0.01, seat, Hz, z0 + 0.01, z0 + 0.01 + leg);
  P.box(m.wood, x0 + 0.01, x1 - 0.01, Hz - 0.11, Hz - 0.01, z0 + 0.012, z0 + 0.035);
  const y = seat + (Hz - seat) * 0.3;
  P.box(m.wood, x0 + 0.01, x1 - 0.01, y, y + 0.06, z0 + 0.012, z0 + 0.035);
  P.soft(m.fabric(col), x0 + 0.025, x1 - 0.025, seat, seat + 0.03, z0 + 0.05, z1 - 0.02, 0.012);
}

/* a bookshelf with books on all but its top board */
function bookshelf(P, m, d) {
  const { D, Hz, rnd } = d;
  const { x0, x1, z0, z1 } = edges(d);
  const s = 0.02;
  P.box(m.wood, x0, x0 + s, 0, Hz, z0, z1);
  P.box(m.wood, x1 - s, x1, 0, Hz, z0, z1);
  P.box(m.woodDark, x0 + s, x1 - s, 0, Hz, z0, z0 + 0.008);
  const n = Math.max(2, Math.round(Hz / 0.36));
  const gap = (Hz - s) / n;
  for (let i = 0; i <= n; i++) P.box(m.wood, x0 + s, x1 - s, i * gap, i * gap + s, z0 + 0.008, z1);
  for (let i = 0; i < n; i++) {
    const yb = i * gap + s,
      room = gap - s - 0.03;
    if (room < 0.12) continue;
    let x = x0 + s + 0.01 + rnd() * 0.05;
    const end = x1 - s - 0.01;
    while (x < end - 0.02) {
      if (rnd() < 0.1) {
        x += 0.05 + rnd() * 0.12;
        continue;
      }
      const bw = 0.018 + rnd() * 0.035,
        bh = room * (0.65 + rnd() * 0.35),
        bd = Math.min(D - 0.03, 0.15 + rnd() * 0.08);
      if (x + bw > end) break;
      P.box(
        m.books[Math.floor(rnd() * m.books.length)],
        x,
        x + bw,
        yb,
        yb + bh,
        z1 - 0.01 - bd,
        z1 - 0.01,
      );
      x += bw + 0.002;
    }
  }
}

/* a masonry fireplace: stone hearth round a glowing firebox, then a chimney */
function fireplace(P, m, d) {
  const { W, D, Hz } = d;
  const { x0, x1, z0, z1 } = edges(d);
  const body = Math.min(Hz, Math.max(0.9, Math.min(1.35, Hz * 0.62)));
  const fx0 = -W * 0.28,
    fx1 = W * 0.28,
    fy0 = Math.min(0.28, body * 0.25),
    fy1 = Math.min(body - 0.2, fy0 + 0.5),
    depth = Math.min(0.35, D * 0.45);
  const zf = z1 - depth;
  P.box(m.stone, x0, x1, 0, body, z0, zf);
  P.box(m.stone, x0, x1, 0, fy0, zf, z1);
  P.box(m.stone, x0, x1, fy1, body, zf, z1);
  P.box(m.stone, x0, fx0, fy0, fy1, zf, z1);
  P.box(m.stone, fx1, x1, fy0, fy1, zf, z1);
  P.box(m.iron, fx0, fx1, fy0, fy1, zf, zf + 0.01); // soot at the back
  P.box(m.ember, fx0 + 0.04, fx1 - 0.04, fy0, fy0 + 0.025, zf + 0.04, z1 - 0.06);
  P.rod(
    m.birch,
    [fx0 + 0.07, fy0 + 0.07, zf + depth * 0.45],
    [fx1 - 0.07, fy0 + 0.07, zf + depth * 0.55],
    0.045,
  );
  P.rod(
    m.birch,
    [fx0 + 0.12, fy0 + 0.15, zf + depth * 0.5],
    [fx1 - 0.12, fy0 + 0.13, zf + depth * 0.4],
    0.04,
  );
  if (Hz > body + 0.02) P.box(m.stoneCap, x0, x1, body, Math.min(Hz, body + 0.06), z0, z1);
  if (Hz > body + 0.15)
    P.box(m.stone, -W * 0.3, W * 0.3, body + 0.06, Hz, z0 + D * 0.08, z0 + D * 0.08 + D * 0.55);
}

/* a wood-fired kitchen range: iron body, fire and oven doors, rings on top */
function cookStove(P, m, d) {
  const { W, D, Hz } = d;
  const { x0, x1, z0, z1 } = edges(d);
  P.box(m.iron, x0 + 0.03, x1 - 0.03, 0, 0.1, z0 + 0.03, z1 - 0.03);
  P.box(m.iron2, x0, x1, 0.1, Hz - 0.03, z0, z1 - 0.012);
  P.box(m.iron, x0, x1, Hz - 0.03, Hz, z0, z1);
  for (const [cx, r] of [
    [x0 + W * 0.3, Math.min(0.1, W * 0.16)],
    [x1 - W * 0.28, Math.min(0.08, W * 0.13)],
  ])
    P.cyl(m.black, cx, -D * 0.05, r, Hz, Hz + 0.004, 32);
  const split = x0 + W * 0.42;
  P.box(m.iron, x0 + 0.05, split - 0.02, Hz * 0.5, Hz - 0.08, z1 - 0.012, z1);
  P.box(m.ember, x0 + 0.08, split - 0.05, Hz * 0.5 + 0.03, Hz * 0.5 + 0.06, z1 - 0.001, z1);
  P.box(m.iron, split + 0.02, x1 - 0.05, 0.16, Hz - 0.08, z1 - 0.012, z1);
  P.rod(m.steel, [x0 + 0.04, Hz - 0.05, z1 - 0.008], [x1 - 0.04, Hz - 0.05, z1 - 0.008], 0.007);
}

/* an open box of split birch logs */
function woodbox(P, m, d) {
  const { Hz, rnd } = d;
  const { x0, x1, z0, z1 } = edges(d);
  const s = 0.018;
  P.box(m.wood, x0, x1, 0, Hz, z0, z0 + s);
  P.box(m.wood, x0, x1, 0, Hz, z1 - s, z1);
  P.box(m.wood, x0, x0 + s, 0, Hz, z0 + s, z1 - s);
  P.box(m.wood, x1 - s, x1, 0, Hz, z0 + s, z1 - s);
  P.box(m.wood, x0 + s, x1 - s, 0, 0.03, z0 + s, z1 - s);
  const r = 0.045;
  for (let y = 0.03 + r; y < Hz - 0.03; y += r * 1.75)
    for (let z = z0 + s + r; z <= z1 - s - r + 1e-6; z += r * 2.05) {
      const rr = r * (0.82 + rnd() * 0.25);
      P.rod(m.birch, [x0 + s + 0.01, y, z], [x1 - s - 0.01 - rnd() * 0.04, y, z], rr, 9);
    }
}

/* A run of kitchen base units with the worktop over them. box is the run's
   footprint; the fronts face +z or +x, and span limits them to part of the
   run (where an L's other arm covers the rest). */
function cabinetRun(P, m, box, Hz, front, col, { span, sink = false } = {}) {
  const alongX = front === "+z";
  const L0 = alongX ? box.x0 : box.z0,
    L1 = alongX ? box.x1 : box.z1;
  const D0 = alongX ? box.z0 : box.x0,
    D1 = alongX ? box.z1 : box.x1;
  const B = (mat, l0, l1, y0, y1, d0, d1) =>
    alongX ? P.box(mat, l0, l1, y0, y1, d0, d1) : P.box(mat, d0, d1, y0, y1, l0, l1);
  const top = Hz - 0.04;
  B(m.iron, L0, L1, 0, 0.1, D0, D1 - 0.06);
  B(m.white, L0, L1, 0.1, top, D0, D1 - 0.02);
  const [a0, a1] = span || [L0, L1];
  const n = Math.max(1, Math.round((a1 - a0) / 0.6));
  const uw = (a1 - a0) / n;
  const paint = m.paint(col, 1.05);
  for (let i = 0; i < n; i++) {
    const a = a0 + i * uw,
      c = a + uw / 2;
    const drawer = !sink && top - 0.1 > 0.45;
    const split = drawer ? top - 0.17 : top;
    if (drawer) {
      B(paint, a + 0.002, a + uw - 0.002, split + 0.003, top - 0.003, D1 - 0.02, D1 - 0.004);
      B(m.steel, c - 0.07, c + 0.07, top - 0.05, top - 0.04, D1 - 0.004, D1);
    }
    B(paint, a + 0.002, a + uw - 0.002, 0.104, split - 0.003, D1 - 0.02, D1 - 0.004);
    B(m.steel, c - 0.07, c + 0.07, split - 0.05, split - 0.04, D1 - 0.004, D1);
  }
  if (!sink) {
    B(m.worktop, L0, L1, top, Hz, D0, D1);
    return;
  }
  // the worktop round a sink, the bowl, and a tap behind it
  const c = (L0 + L1) / 2,
    bw = Math.min(0.25, (L1 - L0) * 0.3);
  const b0 = D0 + 0.1,
    b1 = D1 - 0.08;
  B(m.worktop, L0, c - bw, top, Hz, D0, D1);
  B(m.worktop, c + bw, L1, top, Hz, D0, D1);
  B(m.worktop, c - bw, c + bw, top, Hz, D0, b0);
  B(m.worktop, c - bw, c + bw, top, Hz, b1, D1);
  B(m.steel, c - bw, c + bw, top + 0.004, top + 0.006, b0, b1);
  B(m.steel, c - bw, c + bw, top, Hz + 0.002, b0, b0 + 0.01);
  B(m.steel, c - bw, c + bw, top, Hz + 0.002, b1 - 0.01, b1);
  B(m.steel, c - bw, c - bw + 0.01, top, Hz + 0.002, b0, b1);
  B(m.steel, c + bw - 0.01, c + bw, top, Hz + 0.002, b0, b1);
  const tap = (D0 + b0) / 2;
  const at = (l, dd) => (alongX ? [l, dd] : [dd, l]);
  const [tx, tz] = at(c, tap);
  P.cyl(m.steel, tx, tz, 0.018, Hz, Hz + 0.24, 16);
  const [sx, sz] = at(c, tap + 0.17);
  P.rod(m.steel, [tx, Hz + 0.23, tz], [sx, Hz + 0.23, sz], 0.012);
}

function counter(P, m, d, { sink = false } = {}) {
  const { x0, x1, z0, z1 } = edges(d);
  cabinetRun(P, m, { x0, x1, z0, z1 }, d.Hz, "+z", d.col, { sink });
}

/* the seed corner counter: a run along the back, another down the side */
function cornerCounter(P, m, d) {
  const L = lShape(d.def);
  if (!L) return false;
  const { x0, x1, z0, z1, ix, iz } = L;
  cabinetRun(P, m, { x0, x1, z0, z1: iz }, d.Hz, "+z", d.col, { span: [ix, x1] });
  cabinetRun(P, m, { x0, x1: ix, z0: iz, z1 }, d.Hz, "+x", d.col);
}

/* a cooker: white body, oven door, knobs, a black glass hob with rings */
function cooker(P, m, d) {
  const { W, D, Hz } = d;
  const { x0, x1, z0, z1 } = edges(d);
  P.box(m.iron, x0 + 0.01, x1 - 0.01, 0, 0.1, z0, z1 - 0.06);
  P.box(m.white, x0, x1, 0.1, Hz - 0.012, z0, z1 - 0.02);
  P.box(m.black, x0 + 0.02, x1 - 0.02, 0.12, Hz - 0.18, z1 - 0.02, z1 - 0.003);
  P.rod(m.steel, [x0 + 0.06, Hz - 0.215, z1 - 0.01], [x1 - 0.06, Hz - 0.215, z1 - 0.01], 0.009);
  P.box(m.white2, x0 + 0.02, x1 - 0.02, Hz - 0.165, Hz - 0.02, z1 - 0.02, z1 - 0.006);
  for (let k = 0; k < 4; k++) {
    const kx = x0 + W * (0.2 + k * 0.2);
    P.rod(m.iron2, [kx, Hz - 0.09, z1 - 0.006], [kx, Hz - 0.09, z1], 0.016, 14);
  }
  P.box(m.black, x0, x1, Hz - 0.012, Hz, z0, z1);
  for (const [sx, sz, r] of [
    [-0.22, -0.2, 0.09],
    [0.22, -0.2, 0.075],
    [-0.22, 0.2, 0.075],
    [0.22, 0.2, 0.09],
  ])
    P.cyl(m.hobRing, sx * W, sz * D, r, Hz, Hz + 0.0015, 32);
}

/* an under-counter fridge */
function fridge(P, m, d) {
  const { Hz } = d;
  const { x0, x1, z0, z1 } = edges(d);
  P.box(m.white, x0, x1, 0, Hz, z0, z1 - 0.022);
  P.box(m.iron, x0 + 0.02, x1 - 0.02, 0, 0.08, z1 - 0.022, z1 - 0.006);
  P.box(m.white2, x0 + 0.003, x1 - 0.003, 0.085, Hz - 0.003, z1 - 0.022, z1 - 0.004);
  P.box(m.steel, x1 - 0.055, x1 - 0.04, Hz - 0.38, Hz - 0.06, z1 - 0.004, z1);
}

/* a sauna stove: iron body with a glowing door, a basket of stones on top */
function kiuas(P, m, d) {
  const { W, D, Hz, rnd } = d;
  const { x0, x1, z0, z1 } = edges(d);
  const body = Math.min(Hz * 0.6, 0.55);
  legs(P, m.iron, x0, x1, z0, z1, 0.06, 0.04, 0.03);
  P.box(m.iron, x0 + 0.02, x1 - 0.02, 0.06, body, z0 + 0.02, z1 - 0.02);
  P.box(m.iron2, -W * 0.2, W * 0.2, 0.12, body - 0.12, z1 - 0.02, z1 - 0.006);
  P.box(m.ember, -W * 0.13, W * 0.13, 0.18, Math.max(0.2, body - 0.2), z1 - 0.006, z1 - 0.003);
  const ys = [body + (Hz - body) * 0.5, Hz - 0.012];
  for (const [px, pz] of [
    [x0 + 0.03, z0 + 0.03],
    [x1 - 0.03, z0 + 0.03],
    [x1 - 0.03, z1 - 0.03],
    [x0 + 0.03, z1 - 0.03],
  ])
    P.rod(m.iron, [px, body, pz], [px, Hz - 0.004, pz], 0.008, 8);
  for (const y of ys) {
    P.rod(m.iron, [x0 + 0.03, y, z0 + 0.03], [x1 - 0.03, y, z0 + 0.03], 0.006, 6);
    P.rod(m.iron, [x0 + 0.03, y, z1 - 0.03], [x1 - 0.03, y, z1 - 0.03], 0.006, 6);
    P.rod(m.iron, [x0 + 0.03, y, z0 + 0.03], [x0 + 0.03, y, z1 - 0.03], 0.006, 6);
    P.rod(m.iron, [x1 - 0.03, y, z0 + 0.03], [x1 - 0.03, y, z1 - 0.03], 0.006, 6);
  }
  const step = 0.075;
  for (let y = body + 0.035; y < Hz - 0.03; y += step * 0.8)
    for (let x = x0 + 0.07; x < x1 - 0.05; x += step)
      for (let z = z0 + 0.07; z < z1 - 0.05; z += step) {
        const r = 0.032 + rnd() * 0.02;
        const g = new THREE.DodecahedronGeometry(r, 0);
        g.rotateX(rnd() * 3);
        g.rotateY(rnd() * 3);
        g.scale(1, 0.75 + rnd() * 0.3, 1);
        g.translate(
          x + (rnd() - 0.5) * 0.02,
          Math.min(y + (rnd() - 0.5) * 0.015, Hz - r),
          z + (rnd() - 0.5) * 0.02,
        );
        P.geo(m.stones[Math.floor(rnd() * m.stones.length)], g);
      }
}

/* One arm of a sauna bench: slats along it on supports, boards closing the
   front below. front is the open side, +z or +x; span is the part of that
   side not against the other arm. */
function benchArm(P, m, box, Hz, front, span) {
  const alongX = front === "+z";
  const L0 = alongX ? box.x0 : box.z0,
    L1 = alongX ? box.x1 : box.z1;
  const D0 = alongX ? box.z0 : box.x0,
    D1 = alongX ? box.z1 : box.x1;
  const B = (mat, l0, l1, y0, y1, d0, d1) =>
    alongX ? P.box(mat, l0, l1, y0, y1, d0, d1) : P.box(mat, d0, d1, y0, y1, l0, l1);
  const t = 0.028;
  for (let dd = D0; dd < D1 - 0.02; dd += 0.102)
    B(m.sauna, L0, L1, Hz - t, Hz, dd, Math.min(D1, dd + 0.09));
  const ns = Math.max(1, Math.round((L1 - L0) / 0.6));
  for (let i = 0; i <= ns; i++) {
    const l = L0 + ((L1 - L0 - 0.045) * i) / ns;
    B(m.saunaDark, l, l + 0.045, 0, Hz - t, D0, D1);
  }
  const [a0, a1] = span || [L0, L1];
  for (let l = a0; l < a1 - 0.03; l += 0.1)
    B(m.sauna, l, Math.min(a1, l + 0.09), 0.02, Hz - t, D1 - 0.02, D1);
}

/* the seed L-shaped sauna bench */
function laude(P, m, d) {
  const L = lShape(d.def);
  if (!L) return false;
  const { x0, x1, z0, z1, ix, iz } = L;
  benchArm(P, m, { x0, x1, z0, z1: iz }, d.Hz, "+z", [ix, x1]);
  benchArm(P, m, { x0, x1: ix, z0: iz, z1 }, d.Hz, "+x");
}

/* a corner shower: tray, glass on the two open sides, riser and head */
function shower(P, m, d) {
  const { Hz } = d;
  const { x0, x1, z0, z1 } = edges(d);
  const g = Math.min(Hz, 2.0);
  P.box(m.white, x0, x1, 0, 0.05, z0, z1);
  P.cyl(m.steel, 0, 0, 0.05, 0.05, 0.052, 20);
  P.box(m.glass, x0, x1 - 0.02, 0.05, g - 0.02, z1 - 0.008, z1);
  P.box(m.glass, x1 - 0.008, x1, 0.05, g - 0.02, z0, z1 - 0.02);
  P.box(m.steel, x1 - 0.02, x1, 0.05, g, z1 - 0.02, z1);
  P.box(m.steel, x0, x1, g - 0.02, g, z1 - 0.012, z1);
  P.box(m.steel, x1 - 0.012, x1, g - 0.02, g, z0, z1);
  const rx = x0 + Math.min(0.3, (x1 - x0) * 0.35),
    top = Math.min(Hz, 2.1) - 0.06;
  P.cyl(m.steel, rx, z0 + 0.04, 0.012, 0.85, top, 12);
  P.rod(m.steel, [rx, top, z0 + 0.04], [rx, top, z0 + 0.2], 0.01);
  P.cyl(m.steel, rx, z0 + 0.22, 0.1, top - 0.03, top - 0.01, 28);
  P.box(m.steel, rx - 0.06, rx + 0.06, 1.0, 1.08, z0, z0 + 0.06);
}

/* a toilet: cistern at the back, bowl and lid in front */
function wc(P, m, d) {
  const { W, D, Hz } = d;
  const { x0, x1, z0, z1 } = edges(d);
  const tank = Math.min(0.18, D * 0.28);
  const seat = Math.min(0.42, Hz * 0.55);
  P.soft(m.white, -W * 0.3, W * 0.3, 0, seat - 0.06, z0 + tank, z1 - 0.12, 0.05);
  P.soft(m.white, x0 + 0.02, x1 - 0.02, seat - 0.16, seat - 0.02, z0 + tank - 0.02, z1, 0.08);
  P.soft(m.white2, x0 + 0.025, x1 - 0.025, seat - 0.02, seat + 0.005, z0 + tank, z1 - 0.005, 0.07);
  P.soft(m.white, x0, x1, seat - 0.02, Hz, z0, z0 + tank, 0.03);
  P.cyl(m.steel, 0, z0 + tank / 2, 0.025, Hz, Hz + 0.004, 18);
}

/* a washbasin on a vanity unit, its tap behind the bowl */
function basin(P, m, d) {
  const { Hz, col } = d;
  const { x0, x1, z0, z1 } = edges(d);
  const top = Hz - 0.12;
  P.box(m.white, x0 + 0.01, x1 - 0.01, 0.25, top, z0, z1 - 0.04);
  P.box(m.paint(col, 1.05), x0 + 0.012, x1 - 0.012, 0.255, top - 0.005, z1 - 0.04, z1 - 0.022);
  P.box(m.steel, -0.07, 0.07, top - 0.05, top - 0.04, z1 - 0.022, z1 - 0.012);
  P.soft(m.white, x0, x1, top, Hz, z0, z1, 0.03);
  P.soft(m.white2, x0 + 0.06, x1 - 0.06, Hz - 0.003, Hz + 0.001, z0 + 0.13, z1 - 0.06, 0.04);
  P.cyl(m.steel, 0, z0 + 0.06, 0.016, Hz, Hz + 0.16, 14);
  P.rod(m.steel, [0, Hz + 0.15, z0 + 0.06], [0, Hz + 0.15, z0 + 0.17], 0.011);
}

/* storeroom shelving with boxes on it */
function storage(P, m, d) {
  const { Hz, rnd } = d;
  const { x0, x1, z0, z1 } = edges(d);
  const post = 0.03;
  legs(P, m.steel, x0, x1, z0, z1, Hz, post);
  const n = Math.max(3, Math.round(Hz / 0.45));
  const gap = (Hz - 0.1) / n;
  for (let i = 0; i <= n; i++) {
    const y = 0.08 + i * gap;
    P.box(m.wood, x0 + 0.005, x1 - 0.005, y - 0.018, y, z0 + 0.005, z1 - 0.005);
  }
  for (let i = 0; i < n; i++) {
    const yb = 0.08 + i * gap,
      room = gap - 0.06;
    if (room < 0.15) continue;
    let x = x0 + post + 0.01;
    while (x < x1 - post - 0.15) {
      const bw = Math.min(0.28 + rnd() * 0.14, x1 - post - 0.01 - x);
      if (bw < 0.12) break;
      if (rnd() < 0.2) {
        x += bw;
        continue;
      }
      const bh = room * (0.6 + rnd() * 0.4);
      P.box(
        m.bins[Math.floor(rnd() * m.bins.length)],
        x,
        x + bw - 0.01,
        yb,
        yb + bh,
        z0 + 0.03,
        z1 - 0.03,
      );
      x += bw;
    }
  }
}

/* anything without a model of its own: its outline raised to its height,
   with softened edges, in its group colour */
function raised(P, m, def, d) {
  const mat = m.paint(d.col, 1.0, 0.7);
  if (def.type === "circle") {
    P.cyl(mat, 0, 0, d.W / 2, 0, d.Hz, 40);
    return;
  }
  const pts = defOutline(def).map((p) => new THREE.Vector2(p.x / 1000, -p.y / 1000));
  if (pts.length >= 3) {
    const bt = Math.min(0.012, d.Hz / 4);
    try {
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
        depth: Math.max(0.001, d.Hz - 2 * bt),
        bevelEnabled: true,
        bevelThickness: bt,
        bevelSize: bt,
        bevelOffset: -bt,
        bevelSegments: 2,
        curveSegments: 1,
      });
      // the shape's y is minus plan y, so after this turn the extrusion runs up
      // and the outline lands the right way round
      g.rotateX(-Math.PI / 2);
      g.translate(0, bt, 0);
      P.geo(mat, g);
      return;
    } catch {
      /* a tangled outline: fall back to its box */
    }
  }
  const { x0, x1, z0, z1 } = edges(d);
  P.box(mat, x0, x1, 0, d.Hz, z0, z1);
}
