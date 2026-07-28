import { describe, it, expect } from "vitest";
import {
  PSFS_INTERVAL_DAYS,
  PSFS_MAX_ACTIVITIES,
  PSFS_MID,
  emptyPsfs,
  normalizePsfs,
  psfsActivities,
  psfsAddActivity,
  psfsBand,
  psfsChange,
  psfsClearEntry,
  psfsDaysSince,
  psfsDue,
  psfsForgetActivity,
  psfsMean,
  psfsRenameActivity,
  psfsRetireActivity,
  psfsSeries,
  psfsSetScore,
} from "../src/domain";

const withActs = () => {
  let p: any = emptyPsfs();
  p = psfsAddActivity(p, "Sukkien pukeminen", "2026-06-01");
  p = psfsAddActivity(p, "Istuminen tunnin", "2026-06-01");
  p = psfsAddActivity(p, "Portaat alas", "2026-06-01");
  return p;
};

describe("psfs normalization", () => {
  it("keeps well-formed data and drops the rest", () => {
    const p = normalizePsfs({
      activities: [
        { id: "a", name: " Kävely " },
        { id: "b", name: "Nosto", retired: true, added: "2026-05-01" },
        { id: "c", name: "   " } /* nameless */,
        { id: "a", name: "duplicate id" },
      ],
      entries: {
        "2026-07-01": { a: 4, b: 11, ghost: 5 } /* 11 out of range, ghost unknown */,
        "not-a-date": { a: 3 },
        "2026-07-15": { a: "7" } /* numeric string coerced */,
      },
    });
    expect(p.activities.map((a: any) => a.name)).toEqual(["Kävely", "Nosto"]);
    expect(p.activities[0].added).toBe(null);
    expect(p.activities[1].retired).toBe(true);
    expect(p.entries["2026-07-01"]).toEqual({ a: 4 });
    expect(p.entries["2026-07-15"]).toEqual({ a: 7 });
    expect(p.entries["not-a-date"]).toBeUndefined();
  });

  it("treats junk as an empty PSFS rather than throwing", () => {
    expect(normalizePsfs(null)).toEqual(emptyPsfs());
    expect(normalizePsfs("nope" as any)).toEqual(emptyPsfs());
    expect(normalizePsfs({ activities: 5, entries: 7 } as any)).toEqual(emptyPsfs());
  });

  it("drops a date whose every score was invalid", () => {
    const p = normalizePsfs({ activities: [{ id: "a", name: "X" }], entries: { "2026-07-01": { a: -3 } } });
    expect(p.entries["2026-07-01"]).toBeUndefined();
  });
});

describe("psfs activities", () => {
  it("caps at the instrument's maximum and refuses duplicates", () => {
    let p: any = withActs();
    p = psfsAddActivity(p, "Nostaminen", "2026-06-01");
    p = psfsAddActivity(p, "Juoksu", "2026-06-01");
    expect(psfsActivities(p).length).toBe(PSFS_MAX_ACTIVITIES);
    p = psfsAddActivity(p, "Kuudes", "2026-06-01");
    expect(psfsActivities(p).length).toBe(PSFS_MAX_ACTIVITIES);
    p = psfsAddActivity(p, "  portaat alas  ", "2026-06-01"); /* case/space insensitive */
    expect(psfsActivities(p).length).toBe(PSFS_MAX_ACTIVITIES);
  });

  it("ignores an empty name", () => {
    const p = psfsAddActivity(emptyPsfs(), "   ", "2026-06-01");
    expect(psfsActivities(p).length).toBe(0);
  });

  it("retiring keeps the scored history, forgetting removes it", () => {
    let p: any = withActs();
    const id = p.activities[0].id;
    p = psfsSetScore(p, "2026-07-01", id, 5);

    const retired = psfsRetireActivity(p, id, true);
    expect(psfsActivities(retired).length).toBe(2);
    expect(retired.entries["2026-07-01"][id]).toBe(5);

    const forgotten = psfsForgetActivity(p, id);
    expect(forgotten.activities.length).toBe(2);
    expect(forgotten.entries["2026-07-01"]).toBeUndefined();
  });

  it("renames without touching scores", () => {
    let p: any = withActs();
    const id = p.activities[1].id;
    p = psfsSetScore(p, "2026-07-01", id, 6);
    p = psfsRenameActivity(p, id, "Istuminen kaksi tuntia");
    expect(p.activities[1].name).toBe("Istuminen kaksi tuntia");
    expect(p.entries["2026-07-01"][id]).toBe(6);
  });
});

describe("psfs scoring", () => {
  it("stores 0 as a real score and null as a removal", () => {
    let p: any = withActs();
    const id = p.activities[0].id;
    p = psfsSetScore(p, "2026-07-01", id, 0);
    expect(p.entries["2026-07-01"][id]).toBe(0);
    p = psfsSetScore(p, "2026-07-01", id, null);
    expect(p.entries["2026-07-01"]).toBeUndefined(); /* last score gone -> day gone */
  });

  it("rejects out-of-range values without mutating", () => {
    const p: any = withActs();
    const id = p.activities[0].id;
    expect(psfsSetScore(p, "2026-07-01", id, 11)).toBe(p);
    expect(psfsSetScore(p, "2026-07-01", id, -1)).toBe(p);
  });

  it("averages only what was actually scored", () => {
    let p: any = withActs();
    const [a, b] = p.activities;
    p = psfsSetScore(p, "2026-07-01", a.id, 4);
    p = psfsSetScore(p, "2026-07-01", b.id, 7);
    const m = psfsMean(p.entries["2026-07-01"]);
    expect(m).toEqual({ mean: 5.5, n: 2 }); /* third activity unrated, not counted as 0 */
    expect(psfsMean(null)).toBe(null);
    expect(psfsMean({})).toBe(null);
  });

  it("clears a whole assessment", () => {
    let p: any = withActs();
    p = psfsSetScore(p, "2026-07-01", p.activities[0].id, 4);
    p = psfsClearEntry(p, "2026-07-01");
    expect(psfsSeries(p)).toEqual([]);
  });
});

describe("psfs cadence", () => {
  it("is not due before any activity exists", () => {
    expect(psfsDue(emptyPsfs(), "2026-07-28")).toBe(false);
  });

  it("is due once activities exist but nothing is scored", () => {
    expect(psfsDue(withActs(), "2026-07-28")).toBe(true);
    expect(psfsDaysSince(withActs(), "2026-07-28")).toBe(null);
  });

  it("waits out the interval and then comes due", () => {
    let p: any = withActs();
    p = psfsSetScore(p, "2026-07-14", p.activities[0].id, 5);
    expect(psfsDaysSince(p, "2026-07-27")).toBe(13);
    expect(psfsDue(p, "2026-07-27")).toBe(false);
    expect(psfsDaysSince(p, "2026-07-28")).toBe(PSFS_INTERVAL_DAYS);
    expect(psfsDue(p, "2026-07-28")).toBe(true);
  });
});

describe("psfs change", () => {
  it("needs two assessments before it says anything", () => {
    let p: any = withActs();
    p = psfsSetScore(p, "2026-07-01", p.activities[0].id, 3);
    expect(psfsChange(p)).toBe(null);
  });

  it("compares first to latest, oldest first regardless of insertion order", () => {
    let p: any = withActs();
    const id = p.activities[0].id;
    p = psfsSetScore(p, "2026-07-15", id, 7);
    p = psfsSetScore(p, "2026-07-01", id, 3); /* written second, earlier date */
    const c = psfsChange(p)!;
    expect(c.first.date).toBe("2026-07-01");
    expect(c.last.date).toBe("2026-07-15");
    expect(c.delta).toBe(4);
    expect(c.band).toBe("large");
  });

  it("bands on the published thresholds, inclusive at each boundary", () => {
    expect(psfsBand(PSFS_MID.small - 0.1)).toBe("none");
    expect(psfsBand(PSFS_MID.small)).toBe("small");
    expect(psfsBand(PSFS_MID.medium)).toBe("medium");
    expect(psfsBand(PSFS_MID.large)).toBe("large");
    expect(psfsBand(-PSFS_MID.large)).toBe("large"); /* symmetric: a decline is as real */
  });
});
