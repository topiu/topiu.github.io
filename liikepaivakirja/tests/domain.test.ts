import { describe, it, expect } from "vitest";
import {
  keyOf,
  addDays,
  parseKey,
  humanDate,
  startOfWeek,
  toNum,
  doseLabel,
  targetSets,
  goalSetsOfEntry,
  goalOf,
  dayDoseOf,
  goalMinOf,
  dedupeSteps,
  parseSteps,
  dayLoad,
  normalizeExercises,
  parseImport,
} from "../src/domain";

describe("dates", () => {
  it("formats and round-trips day keys", () => {
    expect(keyOf(new Date(2026, 6, 28))).toBe("2026-07-28");
    expect(keyOf(parseKey("2026-07-28"))).toBe("2026-07-28");
  });
  it("crosses month and year boundaries", () => {
    expect(keyOf(addDays(new Date(2026, 6, 31), 1))).toBe("2026-08-01");
    expect(keyOf(addDays(new Date(2026, 11, 31), 1))).toBe("2027-01-01");
    expect(keyOf(addDays(new Date(2026, 0, 1), -1))).toBe("2025-12-31");
  });
  it("labels days in Finnish", () => {
    expect(humanDate("2026-07-28")).toBe("Ti 28.7.2026");
  });
  it("starts the week on Monday", () => {
    /* 2026-07-28 is a Tuesday; its week starts Monday the 27th */
    expect(keyOf(startOfWeek(new Date(2026, 6, 28)))).toBe("2026-07-27");
    /* a Sunday belongs to the week that began the previous Monday */
    expect(keyOf(startOfWeek(new Date(2026, 7, 2)))).toBe("2026-07-27");
  });
});

describe("dose parsing and labels", () => {
  it("coerces to a positive integer or null", () => {
    expect(toNum("12")).toBe(12);
    expect(toNum("12 kg")).toBe(12);
    expect(toNum("0")).toBeNull();
    expect(toNum("abc")).toBeNull();
    expect(toNum(null)).toBeNull();
  });
  it("renders every dose shape", () => {
    expect(doseLabel({ sets: 2, reps: 5, hold: 10 })).toBe("2 × 5 × 10 s");
    expect(doseLabel({ sets: 1, reps: 10 })).toBe("1 × 10");
    expect(doseLabel({ sets: 3, hold: 30 })).toBe("3 × 30 s pito");
    expect(doseLabel({ sets: 3 })).toBe("3 sarjaa");
    expect(doseLabel({ sets: 1 })).toBe("");
    expect(doseLabel({ min: 30 }, "min")).toBe("30 min");
    expect(doseLabel(null)).toBe("");
  });
});

describe("dose snapshots — history must be immutable (§4.2)", () => {
  const ex = { id: "e1", name: "Lonkan ojennus", dose: { sets: 5, reps: 8, hold: null, min: null } };

  it("evaluates completion against the day's snapshot, not the current dose", () => {
    const day = { goal: { e1: { sets: 2, reps: 5, hold: 10 } } };
    /* the exercise has since been raised to 5 sets; the logged day stays at 2 */
    expect(goalOf(day, ex)).toBe(2);
    expect(goalOf({ goal: {} }, ex)).toBe(targetSets(ex));
  });

  it("keeps the whole dose object, so reps and hold show historically", () => {
    const day = { goal: { e1: { sets: 2, reps: 5, hold: 10 } } };
    expect(dayDoseOf(day, ex)).toEqual({ sets: 2, reps: 5, hold: 10, min: null });
    expect(doseLabel(dayDoseOf(day, ex))).toBe("2 × 5 × 10 s");
  });

  it("reads legacy numeric snapshots from older versions", () => {
    expect(goalSetsOfEntry(3)).toBe(3);
    expect(goalSetsOfEntry(null)).toBeNull();
    expect(goalSetsOfEntry({ sets: 2 })).toBe(2);
    /* a malformed set count falls back to one set rather than zero */
    expect(goalSetsOfEntry({ sets: 0 })).toBe(1);
    expect(dayDoseOf({ goal: { e1: 3 } }, ex)).toEqual({
      sets: 3,
      reps: null,
      hold: null,
      min: null,
    });
  });

  it("falls back to the current dose where no snapshot exists", () => {
    expect(dayDoseOf({ goal: {} }, ex)).toBe(ex.dose);
    const cardio = { id: "c1", unit: "min", dose: { sets: null, reps: null, hold: null, min: 30 } };
    expect(goalMinOf({ goal: { c1: { min: 45 } } }, cardio)).toBe(45);
    expect(goalMinOf({ goal: {} }, cardio)).toBe(30);
  });
});

describe("symptom load", () => {
  it("sums severities, treating an unset severity as 2", () => {
    expect(dayLoad(null)).toBe(0);
    expect(dayLoad({ flared: [] })).toBe(0);
    expect(dayLoad({ flared: ["s1", "s2"], severity: { s1: 3 } })).toBe(5);
  });
});

describe("step import", () => {
  it("keeps the larger count when a day repeats", () => {
    const r = dedupeSteps([
      { date: "2026-07-20", steps: 4000 },
      { date: "2026-07-20", steps: 9500 },
      { date: "2026-07-19", steps: 100 },
    ]);
    expect(r.ok).toBe(true);
    expect(r.rows).toEqual([
      { date: "2026-07-19", steps: 100 },
      { date: "2026-07-20", steps: 9500 },
    ]);
    expect(r.from).toBe("2026-07-19");
    expect(r.to).toBe("2026-07-20");
  });
  it("rejects a set with no valid dates", () => {
    expect(dedupeSteps([{ date: "20.7.2026", steps: 1 }]).ok).toBe(false);
  });
  it("parses the semicolon format the Shortcut produces", () => {
    const r = parseSteps("2026-07-20;8123\n2026-07-21;9044");
    expect(r.ok).toBe(true);
    expect(r.rows.length).toBe(2);
    expect(r.rows[1]).toEqual({ date: "2026-07-21", steps: 9044 });
  });
});

describe("import guards", () => {
  it("refuses invalid JSON and structureless payloads", () => {
    expect(parseImport("not json").ok).toBe(false);
    expect(parseImport("[]").ok).toBe(false);
    expect(parseImport(JSON.stringify({ exercises: [] })).ok).toBe(false);
  });
  it("normalises exercises to a complete shape", () => {
    const out = normalizeExercises([{ name: "Testi" }]);
    expect(out).toHaveLength(1);
    expect(out![0].name).toBe("Testi");
    expect(out![0].id).toBeTruthy();
    expect(out![0].dose).toBeTruthy();
    expect(out![0].archived).toBe(false);
  });
});
