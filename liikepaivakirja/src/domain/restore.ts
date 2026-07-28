/* domain/restore — reading a backup back in.
 *
 * The daily snapshots have existed since the port and nothing has ever read one.
 * That is the gap worth closing: a backup you have never restored from is a
 * hope, not a backup. This module is the pure half — turning stored bytes into a
 * dataset, and describing what applying it would change — so the destructive
 * part can be tested without a browser.
 *
 * Restores deliberately reuse the import path in App (`applyImport`), which
 * snapshots the current data to `physio-undo` before overwriting. That means a
 * restore is itself undoable, and it means there is one write-everything code
 * path rather than two that have to stay in agreement.
 *
 * `describeDataset` and `diffDatasets` exist so the confirm step can state what
 * you are about to lose in numbers rather than in reassurance. Restoring an
 * older snapshot legitimately destroys newer entries; the UI should say how
 * many, and the user should be the one to decide that is fine.
 */

import { DATE_RE } from "./dates";
import { normalizeExercises, normalizeLogs, normalizeMarks, normalizeSymptoms } from "./normalize";
import { normalizePsfs } from "./psfs";

/* The storage keys a complete dataset is made of. Kept here, in the layer that
   knows what the data *is*, so storage/backup.ts and any future restore source
   agree by construction. */
export const DATA_KEYS = [
  "physio-config",
  "physio-logs",
  "physio-marks",
  "physio-psfs",
  "physio-questions",
] as const;

/* Turn a raw key/value map — a snapshot's contents — into the same shape
   parseImport produces, so both feed one apply function. */
export function snapshotToDataset(data: any) {
  if (!data || typeof data !== "object") {
    return { ok: false as const, error: "Varmuuskopiota ei voitu lukea." };
  }
  const cfg = data["physio-config"];
  const ex = normalizeExercises(cfg && cfg.exercises);
  const sy = normalizeSymptoms(cfg && cfg.symptoms);
  if (!ex || !ex.length) {
    return { ok: false as const, error: "Varmuuskopiosta ei löytynyt liikkeitä." };
  }
  if (!sy) {
    return { ok: false as const, error: "Varmuuskopiosta ei löytynyt oireita." };
  }
  const exById = {};
  ex.forEach((e) => (exById[e.id] = e));
  const logs = normalizeLogs(data["physio-logs"] || {}, exById);
  const marks = normalizeMarks(data["physio-marks"]);
  const psfs = normalizePsfs(data["physio-psfs"]);
  const q = data["physio-questions"];
  const questions = typeof q === "string" ? q : "";
  return {
    ok: true as const,
    ex,
    sy,
    logs,
    marks,
    psfs,
    questions,
    counts: {
      ex: ex.length,
      sy: sy.length,
      days: Object.keys(logs).length,
      marks: marks.length,
      psfs: Object.keys(psfs.entries).length,
    },
  };
}

export type Dataset = {
  ex?: any[];
  sy?: any[];
  logs?: Record<string, any>;
  marks?: any[];
  psfs?: any;
  questions?: string;
};

/* A dataset summarised the same way regardless of where it came from, so
   "current" and "incoming" are directly comparable. */
export function describeDataset(d: Dataset) {
  const logs = d.logs || {};
  const dayKeys = Object.keys(logs).filter((k) => DATE_RE.test(k)).sort();
  const psfsKeys = Object.keys((d.psfs && d.psfs.entries) || {}).sort();
  const markDates = (d.marks || []).map((m) => m.date).filter((x) => DATE_RE.test(x)).sort();
  const all = [...dayKeys, ...markDates, ...psfsKeys].sort();
  return {
    exercises: (d.ex || []).length,
    symptoms: (d.sy || []).length,
    days: dayKeys.length,
    marks: (d.marks || []).length,
    psfs: psfsKeys.length,
    questions: (d.questions || "").trim().length > 0,
    first: all.length ? all[0] : null,
    last: all.length ? all[all.length - 1] : null,
  };
}

/* What applying `incoming` over `current` would change. Negative numbers are
   the ones that matter — those are entries that would stop existing. */
export function diffDatasets(current: Dataset, incoming: Dataset) {
  const a = describeDataset(current);
  const b = describeDataset(incoming);
  const currentDays = new Set(Object.keys(current.logs || {}));
  const incomingDays = new Set(Object.keys(incoming.logs || {}));
  const lostDays = [...currentDays].filter((k) => !incomingDays.has(k)).sort();
  const gainedDays = [...incomingDays].filter((k) => !currentDays.has(k)).sort();

  return {
    current: a,
    incoming: b,
    delta: {
      exercises: b.exercises - a.exercises,
      symptoms: b.symptoms - a.symptoms,
      days: b.days - a.days,
      marks: b.marks - a.marks,
      psfs: b.psfs - a.psfs,
    },
    /* days present now that the restore would remove — the honest measure of
       what a restore costs, since a day-count delta of zero can still hide a
       swap of one day for another */
    lostDays,
    gainedDays,
    /* nothing at all would change */
    identical:
      lostDays.length === 0 &&
      gainedDays.length === 0 &&
      b.exercises === a.exercises &&
      b.symptoms === a.symptoms &&
      b.marks === a.marks &&
      b.psfs === a.psfs,
    destructive: lostDays.length > 0 || b.marks < a.marks || b.psfs < a.psfs || b.exercises < a.exercises,
  };
}
