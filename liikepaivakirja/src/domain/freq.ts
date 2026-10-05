/* domain/freq — "× viikossa" prescriptions.
 *
 * Every exercise used to be implicitly due every day. That is wrong for anything
 * a physiotherapist prescribes three times a week, in two ways: the daily screen
 * makes you scan past things that are not due, and the report could never score
 * such an exercise above about 43 %, because its denominator was calendar days.
 * That was a real defect in the report, not a cosmetic one.
 *
 * Frequency is a weekly count, not named weekdays. A weekly target says "three
 * times this week" and leaves the choice of days alone, which is both how these
 * prescriptions are actually given and less to configure. Naming the days would
 * also invent a notion of "late" that the physiotherapist did not prescribe.
 *
 * 7 means daily and is the default, so every existing exercise keeps its current
 * behaviour and every existing report number stays identical.
 *
 * Frequency is snapshotted per day alongside the dose (see doseSnapshotOf), so
 * raising a prescription from 3× to 5× does not retroactively turn completed
 * weeks into missed ones.
 */

import { keyOf, parseKey, startOfWeek } from "./dates";
import { isCompleteOn } from "./dose";
import { toNum } from "./num";

export const FREQ_MIN = 1;
export const FREQ_DAILY = 7;

const clampFreq = (v) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  if (n < FREQ_MIN || n > FREQ_DAILY) return null;
  return n;
};

/* Current prescription. Anything missing or malformed reads as daily, which is
   what the app did before frequencies existed. */
export const freqOf = (ex) => clampFreq(ex && ex.freq) ?? FREQ_DAILY;

export const isDaily = (ex) => freqOf(ex) >= FREQ_DAILY;

export const freqLabel = (f) => (f >= FREQ_DAILY ? "päivittäin" : `${f}× viikossa`);

/* Frequency in force on a given day: the snapshot if the day has one, else the
   current prescription. Mirrors goalOf exactly. */
export const goalFreqOf = (l, ex) => {
  const g = l && l.goal && l.goal[ex.id];
  if (g && typeof g === "object") {
    const v = clampFreq(g.freq);
    if (v) return v;
  }
  return freqOf(ex);
};

/* The Monday–Sunday week containing a date, as date keys. Weeks start Monday
   here because that is the Finnish week and because startOfWeek already does. */
export function weekKeys(dateKey) {
  const start = startOfWeek(parseKey(dateKey));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return keyOf(d);
  });
}

/* The frequency in force for a run of days in one week: the snapshot on the
   first of them that has one, else the current prescription. */
export function weekFreqOf(logs, ex, keys) {
  for (const k of keys) {
    const l = logs && logs[k];
    const g = l && l.goal && l.goal[ex.id];
    if (g && typeof g === "object") {
      const v = clampFreq(g.freq);
      if (v) return v;
    }
  }
  return freqOf(ex);
}

/* Progress against this week's target. Counts the whole Monday–Sunday week, not
   just up to today: a session logged on a later date in the same week still
   counts toward that week.

   The target is the week's own snapshot, not the current prescription: after a
   change from 3× to 5×, a past week of three sessions must still read as met. */
export function weekProgress(logs, ex, dateKey) {
  const keys = weekKeys(dateKey);
  const target = weekFreqOf(logs, ex, keys);
  let done = 0;
  keys.forEach((k) => {
    if (isCompleteOn(logs && logs[k], ex)) done++;
  });
  return { done, target, keys, met: done >= target, remaining: Math.max(0, target - done) };
}

/* Range keys grouped by Monday–Sunday week. */
function byWeekOf(rangeKeys) {
  const byWeek = new Map();
  rangeKeys.forEach((k) => {
    const ws = keyOf(startOfWeek(parseKey(k)));
    if (!byWeek.has(ws)) byWeek.set(ws, []);
    byWeek.get(ws).push(k);
  });
  return byWeek;
}

/* How many sessions the prescription asked for across a set of days.
 *
 * Weeks are handled separately so that a frequency change mid-range is honoured,
 * and each week is prorated by how much of it falls inside the range — a range
 * ending on a Wednesday only asks for part of that week.
 *
 * Clamped to at least one session for any non-empty range: a fortnight of a
 * 3×/week exercise should not be able to round down to "nothing was expected",
 * which would make the percentage meaningless rather than merely small.
 */
export function expectedSessions(logs, ex, rangeKeys) {
  if (!rangeKeys || !rangeKeys.length) return 0;
  let total = 0;
  byWeekOf(rangeKeys).forEach((keys) => {
    total += (weekFreqOf(logs, ex, keys) * keys.length) / FREQ_DAILY;
  });
  return Math.max(1, Math.round(total));
}

/* Completed sessions that count toward adherence: per week, no more than that
 * week's (prorated) target. Without the cap a 3×/week exercise done daily scored
 * 233 %, and in the programme total those extra sessions covered for another
 * exercise that was never done at all. Never exceeds expectedSessions.
 */
export function creditedSessions(logs, ex, rangeKeys) {
  if (!rangeKeys || !rangeKeys.length) return 0;
  let total = 0;
  byWeekOf(rangeKeys).forEach((keys) => {
    const want = (weekFreqOf(logs, ex, keys) * keys.length) / FREQ_DAILY;
    const done = keys.filter((k) => isCompleteOn(logs && logs[k], ex)).length;
    total += Math.min(done, want);
  });
  return Math.min(Math.round(total), expectedSessions(logs, ex, rangeKeys));
}
