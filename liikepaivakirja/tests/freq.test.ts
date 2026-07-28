import { describe, it, expect } from "vitest";
import {
  FREQ_DAILY,
  expectedSessions,
  freqLabel,
  freqOf,
  goalFreqOf,
  isCompleteOn,
  keyOf,
  parseKey,
  startOfWeek,
  weekKeys,
  weekProgress,
} from "../src/domain";

const ex = (over: any = {}) => ({
  id: "e1",
  name: "Loitonnus",
  unit: "sets",
  archived: false,
  dose: { sets: 2, reps: 10, hold: null, min: null },
  ...over,
});

const day = (sets: any, goal: any = null) => ({
  sets,
  goal: goal || {},
  mins: {},
  flared: [],
  severity: {},
  quality: {},
  note: "",
  steps: 0,
});

/* keys for n days starting at a given key, inclusive */
const range = (startKey: string, n: number) => {
  const d = parseKey(startKey);
  return Array.from({ length: n }, (_, i) => {
    const x = new Date(d);
    x.setDate(x.getDate() + i);
    return keyOf(x);
  });
};

describe("freqOf", () => {
  it("treats anything missing or malformed as daily, preserving old behaviour", () => {
    expect(freqOf(ex())).toBe(FREQ_DAILY);
    expect(freqOf(ex({ freq: null }))).toBe(FREQ_DAILY);
    expect(freqOf(ex({ freq: 0 }))).toBe(FREQ_DAILY);
    expect(freqOf(ex({ freq: 99 }))).toBe(FREQ_DAILY);
    expect(freqOf(ex({ freq: "kolme" }))).toBe(FREQ_DAILY);
    expect(freqOf(undefined)).toBe(FREQ_DAILY);
  });

  it("keeps a valid weekly count and rounds a fractional one", () => {
    expect(freqOf(ex({ freq: 3 }))).toBe(3);
    expect(freqOf(ex({ freq: "3" }))).toBe(3);
    expect(freqOf(ex({ freq: 2.4 }))).toBe(2);
  });

  it("labels daily as words, not as a 7", () => {
    expect(freqLabel(7)).toBe("päivittäin");
    expect(freqLabel(3)).toBe("3× viikossa");
  });
});

describe("goalFreqOf", () => {
  it("prefers the day's snapshot so a later change cannot rewrite it", () => {
    const e = ex({ freq: 5 });
    const l = day({ e1: 2 }, { e1: { sets: 2, freq: 3 } });
    expect(goalFreqOf(l, e)).toBe(3);
  });

  it("falls back to the current prescription when the day has no snapshot", () => {
    expect(goalFreqOf(day({ e1: 2 }), ex({ freq: 4 }))).toBe(4);
    expect(goalFreqOf(null, ex({ freq: 4 }))).toBe(4);
  });

  it("ignores a nonsense snapshot value rather than trusting it", () => {
    const l = day({ e1: 2 }, { e1: { sets: 2, freq: 0 } });
    expect(goalFreqOf(l, ex({ freq: 4 }))).toBe(4);
  });
});

describe("weekKeys", () => {
  it("returns Monday to Sunday for any day in the week", () => {
    const wed = weekKeys("2026-07-29");
    expect(wed.length).toBe(7);
    expect(wed[0]).toBe(keyOf(startOfWeek(parseKey("2026-07-29"))));
    expect(parseKey(wed[0]).getDay()).toBe(1); /* Monday */
    expect(parseKey(wed[6]).getDay()).toBe(0); /* Sunday */
    /* every day in the same week agrees on the same week */
    expect(weekKeys(wed[6])[0]).toBe(wed[0]);
  });
});

describe("weekProgress", () => {
  const e = ex({ freq: 3 });

  it("counts completed days across the whole Monday–Sunday week", () => {
    const [mon, tue, wed] = weekKeys("2026-07-29");
    const logs = {
      [mon]: day({ e1: 2 }, { e1: { sets: 2 } }),
      [tue]: day({ e1: 1 }, { e1: { sets: 2 } }) /* incomplete, does not count */,
      [wed]: day({ e1: 3 }, { e1: { sets: 2 } }) /* over the dose, still one session */,
    };
    const p = weekProgress(logs, e, tue);
    expect(p.done).toBe(2);
    expect(p.target).toBe(3);
    expect(p.met).toBe(false);
    expect(p.remaining).toBe(1);
  });

  it("counts a session logged later in the same week", () => {
    const keys = weekKeys("2026-07-29");
    const logs: any = {};
    keys.slice(0, 3).forEach((k) => (logs[k] = day({ e1: 2 }, { e1: { sets: 2 } })));
    /* viewed from Monday, the Tuesday and Wednesday sessions still count */
    const p = weekProgress(logs, e, keys[0]);
    expect(p.done).toBe(3);
    expect(p.met).toBe(true);
    expect(p.remaining).toBe(0);
  });

  it("does not leak across a week boundary", () => {
    const thisWeek = weekKeys("2026-07-29");
    const lastMonday = keyOf(new Date(parseKey(thisWeek[0]).getTime() - 7 * 86400000));
    const logs = { [lastMonday]: day({ e1: 2 }, { e1: { sets: 2 } }) };
    expect(weekProgress(logs, e, thisWeek[0]).done).toBe(0);
  });
});

describe("expectedSessions", () => {
  const monday = keyOf(startOfWeek(parseKey("2026-07-29")));

  it("is the day count for a daily exercise, so existing numbers are unchanged", () => {
    expect(expectedSessions({}, ex(), range(monday, 28))).toBe(28);
    expect(expectedSessions({}, ex(), range(monday, 7))).toBe(7);
  });

  it("prorates a weekly target over whole weeks", () => {
    expect(expectedSessions({}, ex({ freq: 3 }), range(monday, 28))).toBe(12);
    expect(expectedSessions({}, ex({ freq: 3 }), range(monday, 7))).toBe(3);
    expect(expectedSessions({}, ex({ freq: 1 }), range(monday, 28))).toBe(4);
  });

  it("prorates a part-week at the edge of the range", () => {
    /* three weeks plus three days at 3×/week: 9 + 9/7 ≈ 10.3 */
    expect(expectedSessions({}, ex({ freq: 3 }), range(monday, 24))).toBe(10);
  });

  it("never expects zero sessions over a non-empty range", () => {
    expect(expectedSessions({}, ex({ freq: 2 }), range(monday, 1))).toBe(1);
    expect(expectedSessions({}, ex({ freq: 1 }), range(monday, 2))).toBe(1);
  });

  it("returns zero for an empty range", () => {
    expect(expectedSessions({}, ex({ freq: 3 }), [])).toBe(0);
  });

  it("honours a frequency change recorded mid-range", () => {
    const keys = range(monday, 14);
    /* first week snapshotted at 2×, second at 6×; current prescription is 3× */
    const logs: any = {
      [keys[0]]: day({ e1: 2 }, { e1: { sets: 2, freq: 2 } }),
      [keys[7]]: day({ e1: 2 }, { e1: { sets: 2, freq: 6 } }),
    };
    expect(expectedSessions(logs, ex({ freq: 3 }), keys)).toBe(8); /* 2 + 6, not 3 + 3 */
  });
});

describe("isCompleteOn", () => {
  it("respects the day's dose snapshot rather than the current dose", () => {
    const e = ex({ dose: { sets: 5, reps: 10, hold: null, min: null } });
    const l = day({ e1: 2 }, { e1: { sets: 2 } });
    expect(isCompleteOn(l, e)).toBe(true);
  });

  it("uses minutes for a minute-unit exercise", () => {
    const e = ex({ unit: "min", dose: { sets: null, reps: null, hold: null, min: 20 } });
    const l = { ...day({}), mins: { e1: 20 }, goal: { e1: { min: 20 } } };
    expect(isCompleteOn(l, e)).toBe(true);
    expect(isCompleteOn({ ...l, mins: { e1: 19 } }, e)).toBe(false);
  });

  it("is false for a missing day or exercise", () => {
    expect(isCompleteOn(null, ex())).toBe(false);
    expect(isCompleteOn(day({}), null)).toBe(false);
  });
});
