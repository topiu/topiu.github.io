/* The durability guarantees of storage/store.ts and storage/backup.ts. Each
   test names the data-loss path it exists to keep closed. */
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  __closeConnectionForTests,
  getRaw,
  listKeys,
  loadJSON,
  loadJSONStrict,
  saveJSONNow,
  saveManyNow,
  setRaw,
} from "../src/storage/store";
import { isPreRestoreSnapshot, listSnapshots, preRestoreSnapshot, prune, readSnapshot, snapshotDate } from "../src/storage/backup";
import { DATA_KEYS, datasetToValues } from "../src/domain/restore";

describe("store", () => {
  it("writes several keys and deletes others in one transaction", async () => {
    await saveJSONNow("m-gone", 1);
    expect(await saveManyNow({ "m-a": { x: 1 }, "m-b": [2] }, ["m-gone"])).toBe(true);
    expect(await loadJSON("m-a", null)).toEqual({ x: 1 });
    expect(await loadJSON("m-b", null)).toEqual([2]);
    expect(await getRaw("m-gone")).toBeUndefined();
  });

  it("reopens a connection the browser closed instead of failing every later write", async () => {
    /* iOS drops a backgrounded app's connection; every write then silently failed */
    expect(await saveJSONNow("c-key", 1)).toBe(true);
    await __closeConnectionForTests();
    expect(await saveJSONNow("c-key", 2)).toBe(true);
    expect(await loadJSON("c-key", null)).toBe(2);
  });

  it("strict load returns the fallback for an absent key", async () => {
    expect(await loadJSONStrict("never-written", "fb")).toBe("fb");
  });

  it("moves unparseable contents aside rather than losing or blocking on them", async () => {
    await setRaw("broken", "{not json");
    expect(await loadJSONStrict("broken", "fb")).toBe("fb");
    const aside = await listKeys("corrupt:broken:");
    expect(aside.length).toBe(1);
    expect(await getRaw(aside[0])).toBe("{not json");
  });
});

describe("pre-restore snapshots", () => {
  const values = (n: number) =>
    datasetToValues({
      exercises: [{ id: "e1", name: `Liike ${n}` }],
      symptoms: [],
      logs: { "2026-10-05": { sets: { e1: n } } },
    });

  it("never collide with the daily snapshot or with each other", () => {
    /* two restores on one day used to share one key, so the original data was lost */
    const a = preRestoreSnapshot(values(1), new Date(2026, 9, 5, 16, 3, 12, 1));
    const b = preRestoreSnapshot(values(2), new Date(2026, 9, 5, 16, 3, 12, 2));
    expect(a.key).not.toBe(b.key);
    expect(a.key).not.toBe("snapshot:2026-10-05");
    const id = a.key.slice("snapshot:".length);
    expect(isPreRestoreSnapshot(id)).toBe(true);
    expect(snapshotDate(id)).toBe("2026-10-05");
    expect(isPreRestoreSnapshot("2026-10-05")).toBe(false);
  });

  it("read back like a daily snapshot", async () => {
    const s = preRestoreSnapshot(values(3), new Date(2026, 9, 5, 9, 0, 0, 0));
    await saveManyNow({ [s.key]: s.value });
    const id = s.key.slice("snapshot:".length);
    expect(await listSnapshots()).toContain(id);
    const read = await readSnapshot(id);
    expect(read && read.data["physio-logs"]).toEqual({ "2026-10-05": { sets: { e1: 3 } } });
  });

  it("rotate separately, so a burst of restores cannot push out the daily copies", async () => {
    for (let d = 1; d <= 3; d++) await setRaw(`snapshot:2026-09-0${d}`, "{}");
    for (let i = 0; i < 12; i++) {
      const s = preRestoreSnapshot(values(i), new Date(2026, 9, 6, 10, 0, 0, i));
      await saveManyNow({ [s.key]: s.value });
    }
    await prune();
    const ids = await listSnapshots();
    expect(ids.filter((x) => !isPreRestoreSnapshot(x))).toEqual(expect.arrayContaining(["2026-09-01", "2026-09-02", "2026-09-03"]));
    expect(ids.filter((x) => isPreRestoreSnapshot(x)).length).toBe(10);
  });

  it("cover every data key", () => {
    const v = datasetToValues({});
    DATA_KEYS.forEach((k) => expect(v[k]).toBeDefined());
    expect(Object.keys(v).sort()).toEqual([...DATA_KEYS].sort());
  });
});
