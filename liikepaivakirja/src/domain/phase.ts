/* domain/phase — programme phases.
 *
 * A physiotherapist changes the programme every few weeks. A phase is just a
 * milestone mark ("Uusi vaihe: …") plus, usually, archiving the exercises of
 * the previous phase so Tänään shows only the new ones — archived exercises
 * keep their history, and an exercise that continues into the new phase is
 * revived with its id (see `reviveOrAdd`), so its history continues too.
 * The report can then be read for "Tämä vaihe".
 */
import { daysBetween } from "./backup";
import { DATE_RE } from "./dates";

export const PHASE_PREFIX = "Uusi vaihe: ";

export const phaseMarkText = (name) => `${PHASE_PREFIX}${String(name || "").trim() || "nimetön"}`.slice(0, 300);

/* the latest phase start, or null */
export function latestPhase(marks) {
  const ph = (marks || [])
    .filter((m) => m && typeof m.text === "string" && m.text.startsWith(PHASE_PREFIX) && DATE_RE.test(m.date))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return ph.length ? { date: ph[0].date, name: ph[0].text.slice(PHASE_PREFIX.length) } : null;
}

export const phaseCount = (marks) => (marks || []).filter((m) => m && typeof m.text === "string" && m.text.startsWith(PHASE_PREFIX)).length;

/* days covered by the current phase, today included — a report range */
export function phaseDays(marks, todayKey) {
  const p = latestPhase(marks);
  if (!p || p.date > todayKey) return null;
  return daysBetween(p.date, todayKey) + 1;
}

export const archiveActive = (exercises) => (exercises || []).map((e) => (e.archived ? e : { ...e, archived: true }));
