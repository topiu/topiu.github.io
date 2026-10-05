/* Treenitila (gym mode): equipment steps, per-set detail, pain, recall, and
   the round trip through load, export and the report. */
import { describe, it, expect } from "vitest";
import {
  KB_WEIGHTS,
  buildCSV,
  buildJSON,
  buildReport,
  inferEquipment,
  isCompleteOn,
  isEmptyLog,
  lastEquipment,
  lastSession,
  LIBRARY,
  loadSummary,
  nextSetDraft,
  normalizeLogs,
  normalizeSetEntry,
  painSummary,
  parseImport,
  reportText,
  setLabel,
  stepLevel,
  stepLoad,
  timerLeft,
  fmtClock,
  clampRest,
} from "../src/domain";

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
  dose: { sets: 3, reps: 10, hold: null, min: null },
  ...extra,
});

describe("equipment steps", () => {
  it("steps kettlebells along the standard sizes, not by a fixed amount", () => {
    expect(stepLoad("kb", null, 1)).toBe(8);
    expect(stepLoad("kb", 16, 1)).toBe(18);
    expect(stepLoad("kb", 28, 1)).toBe(32);
    expect(stepLoad("kb", 32, -1)).toBe(28);
    expect(stepLoad("kb", 13, 1)).toBe(14); /* off-ladder value snaps */
    expect(stepLoad("kb", KB_WEIGHTS[0], -1)).toBe(null);
    expect(stepLoad("kb", 48, 1)).toBe(52);
  });

  it("steps dumbbells by 1 kg and barbells and machines by 2.5 kg", () => {
    expect(stepLoad("db", 12, 1)).toBe(13);
    expect(stepLoad("bb", null, 1)).toBe(20); /* the empty bar */
    expect(stepLoad("bb", 40, 1)).toBe(42.5);
    expect(stepLoad("machine", 41, 1)).toBe(42.5); /* snaps to the grid */
    expect(stepLoad("machine", 41, -1)).toBe(40);
    expect(stepLoad("db", 1, -1)).toBe(null); /* never negative */
  });

  it("has no load for bodyweight and levels for bands", () => {
    expect(stepLoad("bw", 10, 1)).toBe(10);
    expect(stepLevel(null, 1)).toBe(2);
    expect(stepLevel(4, 1)).toBe(4);
    expect(stepLevel(1, -1)).toBe(null);
  });

  it("guesses equipment from the exercise name when there is no history", () => {
    expect(inferEquipment({ name: "Kahvakuulaheilautus" })).toBe("kb");
    expect(inferEquipment({ name: "Käsipainopenkkipunnerrus" })).toBe("db");
    expect(inferEquipment({ name: "Penkkipunnerrus" })).toBe("bb");
    expect(inferEquipment({ name: "Ylätalja" })).toBe("machine");
    expect(inferEquipment({ name: "Lonkan loitonnus" })).toBe("bw");
    /* every kettlebell preset in the library is recognised as one */
    LIBRARY.filter((l: any) => l.cat === "kb").forEach((l: any) => expect(inferEquipment(l)).toBe("kb"));
  });

  it("keeps an unrecorded field empty rather than zero", () => {
    /* a hold set has no reps; storing 0 would read "0 × …" in the report */
    expect(normalizeSetEntry({ reps: null, hold: 30, kg: null, eq: "bw" })).toEqual({ reps: null, hold: 30, kg: null, lvl: null, eq: "bw" });
    expect(normalizeSetEntry({ reps: 0, kg: "", eq: "nope" })).toEqual({ reps: 0, hold: null, kg: null, lvl: null, eq: null });
  });

  it("labels sets in plain Finnish", () => {
    expect(setLabel({ reps: 10, kg: 12.5, eq: "db" })).toBe("10 × 12,5 kg");
    expect(setLabel({ hold: 30, kg: null })).toBe("30 s");
    expect(setLabel({ reps: 12, lvl: 3, eq: "band" })).toBe("12 × kuminauha raskas");
  });
});

describe("per-set detail never redefines done", () => {
  const a = ex("a");
  it("keeps detail and pain through a load, and trims detail to the set count", () => {
    const raw = {
      "2026-10-01": {
        sets: { a: 2 },
        detail: { a: [{ reps: 10, kg: 40, eq: "bb" }, { reps: 9, kg: 40, eq: "bb" }, { reps: 8, kg: 40, eq: "bb" }], ghost: [{ reps: 1 }] },
        pain: { a: 3, b: 14 },
      },
    };
    const logs: any = normalizeLogs(raw, { a });
    expect(logs["2026-10-01"].detail.a.length).toBe(2);
    expect(logs["2026-10-01"].detail.ghost).toBeUndefined();
    expect(logs["2026-10-01"].pain).toEqual({ a: 3 });
    /* done is still the set count against the snapshot */
    expect(isCompleteOn(logs["2026-10-01"], a)).toBe(false);
  });

  it("leaves days that never used treenitila exactly as they were", () => {
    const raw = { "2026-10-01": { sets: { a: 3 }, goal: { a: { sets: 3, reps: 10, hold: null, min: null, freq: 7 } }, mins: {}, flared: [], severity: {}, quality: {}, note: "", steps: 0 } };
    expect(normalizeLogs(raw, { a })).toEqual(raw);
  });

  it("keeps a day that has only pain recorded", () => {
    expect(isEmptyLog({ sets: {}, mins: {}, flared: [], note: "", steps: 0, pain: { a: 6 } })).toBe(false);
  });

  it("survives export and import", () => {
    const logs = { "2026-10-01": { sets: { a: 1 }, goal: {}, mins: {}, flared: [], severity: {}, quality: {}, note: "", steps: 0, detail: { a: [{ reps: 15, kg: 16, eq: "kb" }] }, pain: { a: 2 } } };
    const back: any = parseImport(buildJSON([a], [], logs, [], null, ""));
    expect(back.ok).toBe(true);
    expect(back.logs["2026-10-01"].detail.a[0]).toEqual({ reps: 15, hold: null, kg: 16, lvl: null, eq: "kb" });
    expect(back.logs["2026-10-01"].pain.a).toBe(2);
    const csv = buildCSV([a], [], logs, [], null);
    expect(csv).toContain("a: 15 × 16 kg");
    expect(csv).toContain("Kipu liikkeen aikana");
  });
});

describe("recall", () => {
  const logs: any = {
    "2026-09-20": { sets: { a: 2 }, detail: { a: [{ reps: 10, kg: 14, eq: "db" }, { reps: 10, kg: 14, eq: "db" }] } },
    "2026-09-27": { sets: { a: 2 }, detail: { a: [{ reps: 12, kg: 16, eq: "kb" }, { reps: 12, kg: 16, eq: "kb" }] } },
  };

  it("finds the last session with the same equipment", () => {
    expect(lastSession(logs, "a", "2026-10-01", "db")!.date).toBe("2026-09-20");
    expect(lastSession(logs, "a", "2026-10-01")!.date).toBe("2026-09-27");
    expect(lastEquipment(logs, "a", "2026-10-01")).toBe("kb");
  });

  it("starts the next set from today's last set, then last time, then the prescription", () => {
    const dose = { sets: 3, reps: 10, hold: null, min: null };
    expect(nextSetDraft({ logs, exId: "a", dateKey: "2026-10-01", eq: "db", dose })).toEqual({ reps: 10, hold: null, kg: 14, lvl: null });
    const withToday = { ...logs, "2026-10-01": { sets: { a: 1 }, detail: { a: [{ reps: 8, kg: 15, eq: "db" }] } } };
    expect(nextSetDraft({ logs: withToday, exId: "a", dateKey: "2026-10-01", eq: "db", dose }).kg).toBe(15);
    expect(nextSetDraft({ logs, exId: "a", dateKey: "2026-10-01", eq: "bb", dose })).toEqual({ reps: 10, hold: null, kg: null, lvl: null });
    expect(nextSetDraft({ logs, exId: "a", dateKey: "2026-10-01", eq: "bw", dose: { sets: 3, reps: null, hold: 30, min: null } }).hold).toBe(30);
  });
});

describe("report facts", () => {
  it("reports loads and pain as plain numbers", () => {
    const a = ex("a", { name: "Kulmasoutu" });
    const logs: any = {
      "2026-10-01": { sets: { a: 2 }, goal: {}, mins: {}, flared: [], severity: {}, quality: {}, note: "", steps: 0, detail: { a: [{ reps: 10, kg: 30, eq: "bb" }, { reps: 10, kg: 32.5, eq: "bb" }] }, pain: { a: 2 } },
      "2026-10-03": { sets: { a: 1 }, goal: {}, mins: {}, flared: [], severity: {}, quality: {}, note: "", steps: 0, detail: { a: [{ reps: 8, kg: 40, eq: "bb" }] }, pain: { a: 4 } },
    };
    const keys = ["2026-10-01", "2026-10-02", "2026-10-03"];
    expect(loadSummary(logs, "a", keys)).toMatchObject({ sets: 3, first: { top: 32.5 }, last: { top: 40 }, max: 40, equipment: ["Tanko"] });
    expect(painSummary(logs, "a", keys)).toEqual({ n: 2, mean: 3, max: 4 });
    const m = buildReport({ exercises: [a], logs, today: new Date(2026, 9, 3), days: 7 });
    const txt = reportText(m, {});
    expect(txt).toContain("kuorma 32,5 → 40 kg (tanko)");
    expect(txt).toContain("kipu liikkeen aikana ka 3, korkein 4 (2 krt)");
  });
});

describe("timers", () => {
  it("counts down from an end time and never below zero", () => {
    expect(timerLeft({ endAt: 60_000 }, 0)).toBe(60);
    expect(timerLeft({ endAt: 60_000 }, 59_001)).toBe(1);
    expect(timerLeft({ endAt: 60_000 }, 70_000)).toBe(0);
    expect(fmtClock(60)).toBe("1:00");
    expect(fmtClock(5)).toBe("0:05");
  });
  it("keeps the rest length sensible", () => {
    expect(clampRest(undefined)).toBe(60);
    expect(clampRest(5)).toBe(15);
    expect(clampRest(90)).toBe(90);
  });
});
