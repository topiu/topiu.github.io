/* domain/dose — moved verbatim from liikepaivakirja.jsx (Phase 1 split). */
import { toNum } from "./num";

/* ------------------------------------------------------------------ */
/*  Defaults (from the physio) — all editable                          */
/* ------------------------------------------------------------------ */
export const EMPTY_DOSE = { sets: null, reps: null, hold: null, min: null };

export function doseLabel(d, unit?) {
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

export const targetSets = (ex) => (ex.dose && ex.dose.sets) || 1;

export const isMin = (ex) => ex && ex.unit === "min";

export const targetMin = (ex) => (ex.dose && ex.dose.min) || 20;

export const emptyLog = () => ({ sets: {}, goal: {}, mins: {}, flared: [], severity: {}, quality: {}, note: "", steps: 0 });

/* goal snapshot per day+exercise is a full dose {sets,reps,hold}; legacy data may hold a bare int */
export const goalSetsOfEntry = (g) => {
  if (g == null) return null;
  if (typeof g === "number") return g > 0 ? g : null;
  const s = parseInt(g.sets, 10);
  return s > 0 ? s : 1;
};

/* sets required for the day: snapshot if present, else current target */
export const goalOf = (l, ex) => (l && l.goal && goalSetsOfEntry(l.goal[ex.id])) || targetSets(ex);

/* full dose in force on that day, for display */
export const dayDoseOf = (l, ex) => {
  const g = l && l.goal && l.goal[ex.id];
  if (g == null) return ex.dose;
  if (typeof g === "number") return { sets: g, reps: null, hold: null, min: null };
  return { sets: toNum(g.sets) || 1, reps: toNum(g.reps), hold: toNum(g.hold), min: toNum(g.min) };
};

/* minutes required on a given day for a minute-unit exercise */
export const goalMinOf = (l, ex) => {
  const g = l && l.goal && l.goal[ex.id];
  if (g && typeof g === "object" && toNum(g.min)) return toNum(g.min);
  return targetMin(ex);
};

export const isEmptyLog = (l) => {
  const noMins = !l.mins || Object.values(l.mins).every((v) => !v);
  const noSets = (!l.sets || Object.values(l.sets).every((v) => !v)) && noMins;
  return noSets && !l.steps && (!l.flared || !l.flared.length) && (!l.note || !l.note.trim());
};
