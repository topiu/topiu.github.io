/* Regression tests for the defects found in the October 2026 code review.
   Each test names the invariant it protects. */
import { describe, it, expect } from "vitest";
import {
  buildReport,
  creditedSessions,
  diffDatasets,
  emptyPsfs,
  expectedSessions,
  isCompleteOn,
  normalizeLogs,
  normalizePsfs,
  psfsAddActivity,
  psfsChange,
  psfsRenameActivity,
  psfsSetScore,
  weekProgress,
} from "../src/domain";

const TODAY = new Date(2026, 6, 28); /* Tue 2026-07-28 */

const ex = (id: string, extra: any = {}) => ({
  id,
  name: id,
  desc: "",
  type: "strength",
  muscles: {},
  structures: [],
  unit: "sets",
  met: null,
  source: null,
  archived: false,
  dose: { sets: 1, reps: 10, hold: null, min: null },
  ...extra,
});

const day = (sets: any, goal: any = {}, rest: any = {}) => ({
  sets,
  goal,
  mins: {},
  flared: [],
  severity: {},
  quality: {},
  note: "",
  steps: 0,
  ...rest,
});

describe("history is immutable for minute exercises", () => {
  it("keeps a minute exercise's dose snapshot through normalization", () => {
    const walk = ex("w", { unit: "min", dose: { sets: null, reps: null, hold: null, min: 30 }, freq: 3 });
    const raw = { "2026-07-20": { sets: {}, mins: { w: 30 }, goal: { w: { sets: 1, min: 30, freq: 3 } } } };
    const logs = normalizeLogs(raw, { w: walk });
    expect(logs["2026-07-20"].goal.w).toEqual({ sets: 1, reps: null, hold: null, min: 30, freq: 3 });
    /* the prescription later rises to 45 min: the past day must still be complete */
    const later = { ...walk, dose: { ...walk.dose, min: 45 } };
    expect(isCompleteOn(logs["2026-07-20"], later)).toBe(true);
  });

  it("backfills a snapshot for a minute-only day that has none", () => {
    const walk = ex("w", { unit: "min", dose: { sets: null, reps: null, hold: null, min: 20 } });
    const logs = normalizeLogs({ "2026-07-20": { mins: { w: 20 } } }, { w: walk });
    expect(logs["2026-07-20"].goal.w.min).toBe(20);
  });

  it("gives legacy done[] days an explicit daily frequency, so loads agree", () => {
    const a = ex("a");
    const once = normalizeLogs({ "2026-07-20": { done: ["a"] } }, { a });
    const twice = normalizeLogs(once, { a });
    expect(once["2026-07-20"].goal.a.freq).toBe(7);
    expect(twice).toEqual(once);
  });
});

describe("weekly targets come from the week's own snapshot", () => {
  it("keeps a past week met after the prescription rises", () => {
    const logs = {
      "2026-07-13": day({ a: 1 }, { a: { sets: 1, freq: 3 } }),
      "2026-07-15": day({ a: 1 }, { a: { sets: 1, freq: 3 } }),
      "2026-07-17": day({ a: 1 }, { a: { sets: 1, freq: 3 } }),
    };
    const p = weekProgress(logs, ex("a", { freq: 5 }), "2026-07-15");
    expect(p.target).toBe(3);
    expect(p.met).toBe(true);
  });
});

describe("programme adherence is not inflated by extra sessions", () => {
  const keys = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(2026, 6, 1 + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  it("credits no more than the weekly target", () => {
    const a = ex("a", { freq: 3 });
    const logs = Object.fromEntries(keys.map((k) => [k, day({ a: 1 }, { a: { sets: 1, freq: 3 } })]));
    expect(creditedSessions(logs, a, keys)).toBe(expectedSessions(logs, a, keys));
  });

  it("does not let one exercise's extra sessions hide another's zero", () => {
    const a = ex("a", { freq: 3 });
    const b = ex("b", { freq: 3 });
    const logs = Object.fromEntries(keys.map((k) => [k, day({ a: 1 }, { a: { sets: 1, freq: 3 } })]));
    const m = buildReport({ exercises: [a, b], logs, today: new Date(2026, 6, 28), days: 28 });
    expect(m.exercises.find((r: any) => r.id === "a").completePct).toBeGreaterThan(100);
    expect(m.adherence.pct).toBe(50);
  });

  it("does not count the days before an exercise was added as missed", () => {
    const a = ex("a");
    const fresh = ex("b", { added: "2026-07-28" });
    const logs = { "2026-07-01": day({ a: 1 }), "2026-07-28": day({ a: 1, b: 1 }) };
    const m = buildReport({ exercises: [a, fresh], logs, today: TODAY, days: 28 });
    const row = m.exercises.find((r: any) => r.id === "b");
    expect(row.since).toBe("2026-07-28");
    expect(row.target).toBe(1);
  });
});

describe("PSFS", () => {
  it("never drops an activity, or its scores, because its name was cleared", () => {
    let p: any = psfsAddActivity(emptyPsfs(), "Portaat", "2026-07-01");
    const id = p.activities[0].id;
    p = psfsSetScore(p, "2026-07-01", id, 4);
    p = psfsRenameActivity(p, id, "");
    const back = normalizePsfs(JSON.parse(JSON.stringify(p)));
    expect(back.activities.length).toBe(1);
    expect(back.activities[0].name).toBeTruthy();
    expect(back.entries["2026-07-01"][id]).toBe(4);
  });

  it("bands from unrounded means", () => {
    /* means 4.333 → 7.0: the true delta 2.67 is medium; rounding first gave 2.7, large */
    let p: any = emptyPsfs();
    ["A", "B", "C"].forEach((n) => (p = psfsAddActivity(p, n, "2026-06-01")));
    const [a, b, c] = p.activities.map((x: any) => x.id);
    [[a, 4], [b, 4], [c, 5]].forEach(([id, v]) => (p = psfsSetScore(p, "2026-06-01", id, v)));
    [a, b, c].forEach((id) => (p = psfsSetScore(p, "2026-07-01", id, 7)));
    expect(psfsChange(p)!.band).toBe("medium");
  });

  it("compares only the activities scored on both occasions", () => {
    let p: any = emptyPsfs();
    ["A", "B", "C", "D"].forEach((n) => (p = psfsAddActivity(p, n, "2026-06-01")));
    const [a, b, c, d] = p.activities.map((x: any) => x.id);
    [a, b, c].forEach((id) => (p = psfsSetScore(p, "2026-06-01", id, 2)));
    [a, b].forEach((id) => (p = psfsSetScore(p, "2026-07-01", id, 2)));
    p = psfsSetScore(p, "2026-07-01", d, 9);
    const ch = psfsChange(p)!;
    expect(ch.delta).toBe(0);
    expect(ch.band).toBe("none");
    expect(ch.sameSet).toBe(false);
    expect(ch.common).toBe(2);
  });
});

describe("restore preview compares contents, not counts", () => {
  const base: any = {
    ex: [ex("e1")],
    sy: [],
    logs: { "2026-07-28": day({ e1: 1 }, {}, { note: "aamu" }) },
    marks: [],
    psfs: emptyPsfs(),
    questions: "",
  };

  it("reports a same-day snapshot with different entries as changing that day", () => {
    const now: any = { ...base, logs: { "2026-07-28": day({ e1: 3 }, {}, { note: "aamu ja ilta" }) } };
    const d = diffDatasets(now, base);
    expect(d.identical).toBe(false);
    expect(d.changedDays).toEqual(["2026-07-28"]);
    expect(d.destructive).toBe(true);
  });

  it("still recognises equal data built in a different key order", () => {
    const { note, ...rest } = day({ e1: 1 }, {}, { note: "aamu" });
    const reordered: any = { ...base, logs: { "2026-07-28": { note, ...rest } } };
    expect(diffDatasets(base, reordered).identical).toBe(true);
  });
});

describe("training days agree between Historia and the report", () => {
  it("counts a day an archived exercise was done as a training day", () => {
    const gone = ex("g", { archived: true });
    const logs = { "2026-07-27": day({ g: 1 }) };
    const m = buildReport({ exercises: [ex("a"), gone], logs, today: TODAY, days: 7 });
    expect(m.adherence.trainedDays).toBe(1);
  });
});
