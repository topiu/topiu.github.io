import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Plus,
  Minus,
  X,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Archive,
  ArchiveRestore,
  Zap,
  HelpCircle,
  BookOpen,
  Download,
  Upload,
  Copy,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Palette                                                            */
/* ------------------------------------------------------------------ */
const C = {
  bg: "#EDF1EF",
  surface: "#FFFFFF",
  surfaceSoft: "#F7FAF8",
  ink: "#16241F",
  inkSoft: "#5C6B65",
  inkFaint: "#98A39D",
  line: "#E0E7E3",
  pine: "#1F7A5C",
  pineDeep: "#17604A",
  pineSoft: "#DBEAE3",
  pineTint: "#EAF3EF",
  amber: "#B96A2E",
  amberSoft: "#EFD8C1",
  amberTint: "#F8EEE3",
  amberLine: "#E7D2BC",
  slate: "#41576A",
  slateSoft: "#9FB3C2",
  slateTint: "#DDE6EC",
};
const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/* ------------------------------------------------------------------ */
/*  Defaults (from the physio) — all editable                          */
/* ------------------------------------------------------------------ */
const EMPTY_DOSE = { sets: null, reps: null, hold: null, min: null };
const DEFAULT_EXERCISES = [
  { name: "Lonkan loitonnus", type: "strength", muscles: { glute_med: 1, tfl: 2, glute_max: 3, core_deep: 3 } },
  { name: "Dead bug -jalka", type: "stability", muscles: { core_deep: 1, abs: 2, hip_flexor: 2, lumbar: 3 } },
  { name: "Tarjoilijankumarrus", type: "strength", muscles: { hamstring: 1, glute_max: 2, lumbar: 2, thoracic: 3 } },
  { name: "Etureiden venytys", type: "stretch", muscles: { quad: 1, hip_flexor: 2 } },
  { name: "Lonkan sisäkierron venytys", type: "stretch", muscles: { hip_rotators: 1, glute_med: 2, adductor: 3 }, structures: ["j_hip"] },
];
const DEFAULT_SYMPTOMS = [
  { name: "Selkä", regions: { lumbar: "B" } },
  { name: "Pakara", regions: { glute_max: "B" } },
  { name: "Nivunen", regions: { adductor: "B" } },
];
const SEVERITY = [
  { v: 1, label: "lievä" },
  { v: 2, label: "kohtalainen" },
  { v: 3, label: "kova" },
];

const seedExercises = () =>
  DEFAULT_EXERCISES.map((d) => ({ id: uid(), name: d.name, desc: "", type: d.type, muscles: { ...d.muscles }, structures: [...(d.structures || [])], dose: { ...EMPTY_DOSE } }));
const seedSymptoms = () => DEFAULT_SYMPTOMS.map((d) => ({ id: uid(), name: d.name, regions: { ...d.regions }, structures: {} }));

/* ------------------------------------------------------------------ */
/*  Date helpers (local, Finnish)                                      */
/* ------------------------------------------------------------------ */
const WD_SHORT = ["Su", "Ma", "Ti", "Ke", "To", "Pe", "La"];
const WD_LONG = [
  "Sunnuntai",
  "Maanantai",
  "Tiistai",
  "Keskiviikko",
  "Torstai",
  "Perjantai",
  "Lauantai",
];
const keyOf = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  x.setHours(0, 0, 0, 0);
  return x;
};
const startOfToday = () => {
  const x = new Date();
  x.setHours(0, 0, 0, 0);
  return x;
};
const shortDate = (d) => `${WD_SHORT[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
const humanDate = (k) => {
  const [y, m, d] = k.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${WD_SHORT[dt.getDay()]} ${d}.${m}.${y}`;
};

/* ------------------------------------------------------------------ */
/*  Dose helpers                                                       */
/* ------------------------------------------------------------------ */
const toNum = (v) => {
  const n = parseInt(String(v).replace(/[^0-9]/g, ""), 10);
  return !n || n <= 0 ? null : n;
};
function doseLabel(d, unit) {
  if (!d) return "";
  if (unit === "min") return d.min ? `${d.min} min` : "";
  const S = d.sets,
    R = d.reps,
    H = d.hold;
  if (!S && !R && !H) return "";
  const s = S || 1;
  if (R && H) return `${s} × ${R} × ${H} s`;
  if (R) return `${s} × ${R}`;
  if (H) return `${s} × ${H} s pito`;
  return s >= 2 ? `${s} sarjaa` : "";
}
const targetSets = (ex) => (ex.dose && ex.dose.sets) || 1;
const isMin = (ex) => ex && ex.unit === "min";
const targetMin = (ex) => (ex.dose && ex.dose.min) || 20;

/* ------------------------------------------------------------------ */
/*  Muscle regions (~26), geometry shared by picker and heat map        */
/*  Coordinate space: 200 x 340, body centred on x=100                 */
/* ------------------------------------------------------------------ */
const REGIONS = [
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
const REGION_BY_ID = {};
REGIONS.forEach((r) => (REGION_BY_ID[r.id] = r));
const regionName = (id) => (REGION_BY_ID[id] ? REGION_BY_ID[id].name : id);
const regionsOfView = (view) => REGIONS.filter((r) => r.view === view);

/* body silhouette, drawn under the regions */
const SILHOUETTE = [
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

/* ------------------------------------------------------------------ */
/*  Structures: nerves (lines) and joints (rings).                      */
/*  These are mobilised, not "loaded", so they carry their own metric   */
/*  (exposure) and their own neutral visual language.                  */
/* ------------------------------------------------------------------ */
const STRUCTURES = [
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
const STRUCT_BY_ID = {};
STRUCTURES.forEach((s) => (STRUCT_BY_ID[s.id] = s));
const structName = (id) => (STRUCT_BY_ID[id] ? STRUCT_BY_ID[id].name : id);
const structuresOfView = (view) => STRUCTURES.filter((s) => s.view === view);

/* symptom quality per day — the field that separates a nerve day from a muscle day */
const QUALITIES = [
  { id: "ache", label: "jomotus" },
  { id: "tingle", label: "pistely" },
  { id: "numb", label: "puutuminen" },
  { id: "radiate", label: "säteily" },
];
const QUALITY_IDS = QUALITIES.map((q) => q.id);
const qualityLabel = (id) => {
  const q = QUALITIES.find((x) => x.id === id);
  return q ? q.label : "";
};

/* exercise types — load means different things, so they stay separable */
const EX_TYPES = [
  { id: "strength", label: "Vahvistus" },
  { id: "stretch", label: "Venytys" },
  { id: "stability", label: "Stabilointi" },
  { id: "mobility", label: "Liikkuvuus" },
  { id: "endurance", label: "Kestävyys" },
];
const EX_TYPE_IDS = EX_TYPES.map((t) => t.id);
const typeLabel = (id) => {
  const t = EX_TYPES.find((x) => x.id === id);
  return t ? t.label : "Vahvistus";
};
/* intensity of a muscle in an exercise: 1 primary, 2 secondary, 3 light */
const INTENSITY = { 1: { label: "pää", w: 1 }, 2: { label: "sivu", w: 0.6 }, 3: { label: "kevyt", w: 0.3 } };
const SIDES = { L: "vasen", R: "oikea", B: "molemmat" };

/* ------------------------------------------------------------------ */
/*  Source provenance for library presets                               */
/* ------------------------------------------------------------------ */
const SOURCES = {
  boren2011: {
    tag: "EMG",
    text:
      "Boren K, Conrey C, Le Coguic J, Paprocki L, Voight M, Robinson TK (2011). Electromyographic analysis of gluteus medius and gluteus maximus during rehabilitation exercises. Int J Sports Phys Ther 6(3):206–223.",
  },
  compendium2024: {
    tag: "MET",
    text:
      "2024 Adult Compendium of Physical Activities. Journal of Sport and Health Science 13(1). Arvot: pacompendium.com — tarkista oma vauhtiluokkasi.",
  },
  anatomy: {
    tag: "Anatomia",
    text:
      "Kohdelihakset perustuvat vakiintuneeseen toiminnalliseen anatomiaan (agonisti tai venytettävä lihas). Ei mittausdataa, mutta ei myöskään kiistanalaista.",
  },
  estimate: {
    tag: "Arvio",
    text:
      "Ei mittausdataa eikä yksiselitteistä anatomista vastausta. Arvot ovat perusteltu arvio — tarkista ja muokkaa omaan tarpeeseesi.",
  },
};
const SRC_ORDER = { boren2011: 0, anatomy: 1, compendium2024: 1, estimate: 2 };
const SCALE_NOTE =
  "EMG-lähteissä aktiivisuus on mitattu prosentteina maksimisupistuksesta (%MVIC). Muunnos kolmiportaiseksi on tämän sovelluksen tekemä, ei tutkimuksen väite: ≥70 % = pää, 40–69 % = sivu, 20–39 % = kevyt. Kynnys 70 % seuraa kirjallisuuden tapaa pitää sitä voimavaikutukseen riittävänä.";

const LIB_CATS = [
  { id: "physio_hip", label: "Fysioterapia · lonkka" },
  { id: "physio_back", label: "Fysioterapia · selkä ja keskivartalo" },
  { id: "physio_knee", label: "Fysioterapia · polvi" },
  { id: "physio_shoulder", label: "Fysioterapia · olkapää" },
  { id: "stretch", label: "Venytykset" },
  { id: "w_legs", label: "Vapaat painot · jalat" },
  { id: "w_back", label: "Vapaat painot · selkä" },
  { id: "w_chest", label: "Vapaat painot · rinta" },
  { id: "w_sh", label: "Vapaat painot · olkapäät" },
  { id: "w_arms", label: "Vapaat painot · kädet" },
  { id: "bw", label: "Kehonpaino" },
  { id: "cardio", label: "Kestävyys" },
];

/* compact constructor: L(id, name, cat, type, muscles, opts) */
const L = (id, name, cat, type, muscles, o) => ({ id, name, cat, type, muscles, ...(o || {}) });
const ST = { sets: 3, reps: null, hold: 30, min: null }; /* stretching convention */
const CARDIO_DOSE = { sets: null, reps: null, hold: null, min: 30 };

const LIBRARY = [
  /* ---------------- physio · hip ---------------- */
  L("side_plank_abd_bottom", "Kylkilankku + loitonnus (alempi jalka)", "physio_hip", "strength", { glute_med: 1, obliques: 2, glute_max: 2, core_deep: 2 }, { src: "boren2011", note: "103 % MVIC (keskimmäinen pakaralihas)" }),
  L("side_plank_abd_top", "Kylkilankku + loitonnus (päällimmäinen jalka)", "physio_hip", "strength", { glute_med: 1, glute_max: 1, obliques: 2, core_deep: 2 }, { src: "boren2011", note: "89 % / 73 % MVIC" }),
  L("single_leg_squat", "Yhden jalan kyykky", "physio_hip", "strength", { quad: 1, glute_max: 1, glute_med: 1, hamstring: 2, core_deep: 3 }, { src: "boren2011", note: "82 % / 71 % MVIC", structures: ["j_knee", "j_hip"] }),
  L("clamshell", "Simpukka", "physio_hip", "strength", { glute_med: 1, hip_rotators: 2, glute_max: 3 }, { src: "boren2011", note: "77 % MVIC (progressio 4)" }),
  L("front_plank_hip_ext", "Lankka + lonkan ojennus", "physio_hip", "strength", { glute_max: 1, core_deep: 1, abs: 2, lumbar: 2, shoulder_front: 3 }, { src: "boren2011", note: "106 % MVIC (iso pakaralihas)" }),
  L("glute_squeeze", "Pakaroiden puristus", "physio_hip", "strength", { glute_max: 1 }, { src: "boren2011", note: "81 % MVIC" }),
  L("sidelying_abduction", "Kylkimakuulla loitonnus", "physio_hip", "strength", { glute_med: 1, tfl: 2, glute_max: 3 }, { src: "boren2011" }),
  L("glute_bridge", "Lantionnosto", "physio_hip", "strength", { glute_max: 1, hamstring: 2, lumbar: 2, core_deep: 3 }, { src: "anatomy" }),
  L("single_leg_bridge", "Yhden jalan lantionnosto", "physio_hip", "strength", { glute_max: 1, hamstring: 2, core_deep: 2, lumbar: 2 }, { src: "anatomy" }),
  L("hip_abduction_standing", "Seisten lonkan loitonnus", "physio_hip", "strength", { glute_med: 1, tfl: 2 }, { src: "anatomy" }),
  L("monster_walk", "Kuminauhakävely sivuttain", "physio_hip", "strength", { glute_med: 1, tfl: 2, glute_max: 3 }, { src: "estimate" }),
  L("fire_hydrant", "Palopostinosto", "physio_hip", "strength", { glute_med: 1, hip_rotators: 2, glute_max: 3 }, { src: "estimate" }),
  L("hip_flexor_march", "Lonkan koukistajan marssi", "physio_hip", "stability", { hip_flexor: 1, core_deep: 2, abs: 3 }, { src: "anatomy" }),
  L("adductor_squeeze", "Lähentäjien puristus (pallo)", "physio_hip", "strength", { adductor: 1, core_deep: 3 }, { src: "anatomy" }),
  L("copenhagen_plank", "Copenhagen-lankku", "physio_hip", "strength", { adductor: 1, obliques: 2, core_deep: 2 }, { src: "anatomy" }),
  L("hip_airplane", "Hip airplane", "physio_hip", "stability", { glute_med: 1, hip_rotators: 1, glute_max: 2, hamstring: 3 }, { src: "estimate", structures: ["j_hip"] }),

  /* ---------------- physio · back & core ---------------- */
  L("dead_bug", "Dead bug", "physio_back", "stability", { core_deep: 1, abs: 2, hip_flexor: 2, lumbar: 3 }, { src: "anatomy" }),
  L("dead_bug_leg", "Dead bug -jalka", "physio_back", "stability", { core_deep: 1, abs: 2, hip_flexor: 2, lumbar: 3 }, { src: "anatomy" }),
  L("bird_dog", "Linnunkoira", "physio_back", "stability", { lumbar: 1, glute_max: 2, core_deep: 2, thoracic: 2, trap_lower: 3 }, { src: "anatomy" }),
  L("front_plank", "Etunojalankku", "physio_back", "stability", { core_deep: 1, abs: 1, obliques: 2, shoulder_front: 3 }, { src: "anatomy" }),
  L("side_plank", "Kylkilankku", "physio_back", "stability", { obliques: 1, core_deep: 1, glute_med: 2, lat: 3 }, { src: "anatomy" }),
  L("curl_up", "McGillin curl-up", "physio_back", "stability", { abs: 1, core_deep: 2 }, { src: "anatomy" }),
  L("pallof_press", "Pallof-puristus", "physio_back", "stability", { obliques: 1, core_deep: 1, abs: 2, shoulder_front: 3 }, { src: "anatomy" }),
  L("waiter_bow", "Tarjoilijankumarrus", "physio_back", "strength", { hamstring: 1, glute_max: 2, lumbar: 2, thoracic: 3 }, { src: "anatomy" }),
  L("prone_extension", "Päinmakuulla selän ojennus", "physio_back", "strength", { lumbar: 1, thoracic: 2, glute_max: 3 }, { src: "anatomy" }),
  L("pelvic_tilt", "Lantion kallistus selinmakuulla", "physio_back", "stability", { core_deep: 1, abs: 2, lumbar: 2 }, { src: "anatomy" }),
  L("cat_camel", "Kissa–kameli", "physio_back", "mobility", { lumbar: 1, thoracic: 2, core_deep: 3 }, { src: "anatomy", structures: ["j_lumbar", "j_thoracic"] }),
  L("thoracic_rotation", "Rintarangan kierto kylkimakuulla", "physio_back", "mobility", { thoracic: 1, lat: 2, obliques: 3 }, { src: "anatomy", structures: ["j_thoracic"] }),
  L("quadruped_rocking", "Nelinkontin keinunta", "physio_back", "mobility", { hip_rotators: 2, glute_med: 3 }, { src: "anatomy", structures: ["j_hip"] }),
  L("sciatic_slider", "Iskiashermon liu'utus", "physio_back", "mobility", { hamstring: 3 }, { src: "anatomy", structures: ["n_sciatic"], note: "Mobilisointi — ei tavoitteena kuormitus." }),
  L("femoral_slider", "Reisihermon liu'utus", "physio_back", "mobility", { quad: 3, hip_flexor: 3 }, { src: "anatomy", structures: ["n_femoral"], note: "Mobilisointi — ei tavoitteena kuormitus." }),
  L("median_slider", "Keskihermon liu'utus", "physio_back", "mobility", { forearm: 3 }, { src: "anatomy", structures: ["n_median"] }),

  /* ---------------- physio · knee ---------------- */
  L("quad_set", "Nelipäisen jännitys (quad set)", "physio_knee", "strength", { quad: 1 }, { src: "anatomy" }),
  L("straight_leg_raise", "Suoran jalan nosto", "physio_knee", "strength", { quad: 1, hip_flexor: 2, core_deep: 3 }, { src: "anatomy" }),
  L("terminal_knee_ext", "Polven loppuojennus kuminauhalla", "physio_knee", "strength", { quad: 1 }, { src: "anatomy", structures: ["j_knee"] }),
  L("wall_sit", "Seinäistunta", "physio_knee", "strength", { quad: 1, glute_max: 2, adductor: 3 }, { src: "anatomy" }),
  L("step_up", "Askelnousu korokkeelle", "physio_knee", "strength", { quad: 1, glute_max: 1, hamstring: 2, calf: 3 }, { src: "anatomy", structures: ["j_knee"] }),
  L("lateral_step_down", "Sivuttainen askellasku", "physio_knee", "strength", { quad: 1, glute_med: 1, glute_max: 2 }, { src: "anatomy" }),
  L("heel_slide", "Kantapään liu'utus", "physio_knee", "mobility", { hamstring: 2, quad: 2 }, { src: "anatomy", structures: ["j_knee"] }),
  L("calf_raise", "Varvasnousu", "physio_knee", "strength", { calf: 1, tibialis: 3 }, { src: "anatomy", structures: ["j_ankle"] }),
  L("ball_hamstring_curl", "Takareiden koukistus pallolla", "physio_knee", "strength", { hamstring: 1, glute_max: 2, core_deep: 3 }, { src: "anatomy" }),
  L("nordic_hamstring", "Nordic hamstring", "physio_knee", "strength", { hamstring: 1, glute_max: 2, lumbar: 3 }, { src: "anatomy" }),

  /* ---------------- physio · shoulder ---------------- */
  L("scapular_retraction", "Lapojen lähennys", "physio_shoulder", "strength", { trap_lower: 1, trap_upper: 2, shoulder_rear: 2 }, { src: "anatomy" }),
  L("wall_slide", "Seinäliuku", "physio_shoulder", "mobility", { trap_lower: 1, shoulder_front: 2, thoracic: 2 }, { src: "anatomy", structures: ["j_shoulder"] }),
  L("external_rotation_band", "Olkanivelen ulkokierto kuminauhalla", "physio_shoulder", "strength", { shoulder_rear: 1, trap_lower: 2 }, { src: "anatomy", structures: ["j_shoulder"] }),
  L("internal_rotation_band", "Olkanivelen sisäkierto kuminauhalla", "physio_shoulder", "strength", { shoulder_front: 1, chest: 2 }, { src: "anatomy", structures: ["j_shoulder"] }),
  L("prone_y", "Y-nosto päinmakuulla", "physio_shoulder", "strength", { trap_lower: 1, shoulder_rear: 2, thoracic: 3 }, { src: "anatomy" }),
  L("prone_t", "T-nosto päinmakuulla", "physio_shoulder", "strength", { shoulder_rear: 1, trap_lower: 1, thoracic: 3 }, { src: "anatomy" }),
  L("pendulum", "Heiluriliike", "physio_shoulder", "mobility", { shoulder_front: 3 }, { src: "anatomy", structures: ["j_shoulder"] }),
  L("serratus_punch", "Etusahan työntö", "physio_shoulder", "strength", { chest: 2, trap_lower: 2, shoulder_front: 2 }, { src: "estimate" }),
  L("band_pull_apart", "Kuminauhan avaus", "physio_shoulder", "strength", { shoulder_rear: 1, trap_lower: 2, trap_upper: 3 }, { src: "anatomy" }),
  L("sleeper_stretch", "Sleeper-venytys", "physio_shoulder", "stretch", { shoulder_rear: 1 }, { src: "anatomy", dose: ST, structures: ["j_shoulder"] }),

  /* ---------------- stretches ---------------- */
  L("st_hamstring", "Takareiden venytys selinmakuulla", "stretch", "stretch", { hamstring: 1, calf: 3 }, { src: "anatomy", dose: ST }),
  L("st_quad", "Etureiden venytys seisten", "stretch", "stretch", { quad: 1, hip_flexor: 2 }, { src: "anatomy", dose: ST }),
  L("st_hip_flexor", "Lonkan koukistajan venytys askelkyykyssä", "stretch", "stretch", { hip_flexor: 1, quad: 2 }, { src: "anatomy", dose: ST }),
  L("st_piriformis", "Piriformis-venytys (nelonen)", "stretch", "stretch", { hip_rotators: 1, glute_max: 2, glute_med: 2 }, { src: "anatomy", dose: ST }),
  L("st_adductor_butterfly", "Lähentäjien venytys (perhonen)", "stretch", "stretch", { adductor: 1 }, { src: "anatomy", dose: ST }),
  L("st_adductor_side", "Lähentäjien venytys sivuaskelkyykyssä", "stretch", "stretch", { adductor: 1, quad: 2 }, { src: "anatomy", dose: ST }),
  L("st_hip_internal", "Lonkan sisäkierron venytys", "stretch", "stretch", { hip_rotators: 1, glute_med: 2, adductor: 3 }, { src: "anatomy", dose: ST, structures: ["j_hip"] }),
  L("st_calf_wall", "Pohkeen venytys seinää vasten", "stretch", "stretch", { calf: 1, tibialis: 3 }, { src: "anatomy", dose: ST, structures: ["j_ankle"] }),
  L("st_soleus", "Leveän kantalihaksen venytys", "stretch", "stretch", { calf: 1 }, { src: "anatomy", dose: ST, structures: ["j_ankle"] }),
  L("st_glute_supine", "Pakaran venytys selinmakuulla", "stretch", "stretch", { glute_max: 1, hip_rotators: 2 }, { src: "anatomy", dose: ST }),
  L("st_itband", "IT-jänteen venytys", "stretch", "stretch", { tfl: 1, glute_med: 2 }, { src: "anatomy", dose: ST }),
  L("st_knees_chest", "Alaselän venytys polvet rintaan", "stretch", "stretch", { lumbar: 1, glute_max: 3 }, { src: "anatomy", dose: ST, structures: ["j_lumbar"] }),
  L("st_child_pose", "Lapsen asento", "stretch", "stretch", { lumbar: 1, lat: 2, thoracic: 2 }, { src: "anatomy", dose: ST }),
  L("st_cobra", "Kobra", "stretch", "stretch", { abs: 1, hip_flexor: 2 }, { src: "anatomy", dose: ST, structures: ["j_lumbar"] }),
  L("st_thoracic_roller", "Rintarangan ojennus rullalla", "stretch", "stretch", { thoracic: 1, chest: 2 }, { src: "anatomy", dose: ST, structures: ["j_thoracic"] }),
  L("st_pec_doorway", "Rintalihaksen venytys ovenkarmissa", "stretch", "stretch", { chest: 1, shoulder_front: 2 }, { src: "anatomy", dose: ST }),
  L("st_lat", "Leveän selkälihaksen venytys", "stretch", "stretch", { lat: 1, trap_lower: 2 }, { src: "anatomy", dose: ST }),
  L("st_neck_lateral", "Niskan sivutaivutus", "stretch", "stretch", { neck_back: 1, trap_upper: 2 }, { src: "anatomy", dose: ST }),
  L("st_levator", "Lapaa kohottavan lihaksen venytys", "stretch", "stretch", { neck_back: 1, trap_upper: 2 }, { src: "anatomy", dose: ST }),
  L("st_wrist_flexor", "Kyynärvarren koukistajien venytys", "stretch", "stretch", { forearm: 1 }, { src: "anatomy", dose: ST, structures: ["n_median"] }),
  L("st_triceps", "Ojentajan venytys pään takaa", "stretch", "stretch", { triceps: 1, lat: 2 }, { src: "anatomy", dose: ST }),

  /* ---------------- free weights · legs ---------------- */
  L("back_squat", "Takakyykky", "w_legs", "strength", { quad: 1, glute_max: 1, adductor: 2, hamstring: 2, lumbar: 2, core_deep: 2, calf: 3 }, { src: "anatomy", structures: ["j_knee", "j_hip"] }),
  L("front_squat", "Etukyykky", "w_legs", "strength", { quad: 1, glute_max: 2, core_deep: 2, thoracic: 2, lumbar: 2 }, { src: "anatomy", structures: ["j_knee"] }),
  L("goblet_squat", "Goblet-kyykky", "w_legs", "strength", { quad: 1, glute_max: 2, core_deep: 2, adductor: 3 }, { src: "anatomy" }),
  L("deadlift", "Maastaveto", "w_legs", "strength", { glute_max: 1, hamstring: 1, lumbar: 1, lat: 2, trap_upper: 2, quad: 2, forearm: 3 }, { src: "anatomy", structures: ["j_hip", "j_lumbar"] }),
  L("romanian_deadlift", "Romanialainen maastaveto", "w_legs", "strength", { hamstring: 1, glute_max: 1, lumbar: 2, lat: 3 }, { src: "anatomy", structures: ["j_hip"] }),
  L("sumo_deadlift", "Sumomaastaveto", "w_legs", "strength", { glute_max: 1, quad: 1, adductor: 2, lumbar: 2, trap_upper: 3 }, { src: "anatomy", structures: ["j_hip"] }),
  L("bulgarian_split_squat", "Bulgarialainen askelkyykky", "w_legs", "strength", { quad: 1, glute_max: 1, adductor: 2, hamstring: 2 }, { src: "anatomy" }),
  L("walking_lunge", "Kävelevä askelkyykky", "w_legs", "strength", { quad: 1, glute_max: 1, hamstring: 2, calf: 3 }, { src: "anatomy" }),
  L("lateral_lunge", "Sivuaskelkyykky", "w_legs", "strength", { adductor: 1, quad: 1, glute_med: 2, glute_max: 2 }, { src: "anatomy" }),
  L("hip_thrust_barbell", "Levytangon lantionnosto", "w_legs", "strength", { glute_max: 1, hamstring: 2, quad: 3 }, { src: "anatomy" }),
  L("barbell_good_morning", "Good morning levytangolla", "w_legs", "strength", { hamstring: 1, lumbar: 1, glute_max: 2 }, { src: "anatomy" }),
  L("leg_press", "Jalkaprässi", "w_legs", "strength", { quad: 1, glute_max: 2, hamstring: 3 }, { src: "anatomy" }),
  L("step_up_db", "Askelnousu käsipainoilla", "w_legs", "strength", { quad: 1, glute_max: 1, calf: 3 }, { src: "anatomy" }),
  L("calf_raise_db", "Varvasnousu käsipainoilla", "w_legs", "strength", { calf: 1 }, { src: "anatomy" }),

  /* ---------------- free weights · back ---------------- */
  L("barbell_row", "Kulmasoutu", "w_back", "strength", { lat: 1, trap_lower: 2, shoulder_rear: 2, biceps: 2, lumbar: 2, forearm: 3 }, { src: "anatomy" }),
  L("one_arm_db_row", "Yhden käden käsipainosoutu", "w_back", "strength", { lat: 1, trap_lower: 2, shoulder_rear: 2, biceps: 2 }, { src: "anatomy" }),
  L("pull_up", "Leuanveto (vastaote)", "w_back", "strength", { lat: 1, biceps: 2, trap_lower: 2, forearm: 2, abs: 3 }, { src: "anatomy", structures: ["j_shoulder"] }),
  L("chin_up", "Leuanveto (myötäote)", "w_back", "strength", { lat: 1, biceps: 1, trap_lower: 2 }, { src: "anatomy", structures: ["j_shoulder"] }),
  L("lat_pulldown", "Ylätalja", "w_back", "strength", { lat: 1, biceps: 2, trap_lower: 2 }, { src: "anatomy" }),
  L("seated_row", "Alatalja", "w_back", "strength", { lat: 1, trap_lower: 1, shoulder_rear: 2, biceps: 2 }, { src: "anatomy" }),
  L("t_bar_row", "T-tankosoutu", "w_back", "strength", { lat: 1, trap_lower: 2, shoulder_rear: 2, biceps: 2 }, { src: "anatomy" }),
  L("face_pull", "Face pull", "w_back", "strength", { shoulder_rear: 1, trap_lower: 2, trap_upper: 2 }, { src: "anatomy" }),
  L("shrug", "Olankohautus", "w_back", "strength", { trap_upper: 1, forearm: 2 }, { src: "anatomy" }),
  L("back_extension", "Selänojennus penkissä", "w_back", "strength", { lumbar: 1, glute_max: 2, hamstring: 2 }, { src: "anatomy" }),

  /* ---------------- free weights · chest ---------------- */
  L("bench_press", "Penkkipunnerrus", "w_chest", "strength", { chest: 1, triceps: 2, shoulder_front: 2 }, { src: "anatomy", structures: ["j_shoulder"] }),
  L("incline_bench", "Vinopenkkipunnerrus", "w_chest", "strength", { chest: 1, shoulder_front: 1, triceps: 2 }, { src: "anatomy", structures: ["j_shoulder"] }),
  L("db_bench", "Käsipainopenkkipunnerrus", "w_chest", "strength", { chest: 1, shoulder_front: 2, triceps: 2 }, { src: "anatomy" }),
  L("db_fly", "Vipunosto rinnalle", "w_chest", "strength", { chest: 1, shoulder_front: 2 }, { src: "anatomy", structures: ["j_shoulder"] }),
  L("dips_chest", "Dipit rintapainotteisesti", "w_chest", "strength", { chest: 1, triceps: 1, shoulder_front: 2 }, { src: "anatomy", structures: ["j_shoulder"] }),
  L("cable_crossover", "Ristikkäistalja", "w_chest", "strength", { chest: 1, shoulder_front: 3 }, { src: "anatomy" }),
  L("floor_press", "Lattiapunnerrus", "w_chest", "strength", { chest: 1, triceps: 1, shoulder_front: 2 }, { src: "anatomy" }),
  L("pushup", "Punnerrus", "w_chest", "strength", { chest: 1, triceps: 2, shoulder_front: 2, core_deep: 2, abs: 3 }, { src: "anatomy" }),

  /* ---------------- free weights · shoulders ---------------- */
  L("overhead_press", "Pystypunnerrus tangolla", "w_sh", "strength", { shoulder_front: 1, triceps: 2, trap_upper: 2, core_deep: 2 }, { src: "anatomy", structures: ["j_shoulder"] }),
  L("db_shoulder_press", "Pystypunnerrus käsipainoilla", "w_sh", "strength", { shoulder_front: 1, triceps: 2, trap_upper: 2 }, { src: "anatomy", structures: ["j_shoulder"] }),
  L("lateral_raise", "Sivunosto", "w_sh", "strength", { shoulder_front: 1, trap_upper: 2 }, { src: "anatomy" }),
  L("front_raise", "Etunosto", "w_sh", "strength", { shoulder_front: 1, chest: 3 }, { src: "anatomy" }),
  L("rear_delt_fly", "Takaolkapään vipunosto", "w_sh", "strength", { shoulder_rear: 1, trap_lower: 2 }, { src: "anatomy" }),
  L("upright_row", "Pystysoutu", "w_sh", "strength", { trap_upper: 1, shoulder_front: 2, biceps: 3 }, { src: "anatomy" }),
  L("arnold_press", "Arnold-punnerrus", "w_sh", "strength", { shoulder_front: 1, triceps: 2, trap_upper: 2 }, { src: "anatomy" }),
  L("landmine_press", "Landmine-punnerrus", "w_sh", "strength", { shoulder_front: 1, chest: 2, triceps: 2, core_deep: 3 }, { src: "estimate" }),

  /* ---------------- free weights · arms ---------------- */
  L("barbell_curl", "Hauiskääntö tangolla", "w_arms", "strength", { biceps: 1, forearm: 2 }, { src: "anatomy" }),
  L("db_curl", "Hauiskääntö käsipainoilla", "w_arms", "strength", { biceps: 1, forearm: 2 }, { src: "anatomy" }),
  L("hammer_curl", "Vasarakääntö", "w_arms", "strength", { biceps: 1, forearm: 1 }, { src: "anatomy" }),
  L("preacher_curl", "Scott-kääntö", "w_arms", "strength", { biceps: 1 }, { src: "anatomy" }),
  L("triceps_pushdown", "Ojentajapunnerrus taljassa", "w_arms", "strength", { triceps: 1 }, { src: "anatomy" }),
  L("skullcrusher", "Ranskalainen punnerrus", "w_arms", "strength", { triceps: 1 }, { src: "anatomy" }),
  L("overhead_triceps", "Ojentajan punnerrus pään takaa", "w_arms", "strength", { triceps: 1, shoulder_front: 3 }, { src: "anatomy" }),
  L("wrist_curl", "Ranteen koukistus", "w_arms", "strength", { forearm: 1 }, { src: "anatomy" }),

  /* ---------------- bodyweight ---------------- */
  L("bw_squat", "Kyykky ilman lisäpainoa", "bw", "strength", { quad: 1, glute_max: 2, adductor: 3 }, { src: "anatomy" }),
  L("bw_lunge", "Askelkyykky", "bw", "strength", { quad: 1, glute_max: 1, hamstring: 2 }, { src: "anatomy" }),
  L("mountain_climber", "Vuorikiipeilijä", "bw", "strength", { core_deep: 1, abs: 2, hip_flexor: 2, shoulder_front: 2 }, { src: "estimate" }),
  L("burpee", "Burpee", "bw", "strength", { quad: 1, chest: 2, shoulder_front: 2, core_deep: 2, glute_max: 2 }, { src: "estimate" }),
  L("hollow_hold", "Hollow hold", "bw", "stability", { abs: 1, core_deep: 1, hip_flexor: 2 }, { src: "anatomy" }),
  L("superman", "Superman", "bw", "strength", { lumbar: 1, glute_max: 2, thoracic: 2 }, { src: "anatomy" }),
  L("pike_pushup", "Pike-punnerrus", "bw", "strength", { shoulder_front: 1, triceps: 2, trap_upper: 2 }, { src: "anatomy" }),
  L("inverted_row", "Vastasoutu", "bw", "strength", { lat: 1, trap_lower: 2, biceps: 2 }, { src: "anatomy" }),
  L("jump_squat", "Hyppykyykky", "bw", "strength", { quad: 1, glute_max: 1, calf: 2 }, { src: "estimate" }),
  L("reverse_plank", "Käänteinen lankku", "bw", "stability", { glute_max: 1, hamstring: 2, lumbar: 2, shoulder_rear: 3 }, { src: "anatomy" }),

  /* ---------------- endurance (MET, minutes) ---------------- */
  L("walk_slow", "Kävely, rauhallinen (n. 3–4 km/h)", "cardio", "endurance", { quad: 2, hamstring: 2, calf: 2, glute_max: 2, tibialis: 3, core_deep: 3 }, { src: "compendium2024", unit: "min", met: 2.8, dose: CARDIO_DOSE }),
  L("walk_moderate", "Kävely, reipas (n. 4,5–5,5 km/h)", "cardio", "endurance", { quad: 2, hamstring: 2, calf: 1, glute_max: 2, tibialis: 3, core_deep: 3 }, { src: "compendium2024", unit: "min", met: 3.5, dose: CARDIO_DOSE }),
  L("walk_brisk", "Kävely, ripeä (n. 6,5 km/h)", "cardio", "endurance", { quad: 1, hamstring: 2, calf: 1, glute_max: 2, tibialis: 2, core_deep: 3 }, { src: "compendium2024", unit: "min", met: 5.0, dose: CARDIO_DOSE }),
  L("nordic_walk", "Sauvakävely", "cardio", "endurance", { quad: 2, calf: 2, glute_max: 2, lat: 2, triceps: 2, core_deep: 3 }, { src: "compendium2024", unit: "min", met: 5.5, dose: CARDIO_DOSE }),
  L("run_jog", "Hölkkä (n. 8 km/h)", "cardio", "endurance", { quad: 1, hamstring: 1, calf: 1, glute_max: 2, tibialis: 2, core_deep: 3 }, { src: "compendium2024", unit: "min", met: 8.3, dose: CARDIO_DOSE }),
  L("run_moderate", "Juoksu (n. 9,5–10 km/h)", "cardio", "endurance", { quad: 1, hamstring: 1, calf: 1, glute_max: 1, tibialis: 2, core_deep: 3 }, { src: "compendium2024", unit: "min", met: 9.8, dose: CARDIO_DOSE }),
  L("run_fast", "Juoksu, vauhdikas (n. 11–12 km/h)", "cardio", "endurance", { quad: 1, hamstring: 1, calf: 1, glute_max: 1, tibialis: 2, core_deep: 2 }, { src: "compendium2024", unit: "min", met: 11.0, dose: CARDIO_DOSE }),
  L("swim_free_mod", "Uinti, vapaauinti kohtalainen", "cardio", "endurance", { lat: 1, shoulder_front: 2, shoulder_rear: 2, triceps: 2, core_deep: 2, glute_max: 3, quad: 3 }, { src: "compendium2024", unit: "min", met: 5.8, dose: CARDIO_DOSE }),
  L("swim_free_vig", "Uinti, vapaauinti ripeä", "cardio", "endurance", { lat: 1, shoulder_front: 1, shoulder_rear: 2, triceps: 2, core_deep: 2, glute_max: 3, quad: 3 }, { src: "compendium2024", unit: "min", met: 9.8, dose: CARDIO_DOSE }),
  L("swim_breast", "Uinti, rintauinti", "cardio", "endurance", { chest: 2, lat: 2, adductor: 2, quad: 2, shoulder_front: 2, core_deep: 3 }, { src: "compendium2024", unit: "min", met: 5.3, dose: CARDIO_DOSE }),
  L("cycle_moderate", "Pyöräily (n. 19–22 km/h)", "cardio", "endurance", { quad: 1, glute_max: 2, hamstring: 2, calf: 2, lumbar: 3 }, { src: "compendium2024", unit: "min", met: 8.0, dose: CARDIO_DOSE }),
  L("row_erg", "Soutulaite, kohtalainen", "cardio", "endurance", { lat: 1, quad: 1, glute_max: 2, lumbar: 2, biceps: 2, core_deep: 2 }, { src: "compendium2024", unit: "min", met: 7.0, dose: CARDIO_DOSE }),
  L("elliptical", "Crosstrainer", "cardio", "endurance", { quad: 2, glute_max: 2, calf: 2, lat: 3, core_deep: 3 }, { src: "compendium2024", unit: "min", met: 5.0, dose: CARDIO_DOSE }),
  L("stair_climb", "Portaiden nousu", "cardio", "endurance", { quad: 1, glute_max: 1, calf: 2, hamstring: 2 }, { src: "compendium2024", unit: "min", met: 8.8, dose: CARDIO_DOSE }),
];
const LIB_BY_ID = {};
LIBRARY.forEach((e) => (LIB_BY_ID[e.id] = e));

/* linear hex colour mix for the heat scale */
function mixHex(a, b, t) {
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  const k = Math.max(0, Math.min(1, t));
  const c = (x, y) => Math.round(x + (y - x) * k);
  return `#${[c(r1, r2), c(g1, g2), c(b1, b2)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
/* which anatomical side a drawn half represents (front view is mirrored to the viewer) */
const sideOfHalf = (view, mirrored) => (view === "front" ? (mirrored ? "L" : "R") : mirrored ? "R" : "L");

/* ------------------------------------------------------------------ */
/*  Persistent storage helpers (fail-safe)                             */
/* ------------------------------------------------------------------ */
const hasStore = typeof window !== "undefined" && window.storage;
async function loadJSON(key, fallback) {
  try {
    if (!hasStore) return fallback;
    const r = await window.storage.get(key);
    if (!r) return fallback;
    return JSON.parse(r.value);
  } catch {
    return fallback;
  }
}
/* Storage writers.
   saveJSON writes immediately (discrete actions: toggles, imports, list edits)
   so nothing depends on a later flush. saveJSONDebounced coalesces rapid writes
   to the same key (typing in a text field) into one call, to respect the
   storage rate limit. A hidden/close flush is kept only as a backstop. */
const _pending = {};
const _timers = {};
function _writeNow(key, s) {
  try {
    if (hasStore) window.storage.set(key, s);
  } catch {
    /* silent */
  }
}
function _flushKey(key) {
  const v = _pending[key];
  if (v === undefined) return;
  delete _pending[key];
  if (_timers[key]) {
    clearTimeout(_timers[key]);
    delete _timers[key];
  }
  _writeNow(key, v);
}
function _flushAll() {
  Object.keys(_pending).forEach(_flushKey);
}
function _stringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return undefined;
  }
}
function saveJSON(key, obj) {
  const s = _stringify(obj);
  if (s === undefined) return;
  // supersede any queued debounced write to the same key
  if (_timers[key]) {
    clearTimeout(_timers[key]);
    delete _timers[key];
  }
  delete _pending[key];
  _writeNow(key, s);
}
function saveJSONDebounced(key, obj) {
  const s = _stringify(obj);
  if (s === undefined) return;
  _pending[key] = s; // snapshot value now; state may change before flush
  if (_timers[key]) clearTimeout(_timers[key]);
  _timers[key] = setTimeout(() => _flushKey(key), 700);
}
/* Awaited write — resolves only once storage confirms. Use for one-shot,
   critical operations (import/undo) and call sequentially so several writes
   don't race the rate limiter. */
async function saveJSONNow(key, obj) {
  const s = _stringify(obj);
  if (s === undefined) return false;
  if (_timers[key]) {
    clearTimeout(_timers[key]);
    delete _timers[key];
  }
  delete _pending[key];
  try {
    if (hasStore) {
      await window.storage.set(key, s);
      return true;
    }
  } catch {
    /* silent */
  }
  return false;
}
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", _flushAll);
  window.addEventListener("beforeunload", _flushAll);
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") _flushAll();
    });
  }
}

let idc = 0;
function uid() {
  return `${Date.now().toString(36)}${(idc++).toString(36)}`;
}
const emptyLog = () => ({ sets: {}, goal: {}, mins: {}, flared: [], severity: {}, quality: {}, note: "", steps: 0 });
/* goal snapshot per day+exercise is a full dose {sets,reps,hold}; legacy data may hold a bare int */
const goalSetsOfEntry = (g) => {
  if (g == null) return null;
  if (typeof g === "number") return g > 0 ? g : null;
  const s = parseInt(g.sets, 10);
  return s > 0 ? s : 1;
};
/* sets required for the day: snapshot if present, else current target */
const goalOf = (l, ex) => (l && l.goal && goalSetsOfEntry(l.goal[ex.id])) || targetSets(ex);
/* full dose in force on that day, for display */
const dayDoseOf = (l, ex) => {
  const g = l && l.goal && l.goal[ex.id];
  if (g == null) return ex.dose;
  if (typeof g === "number") return { sets: g, reps: null, hold: null, min: null };
  return { sets: toNum(g.sets) || 1, reps: toNum(g.reps), hold: toNum(g.hold), min: toNum(g.min) };
};
/* minutes required on a given day for a minute-unit exercise */
const goalMinOf = (l, ex) => {
  const g = l && l.goal && l.goal[ex.id];
  if (g && typeof g === "object" && toNum(g.min)) return toNum(g.min);
  return targetMin(ex);
};
const isEmptyLog = (l) => {
  const noMins = !l.mins || Object.values(l.mins).every((v) => !v);
  const noSets = (!l.sets || Object.values(l.sets).every((v) => !v)) && noMins;
  return noSets && !l.steps && (!l.flared || !l.flared.length) && (!l.note || !l.note.trim());
};

/* ------------------------------------------------------------------ */
/*  Export builders                                                    */
/* ------------------------------------------------------------------ */
function buildCSV(exercises, symptoms, logs, marks) {
  const SEP = ";";
  const esc = (v) => {
    const s = String(v == null ? "" : v);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const header = [
    "Päivä",
    ...exercises.map((e) => {
      const d = doseLabel(e.dose);
      const arch = e.archived ? " [arkistoitu]" : "";
      return d ? `${e.name} (${d})${arch}` : `${e.name}${arch}`;
    }),
    ...symptoms.map((s) => `Oire: ${s.name}${s.archived ? " [arkistoitu]" : ""}`),
    "Askeleet",
    "Muistiinpano",
    "Merkkipaalut",
  ];
  const marksByDate = {};
  (marks || []).forEach((m) => {
    (marksByDate[m.date] = marksByDate[m.date] || []).push(m.text);
  });
  const dateSet = new Set([...Object.keys(logs), ...Object.keys(marksByDate)]);
  const dates = [...dateSet].sort();
  const lines = [header];
  dates.forEach((k) => {
    const l = logs[k] || emptyLog();
    const ex = exercises.map((e) => {
      if (e.unit === "min") {
        const m = (l.mins && l.mins[e.id]) || 0;
        return m ? `${m} min` : "";
      }
      const done = (l.sets && l.sets[e.id]) || 0;
      return `${done}/${goalOf(l, e)}`;
    });
    const sy = symptoms.map((s) => {
      if (!l.flared || !l.flared.includes(s.id)) return "";
      const v = l.severity && l.severity[s.id];
      const sev = SEVERITY.find((x) => x.v === v);
      const q = l.quality && l.quality[s.id];
      const base = sev ? sev.label : "kyllä";
      return q ? `${base} / ${qualityLabel(q)}` : base;
    });
    lines.push([
      humanDate(k),
      ...ex,
      ...sy,
      l.steps || "",
      (l.note || "").replace(/\r?\n/g, " "),
      (marksByDate[k] || []).join(" | "),
    ]);
  });
  return "\uFEFF" + lines.map((r) => r.map(esc).join(SEP)).join("\r\n");
}
function buildJSON(exercises, symptoms, logs, marks) {
  return JSON.stringify(
    { app: "Liikepäiväkirja", exportedAt: new Date().toISOString(), version: 7, exercises, symptoms, logs, marks: marks || [] },
    null,
    2
  );
}
function download(filename, text, mime) {
  try {
    const blob = new Blob([text], { type: mime + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 120);
    return true;
  } catch {
    return false;
  }
}
async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}


/* ------------------------------------------------------------------ */
/*  Step import — tolerant parser, because Shortcuts output varies      */
/* ------------------------------------------------------------------ */
function toDateKey(v) {
  if (v == null) return null;
  const str = String(v).trim();
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/); /* ISO, with or without time */
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = str.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/); /* 20.7.2026 or 20/7/2026 */
  if (m) return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  const d = new Date(str);
  if (!isNaN(d.getTime())) return keyOf(d);
  return null;
}
const STEP_DATE_KEYS = ["date", "day", "start", "startdate", "datetime", "timestamp", "päivä", "pvm"];
const STEP_VALUE_KEYS = ["steps", "value", "qty", "quantity", "count", "sum", "total", "askeleet"];
function pickKey(obj, names) {
  const keys = Object.keys(obj);
  for (const n of names) {
    const hit = keys.find((k) => k.toLowerCase().replace(/[_\s]/g, "") === n);
    if (hit !== undefined) return hit;
  }
  return null;
}
function stepRowsFromArray(arr) {
  const rows = [];
  arr.forEach((item) => {
    if (Array.isArray(item) && item.length >= 2) {
      const d = toDateKey(item[0]);
      const v = parseInt(String(item[1]).replace(/[^0-9]/g, ""), 10);
      if (d && v > 0) rows.push({ date: d, steps: v });
      return;
    }
    if (item && typeof item === "object") {
      const dk = pickKey(item, STEP_DATE_KEYS);
      const vk = pickKey(item, STEP_VALUE_KEYS);
      if (dk == null || vk == null) return;
      const d = toDateKey(item[dk]);
      const v = Math.round(Number(item[vk]));
      if (d && v > 0) rows.push({ date: d, steps: v });
    }
  });
  return rows;
}
function parseSteps(text) {
  const t = (text || "").trim();
  if (!t) return { ok: false, error: "Ei sisältöä." };
  /* 1) JSON in several shapes */
  try {
    const data = JSON.parse(t);
    let rows = [];
    if (Array.isArray(data)) rows = stepRowsFromArray(data);
    else if (data && typeof data === "object") {
      /* Health Auto Export style: data.metrics[].data[] */
      const metrics = data.data && Array.isArray(data.data.metrics) ? data.data.metrics : Array.isArray(data.metrics) ? data.metrics : null;
      if (metrics) {
        metrics.forEach((mt) => {
          const name = String((mt && mt.name) || "").toLowerCase();
          if (name && !name.includes("step") && !name.includes("askel")) return;
          if (Array.isArray(mt.data)) rows = rows.concat(stepRowsFromArray(mt.data));
        });
      }
      if (!rows.length && Array.isArray(data.steps)) rows = stepRowsFromArray(data.steps);
      if (!rows.length) {
        /* plain map { "2026-07-20": 12345 } */
        Object.keys(data).forEach((k) => {
          const d = toDateKey(k);
          const v = Math.round(Number(data[k]));
          if (d && v > 0) rows.push({ date: d, steps: v });
        });
      }
    }
    if (rows.length) return dedupeSteps(rows);
    return { ok: false, error: "JSON tunnistettiin, mutta askeltietoja ei löytynyt. Tarvitaan päivämäärä ja lukumäärä." };
  } catch {
    /* not JSON — fall through to delimited text */
  }
  /* 2) CSV / TSV / semicolon, optional header */
  const rows = [];
  t.split(/\r?\n/).forEach((line) => {
    if (!line.trim()) return;
    const parts = line.split(/[;,\t]/).map((x) => x.trim().replace(/^"|"$/g, ""));
    if (parts.length < 2) return;
    const d = toDateKey(parts[0]);
    const v = parseInt(parts[1].replace(/[^0-9]/g, ""), 10);
    if (d && v > 0) rows.push({ date: d, steps: v });
  });
  if (rows.length) return dedupeSteps(rows);
  return { ok: false, error: "Muotoa ei tunnistettu. Odotettu JSON tai rivit muodossa 2026-07-20;8432." };
}
function dedupeSteps(rows) {
  /* same day appearing twice: keep the larger count (partial vs full day) */
  const map = {};
  rows.forEach(({ date, steps }) => {
    if (!DATE_RE.test(date)) return;
    map[date] = Math.max(map[date] || 0, Math.min(steps, 200000));
  });
  const out = Object.keys(map).sort().map((date) => ({ date, steps: map[date] }));
  if (!out.length) return { ok: false, error: "Kelvollisia päiviä ei löytynyt." };
  return { ok: true, rows: out, from: out[0].date, to: out[out.length - 1].date };
}

/* ------------------------------------------------------------------ */
/*  Version-tolerant normalization (shared by load + import)           */
/* ------------------------------------------------------------------ */
function normalizeExercises(arr) {
  if (!Array.isArray(arr)) return null;
  return arr.map((e) => ({
    id: e && e.id != null ? String(e.id) : uid(),
    name: e && typeof e.name === "string" && e.name.trim() ? e.name : "Liike",
    desc: e && typeof e.desc === "string" ? e.desc.slice(0, 1000) : "",
    type: e && EX_TYPE_IDS.includes(e.type) ? e.type : "strength",
    muscles: normalizeMuscles(e && e.muscles),
    structures: normalizeExStructures(e && e.structures),
    unit: e && e.unit === "min" ? "min" : "sets",
    met: e && Number(e.met) > 0 ? Number(e.met) : null,
    source: e && e.source && SOURCES[e.source.src] ? { src: e.source.src, note: typeof e.source.note === "string" ? e.source.note.slice(0, 200) : "", edited: !!e.source.edited } : null,
    archived: !!(e && e.archived),
    dose:
      e && e.dose
        ? { sets: toNum(e.dose.sets), reps: toNum(e.dose.reps), hold: toNum(e.dose.hold), min: toNum(e.dose.min) }
        : { ...EMPTY_DOSE },
  }));
}
/* muscles: { regionId: 1|2|3 } — unknown ids and out-of-range values dropped */
function normalizeMuscles(m) {
  const out = {};
  if (!m || typeof m !== "object") return out;
  Object.keys(m).forEach((id) => {
    if (!REGION_BY_ID[id]) return;
    const v = parseInt(m[id], 10);
    if (v >= 1 && v <= 3) out[id] = v;
  });
  return out;
}
/* exercise structures: array of ids — exposure is unweighted on purpose */
function normalizeExStructures(a) {
  const seen = new Set();
  const out = [];
  const push = (id) => {
    if (STRUCT_BY_ID[id] && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };
  if (Array.isArray(a)) a.forEach((id) => push(String(id)));
  else if (a && typeof a === "object") Object.keys(a).forEach((id) => a[id] && push(id));
  return out;
}
/* symptom regions: { regionId: 'L'|'R'|'B' } */
function normalizeSymptomRegions(r) {
  const out = {};
  if (!r || typeof r !== "object") return out;
  Object.keys(r).forEach((id) => {
    if (!REGION_BY_ID[id]) return;
    const v = r[id];
    if (v === "L" || v === "R" || v === "B") out[id] = v;
    else if (v === true) out[id] = "B";
  });
  return out;
}
/* symptom structures: { structureId: 'L'|'R'|'B' } */
function normalizeSymptomStructures(r) {
  const out = {};
  if (!r || typeof r !== "object") return out;
  Object.keys(r).forEach((id) => {
    if (!STRUCT_BY_ID[id]) return;
    const v = r[id];
    if (v === "L" || v === "R" || v === "B") out[id] = v;
    else if (v === true) out[id] = "B";
  });
  return out;
}
function normalizeSymptoms(arr) {
  if (!Array.isArray(arr)) return null;
  return arr.map((s) => ({
    id: s && s.id != null ? String(s.id) : uid(),
    name: s && typeof s.name === "string" && s.name.trim() ? s.name : "Oire",
    regions: normalizeSymptomRegions(s && s.regions),
    structures: normalizeSymptomStructures(s && s.structures),
    archived: !!(s && s.archived),
  }));
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function normalizeLogs(raw, exById) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  Object.keys(raw).forEach((k) => {
    if (!DATE_RE.test(k)) return;
    const l = raw[k];
    if (!l || typeof l !== "object") return;
    const sets = {};
    const goal = {};
    if (l.sets && typeof l.sets === "object") {
      Object.keys(l.sets).forEach((id) => {
        const n = parseInt(l.sets[id], 10);
        if (n > 0) sets[id] = n;
      });
      if (l.goal && typeof l.goal === "object") {
        Object.keys(l.goal).forEach((id) => {
          if (!sets[id]) return;
          const g = l.goal[id];
          if (typeof g === "object" && g !== null) {
            const s = toNum(g.sets) || 1;
            goal[id] = { sets: s, reps: toNum(g.reps), hold: toNum(g.hold), min: toNum(g.min) };
          } else {
            const s = parseInt(g, 10);
            if (s > 0) goal[id] = { sets: s, reps: null, hold: null, min: null };
          }
        });
      }
      /* backfill: days logged before snapshots existed get frozen at the
         dose in force right now, so later dose changes can't rewrite them */
      Object.keys(sets).forEach((id) => {
        if (!goal[id]) {
          goal[id] = exById[id]
            ? { sets: targetSets(exById[id]), reps: toNum(exById[id].dose && exById[id].dose.reps), hold: toNum(exById[id].dose && exById[id].dose.hold), min: toNum(exById[id].dose && exById[id].dose.min) }
            : { sets: sets[id], reps: null, hold: null, min: null };
        }
      });
    } else if (Array.isArray(l.done)) {
      l.done.forEach((id) => {
        const ex = exById[id];
        const t = ex ? targetSets(ex) : 1;
        sets[id] = t;
        goal[id] = ex
          ? { sets: t, reps: toNum(ex.dose && ex.dose.reps), hold: toNum(ex.dose && ex.dose.hold), min: toNum(ex.dose && ex.dose.min) }
          : { sets: t, reps: null, hold: null, min: null };
      });
    }
    const flared = Array.isArray(l.flared) ? l.flared.map(String) : [];
    const severity = {};
    if (l.severity && typeof l.severity === "object") {
      Object.keys(l.severity).forEach((id) => {
        const v = parseInt(l.severity[id], 10);
        if (v >= 1 && v <= 3) severity[id] = v;
      });
    }
    const note = typeof l.note === "string" ? l.note : "";
    const mins = {};
    if (l.mins && typeof l.mins === "object") {
      Object.keys(l.mins).forEach((id) => {
        const v = parseInt(l.mins[id], 10);
        if (v > 0) mins[id] = Math.min(v, 1440);
      });
    }
    const quality = {};
    if (l.quality && typeof l.quality === "object") {
      Object.keys(l.quality).forEach((id) => {
        if (flared.includes(id) && QUALITY_IDS.includes(l.quality[id])) quality[id] = l.quality[id];
      });
    }
    const steps = Math.max(0, Math.min(parseInt(l.steps, 10) || 0, 200000));
    const norm = { sets, goal, mins, flared, severity, quality, note, steps };
    if (!isEmptyLog(norm)) out[k] = norm;
  });
  return out;
}
function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "JSON ei ole kelvollinen. Varmista, että kopioit koko sisällön." };
  }
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Tiedosto ei sisällä odotettua rakennetta." };
  }
  const ex = normalizeExercises(data.exercises);
  const sy = normalizeSymptoms(data.symptoms);
  if (!ex || !ex.length) return { ok: false, error: "Tiedostosta ei löytynyt liikkeitä." };
  if (!sy) return { ok: false, error: "Tiedostosta ei löytynyt oireita." };
  const exById = {};
  ex.forEach((e) => (exById[e.id] = e));
  const logs = normalizeLogs(data.logs || {}, exById);
  const marks = normalizeMarks(data.marks);
  return {
    ok: true,
    ex,
    sy,
    logs,
    marks,
    counts: { ex: ex.length, sy: sy.length, days: Object.keys(logs).length, marks: marks.length },
  };
}
function normalizeMarks(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  arr.forEach((m) => {
    if (!m || typeof m !== "object") return;
    const date = typeof m.date === "string" && DATE_RE.test(m.date) ? m.date : null;
    const text = typeof m.text === "string" ? m.text.trim() : "";
    if (!date || !text) return;
    out.push({ id: m.id != null ? String(m.id) : uid(), date, text: text.slice(0, 300), auto: !!m.auto });
  });
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

/* ------------------------------------------------------------------ */
/*  Week helpers (Monday-start) for long-range aggregation             */
/* ------------------------------------------------------------------ */
function startOfWeek(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // Mon=0
  x.setDate(x.getDate() - day);
  return x;
}
function parseKey(k) {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}
/* symptom load of one day: sum of severities (unset severity counts as 2) */
function dayLoad(l) {
  if (!l || !l.flared || !l.flared.length) return 0;
  return l.flared.reduce((sum, id) => sum + ((l.severity && l.severity[id]) || 2), 0);
}

/* ================================================================== */
export default function App() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("today");
  const [exercises, setExercises] = useState([]);
  const [symptoms, setSymptoms] = useState([]);
  const [logs, setLogs] = useState({});
  const [marks, setMarks] = useState([]);
  const [selected, setSelected] = useState(startOfToday());
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [canUndoImport, setCanUndoImport] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);

  const today = startOfToday();
  const selKey = keyOf(selected);
  const isToday = selKey === keyOf(today);
  const isYesterday = selKey === keyOf(addDays(today, -1));
  const log = logs[selKey] || emptyLog();

  /* mirror latest state so import can snapshot it without stale closures */
  const stateRef = useRef({});
  stateRef.current = { exercises, symptoms, logs, marks };
  const undoRef = useRef(null);

  /* ---- initial load + migration ---- */
  useEffect(() => {
    (async () => {
      const cfg = await loadJSON("physio-config", null);
      let ex = cfg ? normalizeExercises(cfg.exercises) : null;
      let sy = cfg ? normalizeSymptoms(cfg.symptoms) : null;
      if (!ex || !ex.length || !sy) {
        ex = seedExercises();
        sy = seedSymptoms();
        saveJSON("physio-config", { exercises: ex, symptoms: sy });
      }
      setExercises(ex);
      setSymptoms(sy);

      const exById = {};
      ex.forEach((e) => (exById[e.id] = e));
      const raw = await loadJSON("physio-logs", {});
      const normLogs = normalizeLogs(raw, exById);
      setLogs(normLogs);
      /* persist backfilled goal snapshots only if normalization changed anything */
      try {
        if (JSON.stringify(normLogs) !== JSON.stringify(raw)) saveJSON("physio-logs", normLogs);
      } catch {
        /* ignore */
      }
      const rawMarks = await loadJSON("physio-marks", []);
      setMarks(normalizeMarks(rawMarks));
      const undo = await loadJSON("physio-undo", null);
      if (undo && Array.isArray(undo.exercises)) {
        undoRef.current = undo;
        setCanUndoImport(true);
      }
      setLoading(false);
    })();
  }, []);

  const persistConfig = useCallback((ex, sy) => {
    saveJSON("physio-config", { exercises: ex, symptoms: sy });
  }, []);

  const applyImport = useCallback(async (res) => {
    /* snapshot current data so an accidental/wrong import can be undone */
    const prev = {
      exercises: stateRef.current.exercises || [],
      symptoms: stateRef.current.symptoms || [],
      logs: stateRef.current.logs || {},
      marks: stateRef.current.marks || [],
    };
    undoRef.current = prev;
    setCanUndoImport(true);

    setExercises(res.ex);
    setSymptoms(res.sy);
    setLogs(res.logs);
    setMarks(res.marks || []);
    setSelected(startOfToday());

    /* write sequentially so the four keys don't race the rate limiter,
       and await so persistence is confirmed before we report success */
    await saveJSONNow("physio-undo", prev);
    await saveJSONNow("physio-config", { exercises: res.ex, symptoms: res.sy });
    await saveJSONNow("physio-logs", res.logs);
    await saveJSONNow("physio-marks", res.marks || []);
  }, []);

  const undoImport = useCallback(async () => {
    const prev = undoRef.current;
    if (!prev) return;
    setExercises(prev.exercises || []);
    setSymptoms(prev.symptoms || []);
    setLogs(prev.logs || {});
    setMarks(prev.marks || []);
    setSelected(startOfToday());
    await saveJSONNow("physio-config", { exercises: prev.exercises || [], symptoms: prev.symptoms || [] });
    await saveJSONNow("physio-logs", prev.logs || {});
    await saveJSONNow("physio-marks", prev.marks || []);
    undoRef.current = null;
    setCanUndoImport(false);
    try {
      if (hasStore) await window.storage.delete("physio-undo");
    } catch {
      /* ignore */
    }
  }, []);

  /* ---- marks (milestones/annotations) ---- */
  const mutateMarks = useCallback((fn) => {
    setMarks((prev) => {
      const next = fn([...prev]);
      next.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      saveJSON("physio-marks", next);
      return next;
    });
  }, []);
  const addMark = useCallback(
    (date, text, auto) => {
      const t = (text || "").trim().slice(0, 300);
      if (!t) return;
      mutateMarks((arr) => [...arr, { id: uid(), date, text: t, auto: !!auto }]);
    },
    [mutateMarks]
  );
  const removeMark = useCallback((id) => mutateMarks((arr) => arr.filter((m) => m.id !== id)), [mutateMarks]);
  /* auto-log a dose change as a mark on today's date */
  const logDoseChange = useCallback(
    (name, oldLabel, newLabel) => {
      const o = oldLabel || "ei annosta";
      const n = newLabel || "ei annosta";
      if (o === n) return;
      addMark(keyOf(startOfToday()), `Annos: ${name}: ${o} → ${n}`, true);
    },
    [addMark]
  );

  /* ---- log mutation ---- */
  const updateLog = useCallback((key, mutate) => {
    setLogs((prev) => {
      const src = prev[key] || emptyLog();
      const cur = {
        sets: { ...(src.sets || {}) },
        goal: { ...(src.goal || {}) },
        mins: { ...(src.mins || {}) },
        flared: [...(src.flared || [])],
        severity: { ...(src.severity || {}) },
        quality: { ...(src.quality || {}) },
        note: src.note || "",
        steps: src.steps || 0,
      };
      const next = mutate(cur) || cur;
      const map = { ...prev };
      if (isEmptyLog(next)) delete map[key];
      else map[key] = next;
      saveJSON("physio-logs", map);
      return map;
    });
  }, []);

  const setExerciseSets = (id, n) =>
    updateLog(selKey, (l) => {
      const map = { ...l.sets };
      const g = { ...l.goal };
      if (n <= 0) {
        delete map[id];
        delete g[id];
      } else {
        map[id] = n;
        /* freeze the day's full dose to what's in force when first logged */
        if (!g[id]) {
          const ex = exercises.find((e) => e.id === id);
          g[id] = ex
            ? { sets: targetSets(ex), reps: toNum(ex.dose && ex.dose.reps), hold: toNum(ex.dose && ex.dose.hold) }
            : { sets: 1, reps: null, hold: null };
        }
      }
      l.sets = map;
      l.goal = g;
      return l;
    });

  const setExerciseMins = (id, m) =>
    updateLog(selKey, (l) => {
      const map = { ...l.mins };
      const g = { ...l.goal };
      if (m <= 0) {
        delete map[id];
        delete g[id];
      } else {
        map[id] = Math.min(m, 1440);
        if (!g[id]) {
          const ex = exercises.find((e) => e.id === id);
          g[id] = ex
            ? { sets: targetSets(ex), reps: toNum(ex.dose && ex.dose.reps), hold: toNum(ex.dose && ex.dose.hold), min: toNum(ex.dose && ex.dose.min) }
            : { sets: 1, reps: null, hold: null, min: null };
        }
      }
      l.mins = map;
      l.goal = g;
      return l;
    });

  const toggleSymptom = (id) =>
    updateLog(selKey, (l) => {
      if (l.flared.includes(id)) {
        l.flared = l.flared.filter((x) => x !== id);
        delete l.severity[id];
        delete l.quality[id];
      } else {
        l.flared = [...l.flared, id];
      }
      return l;
    });
  const setSteps = (n) =>
    updateLog(selKey, (l) => {
      l.steps = Math.max(0, Math.min(parseInt(n, 10) || 0, 200000));
      return l;
    });
  const setQuality = (id, q) =>
    updateLog(selKey, (l) => {
      if (l.quality[id] === q) delete l.quality[id];
      else l.quality[id] = q;
      return l;
    });
  const setSeverity = (id, v) =>
    updateLog(selKey, (l) => {
      if (l.severity[id] === v) delete l.severity[id];
      else l.severity[id] = v;
      return l;
    });

  /* ---- note ---- */
  const noteTimer = useRef();
  const commitNote = (v) => updateLog(selKey, (l) => ((l.note = v), l));
  const onNoteChange = (e) => {
    const v = e.target.value;
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => commitNote(v), 500);
  };

  /* ---- edit ops ---- */
  const setter = (which) => (which === "ex" ? setExercises : setSymptoms);
  const val = (which) => (which === "ex" ? exercises : symptoms);
  const mutateList = (which, fn, debounced) => {
    const next = fn([...val(which)]);
    setter(which)(next);
    const cfg = which === "ex" ? { exercises: next, symptoms } : { exercises, symptoms: next };
    (debounced ? saveJSONDebounced : saveJSON)("physio-config", cfg);
  };
  const renameItem = (which, id, name) =>
    mutateList(which, (arr) => arr.map((i) => (i.id === id ? { ...i, name } : i)), true);
  const setDose = (id, field, raw) =>
    mutateList("ex", (arr) => arr.map((i) => (i.id === id ? { ...i, dose: { ...i.dose, [field]: toNum(raw) } } : i)), true);
  const setDesc = (id, desc) =>
    mutateList("ex", (arr) => arr.map((i) => (i.id === id ? { ...i, desc: desc.slice(0, 1000) } : i)), true);
  const setExType = (id, type) =>
    mutateList("ex", (arr) => arr.map((i) => (i.id === id ? { ...i, type } : i)));
  /* tap cycles: none → primary → secondary → light → none */
  const cycleExMuscle = (id, regionId) =>
    mutateList("ex", (arr) =>
      arr.map((i) => {
        if (i.id !== id) return i;
        const m = { ...(i.muscles || {}) };
        const cur = m[regionId];
        if (!cur) m[regionId] = 1;
        else if (cur === 3) delete m[regionId];
        else m[regionId] = cur + 1;
        return { ...i, muscles: m };
      })
    );
  /* add presets from the library as fully editable copies */
  const addFromLibrary = useCallback(
    (ids) => {
      if (!ids || !ids.length) return;
      setExercises((prev) => {
        const taken = new Set(prev.map((e) => e.name.toLowerCase()));
        const added = [];
        ids.forEach((lid) => {
          const t = LIB_BY_ID[lid];
          if (!t) return;
          let name = t.name;
          let n = 2;
          while (taken.has(name.toLowerCase())) name = `${t.name} (${n++})`;
          taken.add(name.toLowerCase());
          added.push({
            id: uid(),
            name,
            desc: t.note || "",
            type: t.type,
            muscles: { ...t.muscles },
            structures: [...(t.structures || [])],
            unit: t.unit === "min" ? "min" : "sets",
            met: t.met || null,
            source: { src: t.src, note: t.note || "", edited: false },
            archived: false,
            dose: t.dose ? { ...t.dose } : { ...EMPTY_DOSE },
          });
        });
        const next = [...prev, ...added];
        saveJSON("physio-config", { exercises: next, symptoms: stateRef.current.symptoms || [] });
        return next;
      });
    },
    []
  );

  /* merge imported step counts; never overwrites exercises, symptoms or notes,
     so the import can be re-run as often as you like */
  const applySteps = useCallback(async (rows) => {
    let touched = 0;
    setLogs((prev) => {
      const map = { ...prev };
      rows.forEach(({ date, steps }) => {
        const src = map[date] || emptyLog();
        if ((src.steps || 0) === steps) return;
        touched++;
        map[date] = { ...src, steps };
      });
      return map;
    });
    /* read back from the ref on the next tick so we persist the merged result */
    await new Promise((r) => setTimeout(r, 0));
    await saveJSONNow("physio-logs", stateRef.current.logs || {});
    return touched;
  }, []);

  /* structures are mobilised, not loaded: on/off only, no intensity weighting */
  const toggleExStructure = (id, structId) =>
    mutateList("ex", (arr) =>
      arr.map((i) => {
        if (i.id !== id) return i;
        const cur = i.structures || [];
        return { ...i, structures: cur.includes(structId) ? cur.filter((x) => x !== structId) : [...cur, structId] };
      })
    );
  const toggleSymStructure = (id, structId, side) =>
    mutateList("sy", (arr) =>
      arr.map((i) => {
        if (i.id !== id) return i;
        const r = { ...(i.structures || {}) };
        const cur = r[structId];
        const other = side === "L" ? "R" : "L";
        if (!side) {
          if (cur) delete r[structId];
          else r[structId] = "B";
        } else if (!cur) r[structId] = side;
        else if (cur === side) delete r[structId];
        else if (cur === other) r[structId] = "B";
        else r[structId] = other;
        return { ...i, structures: r };
      })
    );
  /* tapping one half toggles that anatomical side for the symptom */
  const toggleSymRegion = (id, regionId, side) =>
    mutateList("sy", (arr) =>
      arr.map((i) => {
        if (i.id !== id) return i;
        const r = { ...(i.regions || {}) };
        const cur = r[regionId];
        const other = side === "L" ? "R" : "L";
        if (!side) {
          if (cur) delete r[regionId];
          else r[regionId] = "B";
        } else if (!cur) r[regionId] = side;
        else if (cur === side) delete r[regionId];
        else if (cur === other) r[regionId] = "B";
        else r[regionId] = other; // was both → drop this side
        return { ...i, regions: r };
      })
    );
  const addItem = (which, name) => {
    const n = name.trim();
    if (!n) return;
    const item = which === "ex" ? { id: uid(), name: n, desc: "", dose: { ...EMPTY_DOSE } } : { id: uid(), name: n };
    mutateList(which, (arr) => [...arr, item]);
  };
  const removeItem = (which, id) => mutateList(which, (arr) => arr.filter((i) => i.id !== id));
  const moveItem = (which, id, dir) =>
    mutateList(which, (arr) => {
      const i = arr.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return arr;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  const resetList = (which) => {
    const next = which === "ex" ? seedExercises() : seedSymptoms();
    setter(which)(next);
    which === "ex" ? persistConfig(next, symptoms) : persistConfig(exercises, next);
  };

  /* ---- derived stats ---- */
  const activeExercises = useMemo(() => exercises.filter((e) => !e.archived), [exercises]);
  const activeSymptoms = useMemo(() => symptoms.filter((s) => !s.archived), [symptoms]);
  const completeCountOf = useCallback(
    (l) =>
      l
        ? exercises.filter((e) =>
            isMin(e) ? ((l.mins && l.mins[e.id]) || 0) >= goalMinOf(l, e) : ((l.sets && l.sets[e.id]) || 0) >= goalOf(l, e)
          ).length
        : 0,
    [exercises]
  );
  const archiveItem = (which, id, archived) =>
    mutateList(which, (arr) => arr.map((i) => (i.id === id ? { ...i, archived } : i)));
  const days14 = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, -i)), [today]);
  const streak = useMemo(() => {
    let start = completeCountOf(logs[keyOf(today)]) === 0 ? 1 : 0;
    let n = 0;
    for (let i = start; i < 400; i++) {
      if (completeCountOf(logs[keyOf(addDays(today, -i))]) > 0) n++;
      else break;
    }
    return n;
  }, [logs, today, completeCountOf]);
  const trained14 = useMemo(
    () => days14.filter((d) => completeCountOf(logs[keyOf(d)]) > 0).length,
    [days14, logs, completeCountOf]
  );
  const symptomFree14 = useMemo(
    () =>
      days14.filter((d) => {
        const l = logs[keyOf(d)];
        return !l || l.flared.length === 0;
      }).length,
    [days14, logs]
  );

  if (loading) {
    return (
      <div className="ptf" style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.inkFaint, fontFamily: FONT }}>
        <Style />
        Ladataan…
      </div>
    );
  }

  return (
    <div className="ptf" style={{ background: C.bg, minHeight: "100vh", fontFamily: FONT, color: C.ink }}>
      <Style />
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "22px 16px 48px" }}>
        <header style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: C.pineDeep, fontWeight: 600 }}>
            Fysioterapian seuranta
          </div>
          <h1 style={{ margin: "3px 0 0", fontSize: 27, fontWeight: 600, letterSpacing: "-0.02em" }}>Liikepäiväkirja</h1>
        </header>

        {/* Tabs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 4, marginBottom: 20 }}>
          {[["today", "Tänään"], ["history", "Historia"], ["edit", "Muokkaa"]].map(([id, label]) => (
            <button key={id} className="tap" onClick={() => setTab(id)}
              style={{ padding: "9px 0", borderRadius: 10, fontSize: 14, fontWeight: 600, color: tab === id ? "#fff" : C.inkSoft, background: tab === id ? C.pine : "transparent", transition: "background .18s, color .18s" }}>
              {label}
            </button>
          ))}
        </div>

        {tab === "today" && (
          <TodayView
            key={selKey}
            selected={selected}
            setSelected={setSelected}
            isToday={isToday}
            isYesterday={isYesterday}
            exercises={activeExercises}
            symptoms={activeSymptoms}
            log={log}
            setExerciseSets={setExerciseSets}
            setExerciseMins={setExerciseMins}
            toggleSymptom={toggleSymptom}
            setSeverity={setSeverity}
            setQuality={setQuality}
            setSteps={setSteps}
            onNoteChange={onNoteChange}
            commitNote={commitNote}
            marks={marks.filter((m) => m.date === selKey)}
            addMark={(text) => addMark(selKey, text, false)}
            removeMark={removeMark}
          />
        )}

        {tab === "history" && (
          <HistoryView
            days14={days14}
            logs={logs}
            symptoms={activeSymptoms}
            allSymptoms={symptoms}
            exercises={exercises}
            completeCountOf={completeCountOf}
            totalEx={activeExercises.length}
            streak={streak}
            trained14={trained14}
            symptomFree14={symptomFree14}
            today={today}
            marks={marks}
            onExport={() => setExportOpen(true)}
            onImport={() => setImportOpen(true)}
            onImportSteps={() => setStepsOpen(true)}
          />
        )}

        {tab === "edit" && (
          <EditView
            exercises={exercises}
            symptoms={symptoms}
            renameItem={renameItem}
            setDose={setDose}
            setDesc={setDesc}
            setExType={setExType}
            cycleExMuscle={cycleExMuscle}
            toggleSymRegion={toggleSymRegion}
            toggleExStructure={toggleExStructure}
            toggleSymStructure={toggleSymStructure}
            addItem={addItem}
            removeItem={removeItem}
            moveItem={moveItem}
            resetList={resetList}
            archiveItem={archiveItem}
            addFromLibrary={addFromLibrary}
            logDoseChange={logDoseChange}
          />
        )}

        {hasStore && (
          <p style={{ marginTop: 26, textAlign: "center", fontSize: 12, color: C.inkFaint }}>
            Merkinnät tallentuvat automaattisesti. Vie tiedot Historia-välilehdeltä varmuuskopioksi.
          </p>
        )}
      </div>

      {exportOpen && (
        <ExportModal exercises={exercises} symptoms={symptoms} logs={logs} marks={marks} onClose={() => setExportOpen(false)} />
      )}
      {importOpen && <ImportModal onApply={applyImport} onUndo={undoImport} canUndo={canUndoImport} onClose={() => setImportOpen(false)} />}
      {stepsOpen && <StepsModal onApply={applySteps} onClose={() => setStepsOpen(false)} />}
    </div>
  );
}

/* ================================================================== */
/*  TODAY                                                              */
/* ================================================================== */
function TodayView({
  selected,
  setSelected,
  isToday,
  isYesterday,
  exercises,
  symptoms,
  log,
  setExerciseSets,
  setExerciseMins,
  toggleSymptom,
  setSeverity,
  setQuality,
  setSteps,
  onNoteChange,
  commitNote,
  marks,
  addMark,
  removeMark,
}) {
  const doneCount = exercises.filter((e) =>
    isMin(e) ? (log.mins[e.id] || 0) >= goalMinOf(log, e) : (log.sets[e.id] || 0) >= goalOf(log, e)
  ).length;
  const total = exercises.length;

  return (
    <div className="rise">
      {/* Date nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <IconBtn label="Edellinen päivä" onClick={() => setSelected(addDays(selected, -1))}>
          <ChevronLeft size={20} />
        </IconBtn>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            {WD_LONG[selected.getDay()]} {selected.getDate()}.{selected.getMonth() + 1}.
          </div>
          {(isToday || isYesterday) && (
            <div style={{ fontSize: 12, color: C.pineDeep, fontWeight: 600 }}>{isToday ? "tänään" : "eilen"}</div>
          )}
        </div>
        <IconBtn label="Seuraava päivä" disabled={isToday} onClick={() => !isToday && setSelected(addDays(selected, 1))}>
          <ChevronRight size={20} />
        </IconBtn>
      </div>

      {/* Hero ring */}
      <Card style={{ textAlign: "center", paddingTop: 26, paddingBottom: 22 }}>
        <RangeArc done={doneCount} total={total} />
        <div style={{ marginTop: 10, fontSize: 13, color: C.inkSoft }}>
          {total === 0
            ? "Lisää liikkeitä Muokkaa-välilehdeltä"
            : doneCount === total
            ? "Kaikki liikkeet tehty 🌿"
            : `${total - doneCount} liikettä jäljellä`}
        </div>
      </Card>

      {/* Exercises */}
      <SectionLabel>Liikkeet</SectionLabel>
      <Card style={{ padding: 6 }}>
        {exercises.length === 0 && <Empty>Ei liikkeitä vielä.</Empty>}
        {exercises.map((e, i) => (
          <ExerciseRow
            key={e.id}
            ex={e}
            completed={log.sets[e.id] || 0}
            dayGoal={goalOf(log, e)}
            dayDose={dayDoseOf(log, e)}
            minutes={log.mins[e.id] || 0}
            goalMin={goalMinOf(log, e)}
            onSet={(n) => setExerciseSets(e.id, n)}
            onMin={(m) => setExerciseMins(e.id, m)}
            isFirst={i === 0}
          />
        ))}
      </Card>

      {/* Symptoms */}
      <SectionLabel>Oireet</SectionLabel>
      <div style={{ fontSize: 12.5, color: C.inkSoft, margin: "-4px 2px 8px" }}>
        Merkitse, jos jokin vaiva on uusinut tänään.
      </div>
      <Card style={{ padding: 6 }}>
        {symptoms.length === 0 && <Empty>Ei oireita seurannassa.</Empty>}
        {symptoms.map((s, i) => {
          const on = log.flared.includes(s.id);
          return (
            <div key={s.id} style={{ borderTop: i === 0 ? "none" : `1px solid ${C.line}`, background: on ? C.amberTint : "transparent", borderRadius: 11, transition: "background .16s" }}>
              <button className="tap" onClick={() => toggleSymptom(s.id)}
                style={{ display: "flex", alignItems: "center", gap: 13, width: "100%", textAlign: "left", padding: "13px 12px" }}>
                <span style={{ flex: "0 0 auto", width: 26, height: 26, borderRadius: "50%", border: on ? "none" : `2px solid ${C.line}`, background: on ? C.amber : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {on && <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#fff" }} />}
                </span>
                <span style={{ fontSize: 15.5, fontWeight: 500, color: on ? C.amber : C.ink, flex: 1 }}>{s.name}</span>
                <span style={{ fontSize: 13, color: on ? C.amber : C.inkFaint }}>{on ? "uusi" : "ei oiretta"}</span>
              </button>
              {on && (
                <div style={{ padding: "0 12px 13px 51px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12.5, color: C.inkSoft }}>Voimakkuus:</span>
                    {SEVERITY.map((sv) => {
                      const sel = log.severity[s.id] === sv.v;
                      return (
                        <button key={sv.v} className="tap" onClick={() => setSeverity(s.id, sv.v)}
                          style={{ fontSize: 12.5, fontWeight: 600, padding: "5px 11px", borderRadius: 999, border: `1px solid ${sel ? C.amber : C.amberLine}`, background: sel ? C.amber : "transparent", color: sel ? "#fff" : C.amber }}>
                          {sv.label}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
                    <span style={{ fontSize: 12.5, color: C.inkSoft }}>Laatu:</span>
                    {QUALITIES.map((q) => {
                      const sel = log.quality[s.id] === q.id;
                      return (
                        <button key={q.id} className="tap" onClick={() => setQuality(s.id, q.id)}
                          style={{ fontSize: 12.5, fontWeight: 600, padding: "5px 11px", borderRadius: 999, border: `1px solid ${sel ? C.slate : C.line}`, background: sel ? C.slate : "transparent", color: sel ? "#fff" : C.slate }}>
                          {q.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </Card>

      {/* Steps */}
      <SectionLabel>Askeleet</SectionLabel>
      <StepsField key={`s-${log.steps || 0}`} value={log.steps || 0} onCommit={setSteps} />

      {/* Note */}
      <SectionLabel>Muistiinpano</SectionLabel>
      <Card style={{ padding: 4 }}>
        <textarea
          defaultValue={log.note}
          onChange={onNoteChange}
          onBlur={(e) => commitNote(e.target.value)}
          placeholder="Miltä tuntui? Muuta huomioitavaa…"
          rows={3}
          style={{ width: "100%", border: "none", resize: "vertical", background: "transparent", padding: "12px", fontSize: 15, lineHeight: 1.45, color: C.ink, outline: "none" }}
        />
      </Card>

      {/* Milestones */}
      <SectionLabel>Merkkipaalut</SectionLabel>
      <div style={{ fontSize: 12.5, color: C.inkSoft, margin: "-4px 2px 8px" }}>
        Esim. fyssarikäynti, annosmuutos, flunssaviikko — näkyvät trendikäyrällä.
      </div>
      <MarksEditor marks={marks} addMark={addMark} removeMark={removeMark} />
    </div>
  );
}

function MarksEditor({ marks, addMark, removeMark }) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    if (!draft.trim()) return;
    addMark(draft);
    setDraft("");
  };
  return (
    <Card style={{ padding: 8 }}>
      {marks.map((m, i) => (
        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 4px", borderTop: i === 0 ? "none" : `1px solid ${C.line}` }}>
          <span aria-hidden="true" style={{ flex: "0 0 auto", width: 8, height: 8, borderRadius: 2, transform: "rotate(45deg)", background: C.pineDeep }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: C.ink, lineHeight: 1.4 }}>
            {m.text}
            {m.auto && <span style={{ fontSize: 11, color: C.inkFaint }}> · autom.</span>}
          </span>
          <MiniBtn label="Poista merkkipaalu" danger onClick={() => removeMark(m.id)}>
            <X size={15} />
          </MiniBtn>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: marks.length ? 6 : 0, paddingTop: marks.length ? 8 : 2, borderTop: marks.length ? `1px solid ${C.line}` : "none" }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Lisää merkkipaalu tälle päivälle…"
          style={{ flex: 1, minWidth: 0, border: `1px solid ${C.line}`, borderRadius: 10, background: C.surfaceSoft, fontSize: 14.5, padding: "9px 12px", color: C.ink, outline: "none" }}
        />
        <button className="tap" onClick={submit} aria-label="Lisää merkkipaalu"
          style={{ flex: "0 0 auto", width: 38, height: 38, borderRadius: 10, background: C.pine, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Plus size={18} color="#fff" strokeWidth={2.5} />
        </button>
      </div>
    </Card>
  );
}

/* steps are typed, so writes are debounced to respect the storage rate limit */
function StepsField({ value, onCommit }) {
  const t = useRef();
  const change = (e) => {
    const v = e.target.value;
    clearTimeout(t.current);
    t.current = setTimeout(() => onCommit(v), 700);
  };
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <Card style={{ padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <input
          defaultValue={value ? String(value) : ""}
          onChange={change}
          onBlur={(e) => {
            clearTimeout(t.current);
            onCommit(e.target.value);
          }}
          inputMode="numeric"
          placeholder="0"
          aria-label="Päivän askeleet"
          style={{ flex: 1, minWidth: 0, border: `1px solid ${C.line}`, borderRadius: 10, background: C.surfaceSoft, fontSize: 17, fontWeight: 600, padding: "10px 12px", color: C.ink, outline: "none", fontVariantNumeric: "tabular-nums" }}
        />
        <span style={{ fontSize: 13, color: C.inkSoft, fontWeight: 600 }}>askelta</span>
      </div>
      <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 8, lineHeight: 1.45 }}>
        Syötä käsin tai tuo Terveys-sovelluksesta Historia-välilehden kautta. Askeleet ovat kontekstitietoa — niitä ei lasketa lihaskuormitukseen, jotta kirjattu kävelylenkki ei tule mukaan kahdesti.
      </div>
    </Card>
  );
}

/* one exercise row with set tracking; supports logging beyond the goal ("overdrive") */
function ExerciseRow({ ex, completed, dayGoal, dayDose, minutes, goalMin, onSet, onMin, isFirst }) {
  const [showHelp, setShowHelp] = useState(false);
  const minute = isMin(ex);
  const target = minute ? goalMin : dayGoal;
  const done = minute ? minutes : completed;
  const complete = done >= target;
  const over = done > target;
  const label = minute ? doseLabel(ex.dose, "min") : doseLabel(ex.dose);
  const dayLabel = minute ? (dayDose && dayDose.min ? `${dayDose.min} min` : "") : doseLabel(dayDose);
  const stale = done > 0 && dayLabel !== label; // logged under a different dose than the current one
  const hasDesc = ex.desc && ex.desc.trim();

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 13,
        padding: "12px",
        borderRadius: 11,
        background: complete ? C.pineTint : "transparent",
        borderTop: isFirst ? "none" : `1px solid ${C.line}`,
        transition: "background .16s",
      }}
    >
      <button
        className="tap"
        aria-label={complete ? "Merkitse tekemättömäksi" : "Merkitse tehdyksi"}
        onClick={() => (minute ? onMin(complete ? 0 : target) : onSet(complete ? 0 : target))}
        style={{ flex: "0 0 auto", width: 26, height: 26, borderRadius: "50%", border: complete ? "none" : `2px solid ${C.line}`, background: complete ? (over ? C.pineDeep : C.pine) : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "background .16s, border-color .16s" }}
      >
        {complete && (over ? <Zap size={14} color="#fff" strokeWidth={2.5} fill="#fff" /> : <Check size={16} color="#fff" strokeWidth={3} />)}
      </button>

      <button
        className="tap"
        onClick={() => (minute ? onMin(complete && !over ? 0 : target) : onSet(complete && !over ? 0 : target))}
        style={{ flex: 1, minWidth: 0, textAlign: "left", background: "transparent" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 15.5, fontWeight: 500, color: complete ? C.pineDeep : C.ink }}>{ex.name}</span>
          {hasDesc && (
            <span
              role="button"
              tabIndex={0}
              aria-label={`Ohje: ${ex.name}`}
              onClick={(e) => { e.stopPropagation(); setShowHelp((v) => !v); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setShowHelp((v) => !v); } }}
              style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: showHelp ? C.pine : C.inkFaint }}
            >
              <HelpCircle size={16} />
            </span>
          )}
        </div>
        {(label || stale) && (
          <div style={{ fontSize: 12.5, color: C.inkFaint, marginTop: 1 }}>
            {label}
            {stale && <span> · kirjattu annoksella {dayLabel || `${dayGoal} ${dayGoal === 1 ? "sarja" : "sarjaa"}`}</span>}
          </div>
        )}
      </button>

      {minute ? (
        <MinuteTracker target={target} minutes={minutes} onMin={onMin} />
      ) : (
        <SetTracker target={target} completed={completed} onSet={onSet} />
      )}

      {showHelp && hasDesc && (
        <>
          <div onClick={() => setShowHelp(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
          <div role="dialog" aria-label={`Ohje: ${ex.name}`}
            style={{ position: "absolute", zIndex: 21, top: "calc(100% - 4px)", left: 12, right: 12, background: C.ink, color: "#fff", borderRadius: 12, padding: "12px 14px", boxShadow: "0 10px 30px rgba(0,0,0,0.28)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.03em", opacity: 0.7 }}>{ex.name}{label ? ` · ${label}` : ""}</span>
              <button className="tap" aria-label="Sulje ohje" onClick={() => setShowHelp(false)} style={{ color: "#fff", opacity: 0.7, display: "flex" }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{ex.desc}</div>
          </div>
        </>
      )}
    </div>
  );
}

function MinuteTracker({ target, minutes, onMin }) {
  const over = minutes > target;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto" }}>
      <button className="tap" aria-label="Vähennä 5 min" onClick={() => onMin(Math.max(0, minutes - 5))}
        style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.inkSoft }}>
        <Minus size={16} />
      </button>
      <span style={{ minWidth: 52, textAlign: "center", fontSize: 13.5, fontWeight: 600, color: minutes > 0 ? C.pineDeep : C.inkFaint, fontVariantNumeric: "tabular-nums" }}>
        {minutes}/{target}
        <span style={{ fontSize: 10.5, color: C.inkFaint }}> min</span>
        {over && <Zap size={11} style={{ verticalAlign: "-1px" }} fill={C.pineDeep} color={C.pineDeep} />}
      </span>
      <button className="tap" aria-label="Lisää 5 min" onClick={() => onMin(minutes + 5)}
        style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.pineDeep }}>
        <Plus size={16} />
      </button>
    </div>
  );
}

function SetTracker({ target, completed, onSet }) {
  const over = Math.max(0, completed - target);
  if (target === 1 && completed <= 1) {
    /* single-set exercise not yet in overdrive: keep the row minimal, just a +-button for extras */
    return (
      <button className="tap" aria-label="Lisää ylimääräinen sarja" onClick={() => onSet(completed + 1)}
        style={{ width: 26, height: 26, flex: "0 0 auto", borderRadius: 8, border: `1px dashed ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.inkFaint }}>
        <Plus size={14} />
      </button>
    );
  }
  if (target <= 6 && completed <= target) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 5, flex: "0 0 auto" }}>
        {Array.from({ length: target }, (_, k) => {
          const filled = k < completed;
          return (
            <button
              key={k}
              className="tap"
              aria-label={`Sarja ${k + 1}`}
              onClick={() => onSet(completed === k + 1 ? k : k + 1)}
              style={{ width: 22, height: 22, borderRadius: "50%", border: filled ? "none" : `2px solid ${C.line}`, background: filled ? C.pine : "transparent", transition: "background .14s" }}
            />
          );
        })}
        {completed >= target && (
          <button className="tap" aria-label="Lisää ylimääräinen sarja" onClick={() => onSet(completed + 1)}
            style={{ width: 22, height: 22, borderRadius: "50%", border: `1.5px dashed ${C.pine}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.pineDeep }}>
            <Plus size={12} strokeWidth={3} />
          </button>
        )}
      </div>
    );
  }
  /* stepper: large goals, or any overdrive state */
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
      <button className="tap" aria-label="Vähennä" onClick={() => onSet(Math.max(0, completed - 1))}
        style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.inkSoft }}>
        <Minus size={16} />
      </button>
      <span style={{ minWidth: 40, textAlign: "center", fontSize: 14, fontWeight: 600, color: over > 0 ? C.pineDeep : completed > 0 ? C.pineDeep : C.inkFaint, fontVariantNumeric: "tabular-nums" }}>
        {completed}/{target}
        {over > 0 && <Zap size={12} style={{ verticalAlign: "-1px", marginLeft: 1 }} fill={C.pineDeep} color={C.pineDeep} />}
      </span>
      <button className="tap" aria-label="Lisää" onClick={() => onSet(completed + 1)}
        style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.pineDeep }}>
        <Plus size={16} />
      </button>
    </div>
  );
}

/* ================================================================== */
/*  RANGE-OF-MOTION RING (signature)                                   */
/* ================================================================== */
function RangeArc({ done, total, size = 176 }) {
  const stroke = 13;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const gap = 0.3;
  const trackLen = (1 - gap) * circ;
  const frac = total > 0 ? Math.min(done / total, 1) : 0;
  const fillLen = frac * trackLen;
  const rotation = 90 + (gap * 360) / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${done} / ${total} liikettä valmiina`}>
      <g transform={`rotate(${rotation} ${cx} ${cy})`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.pineSoft} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${trackLen} ${circ}`} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.pine} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${fillLen} ${circ}`} style={{ transition: "stroke-dasharray .55s cubic-bezier(.22,.61,.36,1)" }} />
      </g>
      <text x={cx} y={cy - 4} textAnchor="middle" style={{ fontSize: 46, fontWeight: 300, fill: done > 0 ? C.pineDeep : C.inkFaint, fontVariantNumeric: "tabular-nums" }}>
        {done}
      </text>
      <text x={cx} y={cy + 22} textAnchor="middle" style={{ fontSize: 14, fontWeight: 600, fill: C.inkSoft }}>
        / {total} liikettä
      </text>
    </svg>
  );
}

/* ================================================================== */
/*  HISTORY                                                            */
/* ================================================================== */
function HistoryView({ days14, logs, symptoms, allSymptoms, exercises, completeCountOf, totalEx, streak, trained14, symptomFree14, today, marks, onExport, onImport, onImportSteps }) {
  const [range, setRange] = useState(14); // 14 | 30 | 90 | 0 (kaikki)
  const [drill, setDrill] = useState(null); // symptom object for drill-down modal
  const [diaryLen, setDiaryLen] = useState(14);
  const sevAlpha = { 1: 0.4, 2: 0.68, 3: 1 };
  const oldToNew = [...days14].reverse();

  /* earliest data date (logs or marks) for diary expansion & heatmap */
  const earliestKey = useMemo(() => {
    const keys = [...Object.keys(logs), ...marks.map((m) => m.date)].sort();
    return keys.length ? keys[0] : null;
  }, [logs, marks]);
  const diaryDays = useMemo(
    () => Array.from({ length: diaryLen }, (_, i) => addDays(today, -i)),
    [diaryLen, today]
  );
  const canExpandDiary =
    earliestKey != null && parseKey(earliestKey) < addDays(today, -(diaryLen - 1));

  /* day list for the selected range, plus the preceding window for delta mode */
  const rangeDays = useMemo(() => {
    if (range !== 0) return Array.from({ length: range }, (_, i) => addDays(today, -i));
    const start = earliestKey ? parseKey(earliestKey) : addDays(today, -13);
    const n = Math.max(1, Math.round((today - start) / 86400000) + 1);
    return Array.from({ length: Math.min(n, 1000) }, (_, i) => addDays(today, -i));
  }, [range, today, earliestKey]);
  const prevDays = useMemo(() => {
    if (range === 0) return null;
    return Array.from({ length: range }, (_, i) => addDays(today, -(range + i)));
  }, [range, today]);

  /* ---- weekly aggregation for long ranges ---- */
  const weekly = useMemo(() => {
    if (range === 14) return null;
    // range start: fixed window, or earliest data for "kaikki"
    let start;
    if (range === 0) {
      const keys = [...Object.keys(logs), ...marks.map((m) => m.date)].sort();
      start = keys.length ? parseKey(keys[0]) : addDays(today, -27);
    } else {
      start = addDays(today, -(range - 1));
    }
    let ws = startOfWeek(start);
    const endWs = startOfWeek(today);
    // safety cap ~2 years of weeks
    const weeks = [];
    for (let g = 0; g < 106 && ws <= endWs; g++) {
      const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
      let train = 0;
      let load = 0;
      let flareDays = 0;
      let stepSum = 0;
      let stepDays = 0;
      days.forEach((d) => {
        if (d > today) return;
        const l = logs[keyOf(d)];
        if (completeCountOf(l) > 0) train++;
        const dl = dayLoad(l);
        if (dl > 0) flareDays++;
        load += dl;
        if (l && l.steps > 0) {
          stepSum += l.steps;
          stepDays++;
        }
      });
      const wkMarks = marks.filter((m) => {
        const md = parseKey(m.date);
        return md >= ws && md < addDays(ws, 7);
      });
      weeks.push({ ws, label: `${ws.getDate()}.${ws.getMonth() + 1}.`, train, load, flareDays, steps: stepDays ? Math.round(stepSum / stepDays) : 0, marks: wkMarks });
      ws = addDays(ws, 7);
    }
    return weeks;
  }, [range, logs, marks, today, completeCountOf]);

  const rangeBtn = (v, label) => (
    <button key={v} className="tap" onClick={() => setRange(v)}
      style={{ padding: "7px 0", borderRadius: 9, fontSize: 13, fontWeight: 600, color: range === v ? "#fff" : C.inkSoft, background: range === v ? C.pine : "transparent", transition: "background .15s" }}>
      {label}
    </button>
  );

  return (
    <div className="rise">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <Stat value={streak} unit="pv" label="Putki" accent={C.pine} />
        <Stat value={trained14} unit="/ 14" label="Treenipäiviä" accent={C.ink} />
        <Stat value={symptomFree14} unit="/ 14" label="Oireettomia" accent={symptomFree14 >= 10 ? C.pine : C.amber} />
      </div>

      {/* Range selector */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 4, margin: "14px 0 2px" }}>
        {rangeBtn(14, "14 pv")}
        {rangeBtn(30, "30 pv")}
        {rangeBtn(90, "90 pv")}
        {rangeBtn(0, "Kaikki")}
      </div>

      <BodyLoadSection
        rangeDays={rangeDays}
        prevDays={prevDays}
        logs={logs}
        exercises={exercises}
        symptoms={allSymptoms}
        rangeLabel={range === 0 ? "koko historia" : `${range} pv`}
        allowDelta={range !== 0}
      />

      {range === 14 ? (
        <>
          <SectionLabel>Oireiden uusiutuminen</SectionLabel>
          <div style={{ fontSize: 12.5, color: C.inkSoft, margin: "-4px 2px 8px" }}>
            Viimeiset 14 päivää — vasemmalta oikealle vanhin → tänään. Napauta oiretta porautuaksesi.
          </div>
          <Card>
            {symptoms.length === 0 && <Empty>Ei oireita seurannassa.</Empty>}
            {symptoms.map((s, i) => {
              const count = oldToNew.filter((d) => {
                const l = logs[keyOf(d)];
                return l && l.flared.includes(s.id);
              }).length;
              return (
                <button key={s.id} className="tap" onClick={() => setDrill(s)} aria-label={`Avaa oireen ${s.name} tarkastelu`}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderTop: i === 0 ? "none" : `1px solid ${C.line}`, width: "100%", textAlign: "left" }}>
                  <div style={{ width: 62, flex: "0 0 auto", fontSize: 13.5, fontWeight: 600, color: count > 0 ? C.amber : C.ink }}>{s.name}</div>
                  <div style={{ display: "flex", gap: 3, flex: 1 }}>
                    {oldToNew.map((d) => {
                      const l = logs[keyOf(d)];
                      const flared = l && l.flared.includes(s.id);
                      const sev = (l && l.severity[s.id]) || 3;
                      const isTd = keyOf(d) === keyOf(today);
                      return (
                        <div key={keyOf(d)} title={shortDate(d)}
                          style={{ flex: 1, height: 22, borderRadius: 4, background: flared ? C.amber : C.line, opacity: flared ? sevAlpha[sev] : 0.4, boxShadow: isTd ? `0 0 0 2px ${C.bg}, 0 0 0 3px ${C.inkFaint}` : "none" }} />
                      );
                    })}
                  </div>
                  <div style={{ width: 30, flex: "0 0 auto", textAlign: "right", fontSize: 13, fontWeight: 600, color: count > 0 ? C.amber : C.inkFaint, fontVariantNumeric: "tabular-nums" }}>{count}×</div>
                  <ChevronRight size={15} style={{ flex: "0 0 auto", color: C.inkFaint }} />
                </button>
              );
            })}
          </Card>

          <SectionLabel>Päiväkirja</SectionLabel>
          <Card style={{ padding: 6 }}>
            {diaryDays.map((d, i) => {
              const k = keyOf(d);
              const l = logs[k];
              const dc = completeCountOf(l);
              const frac = totalEx > 0 ? Math.min(1, dc / totalEx) : 0;
              const flaredNames = l ? symptoms.filter((s) => l.flared.includes(s.id)).map((s) => s.name) : [];
              const hasNote = l && l.note && l.note.trim();
              const dayMarks = marks.filter((m) => m.date === k);
              const over = l && exercises.some((e) => ((l.sets && l.sets[e.id]) || 0) > goalOf(l, e));
              const steps = (l && l.steps) || 0;
              return (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 8px", borderTop: i === 0 ? "none" : `1px solid ${C.line}` }}>
                  <div style={{ width: 66, flex: "0 0 auto", fontSize: 13, fontWeight: 600, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{shortDate(d)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ height: 7, borderRadius: 999, background: C.line, overflow: "hidden" }}>
                      <div style={{ width: `${frac * 100}%`, height: "100%", background: C.pine, borderRadius: 999 }} />
                    </div>
                    {(flaredNames.length > 0 || hasNote || dayMarks.length > 0 || over || steps > 0) && (
                      <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                        {over && (
                          <span title="Kirjattu annosta enemmän" style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 11, fontWeight: 700, color: C.pineDeep, background: C.pineTint, border: `1px solid ${C.pineSoft}`, borderRadius: 999, padding: "1px 7px" }}>
                            <Zap size={10} fill={C.pineDeep} color={C.pineDeep} /> ylitys
                          </span>
                        )}
                        {flaredNames.map((n) => (
                          <span key={n} style={{ fontSize: 11, fontWeight: 600, color: C.amber, background: C.amberTint, border: `1px solid ${C.amberLine}`, borderRadius: 999, padding: "1px 8px" }}>{n}</span>
                        ))}
                        {dayMarks.map((m) => (
                          <span key={m.id} title={m.text} style={{ fontSize: 11, fontWeight: 600, color: C.pineDeep, background: C.pineTint, border: `1px solid ${C.pineSoft}`, borderRadius: 999, padding: "1px 8px", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>◆ {m.text}</span>
                        ))}
                        {steps > 0 && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: C.slate, background: C.slateTint, borderRadius: 999, padding: "1px 7px", fontVariantNumeric: "tabular-nums" }}>
                            {steps.toLocaleString("fi-FI")} askelta
                          </span>
                        )}
                        {hasNote && <span style={{ fontSize: 11, color: C.inkFaint }}>✎ muistiinpano</span>}
                      </div>
                    )}
                  </div>
                  <div style={{ width: 34, flex: "0 0 auto", textAlign: "right", fontSize: 13, fontWeight: 600, color: dc > 0 ? C.pineDeep : C.inkFaint, fontVariantNumeric: "tabular-nums" }}>{dc}/{totalEx}</div>
                </div>
              );
            })}
          </Card>
          {canExpandDiary && (
            <button className="tap" onClick={() => setDiaryLen((n) => n + 30)}
              style={{ display: "block", width: "100%", marginTop: -8, marginBottom: 16, padding: "10px", borderRadius: 11, border: `1px dashed ${C.line}`, background: "transparent", color: C.inkSoft, fontSize: 13.5, fontWeight: 600 }}>
              Näytä vanhemmat (+30 pv)
            </button>
          )}
        </>
      ) : (
        <>
          <WeeklyTrends weekly={weekly} rangeLabel={range === 0 ? "koko historia" : `viimeiset ${range} pv`} />
          <SectionLabel>Kuukausikalenteri</SectionLabel>
          <div style={{ fontSize: 12.5, color: C.inkSoft, margin: "-4px 2px 8px" }}>
            Vihreä = treeniä (tummempi = enemmän), <span style={{ color: C.amber, fontWeight: 700 }}>piste</span> = oirepäivä, ◆ = merkkipaalu.
          </div>
          <MonthHeatmaps range={range} today={today} logs={logs} marks={marks} completeCountOf={completeCountOf} totalEx={totalEx} earliestKey={earliestKey} />
          <SectionLabel>Oireet — porautuminen</SectionLabel>
          <Card style={{ padding: 6 }}>
            {allSymptoms.length === 0 && <Empty>Ei oireita seurannassa.</Empty>}
            {allSymptoms
              .filter((s) => !s.archived || Object.keys(logs).some((k) => logs[k].flared.includes(s.id)))
              .map((s, i) => {
                const total = Object.keys(logs).filter((k) => logs[k].flared.includes(s.id)).length;
                return (
                  <button key={s.id} className="tap" onClick={() => setDrill(s)}
                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "12px 10px", borderTop: i === 0 ? "none" : `1px solid ${C.line}` }}>
                    <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: s.archived ? C.inkSoft : C.ink }}>
                      {s.name}
                      {s.archived && <span style={{ fontSize: 11.5, fontWeight: 600, color: C.inkFaint }}> · arkistoitu</span>}
                    </span>
                    <span style={{ fontSize: 13, color: total > 0 ? C.amber : C.inkFaint, fontWeight: 600 }}>{total}× yhteensä</span>
                    <ChevronRight size={16} style={{ color: C.inkFaint }} />
                  </button>
                );
              })}
          </Card>
        </>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <button className="tap" onClick={onExport}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px", borderRadius: 13, border: `1px solid ${C.pine}`, background: C.surface, color: C.pineDeep, fontSize: 15, fontWeight: 600 }}>
          <Download size={18} /> Vie tiedot
        </button>
        <button className="tap" onClick={onImport}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px", borderRadius: 13, border: `1px solid ${C.pine}`, background: C.surface, color: C.pineDeep, fontSize: 15, fontWeight: 600 }}>
          <Upload size={18} /> Tuo tiedot
        </button>
      </div>
      <button className="tap" onClick={onImportSteps}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", marginTop: 10, padding: "12px", borderRadius: 13, border: `1px solid ${C.line}`, background: C.surface, color: C.inkSoft, fontSize: 14.5, fontWeight: 600 }}>
        <Upload size={16} /> Tuo askeleet Terveys-datasta
      </button>

      {drill && (
        <SymptomModal symptom={drill} logs={logs} exercises={exercises} completeCountOf={completeCountOf} today={today} onClose={() => setDrill(null)} />
      )}
    </div>
  );
}

/* ---- long-range weekly view: trend chart + marks list ---- */
function WeeklyTrends({ weekly, rangeLabel }) {
  if (!weekly || weekly.length === 0) {
    return (
      <Card>
        <Empty>Ei merkintöjä valitulla aikavälillä.</Empty>
      </Card>
    );
  }
  const marksInRange = weekly.flatMap((w) => w.marks);
  const hasData = weekly.some((w) => w.train > 0 || w.load > 0);

  return (
    <>
      <SectionLabel>Viikkotrendit</SectionLabel>
      <div style={{ fontSize: 12.5, color: C.inkSoft, margin: "-4px 2px 8px", lineHeight: 1.5 }}>
        Viikkotaso ({rangeLabel}): <span style={{ color: C.amber, fontWeight: 700 }}>oirekuorma</span> = oirepäivien voimakkuuksien summa/viikko, <span style={{ color: C.pineDeep, fontWeight: 700 }}>palkit</span> = treenipäiviä/viikko, <span style={{ color: C.slate, fontWeight: 700 }}>katkoviiva</span> = askelkeskiarvo (oma asteikko). ◆ = merkkipaalu.
      </div>
      <Card style={{ paddingBottom: 10 }}>
        {hasData ? <TrendChart weekly={weekly} /> : <Empty>Ei vielä merkintöjä tälle välille.</Empty>}
      </Card>

      <SectionLabel>Merkkipaalut aikavälillä</SectionLabel>
      <Card style={{ padding: 8 }}>
        {marksInRange.length === 0 && <Empty>Ei merkkipaaluja. Lisää niitä Tänään-välilehdeltä.</Empty>}
        {marksInRange.map((m, i) => (
          <div key={m.id} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "8px 4px", borderTop: i === 0 ? "none" : `1px solid ${C.line}` }}>
            <span style={{ flex: "0 0 auto", width: 66, fontSize: 12.5, fontWeight: 600, color: C.inkSoft, fontVariantNumeric: "tabular-nums" }}>{humanDate(m.date)}</span>
            <span style={{ flex: 1, fontSize: 14, color: C.ink, lineHeight: 1.4 }}>
              {m.text}
              {m.auto && <span style={{ fontSize: 11, color: C.inkFaint }}> · autom.</span>}
            </span>
          </div>
        ))}
      </Card>
    </>
  );
}

/* ---- month heatmap calendar (quick browse of long ranges) ---- */
function MonthHeatmaps({ range, today, logs, marks, completeCountOf, totalEx, earliestKey }) {
  const months = useMemo(() => {
    let start;
    if (range === 0) {
      start = earliestKey ? parseKey(earliestKey) : addDays(today, -29);
    } else {
      start = addDays(today, -(range - 1));
    }
    // cap to last 12 months for rendering
    const cap = new Date(today.getFullYear(), today.getMonth() - 11, 1);
    let m = new Date(start.getFullYear(), start.getMonth(), 1);
    let capped = false;
    if (m < cap) {
      m = cap;
      capped = true;
    }
    const list = [];
    const end = new Date(today.getFullYear(), today.getMonth(), 1);
    while (m <= end) {
      list.push(new Date(m));
      m = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    }
    return { list, capped };
  }, [range, today, earliestKey]);

  const markDates = useMemo(() => new Set(marks.map((m) => m.date)), [marks]);
  const MONTHS_FI = ["Tammikuu", "Helmikuu", "Maaliskuu", "Huhtikuu", "Toukokuu", "Kesäkuu", "Heinäkuu", "Elokuu", "Syyskuu", "Lokakuu", "Marraskuu", "Joulukuu"];

  return (
    <Card>
      {months.capped && (
        <div style={{ fontSize: 12, color: C.inkFaint, marginBottom: 8 }}>Näytetään viimeiset 12 kuukautta — vanhemmat löytyvät viennistä.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {months.list.map((m0) => {
          const y = m0.getFullYear();
          const mo = m0.getMonth();
          const daysInMonth = new Date(y, mo + 1, 0).getDate();
          const lead = (new Date(y, mo, 1).getDay() + 6) % 7; // Mon=0
          const cells = [];
          for (let i = 0; i < lead; i++) cells.push(null);
          for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, mo, d));
          return (
            <div key={`${y}-${mo}`}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 6 }}>
                {MONTHS_FI[mo]} {y}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
                {["Ma", "Ti", "Ke", "To", "Pe", "La", "Su"].map((w) => (
                  <div key={w} style={{ fontSize: 9.5, fontWeight: 700, color: C.inkFaint, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.05em" }}>{w}</div>
                ))}
                {cells.map((d, i) => {
                  if (!d) return <div key={`e${i}`} />;
                  const k = keyOf(d);
                  const future = d > today;
                  const l = logs[k];
                  const dc = completeCountOf(l);
                  const frac = totalEx > 0 ? dc / totalEx : 0;
                  const flare = dayLoad(l) > 0;
                  const hasMark = markDates.has(k);
                  const bg = future
                    ? "transparent"
                    : frac >= 1
                    ? C.pine
                    : frac > 0
                    ? C.pineSoft
                    : C.surfaceSoft;
                  const isTd = k === keyOf(today);
                  return (
                    <div key={k} title={`${shortDate(d)}${dc > 0 ? ` — ${dc}/${totalEx} liikettä` : ""}${flare ? " — oiretta" : ""}`}
                      style={{ position: "relative", aspectRatio: "1", borderRadius: 5, background: bg, border: `1px solid ${future ? "transparent" : isTd ? C.inkSoft : C.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 9.5, fontWeight: 600, color: future ? C.inkFaint : frac >= 1 ? "#fff" : C.inkSoft, opacity: future ? 0.4 : 1 }}>{d.getDate()}</span>
                      {flare && <span style={{ position: "absolute", top: 2, right: 2, width: 5, height: 5, borderRadius: "50%", background: C.amber }} />}
                      {hasMark && <span style={{ position: "absolute", bottom: 2, left: 2, width: 5, height: 5, transform: "rotate(45deg)", background: C.pineDeep, borderRadius: 1 }} />}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ---- per-symptom drill-down + lag analysis over full history ---- */
function SymptomModal({ symptom, logs, exercises, completeCountOf, today, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const S = useMemo(() => {
    const allKeys = Object.keys(logs).sort();
    const occ = allKeys.filter((k) => logs[k].flared.includes(symptom.id));
    const n = occ.length;
    /* gaps between consecutive occurrences (days) */
    const gaps = [];
    for (let i = 1; i < n; i++) {
      gaps.push(Math.round((parseKey(occ[i]) - parseKey(occ[i - 1])) / 86400000));
    }
    const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
    /* longest symptom-free stretch: between occurrences and since last */
    let longestFree = null;
    gaps.forEach((g) => {
      if (g - 1 > (longestFree || 0)) longestFree = g - 1;
    });
    let sinceLast = null;
    if (n > 0) {
      sinceLast = Math.round((today - parseKey(occ[n - 1])) / 86400000);
      if (sinceLast > (longestFree || 0)) longestFree = sinceLast;
    }
    /* lag analysis: was there training on the 1–2 days before each flare vs. baseline */
    const trainedOn = (k) => completeCountOf(logs[k]) > 0;
    let preTrained = 0;
    occ.forEach((k) => {
      const d = parseKey(k);
      const p1 = keyOf(addDays(d, -1));
      const p2 = keyOf(addDays(d, -2));
      if (trainedOn(p1) || trainedOn(p2)) preTrained++;
    });
    /* baseline: share of all logged-period days with training within any 2-day window.
       Approximate with overall training-day share to keep it honest and simple. */
    let baselineDays = 0;
    let baselineTrained = 0;
    if (allKeys.length) {
      const first = parseKey(allKeys[0]);
      for (let d = new Date(first); d <= today; d = addDays(d, 1)) {
        baselineDays++;
        if (trainedOn(keyOf(d))) baselineTrained++;
      }
    }
    const baselineShare = baselineDays ? baselineTrained / baselineDays : 0;
    /* which exercises appeared on the 1–2 days before flares */
    const exCounts = {};
    occ.forEach((k) => {
      const d = parseKey(k);
      [1, 2].forEach((off) => {
        const l = logs[keyOf(addDays(d, -off))];
        if (!l || !l.sets) return;
        Object.keys(l.sets).forEach((id) => {
          if (l.sets[id] > 0) exCounts[id] = (exCounts[id] || 0) + 1;
        });
      });
    });
    const exList = exercises
      .map((e) => ({ name: e.name, count: exCounts[e.id] || 0 }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count);
    const sevCount = { 1: 0, 2: 0, 3: 0 };
    occ.forEach((k) => {
      const v = logs[k].severity[symptom.id];
      if (v >= 1 && v <= 3) sevCount[v]++;
    });
    /* step context: are flares preceded by high-step days? */
    const stepAvg = (keys) => {
      const vals = keys.map((k) => (logs[k] && logs[k].steps) || 0).filter((v) => v > 0);
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    };
    const preKeys = [];
    occ.forEach((k) => {
      const d = parseKey(k);
      preKeys.push(keyOf(addDays(d, -1)), keyOf(addDays(d, -2)));
    });
    const stepsOnFlare = stepAvg(occ);
    const stepsBefore = stepAvg(preKeys);
    const stepsBaseline = stepAvg(allKeys);
    const qCount = {};
    occ.forEach((k) => {
      const q = logs[k].quality && logs[k].quality[symptom.id];
      if (q) qCount[q] = (qCount[q] || 0) + 1;
    });
    return { occ, n, avgGap, longestFree, sinceLast, preTrained, baselineShare, exList, sevCount, qCount, stepsOnFlare, stepsBefore, stepsBaseline };
  }, [logs, symptom, exercises, completeCountOf, today]);

  const recent = [...S.occ].reverse().slice(0, 20);
  const SEV_NAME = { 1: "lievä", 2: "kohtalainen", 3: "kova" };

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(22,36,31,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 12, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Oire: ${symptom.name}`}
        style={{ background: C.surface, borderRadius: 18, width: "100%", maxWidth: 520, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 10px" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            <span style={{ color: C.amber }}>●</span> {symptom.name}
          </h2>
          <IconBtn label="Sulje" onClick={onClose}><X size={18} /></IconBtn>
        </div>

        <div style={{ padding: "0 16px 16px", overflowY: "auto" }}>
          {S.n === 0 ? (
            <Empty>Ei kirjattuja esiintymiä koko historiassa. 🌿</Empty>
          ) : (
            <>
              {/* headline stats */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <Stat value={S.n} unit="×" label="Esiintymiä" accent={C.amber} />
                <Stat value={S.avgGap != null ? Math.round(S.avgGap) : "–"} unit="pv" label="Keskim. väli" accent={C.ink} />
                <Stat value={S.longestFree != null ? S.longestFree : "–"} unit="pv" label="Pisin oireeton" accent={C.pine} />
              </div>
              {S.sinceLast != null && (
                <div style={{ fontSize: 13, color: C.inkSoft, margin: "10px 2px 0" }}>
                  Edellisestä esiintymästä <b style={{ color: S.sinceLast > (S.avgGap || 0) ? C.pineDeep : C.ink }}>{S.sinceLast} pv</b>
                  {S.avgGap != null && S.sinceLast > S.avgGap && " — pidempään kuin keskimäärin 💪"}.
                  {" "}Voimakkuudet: {[3, 2, 1].filter((v) => S.sevCount[v] > 0).map((v) => `${S.sevCount[v]}× ${SEV_NAME[v]}`).join(", ") || "ei kirjattu"}.
                </div>
              )}

              {/* lag analysis */}
              {Object.keys(S.qCount).length > 0 && (
                <div style={{ fontSize: 13, color: C.inkSoft, margin: "8px 2px 0" }}>
                  Laatu: {QUALITIES.filter((q) => S.qCount[q.id]).map((q) => `${S.qCount[q.id]}× ${q.label}`).join(", ")}
                </div>
              )}
              <SectionLabel>Edeltävät päivät (viive 1–2 pv)</SectionLabel>
              <Card style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.55 }}>
                  Treeniä oli 1–2 päivää ennen oiretta <b>{S.preTrained}/{S.n}</b> kerralla ({Math.round((S.preTrained / S.n) * 100)} %).
                  Vertailuksi: treenipäiviä on ollut noin <b>{Math.round(S.baselineShare * 100)} %</b> kaikista päivistä.
                </div>
                {S.exList.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.inkSoft, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                      Liikkeet oiretta edeltävinä päivinä
                    </div>
                    {S.exList.map((x) => (
                      <div key={x.name} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13.5, padding: "4px 0", color: C.ink }}>
                        <span>{x.name}</span>
                        <span style={{ fontWeight: 600, color: C.inkSoft }}>{x.count}×</span>
                      </div>
                    ))}
                  </div>
                )}
                {S.stepsBaseline != null && (S.stepsBefore != null || S.stepsOnFlare != null) && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}`, fontSize: 13, color: C.ink, lineHeight: 1.55 }}>
                    <span style={{ fontWeight: 700, color: C.slate }}>Askeleet: </span>
                    {S.stepsBefore != null && (
                      <>
                        1–2 pv ennen oiretta keskimäärin <b>{S.stepsBefore.toLocaleString("fi-FI")}</b>
                        {" "}(kaikkien päivien keskiarvo {S.stepsBaseline.toLocaleString("fi-FI")}).
                        {S.stepsBefore > S.stepsBaseline * 1.15 && " Edeltävät päivät olivat selvästi vilkkaampia."}
                        {S.stepsBefore < S.stepsBaseline * 0.85 && " Edeltävät päivät olivat tavallista hiljaisempia."}
                      </>
                    )}
                    {S.stepsOnFlare != null && <> Oirepäivinä <b>{S.stepsOnFlare.toLocaleString("fi-FI")}</b>.</>}
                  </div>
                )}
                <div style={{ fontSize: 12, color: C.inkFaint, marginTop: 10, lineHeight: 1.5 }}>
                  Huom: tämä näyttää ajallisia yhteyksiä, ei syy-seuraussuhdetta. Tulkitse yhdessä fysioterapeutin kanssa.
                </div>
              </Card>

              {/* occurrence list */}
              <SectionLabel>Esiintymät{S.n > 20 ? " (20 viimeisintä)" : ""}</SectionLabel>
              <Card style={{ padding: 8 }}>
                {recent.map((k, i) => {
                  const v = logs[k].severity[symptom.id];
                  const q = logs[k].quality && logs[k].quality[symptom.id];
                  return (
                    <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", borderTop: i === 0 ? "none" : `1px solid ${C.line}` }}>
                      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{humanDate(k)}</span>
                      {q && <span style={{ fontSize: 12, fontWeight: 600, color: C.slate }}>{qualityLabel(q)}</span>}
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: C.amber }}>{v ? SEV_NAME[v] : "—"}</span>
                    </div>
                  );
                })}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* dual-scale SVG: bars = train days (0–7), line = symptom load */
function TrendChart({ weekly }) {
  const W = 480;
  const H = 190;
  const padL = 26;
  const padR = 10;
  const padT = 14;
  const padB = 34;
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const n = weekly.length;
  const step = iw / n;
  const maxLoad = Math.max(4, ...weekly.map((w) => w.load));
  const maxSteps = Math.max(0, ...weekly.map((w) => w.steps));
  const hasSteps = maxSteps > 0;
  const ySteps = (v) => padT + ih - (v / maxSteps) * ih;
  const stepPts = weekly.map((w, i) => `${xC(i).toFixed(1)},${ySteps(w.steps).toFixed(1)}`).join(" ");
  const xC = (i) => padL + step * (i + 0.5);
  const yLoad = (v) => padT + ih - (v / maxLoad) * ih;
  const yTrain = (v) => (v / 7) * ih;
  const linePts = weekly.map((w, i) => `${xC(i).toFixed(1)},${yLoad(w.load).toFixed(1)}`).join(" ");
  const barW = Math.min(18, step * 0.55);
  // label at most ~6 x-ticks
  const labelEvery = Math.max(1, Math.ceil(n / 6));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Viikkotrendit: oirekuorma ja treenipäivät">
      {/* gridlines + load axis labels */}
      {[0, 0.5, 1].map((f) => {
        const v = Math.round(maxLoad * f);
        const y = yLoad(v);
        return (
          <g key={f}>
            <line x1={padL} x2={W - padR} y1={y} y2={y} stroke={C.line} strokeWidth="1" />
            <text x={padL - 5} y={y + 3.5} textAnchor="end" style={{ fontSize: 10, fill: C.inkFaint }}>{v}</text>
          </g>
        );
      })}
      {/* train-day bars */}
      {weekly.map((w, i) =>
        w.train > 0 ? (
          <rect key={i} x={xC(i) - barW / 2} y={padT + ih - yTrain(w.train)} width={barW} height={yTrain(w.train)} rx="2.5" fill={C.pineSoft} stroke={C.pine} strokeWidth="1" />
        ) : null
      )}
      {/* steps (own scale, context only) */}
      {hasSteps && n > 1 && (
        <polyline points={stepPts} fill="none" stroke={C.slateSoft} strokeWidth="2" strokeDasharray="4 3" strokeLinejoin="round" strokeLinecap="round" />
      )}
      {/* symptom load line */}
      {n > 1 && <polyline points={linePts} fill="none" stroke={C.amber} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
      {weekly.map((w, i) => (
        <circle key={i} cx={xC(i)} cy={yLoad(w.load)} r={w.load > 0 ? 3.4 : 2.4} fill={w.load > 0 ? C.amber : C.surface} stroke={C.amber} strokeWidth="1.5" />
      ))}
      {/* milestone diamonds */}
      {weekly.map((w, i) =>
        w.marks.length > 0 ? (
          <g key={`m${i}`} transform={`translate(${xC(i)}, ${H - padB + 9}) rotate(45)`}>
            <rect x="-4" y="-4" width="8" height="8" fill={C.pineDeep} rx="1" />
          </g>
        ) : null
      )}
      {/* x labels */}
      {weekly.map((w, i) =>
        i % labelEvery === 0 ? (
          <text key={`t${i}`} x={xC(i)} y={H - 6} textAnchor="middle" style={{ fontSize: 10, fill: C.inkSoft, fontWeight: 600 }}>{w.label}</text>
        ) : null
      )}
    </svg>
  );
}

/* ================================================================== */
/*  EDIT                                                               */
/* ================================================================== */
function EditView({ exercises, symptoms, renameItem, setDose, setDesc, setExType, cycleExMuscle, toggleSymRegion, toggleExStructure, toggleSymStructure, addItem, removeItem, moveItem, resetList, archiveItem, addFromLibrary, logDoseChange }) {
  const [exDraft, setExDraft] = useState("");
  const [syDraft, setSyDraft] = useState("");
  const [picker, setPicker] = useState(null); // { kind:'ex'|'sy', id }
  const [libOpen, setLibOpen] = useState(false);
  /* snapshot dose label when a dose field gains focus; compare on blur */
  const doseSnap = useRef({});
  const exercisesRef = useRef(exercises);
  exercisesRef.current = exercises;
  const onDoseFocus = (id) => {
    if (doseSnap.current[id] === undefined) {
      const ex = exercisesRef.current.find((e) => e.id === id);
      doseSnap.current[id] = ex ? doseLabel(ex.dose) : "";
    }
  };
  const onDoseBlur = (id) => {
    // wait a tick: focus may move between fields of the same exercise
    setTimeout(() => {
      const active = document.activeElement;
      if (active && active.dataset && active.dataset.doseEx === id) return;
      const before = doseSnap.current[id];
      if (before === undefined) return;
      delete doseSnap.current[id];
      const ex = exercisesRef.current.find((e) => e.id === id);
      if (!ex) return;
      logDoseChange(ex.name, before, doseLabel(ex.dose));
    }, 120);
  };

  return (
    <div className="rise">
      {/* Exercises */}
      <SectionLabel>Liikkeet</SectionLabel>
      <div style={{ fontSize: 12.5, color: C.inkSoft, margin: "-4px 2px 8px", lineHeight: 1.5 }}>
        Toistoluokka: <b>Sarjat</b> = montako kertaa (kuitattava määrä), <b>Toistot</b> = toistoa/kerta, <b>Pito</b> = sekunteina. Esim. 2 × 5 → Sarjat 2, Toistot 5. 10 × 10 s pito → Sarjat 10, Pito 10.
      </div>
      <button className="tap" onClick={() => setLibOpen(true)}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", marginBottom: 10, padding: "12px", borderRadius: 13, border: `1px solid ${C.pine}`, background: C.surface, color: C.pineDeep, fontSize: 15, fontWeight: 600 }}>
        <BookOpen size={17} /> Lisää kirjastosta
      </button>
      <Card style={{ padding: 8 }}>
        {exercises.filter((e) => !e.archived).map((e, i) => (
          <div key={e.id} style={{ background: C.surfaceSoft, border: `1px solid ${C.line}`, borderRadius: 12, padding: 10, marginTop: i === 0 ? 0 : 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input value={e.name} onChange={(ev) => renameItem("ex", e.id, ev.target.value)} aria-label="Liikkeen nimi"
                style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", fontSize: 15, fontWeight: 600, padding: "6px 4px", color: C.ink, outline: "none" }} />
              <MiniBtn label="Ylös" disabled={i === 0} onClick={() => moveItem("ex", e.id, -1)}><ArrowUp size={16} /></MiniBtn>
              <MiniBtn label="Alas" onClick={() => moveItem("ex", e.id, 1)}><ArrowDown size={16} /></MiniBtn>
              <MiniBtn label="Arkistoi" onClick={() => archiveItem("ex", e.id, true)}><Archive size={16} /></MiniBtn>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {isMin(e) && (
                <>
                  <NumField label="Minuutit" value={e.dose.min} placeholder="–" onChange={(v) => setDose(e.id, "min", v)} exId={e.id} onDoseFocus={onDoseFocus} onDoseBlur={onDoseBlur} />
                  <span style={{ paddingBottom: 9, fontSize: 12.5, color: C.inkFaint }}>MET {e.met || "–"}</span>
                </>
              )}
              {!isMin(e) && <NumField label="Sarjat" value={e.dose.sets} placeholder="–" onChange={(v) => setDose(e.id, "sets", v)} exId={e.id} onDoseFocus={onDoseFocus} onDoseBlur={onDoseBlur} />}
              {!isMin(e) && <span style={{ paddingBottom: 9, color: C.inkFaint, fontSize: 15 }}>×</span>}
              {!isMin(e) && <NumField label="Toistot" value={e.dose.reps} placeholder="–" onChange={(v) => setDose(e.id, "reps", v)} exId={e.id} onDoseFocus={onDoseFocus} onDoseBlur={onDoseBlur} />}
              {!isMin(e) && <NumField label="Pito (s)" value={e.dose.hold} placeholder="–" onChange={(v) => setDose(e.id, "hold", v)} exId={e.id} onDoseFocus={onDoseFocus} onDoseBlur={onDoseBlur} />}
              <span style={{ paddingBottom: 9, marginLeft: "auto", fontSize: 13, fontWeight: 600, color: doseLabel(e.dose, e.unit) ? C.pineDeep : C.inkFaint }}>
                {doseLabel(e.dose, e.unit) || "ei annosta"}
              </span>
            </div>
            <textarea
              value={e.desc || ""}
              onChange={(ev) => setDesc(e.id, ev.target.value)}
              placeholder="Suoritusohje (valinnainen) — näkyy Tänään-näkymässä ?-pallosta…"
              rows={2}
              style={{ width: "100%", marginTop: 8, border: `1px solid ${C.line}`, borderRadius: 9, background: C.surface, resize: "vertical", padding: "9px 10px", fontSize: 13.5, lineHeight: 1.45, color: C.ink, outline: "none" }}
            />
            <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
              {EX_TYPES.map((t) => {
                const sel = (e.type || "strength") === t.id;
                return (
                  <button key={t.id} className="tap" onClick={() => setExType(e.id, t.id)}
                    style={{ fontSize: 12, fontWeight: 600, padding: "5px 10px", borderRadius: 999, border: `1px solid ${sel ? C.pine : C.line}`, background: sel ? C.pine : C.surface, color: sel ? "#fff" : C.inkSoft }}>
                    {t.label}
                  </button>
                );
              })}
            </div>
            <button className="tap" onClick={() => setPicker({ kind: "ex", id: e.id })}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", marginTop: 8, padding: "9px 10px", borderRadius: 9, border: `1px solid ${C.line}`, background: C.surface, textAlign: "left" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.inkSoft }}>Kohdealueet</span>
              <span style={{ flex: 1, fontSize: 12.5, color: Object.keys(e.muscles || {}).length || (e.structures || []).length ? C.pineDeep : C.inkFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {[
                  ...Object.keys(e.muscles || {})
                    .sort((a, b) => e.muscles[a] - e.muscles[b])
                    .map((id) => regionName(id)),
                  ...(e.structures || []).map((id) => structName(id)),
                ].join(", ") || "ei valintoja"}
              </span>
              <ChevronRight size={15} style={{ color: C.inkFaint }} />
            </button>
            {e.source && <SourceBadge source={e.source} />}
          </div>
        ))}
        <AddRow value={exDraft} setValue={setExDraft} placeholder="Lisää liike…" onAdd={() => { addItem("ex", exDraft); setExDraft(""); }} />
      </Card>
      <ArchivedList which="ex" items={exercises.filter((e) => e.archived)} restore={archiveItem} remove={removeItem} />
      <ResetBtn onClick={() => resetList("ex")} />

      <div style={{ height: 10 }} />

      {/* Symptoms */}
      <SectionLabel>Oireet</SectionLabel>
      <Card style={{ padding: 8 }}>
        {symptoms.filter((s) => !s.archived).map((s, i) => (
          <div key={s.id} style={{ padding: "6px 2px", borderTop: i === 0 ? "none" : `1px solid ${C.line}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input value={s.name} onChange={(ev) => renameItem("sy", s.id, ev.target.value)} aria-label="Oireen nimi"
                style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", fontSize: 15, fontWeight: 500, padding: "8px 6px", color: C.ink, outline: "none" }} />
              <MiniBtn label="Ylös" disabled={i === 0} onClick={() => moveItem("sy", s.id, -1)}><ArrowUp size={16} /></MiniBtn>
              <MiniBtn label="Alas" onClick={() => moveItem("sy", s.id, 1)}><ArrowDown size={16} /></MiniBtn>
              <MiniBtn label="Arkistoi" onClick={() => archiveItem("sy", s.id, true)}><Archive size={16} /></MiniBtn>
            </div>
            <button className="tap" onClick={() => setPicker({ kind: "sy", id: s.id })}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", marginTop: 2, marginBottom: 4, padding: "8px 8px", borderRadius: 9, border: `1px solid ${C.line}`, background: C.surfaceSoft, textAlign: "left" }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.inkSoft }}>Sijainti</span>
              <span style={{ flex: 1, fontSize: 12.5, color: Object.keys(s.regions || {}).length || Object.keys(s.structures || {}).length ? C.amber : C.inkFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {[
                  ...Object.keys(s.regions || {}).map((id) => `${regionName(id)} (${SIDES[s.regions[id]]})`),
                  ...Object.keys(s.structures || {}).map((id) => `${structName(id)} (${SIDES[s.structures[id]]})`),
                ].join(", ") || "ei valintoja"}
              </span>
              <ChevronRight size={15} style={{ color: C.inkFaint }} />
            </button>
          </div>
        ))}
        <AddRow value={syDraft} setValue={setSyDraft} placeholder="Lisää oire…" onAdd={() => { addItem("sy", syDraft); setSyDraft(""); }} />
      </Card>
      <ArchivedList which="sy" items={symptoms.filter((s) => s.archived)} restore={archiveItem} remove={removeItem} />
      <ResetBtn onClick={() => resetList("sy")} />

      {libOpen && <LibraryModal existing={exercises} onAdd={addFromLibrary} onClose={() => setLibOpen(false)} />}
      {picker && picker.kind === "ex" && (() => {
        const ex = exercises.find((x) => x.id === picker.id);
        if (!ex) return null;
        return (
          <RegionPicker
            kind="ex"
            title={ex.name}
            valueMap={ex.muscles || {}}
            structMap={ex.structures || []}
            onTap={(regionId) => cycleExMuscle(ex.id, regionId)}
            onTapStruct={(structId) => toggleExStructure(ex.id, structId)}
            onClose={() => setPicker(null)}
          />
        );
      })()}
      {picker && picker.kind === "sy" && (() => {
        const sy = symptoms.find((x) => x.id === picker.id);
        if (!sy) return null;
        return (
          <RegionPicker
            kind="sy"
            title={sy.name}
            valueMap={sy.regions || {}}
            structMap={sy.structures || {}}
            onTap={(regionId, side) => toggleSymRegion(sy.id, regionId, side)}
            onTapStruct={(structId, side) => toggleSymStructure(sy.id, structId, side)}
            onClose={() => setPicker(null)}
          />
        );
      })()}
    </div>
  );
}

/* archived items: hidden from daily use, history preserved; restore or delete permanently */
function ArchivedList({ which, items, restore, remove }) {
  if (!items.length) return null;
  return (
    <>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.inkFaint, fontWeight: 700, margin: "10px 2px 6px" }}>
        Arkistoidut ({items.length})
      </div>
      <Card style={{ padding: 8, background: C.surfaceSoft }}>
        {items.map((it, i) => (
          <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 2px", borderTop: i === 0 ? "none" : `1px solid ${C.line}` }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, color: C.inkSoft, padding: "2px 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {it.name}
              {which === "ex" && doseLabel(it.dose) && <span style={{ color: C.inkFaint }}> · {doseLabel(it.dose)}</span>}
            </span>
            <MiniBtn label="Palauta käyttöön" onClick={() => restore(which, it.id, false)}><ArchiveRestore size={16} /></MiniBtn>
            <MiniBtn label="Poista pysyvästi" danger onClick={() => remove(which, it.id)}><X size={16} /></MiniBtn>
          </div>
        ))}
        <div style={{ fontSize: 11.5, color: C.inkFaint, padding: "8px 6px 2px", lineHeight: 1.4 }}>
          Arkistoidut eivät näy Tänään-listalla, mutta historia ja porautumiset säilyvät. Poisto on pysyvä.
        </div>
      </Card>
    </>
  );
}

function AddRow({ value, setValue, placeholder, onAdd }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
      <input value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onAdd()} placeholder={placeholder}
        style={{ flex: 1, minWidth: 0, border: `1px solid ${C.line}`, borderRadius: 10, background: C.surface, fontSize: 15, padding: "10px 12px", color: C.ink, outline: "none" }} />
      <button className="tap" onClick={onAdd} aria-label="Lisää"
        style={{ flex: "0 0 auto", width: 42, height: 42, borderRadius: 10, background: C.pine, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Plus size={20} color="#fff" strokeWidth={2.5} />
      </button>
    </div>
  );
}
function ResetBtn({ onClick }) {
  return (
    <button className="tap" onClick={onClick}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, margin: "8px 2px 0", fontSize: 13, fontWeight: 600, color: C.inkSoft }}>
      <RotateCcw size={14} /> Palauta oletukset
    </button>
  );
}

/* ================================================================== */
/*  EXPORT MODAL                                                       */
/* ================================================================== */
function ExportModal({ exercises, symptoms, logs, marks, onClose }) {
  const [fmt, setFmt] = useState("csv");
  const [msg, setMsg] = useState("");
  const taRef = useRef(null);
  const count = Object.keys(logs).length;
  const text = useMemo(
    () => (fmt === "csv" ? buildCSV(exercises, symptoms, logs, marks) : buildJSON(exercises, symptoms, logs, marks)),
    [fmt, exercises, symptoms, logs, marks]
  );
  const filename = `liikepaivakirja-${keyOf(startOfToday())}.${fmt}`;

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const doCopy = async () => {
    let ok = await copyText(text);
    if (!ok && taRef.current) {
      try {
        taRef.current.focus();
        taRef.current.select();
        ok = document.execCommand("copy");
      } catch {
        /* ignore */
      }
    }
    setMsg(ok ? "Kopioitu leikepöydälle." : "Valitse teksti alta ja kopioi käsin.");
  };
  const doDownload = () => {
    const ok = download(filename, text, fmt === "csv" ? "text/csv" : "application/json");
    setMsg(ok ? `Ladattu: ${filename}` : "Lataus estetty tässä näkymässä — käytä Kopioi.");
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(22,36,31,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 12, zIndex: 50 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Vie tiedot"
        style={{ background: C.surface, borderRadius: 18, width: "100%", maxWidth: 520, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 12px" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Vie tiedot</h2>
          <IconBtn label="Sulje" onClick={onClose}><X size={18} /></IconBtn>
        </div>

        <div style={{ padding: "0 16px 16px", overflowY: "auto" }}>
          {/* format toggle */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, background: C.surfaceSoft, border: `1px solid ${C.line}`, borderRadius: 12, padding: 4 }}>
            {[["csv", "CSV (taulukko)"], ["json", "JSON (varmuuskopio)"]].map(([id, label]) => (
              <button key={id} className="tap" onClick={() => { setFmt(id); setMsg(""); }}
                style={{ padding: "9px 0", borderRadius: 9, fontSize: 13.5, fontWeight: 600, color: fmt === id ? "#fff" : C.inkSoft, background: fmt === id ? C.pine : "transparent" }}>
                {label}
              </button>
            ))}
          </div>

          <p style={{ fontSize: 12.5, color: C.inkSoft, margin: "10px 2px", lineHeight: 1.5 }}>
            {fmt === "csv"
              ? "Avautuu Excelissä tai Google Sheetsissä. Sopii lähetettäväksi fyssarille."
              : "Sisältää kaikki liikkeet, oireet ja merkinnät kokonaisuudessaan varmuuskopiota varten."}
            {count === 0 && " (Ei vielä merkintöjä — tiedostoon tulee vain otsikot.)"}
          </p>

          <textarea
            ref={taRef}
            readOnly
            value={text}
            onFocus={(e) => e.target.select()}
            style={{ width: "100%", height: 190, resize: "vertical", border: `1px solid ${C.line}`, borderRadius: 12, padding: 12, fontSize: 12, lineHeight: 1.45, fontFamily: "ui-monospace, Menlo, Consolas, monospace", color: C.ink, background: C.surfaceSoft, outline: "none" }}
          />

          {msg && <div style={{ fontSize: 12.5, color: C.pineDeep, fontWeight: 600, marginTop: 8 }}>{msg}</div>}

          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button className="tap" onClick={doCopy}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px", borderRadius: 12, background: C.pine, color: "#fff", fontSize: 15, fontWeight: 600 }}>
              <Copy size={17} /> Kopioi
            </button>
            <button className="tap" onClick={doDownload}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px", borderRadius: 12, border: `1px solid ${C.pine}`, background: C.surface, color: C.pineDeep, fontSize: 15, fontWeight: 600 }}>
              <Download size={17} /> Lataa
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  IMPORT MODAL                                                       */
/* ================================================================== */
function ImportModal({ onApply, onUndo, canUndo, onClose }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || "");
      setText(content);
      const res = parseImport(content);
      if (res.ok) {
        setPreview(res);
        setError("");
      } else {
        setPreview(null);
        setError(res.error);
      }
    };
    reader.onerror = () => setError("Tiedoston luku epäonnistui. Liitä sisältö käsin alle.");
    reader.readAsText(f);
    e.target.value = "";
  };

  const onText = (v) => {
    setText(v);
    setPreview(null);
    setError("");
  };
  const check = () => {
    const res = parseImport(text);
    if (!res.ok) {
      setError(res.error);
      setPreview(null);
    } else {
      setError("");
      setPreview(res);
    }
  };
  const apply = async () => {
    if (!preview || saving) return;
    setSaving(true);
    try {
      await onApply(preview);
    } catch {
      /* ignore */
    }
    setSaving(false);
    setDone(true);
  };
  const undo = () => {
    onUndo && onUndo();
    onClose();
  };

  const outlineBtn = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: "11px",
    borderRadius: 12,
    border: `1px solid ${C.line}`,
    background: C.surface,
    color: C.ink,
    fontSize: 14.5,
    fontWeight: 600,
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(22,36,31,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 12, zIndex: 50 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Tuo tiedot"
        style={{ background: C.surface, borderRadius: 18, width: "100%", maxWidth: 520, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 12px" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Tuo tiedot</h2>
          <IconBtn label="Sulje" onClick={onClose}><X size={18} /></IconBtn>
        </div>

        <div style={{ padding: "0 16px 16px", overflowY: "auto" }}>
          {done ? (
            <div style={{ padding: "6px 2px 4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, color: C.pineDeep }}>
                <Check size={18} /> Tiedot tuotu ja tallennettu.
              </div>
              <p style={{ fontSize: 12.5, color: C.inkSoft, margin: "8px 2px 0", lineHeight: 1.5 }}>
                Väärä tiedosto? Voit kumota tuonnin ja palauttaa edelliset tiedot.
              </p>
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button className="tap" onClick={undo}
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px", borderRadius: 12, border: `1px solid ${C.amberLine}`, background: C.amberTint, color: C.amber, fontSize: 15, fontWeight: 600 }}>
                  <RotateCcw size={16} /> Kumoa tuonti
                </button>
                <button className="tap" onClick={onClose}
                  style={{ flex: 1, padding: "12px", borderRadius: 12, background: C.pine, color: "#fff", fontSize: 15, fontWeight: 600 }}>
                  Valmis
                </button>
              </div>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 12.5, color: C.inkSoft, margin: "0 2px 12px", lineHeight: 1.5 }}>
                Liitä aiemmin viedyn <b>JSON</b>-tiedoston sisältö alle tai valitse tiedosto. Tuonti korvaa nykyiset liikkeet, oireet ja merkinnät.
              </p>

              {canUndo && (
                <button className="tap" onClick={undo}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", marginBottom: 10, padding: "11px", borderRadius: 12, border: `1px solid ${C.amberLine}`, background: C.amberTint, color: C.amber, fontSize: 14, fontWeight: 600 }}>
                  <RotateCcw size={16} /> Palauta edellistä tuontia edeltäneet tiedot
                </button>
              )}

              <input type="file" accept=".json,application/json" ref={fileRef} onChange={onFile} style={{ display: "none" }} />
              <button className="tap" onClick={() => fileRef.current && fileRef.current.click()} style={{ ...outlineBtn, width: "100%", marginBottom: 10 }}>
                <Upload size={17} /> Valitse tiedosto
              </button>

              <textarea
                value={text}
                onChange={(e) => onText(e.target.value)}
                placeholder='Liitä JSON tähän… esim. {"app":"Liikepäiväkirja", ...}'
                style={{ width: "100%", height: 150, resize: "vertical", border: `1px solid ${C.line}`, borderRadius: 12, padding: 12, fontSize: 12, lineHeight: 1.45, fontFamily: "ui-monospace, Menlo, Consolas, monospace", color: C.ink, background: C.surfaceSoft, outline: "none" }}
              />

              {error && (
                <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: C.amber, background: C.amberTint, border: `1px solid ${C.amberLine}`, borderRadius: 10, padding: "10px 12px" }}>
                  {error}
                </div>
              )}

              {preview ? (
                <div style={{ marginTop: 12, background: C.surfaceSoft, border: `1px solid ${C.line}`, borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.5 }}>
                    Löytyi <b>{preview.counts.ex}</b> liikettä, <b>{preview.counts.sy}</b> oiretta, <b>{preview.counts.days}</b> päivän merkinnät ja <b>{preview.counts.marks}</b> merkkipaalua.
                  </div>
                  <div style={{ fontSize: 12.5, color: C.amber, fontWeight: 600, marginTop: 6 }}>
                    Tämä korvaa kaikki nykyiset tiedot.
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                    <button className="tap" onClick={apply} disabled={saving}
                      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px", borderRadius: 12, background: C.amber, color: "#fff", fontSize: 15, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
                      {saving ? "Tallennetaan…" : "Korvaa tiedot"}
                    </button>
                    <button className="tap" onClick={() => setPreview(null)} disabled={saving} style={{ ...outlineBtn, flex: 1, opacity: saving ? 0.5 : 1 }}>
                      Takaisin
                    </button>
                  </div>
                </div>
              ) : (
                <button className="tap" onClick={check} disabled={!text.trim()}
                  style={{ width: "100%", marginTop: 12, padding: "12px", borderRadius: 12, background: text.trim() ? C.pine : C.line, color: text.trim() ? "#fff" : C.inkFaint, fontSize: 15, fontWeight: 600 }}>
                  Jatka
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Small shared pieces                                               */
/* ================================================================== */
function Card({ children, style }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: 16, marginBottom: 16, ...style }}>
      {children}
    </div>
  );
}
function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: C.inkSoft, fontWeight: 700, margin: "6px 2px 9px" }}>
      {children}
    </div>
  );
}
function Empty({ children }) {
  return <div style={{ padding: "16px 12px", color: C.inkFaint, fontSize: 14 }}>{children}</div>;
}
function Stat({ value, unit, label, accent }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 10px", textAlign: "center" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 3 }}>
        <span style={{ fontSize: 30, fontWeight: 300, color: accent, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{value}</span>
        <span style={{ fontSize: 12, color: C.inkFaint, fontWeight: 600 }}>{unit}</span>
      </div>
      <div style={{ marginTop: 6, fontSize: 11.5, color: C.inkSoft, fontWeight: 600 }}>{label}</div>
    </div>
  );
}
function IconBtn({ children, onClick, label, disabled }) {
  return (
    <button className="tap" onClick={onClick} disabled={disabled} aria-label={label}
      style={{ width: 42, height: 42, borderRadius: 12, border: `1px solid ${C.line}`, background: C.surface, display: "flex", alignItems: "center", justifyContent: "center", color: disabled ? C.inkFaint : C.ink, opacity: disabled ? 0.5 : 1 }}>
      {children}
    </button>
  );
}
function MiniBtn({ children, onClick, label, disabled, danger }) {
  return (
    <button className="tap" onClick={onClick} disabled={disabled} aria-label={label}
      style={{ width: 34, height: 34, flex: "0 0 auto", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", color: disabled ? C.inkFaint : danger ? C.amber : C.inkSoft, opacity: disabled ? 0.4 : 1, background: "transparent" }}>
      {children}
    </button>
  );
}
function NumField({ label, value, onChange, placeholder, exId, onDoseFocus, onDoseBlur }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 10.5, letterSpacing: "0.04em", color: C.inkFaint, fontWeight: 700, textTransform: "uppercase" }}>{label}</span>
      <input
        value={value == null ? "" : value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={exId && onDoseFocus ? () => onDoseFocus(exId) : undefined}
        onBlur={exId && onDoseBlur ? () => onDoseBlur(exId) : undefined}
        data-dose-ex={exId || undefined}
        inputMode="numeric"
        placeholder={placeholder}
        style={{ width: 54, textAlign: "center", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 6px", fontSize: 15, background: C.surface, color: C.ink, outline: "none" }}
      />
    </label>
  );
}


/* ================================================================== */
/*  STEP IMPORT MODAL                                                  */
/* ================================================================== */
function StepsModal({ onApply, onClose }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [showHow, setShowHow] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const check = (raw) => {
    const r = parseSteps(raw);
    if (r.ok) {
      setPreview(r);
      setError("");
    } else {
      setPreview(null);
      setError(r.error);
    }
  };
  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const c = String(reader.result || "");
      setText(c);
      check(c);
    };
    reader.onerror = () => setError("Tiedoston luku epäonnistui. Liitä sisältö käsin.");
    reader.readAsText(f);
    e.target.value = "";
  };
  const apply = async () => {
    if (!preview || saving) return;
    setSaving(true);
    let n = 0;
    try {
      n = await onApply(preview.rows);
    } catch {
      /* ignore */
    }
    setSaving(false);
    setResult({ changed: n, total: preview.rows.length });
  };

  const outlineBtn = { display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "11px", borderRadius: 12, border: `1px solid ${C.line}`, background: C.surface, color: C.ink, fontSize: 14.5, fontWeight: 600 };

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(22,36,31,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 12, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Tuo askeleet"
        style={{ background: C.surface, borderRadius: 18, width: "100%", maxWidth: 520, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 10px" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Tuo askeleet</h2>
          <IconBtn label="Sulje" onClick={onClose}><X size={18} /></IconBtn>
        </div>

        <div style={{ padding: "0 16px 16px", overflowY: "auto" }}>
          {result ? (
            <div style={{ padding: "6px 2px 4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, color: C.pineDeep }}>
                <Check size={18} /> {result.changed} päivää päivitetty ({result.total} luettu).
              </div>
              <p style={{ fontSize: 12.5, color: C.inkSoft, margin: "8px 2px 0", lineHeight: 1.5 }}>
                Liikkeisiin, oireisiin tai muistiinpanoihin ei koskettu. Voit ajaa tuonnin uudelleen milloin vain.
              </p>
              <button className="tap" onClick={onClose}
                style={{ width: "100%", marginTop: 14, padding: "12px", borderRadius: 12, background: C.pine, color: "#fff", fontSize: 15, fontWeight: 600 }}>
                Valmis
              </button>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 12.5, color: C.inkSoft, margin: "0 2px 10px", lineHeight: 1.5 }}>
                Liitä Terveys-datasta viety lista tai valitse tiedosto. Tuonti <b>yhdistää</b> askeleet päiviin eikä muuta muita tietoja.
              </p>

              <button className="tap" onClick={() => setShowHow((v) => !v)}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.inkSoft, marginBottom: 8 }}>
                <HelpCircle size={14} /> Miten saan askeleet iPhonesta?
              </button>
              {showHow && (
                <div style={{ background: C.surfaceSoft, border: `1px solid ${C.line}`, borderRadius: 12, padding: 12, marginBottom: 10, fontSize: 12.5, color: C.ink, lineHeight: 1.55 }}>
                  <b>Pikakomennot-sovelluksella (ei lisäsovelluksia):</b>
                  <div style={{ marginTop: 6 }}>
                    1. Uusi pikakomento → <i>Find All Health Samples Where</i> → tyyppi <i>Steps</i>, rajaa päivämäärillä.<br />
                    2. <i>Calculate Statistics</i> → <i>Sum</i>.<br />
                    3. <i>Text</i>-toiminto, johon kirjoitat rivin <code>2026-07-20;[summa]</code> — tai toista päiväsilmukassa.<br />
                    4. <i>Copy to Clipboard</i> ja liitä tähän.
                  </div>
                  <div style={{ marginTop: 8, color: C.inkSoft }}>
                    Puhelimen täytyy olla lukitsematon kun komento ajetaan, muuten terveysdataan ei pääse. Myös Terveys-dataa JSONiksi vievät apusovellukset kelpaavat — jäsennin tunnistaa yleisimmät muodot.
                  </div>
                  <div style={{ marginTop: 8, color: C.inkSoft }}>
                    Hyväksytyt muodot: <code>[{"{"}"date":"2026-07-20","steps":8432{"}"}]</code>, <code>{"{"}"2026-07-20":8432{"}"}</code> tai rivit <code>2026-07-20;8432</code>.
                  </div>
                </div>
              )}

              <input type="file" accept=".json,.csv,.txt,text/plain,application/json" ref={fileRef} onChange={onFile} style={{ display: "none" }} />
              <button className="tap" onClick={() => fileRef.current && fileRef.current.click()} style={{ ...outlineBtn, width: "100%", marginBottom: 10 }}>
                <Upload size={17} /> Valitse tiedosto
              </button>

              <textarea
                value={text}
                onChange={(e) => { setText(e.target.value); setPreview(null); setError(""); }}
                placeholder={'2026-07-20;8432\n2026-07-21;10250'}
                style={{ width: "100%", height: 130, resize: "vertical", border: `1px solid ${C.line}`, borderRadius: 12, padding: 12, fontSize: 12.5, lineHeight: 1.45, fontFamily: "ui-monospace, Menlo, Consolas, monospace", color: C.ink, background: C.surfaceSoft, outline: "none" }}
              />

              {error && (
                <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: C.amber, background: C.amberTint, border: `1px solid ${C.amberLine}`, borderRadius: 10, padding: "10px 12px" }}>
                  {error}
                </div>
              )}

              {preview ? (
                <div style={{ marginTop: 12, background: C.surfaceSoft, border: `1px solid ${C.line}`, borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.5 }}>
                    Löytyi <b>{preview.rows.length}</b> päivää: {humanDate(preview.from)} – {humanDate(preview.to)}.
                  </div>
                  <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 4 }}>
                    Keskimäärin {Math.round(preview.rows.reduce((a, b) => a + b.steps, 0) / preview.rows.length).toLocaleString("fi-FI")} askelta/pv.
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                    <button className="tap" onClick={apply} disabled={saving}
                      style={{ flex: 1, padding: "12px", borderRadius: 12, background: C.pine, color: "#fff", fontSize: 15, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
                      {saving ? "Tallennetaan…" : "Yhdistä askeleet"}
                    </button>
                    <button className="tap" onClick={() => setPreview(null)} disabled={saving} style={{ ...outlineBtn, flex: 1 }}>
                      Takaisin
                    </button>
                  </div>
                </div>
              ) : (
                <button className="tap" onClick={() => check(text)} disabled={!text.trim()}
                  style={{ width: "100%", marginTop: 12, padding: "12px", borderRadius: 12, background: text.trim() ? C.pine : C.line, color: text.trim() ? "#fff" : C.inkFaint, fontSize: 15, fontWeight: 600 }}>
                  Jatka
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  LIBRARY                                                            */
/* ================================================================== */
function SourceBadge({ source, compact }) {
  const meta = SOURCES[source.src];
  if (!meta) return null;
  const measured = source.src === "boren2011";
  const estimate = source.src === "estimate";
  const c = source.edited ? C.inkSoft : measured ? C.pineDeep : estimate ? C.amber : C.slate;
  const bg = source.edited ? C.surfaceSoft : measured ? C.pineTint : estimate ? C.amberTint : C.slateTint;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: c, background: bg, borderRadius: 999, padding: "2px 8px" }}>
        {source.edited ? "Muokattu" : meta.tag}
      </span>
      {!compact && source.note && <span style={{ fontSize: 11.5, color: C.inkFaint }}>{source.note}</span>}
    </div>
  );
}

function LibraryModal({ existing, onAdd, onClose }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [picked, setPicked] = useState([]);
  const [showSources, setShowSources] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const have = useMemo(() => new Set(existing.map((e) => e.name.toLowerCase())), [existing]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return LIBRARY.filter((e) => {
      if (cat !== "all" && e.cat !== cat) return false;
      if (!needle) return true;
      return (
        e.name.toLowerCase().includes(needle) ||
        Object.keys(e.muscles).some((id) => regionName(id).toLowerCase().includes(needle)) ||
        (e.structures || []).some((id) => structName(id).toLowerCase().includes(needle))
      );
    }).sort((a, b) => (SRC_ORDER[a.src] - SRC_ORDER[b.src]) || a.name.localeCompare(b.name, "fi"));
  }, [q, cat]);

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const commit = () => {
    onAdd(picked);
    onClose();
  };

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(22,36,31,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 12, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Liikekirjasto"
        style={{ background: C.surface, borderRadius: 18, width: "100%", maxWidth: 520, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 8px" }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.inkFaint, fontWeight: 700 }}>Kirjasto</div>
            <h2 style={{ margin: "2px 0 0", fontSize: 17, fontWeight: 600 }}>{LIBRARY.length} liikettä</h2>
          </div>
          <IconBtn label="Sulje" onClick={onClose}><X size={18} /></IconBtn>
        </div>

        <div style={{ padding: "0 16px", flex: 1, overflowY: "auto" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hae liikettä tai lihasryhmää…"
            style={{ width: "100%", border: `1px solid ${C.line}`, borderRadius: 11, background: C.surfaceSoft, fontSize: 15, padding: "11px 12px", color: C.ink, outline: "none" }} />
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", margin: "8px 0" }}>
            <button className="tap" onClick={() => setCat("all")}
              style={{ fontSize: 12, fontWeight: 600, padding: "6px 11px", borderRadius: 999, border: `1px solid ${cat === "all" ? C.pine : C.line}`, background: cat === "all" ? C.pine : C.surface, color: cat === "all" ? "#fff" : C.inkSoft }}>
              Kaikki
            </button>
            {LIB_CATS.map((c) => (
              <button key={c.id} className="tap" onClick={() => setCat(c.id)}
                style={{ fontSize: 12, fontWeight: 600, padding: "6px 11px", borderRadius: 999, border: `1px solid ${cat === c.id ? C.pine : C.line}`, background: cat === c.id ? C.pine : C.surface, color: cat === c.id ? "#fff" : C.inkSoft }}>
                {c.label}
              </button>
            ))}
          </div>

          <button className="tap" onClick={() => setShowSources((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.inkSoft, marginBottom: 8 }}>
            <HelpCircle size={14} /> Mihin kuormitusarvot perustuvat?
          </button>
          {showSources && (
            <div style={{ background: C.surfaceSoft, border: `1px solid ${C.line}`, borderRadius: 12, padding: 12, marginBottom: 10 }}>
              <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.5, marginBottom: 8 }}>{SCALE_NOTE}</div>
              {Object.keys(SOURCES).map((k) => (
                <div key={k} style={{ marginTop: 8 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: C.slate }}>{SOURCES[k].tag}</span>
                  <div style={{ fontSize: 12, color: C.inkSoft, lineHeight: 1.5 }}>{SOURCES[k].text}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
            {rows.length === 0 && <Empty>Ei osumia haulla.</Empty>}
            {rows.map((e, i) => {
              const sel = picked.includes(e.id);
              const dup = have.has(e.name.toLowerCase());
              return (
                <button key={e.id} className="tap" onClick={() => toggle(e.id)}
                  style={{ display: "flex", alignItems: "flex-start", gap: 10, width: "100%", textAlign: "left", padding: "11px 12px", borderTop: i === 0 ? "none" : `1px solid ${C.line}`, background: sel ? C.pineTint : C.surface }}>
                  <span style={{ flex: "0 0 auto", marginTop: 2, width: 20, height: 20, borderRadius: 6, border: sel ? "none" : `2px solid ${C.line}`, background: sel ? C.pine : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {sel && <Check size={13} color="#fff" strokeWidth={3} />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: C.ink }}>
                      {e.name}
                      {dup && <span style={{ fontSize: 11, color: C.inkFaint, fontWeight: 500 }}> · jo listalla</span>}
                    </span>
                    <span style={{ display: "block", fontSize: 12, color: C.inkFaint, marginTop: 2 }}>
                      {typeLabel(e.type)}
                      {e.unit === "min" ? ` · ${e.met} MET` : ""}
                      {" · "}
                      {Object.keys(e.muscles).sort((a, b) => e.muscles[a] - e.muscles[b]).slice(0, 3).map((id) => regionName(id)).join(", ")}
                    </span>
                    <SourceBadge source={{ src: e.src, note: e.note }} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ padding: "10px 16px 16px", borderTop: `1px solid ${C.line}`, background: C.surface }}>
          <button className="tap" onClick={commit} disabled={picked.length === 0}
            style={{ width: "100%", padding: "13px", borderRadius: 12, background: picked.length ? C.pine : C.line, color: picked.length ? "#fff" : C.inkFaint, fontSize: 15, fontWeight: 600 }}>
            {picked.length ? `Lisää valitut (${picked.length})` : "Valitse liikkeitä"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  BODY MAP                                                           */
/* ================================================================== */
function Prim({ s, ...rest }) {
  if (s.t === "rect") return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r} {...rest} />;
  if (s.t === "ellipse") return <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} {...rest} />;
  return <polygon points={s.p.map(([x, y]) => `${x},${y}`).join(" ")} {...rest} />;
}
const MIRROR = "translate(200,0) scale(-1,1)";

/* fillOf(regionId, side) → colour; strokeOf → {c,w} | null; onTap(regionId, side) */
function BodyMap({ view, fillOf, strokeOf, onTap, hatchIds, structures }) {
  const halves = [];
  regionsOfView(view).forEach((r) => {
    if (r.m) {
      halves.push({ r, mirrored: false, side: sideOfHalf(view, false) });
      halves.push({ r, mirrored: true, side: sideOfHalf(view, true) });
    } else {
      halves.push({ r, mirrored: false, side: null });
    }
  });
  return (
    <svg viewBox="0 0 200 340" style={{ width: "100%", height: "auto", display: "block", maxHeight: "56vh" }}
      role="img" aria-label={view === "front" ? "Kehokartta, etupuoli" : "Kehokartta, takapuoli"}>
      <defs>
        <pattern id="ptf-hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill={C.surfaceSoft} />
          <line x1="0" y1="0" x2="0" y2="6" stroke={C.line} strokeWidth="2.5" />
        </pattern>
      </defs>
      {/* silhouette */}
      {SILHOUETTE.map((s, i) => (
        <g key={`sil${i}`}>
          <Prim s={s} fill={C.surfaceSoft} stroke={C.line} strokeWidth="1" />
          {s.m && (
            <g transform={MIRROR}>
              <Prim s={s} fill={C.surfaceSoft} stroke={C.line} strokeWidth="1" />
            </g>
          )}
        </g>
      ))}
      {/* regions */}
      {halves.map(({ r, mirrored, side }, i) => {
        const st = strokeOf ? strokeOf(r.id, side) : null;
        const hatched = hatchIds && hatchIds.has(r.id);
        const body = (
          <Prim
            s={r.s}
            fill={hatched ? "url(#ptf-hatch)" : fillOf(r.id, side)}
            stroke={st ? st.c : C.line}
            strokeWidth={st ? st.w : 0.8}
            style={onTap ? { cursor: "pointer" } : undefined}
            onClick={onTap ? () => onTap(r.id, side) : undefined}
          />
        );
        return (
          <g key={`${r.id}${i}`}>{mirrored ? <g transform={MIRROR}>{body}</g> : body}</g>
        );
      })}
      {/* structures: nerves as lines, joints as rings */}
      {structures && structures.show &&
        structuresOfView(view).flatMap((st) => {
          const mirs = st.m ? [false, true] : [false];
          return mirs.map((mir) => {
            const side = st.m ? sideOfHalf(view, mir) : null;
            const sty = structures.styleOf(st.id, side);
            if (!sty) return null;
            const tap = structures.onTap ? () => structures.onTap(st.id, side) : undefined;
            const node =
              st.kind === "nerve" ? (
                <>
                  <polyline points={st.p.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke={sty.c}
                    strokeWidth={sty.w} strokeDasharray={sty.dash} strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points={st.p.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="transparent"
                    strokeWidth="14" style={tap ? { cursor: "pointer" } : undefined} onClick={tap} />
                </>
              ) : (
                <>
                  <circle cx={st.c.cx} cy={st.c.cy} r={sty.r} fill={C.surface} fillOpacity="0.55" stroke={sty.c}
                    strokeWidth={sty.w} strokeDasharray={sty.dash} />
                  <circle cx={st.c.cx} cy={st.c.cy} r="13" fill="transparent"
                    style={tap ? { cursor: "pointer" } : undefined} onClick={tap} />
                </>
              );
            return (
              <g key={`${st.id}${mir ? "m" : ""}`}>{mir ? <g transform={MIRROR}>{node}</g> : node}</g>
            );
          });
        })}
      {/* side legend (front view is mirrored relative to the viewer) */}
      <text x="16" y="20" style={{ fontSize: 11, fontWeight: 700, fill: C.inkFaint }}>
        {view === "front" ? "O" : "V"}
      </text>
      <text x="178" y="20" style={{ fontSize: 11, fontWeight: 700, fill: C.inkFaint }}>
        {view === "front" ? "V" : "O"}
      </text>
    </svg>
  );
}

function ViewToggle({ view, setView }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, background: C.surfaceSoft, border: `1px solid ${C.line}`, borderRadius: 11, padding: 4 }}>
      {[["front", "Edestä"], ["back", "Takaa"]].map(([id, label]) => (
        <button key={id} className="tap" onClick={() => setView(id)}
          style={{ padding: "8px 0", borderRadius: 8, fontSize: 13.5, fontWeight: 600, color: view === id ? "#fff" : C.inkSoft, background: view === id ? C.pine : "transparent" }}>
          {label}
        </button>
      ))}
    </div>
  );
}

/* ---- picker: intensities for an exercise, sides for a symptom ---- */
function RegionPicker({ kind, title, valueMap, structMap, onTap, onTapStruct, onClose }) {
  const [view, setView] = useState("back");
  const [layer, setLayer] = useState("muscles"); // muscles | structures
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const structOn = (id) => (kind === "ex" ? (structMap || []).includes(id) : (structMap || {})[id]);

  const fillOf = (id, side) => {
    if (layer === "structures") return C.surfaceSoft;
    const v = valueMap[id];
    if (!v) return C.surface;
    if (kind === "ex") return mixHex(C.pineTint, C.pineDeep, v === 1 ? 1 : v === 2 ? 0.6 : 0.3);
    if (v === "B" || v === side) return C.amber;
    return C.surface;
  };
  const strokeOf = (id) => {
    if (layer === "structures") return null;
    return valueMap[id] ? { c: kind === "ex" ? C.pineDeep : C.amber, w: 1.4 } : null;
  };
  const structStyle = (id, side) => {
    const v = structOn(id);
    const active = kind === "ex" ? !!v : v === "B" || v === side;
    const dim = layer === "muscles";
    const c = active ? (kind === "ex" ? C.slate : C.amber) : dim ? C.slateTint : C.slateSoft;
    return { c, w: active ? 3.4 : 2, r: active ? 8 : 6, dash: active ? undefined : "3 3" };
  };

  const rows = layer === "muscles" ? regionsOfView(view) : structuresOfView(view);
  const tapRow = (id) => (layer === "muscles" ? onTap(id, kind === "sy" ? "L" : null) : onTapStruct(id, kind === "sy" ? "L" : null));

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(22,36,31,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 12, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={kind === "ex" ? "Valitse kohdealueet" : "Valitse sijainti"}
        style={{ background: C.surface, borderRadius: 18, width: "100%", maxWidth: 520, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 8px" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.inkFaint, fontWeight: 700 }}>
              {kind === "ex" ? "Kohdealueet" : "Oireen sijainti"}
            </div>
            <h2 style={{ margin: "2px 0 0", fontSize: 17, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</h2>
          </div>
          <IconBtn label="Sulje" onClick={onClose}><X size={18} /></IconBtn>
        </div>

        <div style={{ padding: "0 16px 16px", overflowY: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, background: C.surfaceSoft, border: `1px solid ${C.line}`, borderRadius: 11, padding: 4, marginBottom: 8 }}>
            {[["muscles", "Lihakset"], ["structures", "Hermot & nivelet"]].map(([id, label]) => (
              <button key={id} className="tap" onClick={() => setLayer(id)}
                style={{ padding: "8px 0", borderRadius: 8, fontSize: 13, fontWeight: 600, color: layer === id ? "#fff" : C.inkSoft, background: layer === id ? (id === "muscles" ? C.pine : C.slate) : "transparent" }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: C.inkSoft, margin: "0 2px 10px", lineHeight: 1.5 }}>
            {layer === "muscles"
              ? kind === "ex"
                ? "Napauta aluetta: pää → sivu → kevyt → pois. Sama liike voi kuormittaa useaa ryhmää eri voimakkuudella."
                : "Napauta puolta, jossa vaiva tuntuu. V = vasen, O = oikea."
              : kind === "ex"
              ? "Valitse mobilisoitavat hermot ja nivelet. Nämä eivät tuota lihaskuormaa, vaan kirjautuvat altistuksena."
              : "Säteilevä tai puutuva oire kannattaa kiinnittää hermoon, ei lihakseen. Nivelvaiva niveleen."}
          </div>
          <ViewToggle view={view} setView={setView} />
          <div style={{ marginTop: 8 }}>
            <BodyMap
              view={view}
              fillOf={fillOf}
              strokeOf={strokeOf}
              onTap={layer === "muscles" ? onTap : undefined}
              structures={{ show: true, styleOf: structStyle, onTap: layer === "structures" ? onTapStruct : undefined }}
            />
          </div>

          {/* precise list for this view + layer */}
          <div style={{ marginTop: 6, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
            {rows.length === 0 && <Empty>Ei kohteita tässä näkymässä.</Empty>}
            {rows.map((r, i) => {
              const v = layer === "muscles" ? valueMap[r.id] : structOn(r.id);
              const activeBg = layer === "muscles" ? (kind === "ex" ? C.pineTint : C.amberTint) : kind === "ex" ? C.slateTint : C.amberTint;
              const activeCol = layer === "muscles" ? (kind === "ex" ? C.pineDeep : C.amber) : kind === "ex" ? C.slate : C.amber;
              return (
                <button key={r.id} className="tap" onClick={() => tapRow(r.id)}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "10px 12px", borderTop: i === 0 ? "none" : `1px solid ${C.line}`, background: v ? activeBg : C.surface }}>
                  <span style={{ flex: 1, fontSize: 13.5, color: C.ink }}>
                    {r.name}
                    {layer === "structures" && <span style={{ color: C.inkFaint }}> · {r.kind === "nerve" ? "hermo" : "nivel"}</span>}
                  </span>
                  {v ? (
                    <span style={{ fontSize: 12, fontWeight: 700, color: activeCol }}>
                      {layer === "muscles"
                        ? kind === "ex"
                          ? INTENSITY[v].label
                          : SIDES[v]
                        : kind === "ex"
                        ? "valittu"
                        : SIDES[v]}
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: C.inkFaint }}>—</span>
                  )}
                </button>
              );
            })}
          </div>
          {kind === "sy" && (
            <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 8, lineHeight: 1.45 }}>
              Listasta napautus säätää vasenta puolta; oikean puolen saat kehokuvasta.
            </div>
          )}
          <button className="tap" onClick={onClose}
            style={{ width: "100%", marginTop: 12, padding: "12px", borderRadius: 12, background: C.pine, color: "#fff", fontSize: 15, fontWeight: 600 }}>
            Valmis
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- load distribution over a date range ---- */
function BodyLoadSection({ rangeDays, prevDays, logs, exercises, symptoms, rangeLabel, allowDelta }) {
  const [view, setView] = useState("back");
  const [typeFilter, setTypeFilter] = useState("all");
  const [mode, setMode] = useState("dist"); // dist | delta
  const [layer, setLayer] = useState("all"); // muscles | structures | all
  const [overlay, setOverlay] = useState(true);
  const [sel, setSel] = useState(null); // { t:'m'|'s', id }

  const exOf = useMemo(() => {
    const m = {};
    exercises.forEach((e) => (m[e.id] = e));
    return m;
  }, [exercises]);

  /* load per region = Σ (completed sets × intensity weight);
     exposure per structure = Σ sets (unweighted) + day count */
  const computeLoad = useCallback(
    (days) => {
      const out = {};
      const byEx = {};
      const exp = {};
      const expDays = {};
      const expByEx = {};
      days.forEach((d) => {
        const l = logs[keyOf(d)];
        if (!l) return;
        /* endurance is measured in MET-minutes, not sets — never summed with
           strength work; only shown when the endurance filter is selected */
        if (typeFilter === "endurance" && l.mins) {
          Object.keys(l.mins).forEach((exId) => {
            const ex = exOf[exId];
            if (!ex || !isMin(ex)) return;
            const mm = (l.mins[exId] || 0) * (ex.met || 1);
            if (mm <= 0) return;
            Object.keys(ex.muscles || {}).forEach((rid) => {
              const w = INTENSITY[ex.muscles[rid]].w;
              out[rid] = (out[rid] || 0) + mm * w;
              byEx[rid] = byEx[rid] || {};
              byEx[rid][exId] = (byEx[rid][exId] || 0) + mm * w;
            });
            (ex.structures || []).forEach((sid) => {
              exp[sid] = (exp[sid] || 0) + (l.mins[exId] || 0);
              expByEx[sid] = expByEx[sid] || {};
              expByEx[sid][exId] = (expByEx[sid][exId] || 0) + (l.mins[exId] || 0);
            });
          });
        }
        if (!l.sets) return;
        const seenToday = new Set();
        Object.keys(l.sets).forEach((exId) => {
          const ex = exOf[exId];
          if (!ex || isMin(ex)) return;
          if (typeFilter !== "all" && (ex.type || "strength") !== typeFilter) return;
          const sets = l.sets[exId] || 0;
          if (sets <= 0) return;
          Object.keys(ex.muscles || {}).forEach((rid) => {
            const w = INTENSITY[ex.muscles[rid]].w;
            out[rid] = (out[rid] || 0) + sets * w;
            byEx[rid] = byEx[rid] || {};
            byEx[rid][exId] = (byEx[rid][exId] || 0) + sets * w;
          });
          (ex.structures || []).forEach((sid) => {
            exp[sid] = (exp[sid] || 0) + sets;
            expByEx[sid] = expByEx[sid] || {};
            expByEx[sid][exId] = (expByEx[sid][exId] || 0) + sets;
            if (!seenToday.has(sid)) {
              seenToday.add(sid);
              expDays[sid] = (expDays[sid] || 0) + 1;
            }
          });
        });
      });
      return { out, byEx, exp, expDays, expByEx };
    },
    [logs, exOf, typeFilter]
  );

  const cur = useMemo(() => computeLoad(rangeDays), [computeLoad, rangeDays]);
  const prev = useMemo(() => (mode === "delta" && prevDays ? computeLoad(prevDays) : null), [computeLoad, prevDays, mode]);
  const maxLoad = useMemo(() => Math.max(0, ...Object.values(cur.out)), [cur]);

  /* regions no active exercise targets at all (programme blind spots) */
  const mappedIds = useMemo(() => {
    const s = new Set();
    exercises.forEach((e) => {
      if (e.archived) return;
      if (typeFilter !== "all" && (e.type || "strength") !== typeFilter) return;
      if (isMin(e) && typeFilter !== "endurance") return;
      Object.keys(e.muscles || {}).forEach((id) => s.add(id));
    });
    return s;
  }, [exercises, typeFilter]);
  const hatchIds = useMemo(() => {
    const s = new Set();
    REGIONS.forEach((r) => {
      if (!mappedIds.has(r.id)) s.add(r.id);
    });
    return s;
  }, [mappedIds]);

  /* symptom days per region+side */
  const symLoad = useMemo(() => {
    const out = {};
    rangeDays.forEach((d) => {
      const l = logs[keyOf(d)];
      if (!l || !l.flared || !l.flared.length) return;
      l.flared.forEach((sid) => {
        const sy = symptoms.find((s) => s.id === sid);
        if (!sy) return;
        const sev = (l.severity && l.severity[sid]) || 2;
        const add = (map, id, side) => {
          const keys = side === "B" ? [`${id}|L`, `${id}|R`] : [`${id}|${side}`];
          keys.forEach((k) => (map[k] = (map[k] || 0) + sev));
        };
        Object.keys(sy.regions || {}).forEach((rid) => add(out, rid, sy.regions[rid]));
        Object.keys(sy.structures || {}).forEach((stid) => add(out, stid, sy.structures[stid]));
      });
    });
    return out;
  }, [rangeDays, logs, symptoms]);
  const maxSym = useMemo(() => Math.max(0, ...Object.values(symLoad)), [symLoad]);
  const maxExp = useMemo(() => Math.max(0, ...Object.values(cur.exp)), [cur]);

  /* structures deliberately use a neutral scale: with nerves, more is not better */
  const structStyle = (id, side) => {
    if (layer === "muscles") return null;
    const e = cur.exp[id] || 0;
    const symV = side ? symLoad[`${id}|${side}`] || 0 : (symLoad[`${id}|L`] || 0) + (symLoad[`${id}|R`] || 0);
    const sym = overlay && symV > 0;
    const t = maxExp > 0 ? e / maxExp : 0;
    const c = sym ? C.amber : e > 0 ? mixHex(C.slateSoft, C.slate, t) : C.slateTint;
    return { c, w: e > 0 ? 2 + 2.6 * t : 1.6, r: e > 0 ? 6 + 3 * t : 5.5, dash: e > 0 ? undefined : "3 3" };
  };

  const fillOf = (id) => {
    if (layer === "structures") return C.surfaceSoft;
    if (mode === "delta" && prev) {
      const a = prev.out[id] || 0;
      const b = cur.out[id] || 0;
      if (a === 0 && b === 0) return C.surface;
      const denom = Math.max(a, b);
      const rel = (b - a) / denom; // -1..1
      if (Math.abs(rel) < 0.05) return C.surfaceSoft;
      return rel > 0 ? mixHex(C.pineTint, C.pineDeep, Math.min(1, rel)) : mixHex(C.amberTint, C.amber, Math.min(1, -rel));
    }
    const v = cur.out[id] || 0;
    if (v <= 0) return C.surface;
    return mixHex(C.pineTint, C.pineDeep, maxLoad > 0 ? v / maxLoad : 0);
  };
  const strokeOf = (id, side) => {
    if (!overlay || layer === "structures") return null;
    const v = side ? symLoad[`${id}|${side}`] || 0 : (symLoad[`${id}|L`] || 0) + (symLoad[`${id}|R`] || 0);
    if (v <= 0) return null;
    return { c: C.amber, w: 1.5 + 2 * (maxSym > 0 ? v / maxSym : 0) };
  };

  const selInfo = useMemo(() => {
    if (!sel) return null;
    const isM = sel.t === "m";
    const id = sel.id;
    const symNames = symptoms
      .filter((s) => (isM ? (s.regions || {})[id] : (s.structures || {})[id]))
      .map((s) => `${s.name} (${SIDES[isM ? s.regions[id] : s.structures[id]]})`);
    const symDays = (symLoad[`${id}|L`] || 0) + (symLoad[`${id}|R`] || 0);
    if (isM) {
      const load = cur.out[id] || 0;
      const contrib = Object.keys(cur.byEx[id] || {})
        .map((exId) => ({ name: exOf[exId] ? exOf[exId].name : "—", type: exOf[exId] ? typeLabel(exOf[exId].type) : "", v: cur.byEx[id][exId] }))
        .sort((a, b) => b.v - a.v);
      const share = maxLoad > 0 ? Math.round((load / maxLoad) * 100) : 0;
      return { isM, name: regionName(id), metric: `Kuormitus ${Math.round(load * 10) / 10} yks · ${share} % kuormittuneimmasta${mappedIds.has(id) ? "" : " · ei yhtään liikettä kohdistu tähän"}`, contrib, symNames, symDays };
    }
    const e = cur.exp[id] || 0;
    const days = cur.expDays[id] || 0;
    const st = STRUCT_BY_ID[id];
    const contrib = Object.keys(cur.expByEx[id] || {})
      .map((exId) => ({ name: exOf[exId] ? exOf[exId].name : "—", type: exOf[exId] ? typeLabel(exOf[exId].type) : "", v: cur.expByEx[id][exId] }))
      .sort((a, b) => b.v - a.v);
    return {
      isM,
      name: `${structName(id)} · ${st && st.kind === "nerve" ? "hermo" : "nivel"}`,
      metric: e > 0 ? `Altistus ${e} sarjaa · ${days} päivänä` : "Ei mobilisointia tällä välillä",
      contrib,
      symNames,
      symDays,
    };
  }, [sel, cur, exOf, symptoms, symLoad, maxLoad, mappedIds]);

  const chip = (active, label, onClick) => (
    <button key={label} className="tap" onClick={onClick}
      style={{ fontSize: 12, fontWeight: 600, padding: "6px 11px", borderRadius: 999, border: `1px solid ${active ? C.pine : C.line}`, background: active ? C.pine : C.surface, color: active ? "#fff" : C.inkSoft }}>
      {label}
    </button>
  );

  return (
    <>
      <SectionLabel>Kehokartta</SectionLabel>
      <div style={{ fontSize: 12.5, color: C.inkSoft, margin: "-4px 2px 8px", lineHeight: 1.5 }}>
        {typeFilter === "endurance"
          ? `Kestävyys (${rangeLabel}) omalla asteikollaan: MET-minuutit × painotus. Ei summata voimaharjoittelun kanssa, koska yksiköt eivät ole yhteismitallisia.`
          : `Kuormitus lihasryhmittäin (${rangeLabel}) = kuitatut sarjat × painotus (pää 1,0 / sivu 0,6 / kevyt 0,3). Viivoitus = mikään liike ei kohdistu tähän. Kestävyys näkyy omalla suodattimellaan.`}
      </div>
      <Card>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
          {chip(layer === "muscles", "Lihakset", () => setLayer("muscles"))}
          {chip(layer === "structures", "Hermot & nivelet", () => setLayer("structures"))}
          {chip(layer === "all", "Kaikki", () => setLayer("all"))}
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
          {chip(typeFilter === "all", "Kaikki tyypit", () => setTypeFilter("all"))}
          {EX_TYPES.map((t) => chip(typeFilter === t.id, t.label, () => setTypeFilter(t.id)))}
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
          {layer !== "structures" && chip(mode === "dist", "Jakauma", () => setMode("dist"))}
          {layer !== "structures" && allowDelta && chip(mode === "delta", "Muutos", () => setMode("delta"))}
          {chip(overlay, overlay ? "Oireet näkyvissä" : "Oireet piilossa", () => setOverlay((v) => !v))}
        </div>
        <ViewToggle view={view} setView={setView} />
        <div style={{ marginTop: 8 }}>
          <BodyMap
            view={view}
            fillOf={fillOf}
            strokeOf={strokeOf}
            onTap={layer === "structures" ? undefined : (id) => setSel({ t: "m", id })}
            hatchIds={mode === "dist" && layer !== "structures" ? hatchIds : null}
            structures={{ show: layer !== "muscles", styleOf: structStyle, onTap: (id) => setSel({ t: "s", id }) }}
          />
        </div>

        {/* legend */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 11.5, color: C.inkSoft, marginTop: 6 }}>
          {layer !== "structures" && mode === "delta" ? (
            <>
              <LegendSwatch c={C.pineDeep} label="nousi" />
              <LegendSwatch c={C.amber} label="laski" />
              <LegendSwatch c={C.surfaceSoft} label="ennallaan" />
            </>
          ) : layer !== "structures" ? (
            <>
              <LegendSwatch c={C.pineTint} label="vähän" />
              <LegendSwatch c={C.pineDeep} label="paljon" />
              <LegendSwatch c={C.surface} label="ei kuormaa" />
            </>
          ) : null}
          {layer !== "muscles" && <LegendSwatch c={C.surface} border={C.slate} label="mobilisoitu" />}
          {overlay && <LegendSwatch c={C.surface} border={C.amber} label="oire" />}
        </div>
        {layer !== "muscles" && (
          <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 8, lineHeight: 1.45 }}>
            Hermoilla ja nivelillä altistus on neutraali mittari, ei tavoite: enemmän ei ole parempi, ja liika provosoi. Vertaa altistusta oireeseen.
          </div>
        )}

        {selInfo && (
          <div style={{ marginTop: 12, background: C.surfaceSoft, border: `1px solid ${C.line}`, borderRadius: 12, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>{selInfo.name}</span>
              <button className="tap" aria-label="Sulje" onClick={() => setSel(null)} style={{ color: C.inkFaint, display: "flex" }}><X size={15} /></button>
            </div>
            <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 4 }}>{selInfo.metric}</div>
            {selInfo.contrib.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {selInfo.contrib.map((c) => (
                  <div key={c.name} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, padding: "3px 0", color: C.ink }}>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name} <span style={{ color: C.inkFaint }}>· {c.type}</span></span>
                    <span style={{ fontWeight: 600, color: C.inkSoft }}>{Math.round(c.v * 10) / 10}</span>
                  </div>
                ))}
              </div>
            )}
            {selInfo.symNames.length > 0 && (
              <div style={{ fontSize: 12.5, color: C.amber, fontWeight: 600, marginTop: 8 }}>
                Oire tällä kohteella: {selInfo.symNames.join(", ")}
                {selInfo.symDays > 0 ? ` · oirekuorma ${selInfo.symDays}` : " · ei esiintymiä tällä välillä"}
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  );
}

function LegendSwatch({ c, border, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 12, height: 12, borderRadius: 3, background: c, border: `1.5px solid ${border || C.line}` }} />
      {label}
    </span>
  );
}

function Style() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
        .ptf, .ptf * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        .ptf button { font: inherit; color: inherit; cursor: pointer; border: none; background: none; }
        .ptf button:disabled { cursor: default; }
        .ptf input, .ptf textarea { font: inherit; }
        .ptf *:focus { outline: none; }
        .ptf *:focus-visible { outline: 2px solid ${C.pine}; outline-offset: 2px; border-radius: 8px; }
        .ptf .tap:not(:disabled):active { transform: scale(0.98); }
        .ptf textarea::placeholder, .ptf input::placeholder { color: ${C.inkFaint}; }
        @keyframes ptf-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .ptf .rise { animation: ptf-rise .35s ease both; }
        @media (prefers-reduced-motion: reduce) {
          .ptf *, .ptf .rise { animation: none !important; transition: none !important; }
        }
      `,
      }}
    />
  );
}
