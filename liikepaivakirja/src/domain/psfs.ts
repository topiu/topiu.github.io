/* domain/psfs — Patient-Specific Functional Scale (PSFS).
 *
 * Why this instrument and not another. The PSFS is the one widely used
 * physiotherapy outcome measure whose *content* the patient supplies: you name
 * three to five activities you are currently struggling with, then score each
 * from 0 ("en pysty lainkaan") to 10 ("pystyn kuten ennen vaivaa"). The mean of
 * those scores is the number a physiotherapist reads. It is used across
 * musculoskeletal physiotherapy and is one of the two function measures the
 * Dutch physiotherapy guideline recommends for low back pain, so it needs no
 * explaining at the appointment.
 *
 * That shape is exactly why it fits this app. Everything here is already
 * user-defined — your exercises, your symptoms, your body regions. A fixed
 * region-specific questionnaire (Oswestry, HAGOS, iHOT) would have to ship
 * verbatim, is longer, and is licence-encumbered; the PSFS ships as a scale and
 * a rule, and the wording below is ours.
 *
 * Interpretation is not invented here. Published minimal important differences
 * for the *mean* score are about 1.3 (small change), 2.3 (medium) and 2.7
 * (large), and are reported as relatively stable across body regions. The
 * minimal detectable change for a *single* activity is about 3 points — which is
 * why single activities are shown as raw numbers in this app and never labelled
 * "parantunut". Confusing those two thresholds is the standard way to read
 * improvement into noise.
 *
 * Cadence is fortnightly, not daily, and `psfsDue` enforces it. The PSFS
 * measures function over a period. Asking every day would add friction to the
 * one screen that has to stay fast, and would manufacture day-to-day variation
 * that looks like signal.
 *
 * Stored under its own key (`physio-psfs`) rather than inside a day's log:
 * an entry is a fortnightly assessment that happens to carry a date, not part
 * of the daily record, and keeping it separate leaves normalizeLogs untouched.
 */

import { DATE_RE, parseKey } from "./dates";
import { uid } from "./num";

export const PSFS_MIN = 0;
export const PSFS_MAX = 10;

/* the instrument specifies three to five activities */
export const PSFS_MIN_ACTIVITIES = 3;
export const PSFS_MAX_ACTIVITIES = 5;

export const PSFS_INTERVAL_DAYS = 14;

/* minimal important difference for the mean score */
export const PSFS_MID = { small: 1.3, medium: 2.3, large: 2.7 };

/* minimal detectable change for one activity scored alone */
export const PSFS_MDC_SINGLE = 3;

export const emptyPsfs = () => ({ activities: [], entries: {} });

/* ------------------------------------------------------------------ */
/*  Normalization — tolerant, same contract as the other domain loaders */
/* ------------------------------------------------------------------ */
export function normalizePsfs(raw) {
  const out = emptyPsfs();
  if (!raw || typeof raw !== "object") return out;

  const seen = new Set();
  if (Array.isArray(raw.activities)) {
    raw.activities.forEach((a) => {
      if (!a || typeof a !== "object") return;
      const name = typeof a.name === "string" ? a.name.trim() : "";
      if (!name) return;
      const id = a.id != null ? String(a.id) : uid();
      if (seen.has(id)) return;
      seen.add(id);
      out.activities.push({
        id,
        name: name.slice(0, 80),
        added: typeof a.added === "string" && DATE_RE.test(a.added) ? a.added : null,
        retired: !!a.retired,
      });
    });
  }

  const ids = new Set(out.activities.map((a) => a.id));
  if (raw.entries && typeof raw.entries === "object") {
    Object.keys(raw.entries).forEach((k) => {
      if (!DATE_RE.test(k)) return;
      const src = raw.entries[k];
      if (!src || typeof src !== "object") return;
      const scores = {};
      Object.keys(src).forEach((id) => {
        if (!ids.has(id)) return; /* drop scores for activities that no longer exist */
        const v = Math.round(Number(src[id]));
        if (Number.isFinite(v) && v >= PSFS_MIN && v <= PSFS_MAX) scores[id] = v;
      });
      if (Object.keys(scores).length) out.entries[k] = scores;
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Reads                                                              */
/* ------------------------------------------------------------------ */
export const psfsActivities = (p) => ((p && p.activities) || []).filter((a) => !a.retired);

export const psfsAllActivities = (p) => (p && p.activities) || [];

export const psfsActivityName = (p, id) => {
  const a = psfsAllActivities(p).find((x) => x.id === id);
  return a ? a.name : id;
};

export const psfsEntry = (p, dateKey) => (p && p.entries && p.entries[dateKey]) || null;

/* mean of whatever was actually scored that day — never imputes a missing score */
export function psfsMean(scores) {
  if (!scores) return null;
  const vals = Object.keys(scores)
    .map((id) => scores[id])
    .filter((v) => typeof v === "number");
  if (!vals.length) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  return { mean: Math.round((sum / vals.length) * 10) / 10, n: vals.length };
}

/* every assessment, oldest first */
export function psfsSeries(p) {
  const entries = (p && p.entries) || {};
  return Object.keys(entries)
    .sort()
    .map((date) => {
      const m = psfsMean(entries[date]);
      return m ? { date, mean: m.mean, n: m.n, scores: entries[date] } : null;
    })
    .filter(Boolean);
}

export const psfsLastDate = (p) => {
  const s = psfsSeries(p);
  return s.length ? s[s.length - 1].date : null;
};

export function psfsDaysSince(p, todayKey) {
  const last = psfsLastDate(p);
  if (!last) return null;
  const ms = parseKey(todayKey).getTime() - parseKey(last).getTime();
  return Math.max(0, Math.round(ms / 86400000));
}

/* due when never assessed, or when the interval has elapsed */
export function psfsDue(p, todayKey) {
  if (!psfsActivities(p).length) return false; /* nothing to score yet */
  const since = psfsDaysSince(p, todayKey);
  return since == null || since >= PSFS_INTERVAL_DAYS;
}

/* ------------------------------------------------------------------ */
/*  Change between two assessments                                     */
/* ------------------------------------------------------------------ */
export function psfsBand(delta) {
  const d = Math.abs(delta);
  if (d >= PSFS_MID.large) return "large";
  if (d >= PSFS_MID.medium) return "medium";
  if (d >= PSFS_MID.small) return "small";
  return "none";
}

export function psfsBandLabel(band, delta) {
  if (band === "none") return "ei merkittävää muutosta";
  const dir = delta > 0 ? "parannus" : "heikennys";
  if (band === "large") return `suuri ${dir}`;
  if (band === "medium") return `kohtalainen ${dir}`;
  return `pieni ${dir}`;
}

/* first vs latest assessment; null until there are two */
export function psfsChange(p) {
  const s = psfsSeries(p);
  if (s.length < 2) return null;
  const first = s[0];
  const last = s[s.length - 1];
  const delta = Math.round((last.mean - first.mean) * 10) / 10;
  return { first, last, delta, band: psfsBand(delta), n: s.length };
}

/* per-activity first vs latest, reported raw — a single activity needs about
   PSFS_MDC_SINGLE points before a change is distinguishable from measurement
   noise, so no band is attached here on purpose */
export function psfsActivityChanges(p) {
  const s = psfsSeries(p);
  if (!s.length) return [];
  return psfsAllActivities(p)
    .map((a) => {
      const rated = s.filter((e) => typeof e.scores[a.id] === "number");
      if (!rated.length) return null;
      const first = rated[0];
      const last = rated[rated.length - 1];
      const delta = last.scores[a.id] - first.scores[a.id];
      return {
        id: a.id,
        name: a.name,
        retired: !!a.retired,
        firstDate: first.date,
        firstScore: first.scores[a.id],
        lastDate: last.date,
        lastScore: last.scores[a.id],
        delta,
        beyondNoise: Math.abs(delta) >= PSFS_MDC_SINGLE,
        n: rated.length,
      };
    })
    .filter(Boolean);
}

/* ------------------------------------------------------------------ */
/*  Writes — pure, callers persist the result                          */
/* ------------------------------------------------------------------ */
export function psfsAddActivity(p, name, todayKey) {
  const n = (name || "").trim().slice(0, 80);
  if (!n) return p;
  if (psfsActivities(p).length >= PSFS_MAX_ACTIVITIES) return p;
  const taken = psfsActivities(p).some((a) => a.name.toLowerCase() === n.toLowerCase());
  if (taken) return p;
  return {
    ...p,
    activities: [...psfsAllActivities(p), { id: uid(), name: n, added: todayKey || null, retired: false }],
  };
}

export function psfsRenameActivity(p, id, name) {
  const n = (name || "").slice(0, 80);
  return { ...p, activities: psfsAllActivities(p).map((a) => (a.id === id ? { ...a, name: n } : a)) };
}

/* Retire, never delete: past assessments referenced this activity and a report
   that silently loses a scored item is worse than one that shows it stopped. */
export function psfsRetireActivity(p, id, retired) {
  return { ...p, activities: psfsAllActivities(p).map((a) => (a.id === id ? { ...a, retired: !!retired } : a)) };
}

/* Drops the activity and every score it ever had. Only for a mistyped entry
   that was never meant to be part of the record. */
export function psfsForgetActivity(p, id) {
  const entries = {};
  Object.keys((p && p.entries) || {}).forEach((k) => {
    const src = { ...p.entries[k] };
    delete src[id];
    if (Object.keys(src).length) entries[k] = src;
  });
  return { activities: psfsAllActivities(p).filter((a) => a.id !== id), entries };
}

export function psfsSetScore(p, dateKey, id, value) {
  const entries = { ...((p && p.entries) || {}) };
  const cur = { ...(entries[dateKey] || {}) };
  if (value == null) delete cur[id];
  else {
    const v = Math.round(Number(value));
    if (!Number.isFinite(v) || v < PSFS_MIN || v > PSFS_MAX) return p;
    cur[id] = v;
  }
  if (Object.keys(cur).length) entries[dateKey] = cur;
  else delete entries[dateKey];
  return { ...p, activities: psfsAllActivities(p), entries };
}

export function psfsClearEntry(p, dateKey) {
  const entries = { ...((p && p.entries) || {}) };
  delete entries[dateKey];
  return { ...p, activities: psfsAllActivities(p), entries };
}
