/* domain/gym — treenitila: equipment, what was actually lifted, and pain
 * during an exercise.
 *
 * The prescription says "3 × 10". At the gym the dumbbell you wanted is taken,
 * so it is the cable machine today, or 14 kg instead of 13 because that is what
 * the rack has. This module records what was done — per set: reps (or a hold in
 * seconds), the load and the equipment — without changing what "done" means.
 *
 * Invariants, each with a test:
 *
 *  - `l.sets[id]` stays the count of sets and stays the only input to
 *    isCompleteOn. Detail is extra information about those sets, never a second
 *    definition of done. So `detail[id].length <= sets[id]`: lowering the count
 *    on Tänään trims the detail, and the one-tap programme fill may add sets
 *    that have no detail at all.
 *  - Detail and pain live inside the day's log, so they ride along with the
 *    existing `physio-logs` key everywhere it goes (export, snapshots, restore).
 *    normalizeLogs must keep them, or a reload silently drops them.
 *  - Nothing here advises. There is no "add 2.5 kg next time": the app shows
 *    what was done last time and leaves progression to the physiotherapist.
 */

import { DATE_RE } from "./dates";

export const KB_WEIGHTS = [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 44, 48];
export const BAND_LEVELS = ["kevyt", "keskiraskas", "raskas", "erittäin raskas"];

/* load: "none" = bodyweight, "kg" = a number of kilos, "level" = a band level.
   `step` is the usual increment of that equipment; kettlebells come in fixed
   sizes, so they step along a ladder instead; `start` is where an empty load
   field jumps to on the first "+". */
export const EQUIPMENT = [
  { id: "bw", label: "Oma paino", load: "none" },
  { id: "db", label: "Käsipainot", load: "kg", step: 1, start: 5 },
  { id: "kb", label: "Kahvakuula", load: "kg", ladder: KB_WEIGHTS, start: 8 },
  { id: "bb", label: "Tanko", load: "kg", step: 2.5, start: 20 },
  { id: "machine", label: "Laite / talja", load: "kg", step: 2.5, start: 10 },
  { id: "band", label: "Kuminauha", load: "level" },
] as const;

export type EquipId = (typeof EQUIPMENT)[number]["id"];
export const EQUIP_IDS = EQUIPMENT.map((e) => e.id) as string[];
export const EQUIP_BY_ID: Record<string, any> = {};
EQUIPMENT.forEach((e) => (EQUIP_BY_ID[e.id] = e));
export const equipLabel = (id) => (EQUIP_BY_ID[id] ? EQUIP_BY_ID[id].label : "");

export const PAIN_MAX = 10;
export const REST_DEFAULT_S = 60;
export const REST_MIN_S = 15;
export const REST_MAX_S = 600;

export const clampRest = (v) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return REST_DEFAULT_S;
  return Math.max(REST_MIN_S, Math.min(REST_MAX_S, n));
};

const round2 = (v) => Math.round(v * 100) / 100;

/* Next load up or down for the equipment. Never below zero: stepping down
   from the smallest load clears it (null = no load recorded). */
export function stepLoad(eq, kg, dir) {
  const e = EQUIP_BY_ID[eq];
  if (!e || e.load !== "kg") return kg;
  if (kg == null || !(kg > 0)) return dir > 0 ? e.start : null;
  if (e.ladder) {
    const L = e.ladder;
    if (dir > 0) {
      const up = L.find((w) => w > kg);
      return up != null ? up : round2(kg + 4);
    }
    const down = [...L].reverse().find((w) => w < kg);
    if (down != null) return down;
    return kg > L[0] ? L[0] : null;
  }
  /* off-grid values (typed elsewhere, or another equipment's) snap to the grid */
  const s = e.step;
  const next = dir > 0 ? Math.floor(kg / s + 1e-9) * s + s : Math.ceil(kg / s - 1e-9) * s - s;
  return next > 0 ? round2(next) : null;
}

export function stepLevel(lvl, dir) {
  if (lvl == null) return dir > 0 ? 2 : null;
  const n = lvl + (dir > 0 ? 1 : -1);
  if (n < 1) return null;
  return Math.min(BAND_LEVELS.length, n);
}

export const fmtKg = (kg) => String(round2(kg)).replace(".", ",");

/* "10 × 40 kg", "30 s × 8 kg", "12 × kuminauha raskas", "10" */
export function setLabel(s) {
  if (!s) return "";
  const work = s.hold ? `${s.hold} s` : s.reps != null ? String(s.reps) : "";
  let load = "";
  if (s.kg) load = `${fmtKg(s.kg)} kg`;
  else if (s.lvl) load = `kuminauha ${BAND_LEVELS[s.lvl - 1]}`;
  if (work && load) return `${work} × ${load}`;
  return work || load || "sarja";
}

/* null and "" are "not recorded", not zero — Number(null) is 0 */
const intIn = (v, lo, hi) => {
  if (v == null || v === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

/* one set as stored: { reps, hold, kg, lvl, eq } — anything else is dropped */
export function normalizeSetEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const kgN = Number(raw.kg);
  const kg = Number.isFinite(kgN) && kgN > 0 && kgN <= 1000 ? Math.round(kgN * 4) / 4 : null;
  return {
    reps: intIn(raw.reps, 0, 999),
    hold: intIn(raw.hold, 1, 3600),
    kg,
    lvl: intIn(raw.lvl, 1, BAND_LEVELS.length),
    eq: EQUIP_IDS.includes(raw.eq) ? raw.eq : null,
  };
}

/* per-set detail of one day, kept only for exercises with that many sets */
export function normalizeDetail(raw, sets) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  Object.keys(raw).forEach((id) => {
    const n = sets[id] || 0;
    if (!n || !Array.isArray(raw[id])) return;
    const arr = raw[id].map(normalizeSetEntry).filter(Boolean).slice(0, n);
    if (arr.length) out[id] = arr;
  });
  return out;
}

/* pain during an exercise, 0–10 (NRS) */
export function normalizePain(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  Object.keys(raw).forEach((id) => {
    const v = intIn(raw[id], 0, PAIN_MAX);
    if (v != null) out[id] = v;
  });
  return out;
}

/* ------------------------------------------------------------------ */
/*  Equipment guess for an exercise with no history                     */
/* ------------------------------------------------------------------ */
const EQ_BY_NAME: [RegExp, string][] = [
  [/kahvakuul/i, "kb"],
  [/käsipaino/i, "db"],
  [/kuminauh|vastuskum|minibänd|band/i, "band"],
  [/talja|laite|kone|prässi|face pull|pulldown/i, "machine"],
  [/tanko|kulmasoutu|maastaveto|penkkipunnerrus|good morning|levytango/i, "bb"],
];

export function inferEquipment(ex) {
  if (ex && EQUIP_IDS.includes(ex.equip)) return ex.equip;
  const name = (ex && ex.name) || "";
  for (const [re, id] of EQ_BY_NAME) if (re.test(name)) return id;
  return "bw";
}

/* ------------------------------------------------------------------ */
/*  Recall: what was done last time                                     */
/* ------------------------------------------------------------------ */
const detailOf = (l, id) => (l && l.detail && Array.isArray(l.detail[id]) ? l.detail[id] : []);

/* Latest day before `beforeKey` with recorded sets of this exercise — with this
   equipment, if one is given, and then only that equipment's sets, because 40 kg
   on a barbell says nothing about which dumbbell to pick up. */
export function lastSession(logs, exId, beforeKey, eq?) {
  const keys = Object.keys(logs || {})
    .filter((k) => DATE_RE.test(k) && k < beforeKey)
    .sort()
    .reverse();
  for (const k of keys) {
    const sets = detailOf(logs[k], exId).filter((s) => !eq || s.eq === eq);
    if (sets.length) return { date: k, sets };
  }
  return null;
}

/* equipment of the most recent recorded set, today included */
export function lastEquipment(logs, exId, uptoKey) {
  const keys = Object.keys(logs || {})
    .filter((k) => DATE_RE.test(k) && k <= uptoKey)
    .sort()
    .reverse();
  for (const k of keys) {
    const sets = detailOf(logs[k], exId);
    for (let i = sets.length - 1; i >= 0; i--) if (sets[i].eq) return sets[i].eq;
  }
  return null;
}

/* The values the next set starts from: the set just done today with this
   equipment, else the first set of the last session with it, else the
   prescription. A starting point to adjust, not a target. */
export function nextSetDraft({ logs, exId, dateKey, eq, dose }) {
  const today = detailOf(logs && logs[dateKey], exId).filter((s) => s.eq === eq);
  const src = today.length ? today[today.length - 1] : (lastSession(logs, exId, dateKey, eq) || { sets: [] }).sets[0];
  const reps = dose && dose.reps ? dose.reps : null;
  const hold = dose && dose.hold ? dose.hold : null;
  if (src) {
    return {
      reps: src.hold ? null : src.reps != null ? src.reps : reps,
      hold: src.hold || (src.reps == null ? hold : null),
      kg: src.kg ?? null,
      lvl: src.lvl ?? null,
    };
  }
  return { reps: hold ? null : reps, hold, kg: null, lvl: eq === "band" ? 2 : null };
}

/* ------------------------------------------------------------------ */
/*  Summaries for the report                                            */
/* ------------------------------------------------------------------ */

/* Loads over a range of days, as plain facts: the heaviest set on the first
   and on the last day with a recorded load, the heaviest overall, and which
   equipment was used. No trend word, no arrow. */
export function loadSummary(logs, exId, keys) {
  const days = [];
  const eqs = new Set();
  let sets = 0;
  keys.forEach((k) => {
    const d = detailOf(logs && logs[k], exId);
    if (!d.length) return;
    sets += d.length;
    d.forEach((s) => s.eq && eqs.add(s.eq));
    const top = Math.max(0, ...d.map((s) => s.kg || 0));
    if (top > 0) days.push({ date: k, top });
  });
  if (!sets) return null;
  days.sort((a, b) => (a.date < b.date ? -1 : 1));
  return {
    sets,
    equipment: [...eqs].map(equipLabel),
    first: days.length ? days[0] : null,
    last: days.length ? days[days.length - 1] : null,
    max: days.length ? Math.max(...days.map((d) => d.top)) : null,
  };
}

export function painSummary(logs, exId, keys) {
  const vals = [];
  keys.forEach((k) => {
    const l = logs && logs[k];
    const v = l && l.pain ? l.pain[exId] : undefined;
    if (typeof v === "number") vals.push(v);
  });
  if (!vals.length) return null;
  return {
    n: vals.length,
    mean: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
    max: Math.max(...vals),
  };
}

/* ------------------------------------------------------------------ */
/*  Timers — pure, so the screen only renders what this says            */
/* ------------------------------------------------------------------ */
export function timerLeft(timer, now) {
  if (!timer) return null;
  return Math.max(0, Math.ceil((timer.endAt - now) / 1000));
}

export const fmtClock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/* ------------------------------------------------------------------ */
/*  Per-exercise history for the Historia chart                         */
/* ------------------------------------------------------------------ */

/* One point per day the exercise has recorded sets or pain, oldest first:
   the heaviest set's load (null when nothing had a load), the sets as done,
   and the pain during it if recorded. Facts only — no fitted line. */
export function exerciseSeries(logs, exId) {
  return Object.keys(logs || {})
    .filter((k) => DATE_RE.test(k))
    .sort()
    .map((k) => {
      const l = logs[k];
      const sets = detailOf(l, exId);
      const pain = l && l.pain && typeof l.pain[exId] === "number" ? l.pain[exId] : null;
      if (!sets.length && pain == null) return null;
      const top = Math.max(0, ...sets.map((s) => s.kg || 0));
      return { date: k, top: top > 0 ? top : null, sets, pain };
    })
    .filter(Boolean);
}

/* exercises that have anything to chart, most recently trained first */
export function chartableExercises(logs, exercises) {
  const last = {};
  Object.keys(logs || {}).forEach((k) => {
    const l = logs[k];
    if (!l) return;
    [...Object.keys(l.detail || {}), ...Object.keys(l.pain || {})].forEach((id) => {
      if (!last[id] || k > last[id]) last[id] = k;
    });
  });
  return (exercises || []).filter((e) => last[e.id]).sort((a, b) => (last[a.id] < last[b.id] ? 1 : -1));
}
