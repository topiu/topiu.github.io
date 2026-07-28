/* domain/regions — moved verbatim from liikepaivakirja.jsx (Phase 1 split). */

/* ------------------------------------------------------------------ */
/*  Muscle regions (~26), geometry shared by picker and heat map        */
/*  Coordinate space: 200 x 340, body centred on x=100                 */
/* ------------------------------------------------------------------ */
export const REGIONS = [
  /* --- front --- */
  { id: "neck_front", name: "Kaulan etuosa", view: "front", s: { t: "rect", x: 91, y: 45, w: 18, h: 14, r: 5 } },
  { id: "shoulder_front", name: "Etuolkapää", view: "front", m: true, s: { t: "ellipse", cx: 64, cy: 68, rx: 13, ry: 11 } },
  { id: "chest", name: "Rintalihas", view: "front", m: true, s: { t: "rect", x: 71, y: 60, w: 26, h: 26, r: 8 } },
  { id: "biceps", name: "Hauis", view: "front", m: true, s: { t: "rect", x: 48, y: 82, w: 17, h: 34, r: 8 } },
  { id: "forearm", name: "Kyynärvarsi", view: "front", m: true, s: { t: "rect", x: 43, y: 120, w: 15, h: 44, r: 7 } },
  { id: "abs", name: "Suorat vatsalihakset", view: "front", s: { t: "rect", x: 89, y: 90, w: 22, h: 40, r: 6 } },
  { id: "obliques", name: "Vinot vatsalihakset", view: "front", m: true, s: { t: "rect", x: 74, y: 94, w: 13, h: 36, r: 6 } },
  { id: "core_deep", name: "Syvät vatsalihakset", view: "front", s: { t: "rect", x: 86, y: 134, w: 28, h: 16, r: 7 } },
  { id: "tfl", name: "Lonkan loitontajat (TFL)", view: "front", m: true, s: { t: "ellipse", cx: 70, cy: 158, rx: 9, ry: 12 } },
  { id: "hip_flexor", name: "Lonkan koukistajat", view: "front", m: true, s: { t: "ellipse", cx: 88, cy: 158, rx: 11, ry: 11 } },
  { id: "quad", name: "Etureisi", view: "front", m: true, s: { t: "rect", x: 68, y: 176, w: 17, h: 66, r: 9 } },
  { id: "adductor", name: "Lähentäjät (nivunen)", view: "front", m: true, s: { t: "rect", x: 86, y: 176, w: 9, h: 44, r: 5 } },
  { id: "tibialis", name: "Säären etuosa", view: "front", m: true, s: { t: "rect", x: 74, y: 250, w: 14, h: 50, r: 7 } },
  /* --- back --- */
  { id: "neck_back", name: "Niska", view: "back", s: { t: "rect", x: 91, y: 45, w: 18, h: 14, r: 5 } },
  { id: "trap_upper", name: "Ylä-epäkäslihas", view: "back", s: { t: "rect", x: 74, y: 58, w: 52, h: 13, r: 6 } },
  { id: "trap_lower", name: "Lapatuki / ala-epäkäs", view: "back", m: true, s: { t: "rect", x: 78, y: 74, w: 17, h: 20, r: 6 } },
  { id: "thoracic", name: "Rintarangan ojentajat", view: "back", s: { t: "rect", x: 95, y: 72, w: 10, h: 36, r: 5 } },
  { id: "shoulder_rear", name: "Takaolkapää", view: "back", m: true, s: { t: "ellipse", cx: 64, cy: 70, rx: 13, ry: 11 } },
  { id: "triceps", name: "Ojentaja", view: "back", m: true, s: { t: "rect", x: 48, y: 82, w: 17, h: 34, r: 8 } },
  { id: "lat", name: "Leveä selkälihas", view: "back", m: true, s: { t: "rect", x: 72, y: 96, w: 18, h: 26, r: 7 } },
  { id: "lumbar", name: "Alaselän ojentajat", view: "back", s: { t: "rect", x: 88, y: 112, w: 24, h: 26, r: 7 } },
  { id: "glute_max", name: "Iso pakaralihas", view: "back", m: true, s: { t: "rect", x: 79, y: 142, w: 20, h: 28, r: 10 } },
  { id: "glute_med", name: "Keskimmäinen pakaralihas", view: "back", m: true, s: { t: "ellipse", cx: 74, cy: 148, rx: 10, ry: 12 } },
  { id: "hip_rotators", name: "Lonkan kiertäjät", view: "back", m: true, s: { t: "ellipse", cx: 90, cy: 166, rx: 10, ry: 8 } },
  { id: "hamstring", name: "Takareisi", view: "back", m: true, s: { t: "rect", x: 70, y: 178, w: 20, h: 64, r: 9 } },
  { id: "calf", name: "Pohje", view: "back", m: true, s: { t: "rect", x: 74, y: 252, w: 15, h: 46, r: 8 } },
];

export const REGION_BY_ID = {};
REGIONS.forEach((r) => (REGION_BY_ID[r.id] = r));

export const regionName = (id) => (REGION_BY_ID[id] ? REGION_BY_ID[id].name : id);

export const regionsOfView = (view) => REGIONS.filter((r) => r.view === view);

/* body silhouette, drawn under the regions */
export const SILHOUETTE = [
  { t: "ellipse", cx: 100, cy: 26, rx: 17, ry: 20 },
  { t: "rect", x: 91, y: 42, w: 18, h: 18, r: 4 },
  { t: "poly", p: [[66, 58], [134, 58], [130, 108], [122, 148], [122, 176], [78, 176], [78, 148], [70, 108]] },
  { t: "ellipse", cx: 64, cy: 68, rx: 14, ry: 12, m: true },
  { t: "rect", x: 47, y: 78, w: 18, h: 46, r: 9, m: true },
  { t: "rect", x: 43, y: 118, w: 15, h: 48, r: 7, m: true },
  { t: "ellipse", cx: 50, cy: 172, rx: 7, ry: 9, m: true },
  { t: "rect", x: 66, y: 172, w: 28, h: 76, r: 12, m: true },
  { t: "rect", x: 72, y: 244, w: 18, h: 64, r: 9, m: true },
  { t: "ellipse", cx: 81, cy: 316, rx: 11, ry: 8, m: true },
];

/* which anatomical side a drawn half represents (front view is mirrored to the viewer) */
export const sideOfHalf = (view, mirrored) => (view === "front" ? (mirrored ? "L" : "R") : mirrored ? "R" : "L");
