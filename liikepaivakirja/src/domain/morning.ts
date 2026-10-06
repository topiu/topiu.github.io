/* domain/morning — pain the morning after a training day.
 *
 * Physiotherapists ask about pain during an exercise and about the morning
 * after; the first is recorded in treenitila, this is the second. It is stored
 * on the day it is recorded (`l.morning`, 0–10) and asked only when the day
 * before had training logged, so it costs Tänään no space on other days.
 * Recorded as given, with no "acceptable" threshold anywhere.
 */
import { addDays, keyOf, parseKey } from "./dates";
import { PAIN_MAX } from "./gym";

/* any sets or minutes logged at all — a partial session is still a session */
export function trainedOn(l) {
  if (!l) return false;
  const any = (m) => !!m && Object.keys(m).some((id) => m[id] > 0);
  return any(l.sets) || any(l.mins);
}

export const prevKey = (dateKey) => keyOf(addDays(parseKey(dateKey), -1));

/* ask on a morning after training, or keep showing an answer already given */
export function askMorning(logs, dateKey) {
  const l = logs && logs[dateKey];
  if (l && typeof l.morning === "number") return true;
  return trainedOn(logs && logs[prevKey(dateKey)]);
}

export function normalizeMorning(v) {
  if (v == null || v === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= PAIN_MAX ? n : null;
}

/* mornings after training days in a range: plain numbers for the report */
export function morningSummary(logs, keys) {
  const vals = [];
  keys.forEach((k) => {
    const l = logs && logs[k];
    if (l && typeof l.morning === "number" && trainedOn(logs[prevKey(k)])) vals.push(l.morning);
  });
  if (!vals.length) return null;
  return {
    n: vals.length,
    mean: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
    max: Math.max(...vals),
  };
}
