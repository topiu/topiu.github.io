/* domain/templates — ready-made programmes ("pohjat").
 *
 * The heavy part of this app was never daily use; it was the first setup:
 * deleting the example programme, finding exercises in a 155-item library and
 * typing a target for nearly every one. A template is the whole of that in one
 * tap — exercises from the library with a starting target, a weekly frequency
 * and, where it helps, the equipment — after which everything stays editable.
 *
 * The targets are typical starting values, not prescriptions, and the UI says
 * so. Where a physiotherapist or coach gave a programme, theirs wins.
 *
 * Applying is pure and has two modes:
 *   replace — only offered while the diary is empty (first run): the template
 *             becomes the programme, symptoms included.
 *   merge   — any time, from Muokkaa: adds what is missing, matched by name,
 *             and never touches an existing exercise or its history.
 */

import { EMPTY_DOSE } from "./dose";
import { FREQ_DAILY } from "./freq";
import { EQUIP_IDS } from "./gym";
import { LIB_BY_ID } from "./library";
import { uid } from "./num";
import { mergeExercises } from "./programtext";

type Dose = { sets?: number | null; reps?: number | null; hold?: number | null; min?: number | null };
export type TemplateItem = { lib: string; dose: Dose; freq?: number; equip?: string; name?: string };
export type Template = {
  id: string;
  name: string;
  /* the group label its exercises get; merges with an existing group of the same name */
  group?: string;
  blurb: string;
  items: TemplateItem[];
  symptoms: { name: string; regions?: Record<string, string>; structures?: Record<string, string> }[];
};

const reps = (sets, r, freq = 3, extra = {}) => ({ dose: { sets, reps: r }, freq, ...extra });
const hold = (sets, s, freq = 3, extra = {}) => ({ dose: { sets, hold: s }, freq, ...extra });
const mins = (m, freq = 3) => ({ dose: { min: m }, freq });

export const TEMPLATES: Template[] = [
  {
    id: "hip",
    group: "Lonkka ja nivunen",
    name: "Lonkka ja nivunen",
    blurb: "Kuntoutus: pakaran ja lähentäjien vahvistus, keskivartalo, venyttely.",
    items: [
      { lib: "sidelying_abduction", ...reps(3, 12) },
      { lib: "dead_bug_leg", ...reps(3, 8) },
      { lib: "waiter_bow", ...reps(3, 10) },
      { lib: "adductor_squeeze", dose: { sets: 3, reps: 10, hold: 5 }, freq: 3 },
      { lib: "copenhagen_plank", ...hold(3, 20) },
      { lib: "st_hip_internal", ...hold(3, 30, FREQ_DAILY) },
      { lib: "st_hip_flexor", ...hold(3, 30, FREQ_DAILY) },
    ],
    symptoms: [
      { name: "Nivunen", regions: { adductor: "B" } },
      { name: "Pakara", regions: { glute_max: "B" } },
      { name: "Selkä", regions: { lumbar: "B" } },
    ],
  },
  {
    id: "bb",
    group: "Levytanko",
    name: "Koko keho · levytanko",
    blurb: "Perusliikkeet tangolla, 3 × viikossa.",
    items: [
      { lib: "back_squat", ...reps(3, 8, 3, { equip: "bb" }) },
      { lib: "deadlift", ...reps(3, 5, 3, { equip: "bb" }) },
      { lib: "bench_press", ...reps(3, 8, 3, { equip: "bb" }) },
      { lib: "barbell_row", ...reps(3, 8, 3, { equip: "bb" }) },
      { lib: "overhead_press", ...reps(3, 8, 3, { equip: "bb" }) },
      { lib: "hip_thrust_barbell", ...reps(3, 10, 3, { equip: "bb" }) },
    ],
    symptoms: [
      { name: "Alaselkä", regions: { lumbar: "B" } },
      { name: "Olkapää", regions: { shoulder_front: "B" } },
    ],
  },
  {
    id: "db",
    group: "Käsipainot",
    name: "Koko keho · käsipainot",
    blurb: "Koko keho kahdella käsipainolla, 3 × viikossa.",
    items: [
      { lib: "goblet_squat", ...reps(3, 10, 3, { equip: "db" }) },
      { lib: "romanian_deadlift", ...reps(3, 10, 3, { equip: "db" }) },
      { lib: "db_bench", ...reps(3, 10, 3, { equip: "db" }) },
      { lib: "one_arm_db_row", ...reps(3, 10, 3, { equip: "db" }) },
      { lib: "db_shoulder_press", ...reps(3, 10, 3, { equip: "db" }) },
      { lib: "step_up_db", ...reps(3, 10, 3, { equip: "db" }) },
    ],
    symptoms: [
      { name: "Alaselkä", regions: { lumbar: "B" } },
      { name: "Olkapää", regions: { shoulder_front: "B" } },
    ],
  },
  {
    id: "bw",
    group: "Kehonpaino",
    name: "Koko keho · kehonpaino",
    blurb: "Ilman välineitä, kotona tai matkalla, 3 × viikossa.",
    items: [
      { lib: "bw_squat", ...reps(3, 15, 3, { equip: "bw" }) },
      { lib: "bw_lunge", ...reps(3, 10, 3, { equip: "bw" }) },
      { lib: "pushup", ...reps(3, 10, 3, { equip: "bw" }) },
      { lib: "inverted_row", ...reps(3, 8, 3, { equip: "bw" }) },
      { lib: "glute_bridge", ...reps(3, 15, 3, { equip: "bw" }) },
      { lib: "front_plank", ...hold(3, 30, 3, { equip: "bw" }) },
      { lib: "side_plank", ...hold(2, 30, 3, { equip: "bw" }) },
    ],
    symptoms: [],
  },
  {
    id: "kb",
    group: "Kahvakuula",
    name: "Kahvakuula perus",
    blurb: "Yksi kuula riittää: heilautus, kyykky, soutu, punnerrus.",
    items: [
      { lib: "kb_swing", ...reps(3, 15, 3, { equip: "kb" }) },
      { lib: "kb_goblet_squat", ...reps(3, 10, 3, { equip: "kb" }) },
      { lib: "kb_deadlift", ...reps(3, 10, 3, { equip: "kb" }) },
      { lib: "kb_row", ...reps(3, 10, 3, { equip: "kb" }) },
      { lib: "kb_press", ...reps(3, 8, 3, { equip: "kb" }) },
      { lib: "kb_tgu", ...reps(3, 2, 3, { equip: "kb" }) },
      { lib: "kb_halo", ...reps(2, 10, 3, { equip: "kb" }) },
    ],
    symptoms: [
      { name: "Alaselkä", regions: { lumbar: "B" } },
      { name: "Olkapää", regions: { shoulder_front: "B" } },
    ],
  },
  {
    id: "run",
    group: "Juoksu",
    name: "Juoksua tukeva",
    blurb: "Pohkeet, pakarat ja keskivartalo juoksun tueksi, sekä itse juoksu.",
    items: [
      { lib: "run_jog", ...mins(30, 3) },
      { lib: "calf_raise", ...reps(3, 15, 2) },
      { lib: "step_up", ...reps(3, 10, 2) },
      { lib: "single_leg_bridge", ...reps(3, 10, 2) },
      { lib: "monster_walk", ...reps(3, 10, 2, { equip: "band" }) },
      { lib: "side_plank", ...hold(3, 30, 2) },
      { lib: "nordic_hamstring", ...reps(3, 5, 2) },
      { lib: "st_calf_wall", ...hold(2, 30, FREQ_DAILY) },
    ],
    symptoms: [
      { name: "Polvi", structures: { j_knee: "B" } },
      { name: "Pohje / akillesjänne", regions: { calf: "B" } },
      { name: "Lonkka", regions: { glute_med: "B" } },
    ],
  },
  {
    id: "empty",
    name: "Tyhjä",
    blurb: "Lisään liikkeet itse kirjastosta tai tekstinä.",
    items: [],
    symptoms: [],
  },
];

export const TEMPLATE_BY_ID: Record<string, Template> = {};
TEMPLATES.forEach((t) => (TEMPLATE_BY_ID[t.id] = t));

/* A starting target for a library exercise that has none: holds by name,
   mobility lighter, everything else the common 3 × 10. Shown as a target to
   check, never as advice. */
const HOLD_NAME = /lankku|pito|hold|seinäistunta|puristus/i;
export function defaultTargetFor(lib) {
  if (lib && lib.dose) return { ...EMPTY_DOSE, ...lib.dose };
  if (lib && lib.unit === "min") return { ...EMPTY_DOSE, min: 30 };
  if (lib && HOLD_NAME.test(lib.name || "")) return { ...EMPTY_DOSE, sets: 3, hold: 30 };
  if (lib && lib.type === "mobility") return { ...EMPTY_DOSE, sets: 2, reps: 10 };
  return { ...EMPTY_DOSE, sets: 3, reps: 10 };
}

/* An exercise built from a library entry, the same shape addFromLibrary makes. */
export function exerciseFromLibrary(lib, { dose, freq, equip, name, todayKey, groups }: any = {}) {
  return {
    id: uid(),
    added: todayKey || null,
    name: name || lib.name,
    desc: lib.note || "",
    type: lib.type,
    muscles: { ...lib.muscles },
    structures: [...(lib.structures || [])],
    unit: lib.unit === "min" ? "min" : "sets",
    met: lib.met || null,
    source: { src: lib.src, note: lib.note || "", edited: false },
    archived: false,
    freq: freq || FREQ_DAILY,
    equip: EQUIP_IDS.includes(equip) ? equip : null,
    groups: Array.isArray(groups) ? groups.filter(Boolean) : [],
    dose: dose ? { ...EMPTY_DOSE, ...dose } : defaultTargetFor(lib),
  };
}

export function templateExercises(tpl: Template, todayKey?: string) {
  return tpl.items
    .map((it) => {
      const lib = LIB_BY_ID[it.lib];
      return lib ? exerciseFromLibrary(lib, { ...it, todayKey, groups: tpl.group ? [tpl.group] : [] }) : null;
    })
    .filter(Boolean);
}

export function templateSymptoms(tpl: Template) {
  return tpl.symptoms.map((s) => ({
    id: uid(),
    name: s.name,
    regions: { ...(s.regions || {}) },
    structures: { ...(s.structures || {}) },
    archived: false,
  }));
}

const key = (n) => String(n || "").trim().toLowerCase();

/* replace: the template becomes the programme (empty diary only).
   merge: add what is missing by name; an active exercise of the same name is
   never changed, an archived one is revived with its history (mergeExercises). */
export function applyTemplate({ exercises, symptoms }, tpl: Template, mode: "replace" | "merge", todayKey?: string) {
  const newEx = templateExercises(tpl, todayKey);
  const newSy = templateSymptoms(tpl);
  if (mode === "replace") {
    return { exercises: newEx, symptoms: newSy, added: newEx.length, skipped: 0 };
  }
  const haveSy = new Set((symptoms || []).map((s) => key(s.name)));
  const addSy = newSy.filter((s) => !haveSy.has(key(s.name)));
  const m = mergeExercises(exercises, newEx);
  return {
    exercises: m.exercises,
    symptoms: [...(symptoms || []), ...addSy],
    added: m.added,
    revived: m.revived,
    skipped: m.skipped,
  };
}
