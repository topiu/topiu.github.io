import { describe, it, expect } from "vitest";
import {
  buildReport,
  emptyPsfs,
  psfsAddActivity,
  psfsSetScore,
  reportBodyHTML,
  reportDocument,
  reportText,
} from "../src/domain";

const TODAY = new Date(2026, 6, 28); /* 2026-07-28 */

const ex = (id: string, name: string, sets: number, extra: any = {}) => ({
  id,
  name,
  desc: "",
  type: "strength",
  muscles: {},
  structures: [],
  unit: "sets",
  met: null,
  source: null,
  archived: false,
  dose: { sets, reps: 10, hold: null, min: null },
  ...extra,
});

const day = (sets: any, goal: any, rest: any = {}) => ({
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

describe("report range", () => {
  it("never claims a window that predates the data", () => {
    const m = buildReport({
      exercises: [ex("a", "Loitonnus", 2)],
      logs: { "2026-07-26": day({ a: 2 }, { a: { sets: 2 } }) },
      today: TODAY,
      days: 90,
    });
    expect(m.from).toBe("2026-07-26");
    expect(m.to).toBe("2026-07-28");
    expect(m.spanDays).toBe(3);
    expect(m.truncated).toBe(true);
  });

  it("uses the full window when there is enough history", () => {
    const m = buildReport({
      exercises: [ex("a", "Loitonnus", 2)],
      logs: { "2026-01-01": day({ a: 2 }, { a: { sets: 2 } }) },
      today: TODAY,
      days: 7,
    });
    expect(m.from).toBe("2026-07-22");
    expect(m.spanDays).toBe(7);
    expect(m.truncated).toBe(false);
  });

  it("days=0 covers everything on record", () => {
    const m = buildReport({
      exercises: [ex("a", "Loitonnus", 2)],
      logs: { "2026-07-01": day({ a: 2 }, { a: { sets: 2 } }) },
      marks: [{ id: "m", date: "2026-06-20", text: "Alku", auto: false }],
      today: TODAY,
      days: 0,
    });
    expect(m.from).toBe("2026-06-20"); /* a mark is data too */
  });
});

describe("report adherence", () => {
  it("scores each day against the dose in force that day, not today's dose", () => {
    /* current prescription is 3 sets; on 07-27 it was 2, and 2 were done */
    const m = buildReport({
      exercises: [ex("a", "Loitonnus", 3)],
      logs: { "2026-07-27": day({ a: 2 }, { a: { sets: 2, reps: 10, hold: null, min: null } }) },
      today: TODAY,
      days: 2,
    });
    const row = m.exercises[0];
    expect(row.daysComplete).toBe(1); /* would be 0 if it compared against 3 */
    expect(row.unitsGoal).toBe(2 + 3); /* 07-27 snapshot 2, 07-28 unlogged so current 3 */
  });

  it("starts an exercise's denominator the day it first appears", () => {
    const logs = {
      "2026-07-20": day({ a: 2 }, { a: { sets: 2 } }),
      "2026-07-27": day({ a: 2, b: 1 }, { a: { sets: 2 }, b: { sets: 1 } }),
    };
    const m = buildReport({
      exercises: [ex("a", "Vanha", 2), ex("b", "Uusi", 1)],
      logs,
      today: TODAY,
      days: 9 /* 07-20 .. 07-28 */,
    });
    const [a, b] = m.exercises;
    expect(a.days).toBe(9);
    expect(b.days).toBe(2); /* 07-27 and 07-28 only */
    expect(b.since).toBe("2026-07-27");
    expect(b.completePct).toBe(50);
  });

  it("counts sets beyond the dose as overdrive without inflating adherence", () => {
    const m = buildReport({
      exercises: [ex("a", "Loitonnus", 2)],
      logs: { "2026-07-28": day({ a: 4 }, { a: { sets: 2 } }) },
      today: TODAY,
      days: 1,
    });
    expect(m.exercises[0].over).toBe(1);
    expect(m.exercises[0].completePct).toBe(100);
    expect(m.adherence.pct).toBe(100);
  });

  it("leaves archived exercises out of the numbers but reports the count", () => {
    const m = buildReport({
      exercises: [ex("a", "Aktiivinen", 1), ex("z", "Arkistoitu", 1, { archived: true })],
      logs: { "2026-07-28": day({ a: 1 }, { a: { sets: 1 } }) },
      today: TODAY,
      days: 1,
    });
    expect(m.exercises.map((e: any) => e.name)).toEqual(["Aktiivinen"]);
    expect(m.archivedExercises).toBe(1);
    expect(m.adherence.pct).toBe(100);
  });

  it("handles a minute-unit exercise on its own scale", () => {
    const m = buildReport({
      exercises: [ex("a", "Kävely", 1, { unit: "min", dose: { sets: null, reps: null, hold: null, min: 20 } })],
      logs: { "2026-07-28": day({}, { a: { min: 20 } }, { mins: { a: 25 } }) },
      today: TODAY,
      days: 1,
    });
    expect(m.exercises[0].unit).toBe("min");
    expect(m.exercises[0].daysComplete).toBe(1);
    expect(m.exercises[0].over).toBe(1);
  });

  it("reports no adherence rather than 0 % when there is nothing prescribed", () => {
    const m = buildReport({ exercises: [], logs: {}, today: TODAY, days: 7 });
    expect(m.adherence.pct).toBe(null);
    expect(m.exercises).toEqual([]);
  });
});

describe("report adherence with weekly prescriptions", () => {
  /* Three complete sessions in the seven days ending 28.7. Any seven-day window
     asks for exactly `freq` sessions regardless of where the week boundary
     falls, which makes this the clearest possible case. */
  const logs = {
    "2026-07-22": day({ a: 2 }, { a: { sets: 2 } }),
    "2026-07-25": day({ a: 2 }, { a: { sets: 2 } }),
    "2026-07-28": day({ a: 2 }, { a: { sets: 2 } }),
  };

  it("scores a 3×/week exercise against its weekly target", () => {
    const m = buildReport({ exercises: [ex("a", "Loitonnus", 2, { freq: 3 })], logs, today: TODAY, days: 7 });
    const row = m.exercises[0];
    expect(row.target).toBe(3);
    expect(row.daysComplete).toBe(3);
    expect(row.completePct).toBe(100);
    expect(m.adherence.pct).toBe(100);
  });

  it("is the old calendar-day behaviour for a daily exercise", () => {
    const m = buildReport({ exercises: [ex("a", "Loitonnus", 2)], logs, today: TODAY, days: 7 });
    const row = m.exercises[0];
    expect(row.target).toBe(7);
    expect(row.completePct).toBe(43); /* the number a 3×/week exercise used to be stuck at */
  });

  it("reports over-delivery above 100 rather than silently capping it", () => {
    const m = buildReport({ exercises: [ex("a", "Loitonnus", 2, { freq: 1 })], logs, today: TODAY, days: 7 });
    expect(m.exercises[0].target).toBe(1);
    expect(m.exercises[0].completePct).toBe(300);
  });

  it("carries the frequency into the report so the physio sees the prescription", () => {
    const m = buildReport({ exercises: [ex("a", "Loitonnus", 2, { freq: 3 })], logs, today: TODAY, days: 7 });
    expect(m.exercises[0].freqText).toBe("3× viikossa");
    const html = reportBodyHTML(m, {});
    expect(html).toContain("3× viikossa");
    expect(reportText(m, {})).toContain("3× viikossa");
  });

  it("leaves the frequency out of the page when it is daily", () => {
    const m = buildReport({ exercises: [ex("a", "Loitonnus", 2)], logs, today: TODAY, days: 7 });
    expect(reportBodyHTML(m, {})).not.toContain("päivittäin");
  });
});

describe("report symptoms and marks", () => {
  it("counts symptom days, mean severity and quality tallies", () => {
    const logs = {
      "2026-07-26": day({}, {}, { flared: ["s1"], severity: { s1: 1 }, quality: { s1: "ache" } }),
      "2026-07-27": day({}, {}, { flared: ["s1"], severity: { s1: 3 }, quality: { s1: "tingle" } }),
      "2026-07-28": day({}, {}, { flared: [] }),
    };
    const m = buildReport({
      exercises: [],
      symptoms: [{ id: "s1", name: "Nivunen", regions: {}, structures: {}, archived: false }],
      logs,
      today: TODAY,
      days: 3,
    });
    const s = m.symptoms[0];
    expect(s.days).toBe(2);
    expect(s.pct).toBe(67);
    expect(s.meanSeverity).toBe(2);
    expect(s.worstLabel).toBe("kova");
    expect(s.qualities.map((q: any) => q.label).sort()).toEqual(["jomotus", "pistely"]);
    expect(m.symptomFreeDays).toBe(1);
  });

  it("separates auto-logged dose changes from hand-typed milestones", () => {
    const m = buildReport({
      exercises: [],
      logs: {},
      marks: [
        { id: "1", date: "2026-07-27", text: "Annos: Loitonnus: 2 × 10 → 3 × 10", auto: true },
        { id: "2", date: "2026-07-27", text: "Ensimmäinen kipuvapaa lenkki", auto: false },
        { id: "3", date: "2026-01-01", text: "Kauan sitten", auto: false },
      ],
      today: TODAY,
      days: 7,
    });
    expect(m.doseChanges.length).toBe(1);
    expect(m.milestones.length).toBe(1);
    expect(m.milestones[0].text).toBe("Ensimmäinen kipuvapaa lenkki");
  });

  it("caps notes at twelve, newest first, and says how many there were", () => {
    const logs: any = {};
    for (let d = 1; d <= 20; d++) {
      const k = `2026-07-${String(d).padStart(2, "0")}`;
      logs[k] = day({}, {}, { note: `merkintä ${d}` });
    }
    const m = buildReport({ exercises: [], logs, today: TODAY, days: 0 });
    expect(m.notes.length).toBe(12);
    expect(m.notes[0].text).toBe("merkintä 20");
    expect(m.notesTotal).toBe(20);
  });

  it("averages steps only over days that have data", () => {
    const logs = {
      "2026-07-27": day({}, {}, { steps: 4000 }),
      "2026-07-28": day({}, {}, { steps: 6000 }),
      "2026-07-26": day({}, {}, { note: "ei askeleita" }),
    };
    const m = buildReport({ exercises: [], logs, today: TODAY, days: 3 });
    expect(m.steps).toEqual({ mean: 5000, days: 2 });
  });
});

describe("report rendering", () => {
  const model = () => {
    let p: any = emptyPsfs();
    p = psfsAddActivity(p, "Sukkien pukeminen", "2026-06-01");
    const id = p.activities[0].id;
    p = psfsSetScore(p, "2026-06-01", id, 3);
    p = psfsSetScore(p, "2026-07-15", id, 8);
    return buildReport({
      exercises: [ex("a", "Lonkan loitonnus", 2)],
      symptoms: [{ id: "s1", name: "Nivunen", regions: {}, structures: {}, archived: false }],
      logs: { "2026-07-28": day({ a: 2 }, { a: { sets: 2 } }, { flared: ["s1"], severity: { s1: 2 } }) },
      marks: [],
      psfs: p,
      today: TODAY,
      days: 30,
    });
  };

  it("puts the substance in the HTML body", () => {
    const html = reportBodyHTML(model(), { questions: "Voiko lisätä toistoja?" });
    expect(html).toContain("Lonkan loitonnus");
    expect(html).toContain("Nivunen");
    expect(html).toContain("Sukkien pukeminen");
    expect(html).toContain("Voiko lisätä toistoja?");
    expect(html).toContain("PSFS");
    expect(html).toContain("+5"); /* 3 -> 8 */
  });

  it("escapes user text instead of trusting it", () => {
    let p: any = psfsAddActivity(emptyPsfs(), '<img src=x onerror="boom">', "2026-06-01");
    p = psfsSetScore(p, "2026-07-01", p.activities[0].id, 4);
    const m = buildReport({ exercises: [], logs: {}, psfs: p, today: TODAY, days: 30 });
    const html = reportBodyHTML(m, { questions: "<script>alert(1)</script>" });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("keeps line breaks in the questions block", () => {
    const html = reportBodyHTML(model(), { questions: "eka\ntoka" });
    expect(html).toContain("eka<br>toka");
  });

  it("omits the questions block entirely when nothing was written", () => {
    expect(reportBodyHTML(model(), { questions: "   " })).not.toContain("Kysymykset ja huomiot");
  });

  it("produces a standalone document with its styles inlined", () => {
    const doc = reportDocument(model(), { questions: "" });
    expect(doc.startsWith("<!doctype html>")).toBe(true);
    expect(doc).toContain('lang="fi"');
    expect(doc).toContain("@page");
    expect(doc).toContain("Lonkan loitonnus");
    expect(doc).not.toContain("<link"); /* nothing to fetch, so it works offline forever */
  });

  it("produces plain text with the headline numbers", () => {
    const t = reportText(model(), { questions: "Kysymys?" });
    expect(t).toContain("LIIKEPÄIVÄKIRJA");
    expect(t).toContain("KYSYMYKSET JA HUOMIOT");
    expect(t).toContain("Kysymys?");
    expect(t).toContain("Lonkan loitonnus");
    expect(t).toContain("Nivunen");
    expect(t).not.toContain("<"); /* genuinely plain */
  });

  it("trims a long PSFS grid to a printable width without changing the deltas", () => {
    let p: any = psfsAddActivity(emptyPsfs(), "Kävely", "2026-01-01");
    const id = p.activities[0].id;
    /* 20 fortnightly assessments climbing 0 -> 10 */
    for (let i = 0; i < 20; i++) {
      const d = new Date(2025, 8, 1 + i * 14);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      p = psfsSetScore(p, k, id, Math.min(10, Math.round(i / 2)));
    }
    const m = buildReport({ exercises: [], logs: {}, psfs: p, today: TODAY, days: 0 });
    const html = reportBodyHTML(m, {});
    /* 1 label + 8 date columns + 1 change column. The character class matters:
       /<th[^>]*>/ would also match <thead>. */
    const headerCols = (html.match(/<th[ >]/g) || []).length;
    expect(headerCols).toBe(10);
    expect(html).toContain("arvioita on tehty yhteensä 20");
    /* the delta still spans the whole series, not just the shown columns */
    expect(html).toContain("+10"); /* 0 at baseline, 10 at the latest */
  });

  it("renders an empty diary without throwing", () => {
    const m = buildReport({ exercises: [], symptoms: [], logs: {}, marks: [], today: TODAY, days: 30 });
    expect(() => reportBodyHTML(m, {})).not.toThrow();
    expect(reportBodyHTML(m, {})).toContain("Ei aktiivisia liikkeitä");
    expect(() => reportText(m, {})).not.toThrow();
  });
});
