/* domain/structures — moved verbatim from liikepaivakirja.jsx (Phase 1 split). */

/* ------------------------------------------------------------------ */
/*  Structures: nerves (lines) and joints (rings).                      */
/*  These are mobilised, not "loaded", so they carry their own metric   */
/*  (exposure) and their own neutral visual language.                  */
/* ------------------------------------------------------------------ */
export const STRUCTURES = [
  /* --- nerves --- */
  { id: "n_sciatic", name: "Iskiashermo", kind: "nerve", view: "back", m: true, p: [[87, 148], [83, 178], [80, 212], [77, 246]] },
  { id: "n_tibial", name: "Säärihermo", kind: "nerve", view: "back", m: true, p: [[77, 250], [79, 276], [81, 300]] },
  { id: "n_femoral", name: "Reisihermo", kind: "nerve", view: "front", m: true, p: [[89, 158], [85, 186], [81, 216], [79, 242]] },
  { id: "n_lat_fem_cut", name: "Reiden ulompi ihohermo", kind: "nerve", view: "front", m: true, p: [[71, 166], [68, 194], [70, 220]] },
  { id: "n_peroneal", name: "Pohjehermo", kind: "nerve", view: "front", m: true, p: [[78, 252], [75, 278], [78, 302]] },
  { id: "n_median", name: "Keskihermo", kind: "nerve", view: "front", m: true, p: [[57, 88], [53, 118], [49, 150], [51, 168]] },
  { id: "n_ulnar", name: "Kyynärhermo", kind: "nerve", view: "front", m: true, p: [[62, 92], [59, 122], [55, 152], [57, 170]] },
  /* --- joints --- */
  { id: "j_shoulder", name: "Olkanivel", kind: "joint", view: "front", m: true, c: { cx: 64, cy: 68 } },
  { id: "j_hip", name: "Lonkkanivel", kind: "joint", view: "front", m: true, c: { cx: 84, cy: 168 } },
  { id: "j_knee", name: "Polvinivel", kind: "joint", view: "front", m: true, c: { cx: 76, cy: 247 } },
  { id: "j_ankle", name: "Nilkkanivel", kind: "joint", view: "front", m: true, c: { cx: 80, cy: 305 } },
  { id: "j_si", name: "SI-nivel (risti-suoliluu)", kind: "joint", view: "back", m: true, c: { cx: 92, cy: 138 } },
  { id: "j_lumbar", name: "Lanneranka", kind: "joint", view: "back", c: { cx: 100, cy: 124 } },
  { id: "j_thoracic", name: "Rintaranka", kind: "joint", view: "back", c: { cx: 100, cy: 88 } },
];

export const STRUCT_BY_ID = {};
STRUCTURES.forEach((s) => (STRUCT_BY_ID[s.id] = s));

export const structName = (id) => (STRUCT_BY_ID[id] ? STRUCT_BY_ID[id].name : id);

export const structuresOfView = (view) => STRUCTURES.filter((s) => s.view === view);
