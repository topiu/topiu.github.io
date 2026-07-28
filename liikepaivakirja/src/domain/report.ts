/* domain/report — the model behind the clinician one-pager.
 *
 * The CSV export answers "give me everything"; a physiotherapist has about two
 * minutes and a different question: did he do it, did it hurt, what changed, and
 * what does he want to ask. This module answers that in one page and nothing
 * more. It is pure so the numbers can be tested without rendering anything.
 *
 * Three decisions worth stating, because they are what make the page honest:
 *
 *  1. Adherence is measured against the dose that was in force on each day, via
 *     goalOf/goalMinOf, not against today's dose. The app already freezes a dose
 *     snapshot per day+exercise for exactly this reason; a report that ignored it
 *     would rewrite history every time the physio changes the prescription.
 *
 *  2. Each exercise's denominator starts on the day it first appears anywhere in
 *     the log, not at the start of the range. An exercise added last week must
 *     not read as three weeks of missed sessions. `since` carries that date so
 *     the page can say so out loud.
 *
 *  3. Nothing is imputed and nothing is interpreted. No trend arrows on symptom
 *     counts, no "improving", no advice. The one interpretive statement on the
 *     page is the PSFS band, and that threshold is published rather than ours.
 */

import { addDays, keyOf, parseKey } from "./dates";
import { doseLabel, goalMinOf, goalOf, isCompleteOn, isMin } from "./dose";
import { FREQ_DAILY, expectedSessions, freqLabel, freqOf } from "./freq";
import { psfsActivityChanges, psfsChange, psfsSeries } from "./psfs";
import { SEVERITY, qualityLabel } from "./taxonomy";

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null);
const round1 = (v) => Math.round(v * 10) / 10;

/* first date this exercise appears in any log, ever — outside the range too */
function firstSeenOf(logs, exId) {
  let first = null;
  Object.keys(logs).forEach((k) => {
    const l = logs[k];
    if (!l) return;
    const touched =
      (l.sets && l.sets[exId] > 0) || (l.mins && l.mins[exId] > 0) || (l.goal && l.goal[exId] != null);
    if (touched && (first == null || k < first)) first = k;
  });
  return first;
}

/* days: a positive window, or 0 for "everything on record" */
export function buildReport({ exercises = [], symptoms = [], logs = {}, marks = [], psfs = null, today, days = 30 }) {
  const end = today || new Date();
  const endKey = keyOf(end);

  const dataKeys = [...Object.keys(logs), ...(marks || []).map((m) => m.date)].sort();
  const earliest = dataKeys.length ? dataKeys[0] : endKey;

  let start;
  if (days && days > 0) {
    start = addDays(end, -(days - 1));
    /* never claim a window that reaches back before any data exists */
    const e = parseKey(earliest);
    if (e > start) start = e;
  } else {
    start = parseKey(earliest);
  }
  const startKey = keyOf(start);
  const spanDays = Math.max(1, Math.round((parseKey(endKey) - parseKey(startKey)) / 86400000) + 1);
  const rangeKeys = Array.from({ length: spanDays }, (_, i) => keyOf(addDays(start, i)));
  const inRange = (k) => k >= startKey && k <= endKey;

  const activeEx = exercises.filter((e) => !e.archived);
  const activeSy = symptoms.filter((s) => !s.archived);

  /* ---- per-exercise adherence ---- */
  let doneSum = 0;
  let denomSum = 0;
  const exRows = activeEx.map((ex) => {
    const firstSeen = firstSeenOf(logs, ex.id);
    const since = firstSeen && firstSeen > startKey ? firstSeen : startKey;
    const keys = rangeKeys.filter((k) => k >= since);
    let daysComplete = 0;
    let daysAny = 0;
    let over = 0;
    let unitsDone = 0;
    let unitsGoal = 0;
    keys.forEach((k) => {
      const l = logs[k];
      const min = isMin(ex);
      const got = l ? (min ? (l.mins && l.mins[ex.id]) || 0 : (l.sets && l.sets[ex.id]) || 0) : 0;
      const want = l ? (min ? goalMinOf(l, ex) : goalOf(l, ex)) : min ? goalMinOf(null, ex) : goalOf(null, ex);
      if (got > 0) daysAny++;
      if (got >= want) daysComplete++;
      if (got > want) over++;
      unitsDone += got;
      unitsGoal += want;
    });
    /* Denominator is what the prescription asked for over this window, not the
       number of calendar days. For a daily exercise the two are the same; for
       anything less frequent, calendar days made a perfect record look like a
       failure — a 3×/week exercise could not exceed about 43 %. */
    const target = expectedSessions(logs, ex, keys);
    doneSum += daysComplete;
    denomSum += target;
    return {
      id: ex.id,
      name: ex.name,
      type: ex.type,
      unit: isMin(ex) ? "min" : "sets",
      dose: doseLabel(ex.dose, ex.unit),
      since: since > startKey ? since : null,
      freq: freqOf(ex),
      freqText: freqLabel(freqOf(ex)),
      days: keys.length,
      target,
      daysAny,
      daysComplete,
      completePct: pct(daysComplete, target),
      over,
      unitsDone,
      unitsGoal,
    };
  });

  /* ---- days trained / logged ---- */
  let loggedDays = 0;
  let trainedDays = 0;
  let fullDays = 0;
  rangeKeys.forEach((k) => {
    const l = logs[k];
    if (!l) return;
    loggedDays++;
    const done = activeEx.filter((ex) => isCompleteOn(l, ex)).length;
    if (done > 0) trainedDays++;
    if (activeEx.length && done === activeEx.length) fullDays++;
  });

  /* ---- symptoms ---- */
  const syRows = activeSy
    .map((s) => {
      let dayCount = 0;
      let sevSum = 0;
      let sevN = 0;
      let worst = 0;
      const qual = {};
      rangeKeys.forEach((k) => {
        const l = logs[k];
        if (!l || !l.flared || !l.flared.includes(s.id)) return;
        dayCount++;
        const v = l.severity && l.severity[s.id];
        if (v >= 1 && v <= 3) {
          sevSum += v;
          sevN++;
          if (v > worst) worst = v;
        }
        const q = l.quality && l.quality[s.id];
        if (q) qual[q] = (qual[q] || 0) + 1;
      });
      const sev = SEVERITY.find((x) => x.v === worst);
      return {
        id: s.id,
        name: s.name,
        days: dayCount,
        pct: pct(dayCount, spanDays),
        meanSeverity: sevN ? round1(sevSum / sevN) : null,
        worstLabel: sev ? sev.label : null,
        qualities: Object.keys(qual)
          .sort((a, b) => qual[b] - qual[a])
          .map((q) => ({ label: qualityLabel(q), n: qual[q] })),
      };
    })
    .sort((a, b) => b.days - a.days);

  const symptomFreeDays = rangeKeys.filter((k) => {
    const l = logs[k];
    return !l || !l.flared || l.flared.length === 0;
  }).length;

  /* ---- steps ---- */
  let stepSum = 0;
  let stepDays = 0;
  rangeKeys.forEach((k) => {
    const l = logs[k];
    if (l && l.steps > 0) {
      stepSum += l.steps;
      stepDays++;
    }
  });

  /* ---- marks: dose changes are auto-logged, milestones are typed by hand ---- */
  const ranged = (marks || []).filter((m) => inRange(m.date));
  const doseChanges = ranged.filter((m) => m.auto).map((m) => ({ date: m.date, text: m.text }));
  const milestones = ranged.filter((m) => !m.auto).map((m) => ({ date: m.date, text: m.text }));

  /* ---- notes, newest first, capped: this is a summary, not the diary ---- */
  const NOTE_CAP = 12;
  const noteKeys = rangeKeys.filter((k) => logs[k] && logs[k].note && logs[k].note.trim()).reverse();
  const notes = noteKeys.slice(0, NOTE_CAP).map((k) => ({ date: k, text: logs[k].note.trim() }));

  /* ---- PSFS: the whole history, not the window. Fortnightly assessments make a
     30-day window two data points, and the trajectory is the point. ---- */
  const series = psfsSeries(psfs);
  const psfsBlock = series.length
    ? { series, change: psfsChange(psfs), activities: psfsActivityChanges(psfs) }
    : null;

  return {
    generatedAt: new Date().toISOString(),
    from: startKey,
    to: endKey,
    spanDays,
    requestedDays: days || 0,
    truncated: !!(days && days > 0 && spanDays < days),
    adherence: {
      pct: pct(doneSum, denomSum),
      doneSum,
      denomSum,
      loggedDays,
      trainedDays,
      fullDays,
    },
    exercises: exRows,
    archivedExercises: exercises.length - activeEx.length,
    symptoms: syRows,
    symptomFreeDays,
    steps: stepDays ? { mean: Math.round(stepSum / stepDays), days: stepDays } : null,
    doseChanges,
    milestones,
    notes,
    notesTotal: noteKeys.length,
    psfs: psfsBlock,
  };
}
