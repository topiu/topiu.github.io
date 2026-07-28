/* domain/normalize — moved verbatim from liikepaivakirja.jsx (Phase 1 split). */
import { DATE_RE } from "./dates";
import { EMPTY_DOSE, isEmptyLog, targetSets } from "./dose";
import { SOURCES } from "./library";
import { toNum, uid } from "./num";
import { REGION_BY_ID } from "./regions";
import { STRUCT_BY_ID } from "./structures";
import { EX_TYPE_IDS, QUALITY_IDS } from "./taxonomy";

/* ------------------------------------------------------------------ */
/*  Version-tolerant normalization (shared by load + import)           */
/* ------------------------------------------------------------------ */
export function normalizeExercises(arr) {
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
export function normalizeMuscles(m) {
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
export function normalizeExStructures(a) {
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
export function normalizeSymptomRegions(r) {
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
export function normalizeSymptomStructures(r) {
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

export function normalizeSymptoms(arr) {
  if (!Array.isArray(arr)) return null;
  return arr.map((s) => ({
    id: s && s.id != null ? String(s.id) : uid(),
    name: s && typeof s.name === "string" && s.name.trim() ? s.name : "Oire",
    regions: normalizeSymptomRegions(s && s.regions),
    structures: normalizeSymptomStructures(s && s.structures),
    archived: !!(s && s.archived),
  }));
}

export function normalizeLogs(raw, exById) {
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

export function parseImport(text) {
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

export function normalizeMarks(arr) {
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
