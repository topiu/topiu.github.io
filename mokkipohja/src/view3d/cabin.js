import * as THREE from "three";
import { D2R } from "../core";
import { defaultCeiling, headroomFor } from "../domain/ceilings";
import {
  bbox,
  clipHalf,
  defOutline,
  itemPoly,
  pointInPoly,
  triangulate,
  wallPoly,
} from "../domain/geometry";
import { offsetEdges, polySigned, roomEdgeShares } from "../domain/rooms";
import {
  pieceEnds,
  ridgeOf,
  roofHeightAt,
  topBreaks,
  wallPieces,
  wallTop,
} from "../domain/wallpieces";
import { Parts, furnitureModel } from "./furniture";

/* The plan as a 3D model. Plan millimetres become metres, plan x is x, plan
   y is z, and y points up, so seen from above the model lies exactly like the
   plan. Built once when the view opens (the plan cannot change underneath
   it), as plain three.js objects the stage shows, hides and lights. */

const MM = 0.001;
const ROOF_BUILDUP = 220; // mm from the ceiling to the top of the roof
const EAVES = 450; // mm a roof overhangs an outside wall's face
const SLAB = 120; // mm: what stays of a wall cut away to look inside

export function buildCabin(doc, defs, mats) {
  const group = new THREE.Group();
  const floors = new THREE.Group();
  const walls = new THREE.Group();
  const slabs = new THREE.Group();
  const roof = new THREE.Group();
  const furniture = new THREE.Group();
  group.add(floors, walls, slabs, roof, furniture);
  const rooms = doc.rooms.filter((r) => r.points && r.points.length > 2);
  const centre = planCentre(doc, defs);

  rooms.forEach((r, i) => floors.add(floorMesh(r, i, mats)));

  const pieces = wallPieces(doc);
  const ends = pieceEnds(pieces);
  const wallInfo = pieces.map((p, i) => {
    const w = buildWall(p, ends[i], doc, rooms, mats, centre);
    walls.add(w.obj);
    slabs.add(w.slab);
    return w;
  });

  const shares = roomEdgeShares(doc);
  rooms.forEach((r, i) => roof.add(buildRoof(r, shares.get(r.id), i, mats)));

  const shadowQuad = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  for (const it of doc.items) {
    const def = defs[it.defId];
    if (!def) continue;
    const hr = headroomFor(it, def, doc);
    const bad = !!(hr && (def.hz ?? 700) > hr.mm);
    const model = furnitureModel(def, mats, { bad, seed: it.id });
    if (mats.hasTextures) {
      const b = bbox(defOutline(def));
      const s = new THREE.Mesh(shadowQuad, mats.shadow);
      s.scale.set(b.w * MM + 0.24, 1, b.h * MM + 0.24);
      s.position.set(b.cx * MM, 0.006, b.cy * MM);
      s.renderOrder = 1;
      s.userData.shared = true;
      model.add(s);
    }
    model.position.set(it.x * MM, 0, it.y * MM);
    model.rotation.y = -(it.rot || 0) * D2R;
    model.userData.itemId = it.id;
    furniture.add(model);
  }

  const lights = roomLights(rooms);
  lights.forEach((l) => roof.add(l));

  return {
    group,
    floors,
    walls: wallInfo,
    slabs,
    roof,
    furniture,
    lights,
    bounds: bounds(doc, defs, rooms, pieces),
    dispose() {
      group.traverse((o) => {
        if ((o.isMesh || o.isLine) && !o.userData.shared) o.geometry.dispose();
      });
      shadowQuad.dispose();
    },
  };
}

/* ---------- triangles ---------- */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/* Collects triangles per material and makes one geometry with a group per
   material. Each triangle is wound to face the normal it is given, so no
   caller has to keep track of winding. */
class Mesher {
  constructor(n) {
    this.parts = Array.from({ length: n }, () => ({ pos: [], nrm: [], uv: [] }));
  }
  tri(mi, a, b, c, n, ua = [0, 0], ub = [0, 0], uc = [0, 0]) {
    const f = cross(sub(b, a), sub(c, a));
    const len = Math.hypot(f[0], f[1], f[2]);
    if (len < 1e-10) return;
    if (!n) n = [f[0] / len, f[1] / len, f[2] / len];
    else if (dot(f, n) < 0) {
      [b, c] = [c, b];
      [ub, uc] = [uc, ub];
    }
    const P = this.parts[mi];
    P.pos.push(...a, ...b, ...c);
    P.nrm.push(...n, ...n, ...n);
    P.uv.push(...ua, ...ub, ...uc);
  }
  /* a planar triangle facing up (or down), with its true sloping normal */
  sloped(mi, a, b, c, up, ua, ub, uc) {
    const f = cross(sub(b, a), sub(c, a));
    const len = Math.hypot(f[0], f[1], f[2]);
    if (len < 1e-10) return;
    let n = [f[0] / len, f[1] / len, f[2] / len];
    if (n[1] < 0 === up) n = [-n[0], -n[1], -n[2]];
    this.tri(mi, a, b, c, n, ua, ub, uc);
  }
  /* a convex polygon, as a fan */
  fan(mi, pts, n, uvs) {
    for (let i = 1; i < pts.length - 1; i++)
      this.tri(mi, pts[0], pts[i], pts[i + 1], n, uvs && uvs[0], uvs && uvs[i], uvs && uvs[i + 1]);
  }
  geometry() {
    const pos = [],
      nrm = [],
      uv = [];
    const g = new THREE.BufferGeometry();
    let start = 0;
    this.parts.forEach((p, mi) => {
      pos.push(...p.pos);
      nrm.push(...p.nrm);
      uv.push(...p.uv);
      const count = p.pos.length / 3;
      if (count) g.addGroup(start, count, mi);
      start += count;
    });
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    return g;
  }
}

const v3 = (p, h) => [p.x * MM, h * MM, p.y * MM];

/* ---------- floors ---------- */

function floorMesh(room, i, mats) {
  const pts = room.points;
  const b = bbox(pts);
  const y = Math.min(i, 5) * 1; // mm: rooms drawn overlapping would fight
  // boards run along the room's longer side
  const uv = (p) => (b.w >= b.h ? [p.x * MM, p.y * MM] : [p.y * MM, p.x * MM]);
  const M = new Mesher(1);
  for (const [a, c, d] of triangulate(pts))
    M.tri(
      0,
      v3(pts[a], y),
      v3(pts[c], y),
      v3(pts[d], y),
      [0, 1, 0],
      uv(pts[a]),
      uv(pts[c]),
      uv(pts[d]),
    );
  const mesh = new THREE.Mesh(M.geometry(), mats.floor);
  mesh.receiveShadow = true;
  mesh.userData.floor = room.id;
  return mesh;
}

/* ---------- walls ---------- */

/* One wall piece: its two faces with the openings cut out, its top, ends
   and reveals; window and door joinery; contact shadow strips along its
   foot; and the low slab left standing when the wall is cut away. */
function buildWall(piece, e, doc, rooms, mats, centre) {
  const { L, ux, uy } = piece;
  const t = Math.max(20, piece.t);
  const t2 = t / 2;
  const nx = -uy,
    ny = ux;
  const P = (u, w) => ({ x: piece.x1 + ux * u + nx * w, y: piece.y1 + uy * u + ny * w });
  const top = wallTop(piece, doc);
  const H = (u, w) => top(P(u, w));
  const V = (u, w, v) => v3(P(u, w), v);
  const room = piece.room ? rooms.find((r) => r.id === piece.room) : null;
  // the gables over this wall: its own room's, and any it stands in for
  const ridges = [piece.room, ...piece.shared.map((x) => x.room)]
    .map((id) => rooms.find((r) => r.id === id))
    .filter(Boolean)
    .map(ridgeOf)
    .filter(Boolean);

  // which faces look out: probe a little way off each face's middle
  const inside = (p) => rooms.some((r) => pointInPoly(p, r.points));
  const ext = { 1: !inside(P(L / 2, t2 + 300)), [-1]: !inside(P(L / 2, -t2 - 300)) };

  // openings, kept where both faces are and below the top of the wall
  const lo = Math.max(e.plus[0], e.minus[0]) + 20,
    hi = Math.min(e.plus[1], e.minus[1]) - 20;
  const ops = piece.ops
    .map((o) => {
      const a = Math.max(o.a, lo),
        b = Math.min(o.b, hi);
      const roof = Math.min(H(a, -t2), H(a, t2), H(b, -t2), H(b, t2), H((a + b) / 2, 0));
      return { ...o, a, b, s: Math.max(0, o.sill), h: Math.min(o.head, roof - 20) };
    })
    .filter((o) => o.b - o.a > 50 && o.h > o.s + 10);

  /* points along a face's top where the height can bend or step: ridges,
     where it stands in for another room's wall, and for a free wall regular
     steps, as the ceilings it runs under may slope */
  const topSamples = (u0, u1, w) => {
    const us = [u0, u1, ...topBreaks(piece, doc, w)];
    if (!room) for (let u = u0 + 250; u < u1; u += 250) us.push(u);
    return [
      ...new Set(us.filter((u) => u >= u0 && u <= u1).map((u) => Math.round(u * 100) / 100)),
    ].sort((a, b) => a - b);
  };

  const M = new Mesher(3); // 0 inside face, 1 outside face, 2 cut wood
  for (const s of [1, -1]) {
    const w = s * t2;
    const [f0, f1] = s > 0 ? e.plus : e.minus;
    const contour = [new THREE.Vector2(f0, 0)];
    for (const o of ops)
      if (o.s <= 1)
        contour.push(
          new THREE.Vector2(o.a, 0),
          new THREE.Vector2(o.a, o.h),
          new THREE.Vector2(o.b, o.h),
          new THREE.Vector2(o.b, 0),
        );
    contour.push(new THREE.Vector2(f1, 0));
    const us = topSamples(f0, f1, w);
    for (let i = us.length - 1; i >= 0; i--) contour.push(new THREE.Vector2(us[i], H(us[i], w)));
    const holes = ops
      .filter((o) => o.s > 1)
      .map((o) => [
        new THREE.Vector2(o.a, o.s),
        new THREE.Vector2(o.b, o.s),
        new THREE.Vector2(o.b, o.h),
        new THREE.Vector2(o.a, o.h),
      ]);
    const tris = THREE.ShapeUtils.triangulateShape(contour, holes);
    const all = [...contour, ...holes.flat()];
    const n = [s * nx, 0, s * ny];
    const mi = ext[s] ? 1 : 0;
    for (const [i, j, k] of tris) {
      const [a, b, c] = [all[i], all[j], all[k]];
      M.tri(
        mi,
        V(a.x, w, a.y),
        V(b.x, w, b.y),
        V(c.x, w, c.y),
        n,
        [a.x * MM, a.y * MM],
        [b.x * MM, b.y * MM],
        [c.x * MM, c.y * MM],
      );
    }
  }

  // the top, in slices along the wall where its height bends
  const quad = [
    { x: e.minus[0], y: -t2 },
    { x: e.minus[1], y: -t2 },
    { x: e.plus[1], y: t2 },
    { x: e.plus[0], y: t2 },
  ];
  const cuts = [
    ...new Set([
      ...topSamples(Math.min(e.plus[0], e.minus[0]), Math.max(e.plus[1], e.minus[1]), 0),
    ]),
  ];
  const local = (q) => P(q.x, q.y);
  for (let i = 0; i < cuts.length - 1; i++) {
    let halves = [clipHalf(clipHalf(quad, "x", cuts[i], false), "x", cuts[i + 1], true).map(local)];
    for (const r of ridges)
      halves = halves.flatMap((h) => [
        clipHalf(h, r.axis, r.value, true),
        clipHalf(h, r.axis, r.value, false),
      ]);
    for (const h of halves) {
      if (h.length < 3) continue;
      const pts = h.map((p) => v3(p, top(p)));
      for (let k = 1; k < pts.length - 1; k++) M.sloped(2, pts[0], pts[k], pts[k + 1], true);
    }
  }

  // the two ends, square or mitred
  for (const k of [0, 1]) {
    const A = P(e.minus[k], -t2),
      B = P(e.plus[k], t2);
    let n = [B.y - A.y, 0, -(B.x - A.x)];
    const out = k === 0 ? -1 : 1;
    if ((n[0] * ux + n[2] * uy) * out < 0) n = n.map((v) => -v);
    const len = Math.hypot(n[0], n[2]) || 1;
    n = n.map((v) => v / len);
    M.fan(2, [v3(A, 0), v3(B, 0), v3(B, top(B)), v3(A, top(A))], n);
  }

  // reveals: the sides of each hole through the wall
  const U = [ux, 0, uy];
  for (const o of ops) {
    M.fan(2, [V(o.a, -t2, o.s), V(o.a, t2, o.s), V(o.a, t2, o.h), V(o.a, -t2, o.h)], U);
    M.fan(
      2,
      [V(o.b, -t2, o.s), V(o.b, t2, o.s), V(o.b, t2, o.h), V(o.b, -t2, o.h)],
      U.map((v) => -v),
    );
    M.fan(2, [V(o.a, -t2, o.h), V(o.b, -t2, o.h), V(o.b, t2, o.h), V(o.a, t2, o.h)], [0, -1, 0]);
    if (o.s > 1)
      M.fan(2, [V(o.a, -t2, o.s), V(o.b, -t2, o.s), V(o.b, t2, o.s), V(o.a, t2, o.s)], [0, 1, 0]);
  }

  const mesh = new THREE.Mesh(M.geometry(), [mats.logsIn, mats.logsOut, mats.cut]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const obj = new THREE.Group();
  obj.add(mesh);

  // joinery, built in the wall's own frame: u along it, v up, w across
  const frame = new THREE.Group();
  frame.matrixAutoUpdate = false;
  frame.matrix
    .makeBasis(
      new THREE.Vector3(ux, 0, uy),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(nx, 0, ny),
    )
    .setPosition(piece.x1 * MM, 0, piece.y1 * MM);
  const J = new Parts();
  const extSide = ext[1] && !ext[-1] ? 1 : ext[-1] && !ext[1] ? -1 : 0;
  for (const o of ops) joinery(J, frame, o, t2, extSide, e, H, mats);
  for (const m of J.meshes()) frame.add(m);
  obj.add(frame);

  // contact shadows along the foot of both faces, broken at doors
  if (mats.hasTextures) {
    const S = new Mesher(1);
    const doors = ops.filter((o) => o.s <= 1).map((o) => [o.a, o.b]);
    for (const s of [1, -1]) {
      const [f0, f1] = s > 0 ? e.plus : e.minus;
      let from = f0;
      for (const [a, b] of [...doors, [f1, f1]]) {
        if (a > from + 1) {
          const y = 6;
          S.fan(
            0,
            [
              V(from, s * t2, y),
              V(a, s * t2, y),
              V(a, s * (t2 + 300), y),
              V(from, s * (t2 + 300), y),
            ],
            [0, 1, 0],
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
            ],
          );
        }
        from = Math.max(from, b);
      }
    }
    const strip = new THREE.Mesh(S.geometry(), mats.edgeShadow);
    strip.renderOrder = 1;
    obj.add(strip);
  }

  // what is left standing when the wall is cut away: its footprint, low
  const B = new Mesher(1);
  const doorCuts = ops.filter((o) => o.s <= 1);
  let from = -Infinity;
  for (const [a, b] of [...doorCuts.map((o) => [o.a, o.b]), [Infinity, Infinity]]) {
    let part = quad;
    if (from > -Infinity) part = clipHalf(part, "x", from, false);
    if (a < Infinity) part = clipHalf(part, "x", a, true);
    from = b;
    if (part.length < 3) continue;
    const pl = part.map(local);
    B.fan(
      0,
      pl.map((p) => v3(p, SLAB)),
      [0, 1, 0],
    );
    for (let i = 0; i < pl.length; i++) {
      const p = pl[i],
        q = pl[(i + 1) % pl.length];
      const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      const cpt = pl.reduce(
        (acc, r) => ({ x: acc.x + r.x / pl.length, y: acc.y + r.y / pl.length }),
        { x: 0, y: 0 },
      );
      let n = [q.y - p.y, 0, -(q.x - p.x)];
      if (n[0] * (mid.x - cpt.x) + n[2] * (mid.y - cpt.y) < 0) n = n.map((v) => -v);
      const len = Math.hypot(n[0], n[2]) || 1;
      B.fan(
        0,
        [v3(p, 0), v3(q, 0), v3(q, SLAB), v3(p, SLAB)],
        n.map((v) => v / len),
      );
    }
  }
  const slab = new THREE.Mesh(B.geometry(), mats.slab);
  slab.receiveShadow = true;

  // the way out, for cutting away the walls between the camera and the rooms
  const mid = P(L / 2, 0);
  let out = null;
  if (extSide) out = { x: extSide * nx, z: extSide * ny };
  else if (ext[1] && ext[-1]) {
    const k = Math.sign((mid.x - centre.x) * nx + (mid.y - centre.y) * ny) || 1;
    out = { x: k * nx, z: k * ny };
  }
  return { id: piece.id, obj, slab, mid: { x: mid.x * MM, z: mid.y * MM }, out };
}

/* Window and door joinery in a wall's frame (metres; u along, v up, w
   across): frames, glass, casings round the hole on both faces, a sill
   outside, and a door leaf standing open towards its swing side. */
function joinery(J, frame, o, t2mm, extSide, e, H, mats) {
  const A = o.a * MM,
    B = o.b * MM,
    S = o.s * MM,
    T = o.h * MM,
    t2 = t2mm * MM;
  const cw = 0.07, // casing width
    cp = 0.018; // how far casings stand proud of the face
  for (const side of [1, -1]) {
    const f0 = (side > 0 ? e.plus[0] : e.minus[0]) * MM,
      f1 = (side > 0 ? e.plus[1] : e.minus[1]) * MM;
    const w0 = side * t2,
      w1 = side * (t2 + cp);
    const [wa, wb] = side > 0 ? [w0, w1] : [w1, w0];
    const room = (u) => H(u / MM, side * t2mm) * MM;
    const ca = Math.max(f0, A - cw),
      cb = Math.min(f1, B + cw);
    const head = Math.min(T + cw, room(ca), room(cb)) - 0.005;
    if (head > T + 0.02) J.box(mats.trim, ca, cb, T, head, wa, wb);
    const foot = o.s > 1 ? Math.max(0, S - cw) : 0;
    J.box(mats.trim, ca, A, foot, T, wa, wb);
    J.box(mats.trim, B, cb, foot, T, wa, wb);
    if (o.s > 1) {
      const outside = extSide === side;
      if (outside) {
        const [sa, sb] = side > 0 ? [w0, side * (t2 + 0.06)] : [side * (t2 + 0.06), w0];
        J.box(mats.trim, Math.max(f0, A - 0.04), Math.min(f1, B + 0.04), S - 0.035, S, sa, sb);
      } else J.box(mats.trim, ca, cb, foot, S, wa, wb);
    }
  }
  if (o.s > 1) {
    // a window: frame and glass towards the outside face, a mullion if wide
    const wf = extSide ? extSide * (t2 - 0.06) : 0;
    const fp = 0.05,
      fd = 0.07;
    const [w0, w1] = [wf - fd / 2, wf + fd / 2];
    J.box(mats.trim, A, B, S, S + fp, w0, w1);
    J.box(mats.trim, A, B, T - fp, T, w0, w1);
    J.box(mats.trim, A, A + fp, S + fp, T - fp, w0, w1);
    J.box(mats.trim, B - fp, B, S + fp, T - fp, w0, w1);
    if (B - A > 1.0)
      J.box(mats.trim, (A + B) / 2 - fp / 2, (A + B) / 2 + fp / 2, S + fp, T - fp, w0, w1);
    J.box(mats.glass, A + fp, B - fp, S + fp, T - fp, wf - 0.003, wf + 0.003);
    return;
  }
  // a door: linings over the reveals, and the leaf
  const lt = 0.02;
  J.box(mats.trim, A, A + lt, 0, T, -t2, t2);
  J.box(mats.trim, B - lt, B, 0, T, -t2, t2);
  J.box(mats.trim, A, B, T - lt, T, -t2, t2);
  const width = B - A - 2 * lt - 0.006,
    height = T - lt - 0.012,
    thick = 0.04;
  if (width < 0.2 || height < 0.5) return;
  const sw = o.side || 1,
    dir = o.flip ? -1 : 1;
  const open = 78 * D2R;
  const du = dir * Math.cos(open),
    dw = sw * Math.sin(open);
  const leaf = new THREE.Group();
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, thick).translate(width / 2, height / 2, 0),
    mats.doorLeaf,
  );
  slab.castShadow = slab.receiveShadow = true;
  const knob = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.022, thick + 0.12).translate(width - 0.09, 1.0 - 0.006, 0),
    mats.steel,
  );
  knob.castShadow = true;
  leaf.add(slab, knob);
  leaf.rotation.y = Math.atan2(-dw, du);
  leaf.position.set(o.flip ? B - lt - 0.003 : A + lt + 0.003, 0.006, sw * (t2 - thick / 2 - 0.004));
  frame.add(leaf);
}

/* ---------- roofs ---------- */

/* A room's roof: its ceiling's shape carried out over the walls, as a slab
   with tin on top and boards underneath, a white fascia round its edge and
   a cap along a gable's ridge. Outside edges overhang the wall face; where
   an edge runs along another room, the roof reaches halfway to that room's
   roof instead, and the eaves step back square where the other room ends. */
function buildRoof(room, shares, idx, mats) {
  const c = room.ceiling || defaultCeiling();
  const aw = room.autoWalls || {};
  const t = aw.t || 150;
  const face = aw.mode === "outside" ? t : aw.mode === "centre" ? t / 2 : 0;
  const pts = [],
    dists = [];
  room.points.forEach((p, i) => {
    const q = room.points[(i + 1) % room.points.length];
    const L = Math.hypot(q.x - p.x, q.y - p.y);
    if (L < 1) return;
    const spans = (shares && shares[i]) || [];
    const marks = [
      ...new Set([0, ...spans.flatMap((sp) => [sp.a, sp.b]), L].map((v) => Math.round(v))),
    ]
      .filter((v) => v >= 0 && v <= L)
      .sort((a, b) => a - b);
    for (let k = 0; k < marks.length - 1; k++) {
      if (marks[k + 1] - marks[k] < 1) continue;
      const mid = (marks[k] + marks[k + 1]) / 2;
      const sp = spans.find((x) => mid > x.a && mid < x.b);
      pts.push({ x: p.x + ((q.x - p.x) * marks[k]) / L, y: p.y + ((q.y - p.y) * marks[k]) / L });
      dists.push(sp ? sp.gap / 2 : face + EAVES);
    }
  });
  if (pts.length < 3) return new THREE.Group();
  const outline = offsetEdges(pts, dists);
  const ridge = ridgeOf(room);
  const parts = ridge
    ? [
        clipHalf(outline, ridge.axis, ridge.value, true),
        clipHalf(outline, ridge.axis, ridge.value, false),
      ]
    : [outline];
  const lift = idx * 3; // mm: keeps roofs that meet from fighting where they touch
  const low = (p) => roofHeightAt(room, p) + lift;
  // u along the ridge, v down the slope, so the tin's seams run downhill
  const uv = (p) => (c.axis === "x" ? [p.y * MM, p.x * MM] : [p.x * MM, p.y * MM]);
  const M = new Mesher(3); // 0 tin, 1 ceiling boards, 2 fascia
  const onRidge = (p) => ridge && Math.abs((ridge.axis === "x" ? p.x : p.y) - ridge.value) < 0.5;
  for (const poly of parts) {
    if (poly.length < 3) continue;
    for (const [a, b, d] of triangulate(poly)) {
      const [pa, pb, pd] = [poly[a], poly[b], poly[d]];
      M.sloped(
        0,
        v3(pa, low(pa) + ROOF_BUILDUP),
        v3(pb, low(pb) + ROOF_BUILDUP),
        v3(pd, low(pd) + ROOF_BUILDUP),
        true,
        uv(pa),
        uv(pb),
        uv(pd),
      );
      M.sloped(1, v3(pa, low(pa)), v3(pb, low(pb)), v3(pd, low(pd)), false, uv(pa), uv(pb), uv(pd));
    }
    const s = polySigned(poly) > 0 ? 1 : -1;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i],
        q = poly[(i + 1) % poly.length];
      if (onRidge(p) && onRidge(q)) continue;
      const L = Math.hypot(q.x - p.x, q.y - p.y);
      if (L < 0.5) continue;
      const n = [((q.y - p.y) / L) * s, 0, (-(q.x - p.x) / L) * s];
      M.fan(
        2,
        [v3(p, low(p)), v3(q, low(q)), v3(q, low(q) + ROOF_BUILDUP), v3(p, low(p) + ROOF_BUILDUP)],
        n,
      );
    }
  }
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(M.geometry(), [mats.roof, mats.ceiling, mats.trim]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  if (ridge) {
    const along = outline.map((p) => (ridge.axis === "x" ? p.y : p.x));
    const a0 = Math.min(...along),
      a1 = Math.max(...along);
    const y = (c.ridgeH + lift + ROOF_BUILDUP) * MM;
    const r = ridge.value * MM;
    const cap = new THREE.Mesh(
      ridge.axis === "x"
        ? new THREE.BoxGeometry(0.16, 0.07, (a1 - a0) * MM).translate(
            r,
            y + 0.02,
            ((a0 + a1) / 2) * MM,
          )
        : new THREE.BoxGeometry((a1 - a0) * MM, 0.07, 0.16).translate(
            ((a0 + a1) / 2) * MM,
            y + 0.02,
            r,
          ),
      mats.iron,
    );
    cap.castShadow = true;
    g.add(cap);
  }
  return g;
}

/* ---------- the rest ---------- */

/* a warm light under each of the biggest rooms' ceilings, for walking round
   inside with the roof on. Lights cast no shadows, so they shine through
   walls: the view turns them up only in walk mode (by intensity, as
   switching lights on and off would recompile every material). */
function roomLights(rooms) {
  return [...rooms]
    .sort((a, b) => Math.abs(polySigned(b.points)) - Math.abs(polySigned(a.points)))
    .slice(0, 6)
    .map((r) => {
      const b = bbox(r.points);
      let p = { x: b.cx, y: b.cy };
      if (!pointInPoly(p, r.points)) p = r.points[0];
      // well below the ceiling, or it glares on the boards right above it
      const h = Math.max(1600, Math.min(2100, roofHeightAt(r, p) - 700));
      const light = new THREE.PointLight("#FFD9A8", 0.7, Math.max(b.w, b.h) * MM * 1.6 + 2, 1.2);
      light.position.set(p.x * MM, h * MM, p.y * MM);
      light.userData.room = r.id;
      light.userData.on = light.intensity;
      return light;
    });
}

function planCentre(doc, defs) {
  const pts = planPoints(doc, defs);
  if (!pts.length) return { x: 0, y: 0 };
  const b = bbox(pts);
  return { x: b.cx, y: b.cy };
}

function planPoints(doc, defs) {
  const pts = [];
  for (const w of doc.walls) pts.push(...wallPoly(w));
  for (const r of doc.rooms) pts.push(...(r.points || []));
  for (const it of doc.items) {
    const d = defs[it.defId];
    if (d) pts.push(...itemPoly(it, d));
  }
  return pts;
}

/* the box the model fills, in metres, and the sphere round it */
function bounds(doc, defs, rooms, pieces) {
  const pts = planPoints(doc, defs);
  const b = pts.length ? bbox(pts) : { x0: -3000, x1: 3000, y0: -3000, y1: 3000, cx: 0, cy: 0 };
  let top = 2500;
  for (const r of rooms) {
    const c = r.ceiling || defaultCeiling();
    top = Math.max(top, (c.mode === "flat" ? c.h : Math.max(c.ridgeH, c.eaveH)) + ROOF_BUILDUP);
  }
  for (const p of pieces) if (!p.room) top = Math.max(top, p.wall.h || doc.wallH || 2500);
  const min = new THREE.Vector3(b.x0 * MM, 0, b.y0 * MM),
    max = new THREE.Vector3(b.x1 * MM, top * MM, b.y1 * MM);
  const centre = min.clone().add(max).multiplyScalar(0.5);
  return { min, max, centre, radius: Math.max(2, min.distanceTo(max) / 2) };
}
