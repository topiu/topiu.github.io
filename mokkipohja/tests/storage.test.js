import { beforeEach, describe, expect, it } from "vitest";
import { backupAll, kPlan, NS, restoreAll, sDel, sGet, sSet } from "../src/storage";

/* A Map-backed localStorage, enough for the storage layer. */
function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    clear: () => m.clear(),
    get length() {
      return m.size;
    },
  };
}

describe("storage", () => {
  beforeEach(() => {
    globalThis.localStorage = fakeStorage();
  });

  it("keeps everything under the mokkipohja: prefix", async () => {
    await sSet(kPlan("A"), { id: "A" });
    expect(localStorage.getItem(NS + "plan:A")).toBe('{"id":"A"}');
    expect(await sGet(kPlan("A"))).toEqual({ id: "A" });
    await sDel(kPlan("A"));
    expect(await sGet(kPlan("A"))).toBeNull();
  });

  it("reads a corrupt value as missing rather than throwing", async () => {
    localStorage.setItem(NS + "plan:B", "{not json");
    expect(await sGet(kPlan("B"))).toBeNull();
  });

  it("backs up only its own keys and restores them byte for byte", () => {
    localStorage.setItem(NS + "plans:index", '[{"id":"A","name":"Mökki","updated":1}]');
    localStorage.setItem(NS + "plan:A", '{"id":"A"}');
    localStorage.setItem("someone-else", "x");
    const b = backupAll();
    expect(b.app).toBe("mokkipohja");
    expect(Object.keys(b.data).sort()).toEqual(["plan:A", "plans:index"]);

    globalThis.localStorage = fakeStorage();
    restoreAll(JSON.parse(JSON.stringify(b)));
    expect(localStorage.getItem(NS + "plans:index")).toBe('[{"id":"A","name":"Mökki","updated":1}]');
    expect(localStorage.getItem(NS + "plan:A")).toBe('{"id":"A"}');
  });

  it("refuses a file that is not a Mökkipohja backup", () => {
    expect(() => restoreAll({ app: "other", data: {} })).toThrow();
    expect(() => restoreAll(null)).toThrow();
  });
});
