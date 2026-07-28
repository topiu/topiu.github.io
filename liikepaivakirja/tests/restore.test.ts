import { describe, it, expect } from "vitest";
import {
  DATA_KEYS,
  buildJSON,
  describeDataset,
  diffDatasets,
  emptyPsfs,
  parseImport,
  psfsAddActivity,
  psfsSetScore,
  snapshotToDataset,
} from "../src/domain";

const ex = (id: string, name: string) => ({
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
  dose: { sets: 2, reps: 10, hold: null, min: null },
});

const day = (sets: any = {}, extra: any = {}) => ({
  sets,
  goal: Object.fromEntries(Object.keys(sets).map((k) => [k, { sets: 2, reps: 10, hold: null, min: null }])),
  mins: {},
  flared: [],
  severity: {},
  quality: {},
  note: "",
  steps: 0,
  ...extra,
});

const snapshotParts = (over: any = {}) => ({
  "physio-config": { exercises: [ex("e1", "Loitonnus")], symptoms: [{ id: "s1", name: "Selkä", regions: {} }] },
  "physio-logs": { "2026-07-20": day({ e1: 2 }), "2026-07-21": day({ e1: 1 }) },
  "physio-marks": [{ id: "m1", date: "2026-07-20", text: "Aloitus", auto: false }],
  "physio-psfs": { activities: [{ id: "a1", name: "Kävely" }], entries: { "2026-07-20": { a1: 5 } } },
  "physio-questions": "Voiko lisätä toistoja?",
  ...over,
});

describe("snapshotToDataset", () => {
  it("reads a complete snapshot into the shape applyImport expects", () => {
    const r: any = snapshotToDataset(snapshotParts());
    expect(r.ok).toBe(true);
    expect(r.ex.length).toBe(1);
    expect(r.sy.length).toBe(1);
    expect(Object.keys(r.logs).length).toBe(2);
    expect(r.marks.length).toBe(1);
    expect(Object.keys(r.psfs.entries).length).toBe(1);
    expect(r.questions).toBe("Voiko lisätä toistoja?");
    expect(r.counts).toEqual({ ex: 1, sy: 1, days: 2, marks: 1, psfs: 1 });
  });

  it("refuses a snapshot with no exercises rather than wiping the app", () => {
    const bad: any = snapshotToDataset(snapshotParts({ "physio-config": { exercises: [], symptoms: [] } }));
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/liikkeitä/);
  });

  it("survives missing and malformed keys", () => {
    expect(snapshotToDataset(null).ok).toBe(false);
    expect(snapshotToDataset("nope").ok).toBe(false);
    const partial: any = snapshotToDataset(
      snapshotParts({ "physio-logs": null, "physio-marks": null, "physio-psfs": null, "physio-questions": null })
    );
    expect(partial.ok).toBe(true);
    expect(partial.logs).toEqual({});
    expect(partial.marks).toEqual([]);
    expect(partial.psfs).toEqual(emptyPsfs());
    expect(partial.questions).toBe("");
  });
});

describe("describeDataset", () => {
  it("summarises counts and the overall date span", () => {
    const r: any = snapshotToDataset(snapshotParts());
    const s = describeDataset(r);
    expect(s).toMatchObject({ exercises: 1, symptoms: 1, days: 2, marks: 1, psfs: 1, questions: true });
    expect(s.first).toBe("2026-07-20");
    expect(s.last).toBe("2026-07-21");
  });

  it("reports an empty dataset without inventing a range", () => {
    const s = describeDataset({});
    expect(s.days).toBe(0);
    expect(s.first).toBe(null);
    expect(s.last).toBe(null);
    expect(s.questions).toBe(false);
  });

  it("does not count whitespace as a question", () => {
    expect(describeDataset({ questions: "   \n " }).questions).toBe(false);
  });
});

describe("diffDatasets", () => {
  const current: any = {
    ex: [ex("e1", "Loitonnus")],
    sy: [{ id: "s1", name: "Selkä", regions: {} }],
    logs: { "2026-07-20": day({ e1: 2 }), "2026-07-21": day({ e1: 2 }), "2026-07-22": day({ e1: 2 }) },
    marks: [],
    psfs: emptyPsfs(),
  };

  it("counts the days a restore would destroy, not just the net total", () => {
    /* same day count, but a different set of days: the net delta hides the loss */
    const incoming: any = {
      ...current,
      logs: { "2026-07-20": day({ e1: 2 }), "2026-07-21": day({ e1: 2 }), "2026-07-19": day({ e1: 2 }) },
    };
    const d = diffDatasets(current, incoming);
    expect(d.delta.days).toBe(0);
    expect(d.lostDays).toEqual(["2026-07-22"]);
    expect(d.gainedDays).toEqual(["2026-07-19"]);
    expect(d.destructive).toBe(true);
    expect(d.identical).toBe(false);
  });

  it("calls an older snapshot destructive and names the range", () => {
    const incoming: any = { ...current, logs: { "2026-07-20": day({ e1: 2 }) } };
    const d = diffDatasets(current, incoming);
    expect(d.delta.days).toBe(-2);
    expect(d.lostDays).toEqual(["2026-07-21", "2026-07-22"]);
    expect(d.destructive).toBe(true);
  });

  it("recognises a no-op restore, which is what a verified backup looks like", () => {
    const d = diffDatasets(current, { ...current });
    expect(d.identical).toBe(true);
    expect(d.destructive).toBe(false);
    expect(d.lostDays).toEqual([]);
  });

  it("a purely additive restore is not destructive", () => {
    const incoming: any = { ...current, logs: { ...current.logs, "2026-07-23": day({ e1: 2 }) } };
    const d = diffDatasets(current, incoming);
    expect(d.delta.days).toBe(1);
    expect(d.lostDays).toEqual([]);
    expect(d.destructive).toBe(false);
  });

  it("flags losing PSFS assessments even when the day count is unchanged", () => {
    let p: any = psfsAddActivity(emptyPsfs(), "Kävely", "2026-06-01");
    p = psfsSetScore(p, "2026-07-01", p.activities[0].id, 5);
    const d = diffDatasets({ ...current, psfs: p }, { ...current, psfs: emptyPsfs() });
    expect(d.delta.psfs).toBe(-1);
    expect(d.destructive).toBe(true);
  });
});

describe("export/import round trip", () => {
  it("carries every data key, so a restore from file loses nothing", () => {
    let p: any = psfsAddActivity(emptyPsfs(), "Kävely", "2026-06-01");
    p = psfsSetScore(p, "2026-07-01", p.activities[0].id, 6);
    const json = buildJSON(
      [ex("e1", "Loitonnus")],
      [{ id: "s1", name: "Selkä", regions: {}, structures: {}, archived: false }],
      { "2026-07-20": day({ e1: 2 }) },
      [{ id: "m1", date: "2026-07-20", text: "Aloitus", auto: false }],
      p,
      "Kysymys vastaanotolle?"
    );
    const parsed: any = JSON.parse(json);
    expect(parsed.version).toBe(9);
    /* the invariant behind version 9: no key in DATA_KEYS may be absent here */
    const covered = { "physio-config": "exercises", "physio-logs": "logs", "physio-marks": "marks", "physio-psfs": "psfs", "physio-questions": "questions" };
    DATA_KEYS.forEach((k) => expect(parsed[covered[k]]).toBeDefined());

    const back: any = parseImport(json);
    expect(back.ok).toBe(true);
    expect(back.questions).toBe("Kysymys vastaanotolle?");
    expect(Object.keys(back.psfs.entries).length).toBe(1);
    expect(back.counts.days).toBe(1);
  });

  it("reads an older file without a questions or psfs field", () => {
    const old = JSON.stringify({
      app: "Liikepäiväkirja",
      version: 7,
      exercises: [ex("e1", "Loitonnus")],
      symptoms: [{ id: "s1", name: "Selkä", regions: {} }],
      logs: { "2026-07-20": day({ e1: 2 }) },
      marks: [],
    });
    const back: any = parseImport(old);
    expect(back.ok).toBe(true);
    expect(back.questions).toBe("");
    expect(back.psfs).toEqual(emptyPsfs());
  });
});
