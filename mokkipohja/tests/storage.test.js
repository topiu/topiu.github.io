import { beforeEach, describe, expect, it } from "vitest";
import {
  backupAll,
  imageKeyOf,
  kPlan,
  newImageKey,
  NS,
  pruneImages,
  restoreAll,
  sDel,
  sGet,
  sSet,
} from "../src/storage";

/* A Map-backed localStorage, enough for the storage layer. With a quota, a
   write that would take the total over it throws, like the real thing. */
function fakeStorage(quota = Infinity) {
  const m = new Map();
  const size = () => [...m].reduce((s, [k, v]) => s + k.length + v.length, 0);
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      const prev = m.get(k);
      m.set(k, String(v));
      if (size() > quota) {
        if (prev == null) m.delete(k);
        else m.set(k, prev);
        throw new DOMException("full", "QuotaExceededError");
      }
    },
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

const put = (k, v) => localStorage.setItem(NS + k, typeof v === "string" ? v : JSON.stringify(v));
const get = (k) => JSON.parse(localStorage.getItem(NS + k));
const backupOf = (data) => ({
  app: "mokkipohja",
  version: 1,
  data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, JSON.stringify(v)])),
});

describe("restoring a backup onto a device that has plans (review finding 7)", () => {
  beforeEach(() => {
    globalThis.localStorage = fakeStorage();
    put("plans:index", [
      { id: "LOCAL", name: "Local plan", updated: 100 },
      { id: "BOTH", name: "Old copy", updated: 50 },
    ]);
    put("plan:LOCAL", { id: "LOCAL", name: "Local plan" });
    put("plan:BOTH", { id: "BOTH", name: "Old copy" });
    put("settings:v1", { lang: "fi", grid: 50 });
    put("library:v2", [
      { id: "s1", key: "sofa", type: "rect" },
      { id: "c1", name: "My bench", type: "rect" },
    ]);
  });

  it("keeps local plans the backup does not have, and takes the backup's copy of shared ones", () => {
    restoreAll(
      backupOf({
        "plans:index": [
          { id: "REMOTE", name: "Remote plan", updated: 200 },
          { id: "BOTH", name: "New copy", updated: 150 },
        ],
        "plan:REMOTE": { id: "REMOTE", name: "Remote plan" },
        "plan:BOTH": { id: "BOTH", name: "New copy" },
      }),
    );
    expect(get("plans:index").map((p) => p.name)).toEqual(["Remote plan", "New copy", "Local plan"]);
    expect(get("plan:LOCAL").name).toBe("Local plan");
    expect(get("plan:BOTH").name).toBe("New copy");
  });

  it("keeps this device's settings", () => {
    restoreAll(backupOf({ "settings:v1": { lang: "en", grid: 10 } }));
    expect(get("settings:v1")).toEqual({ lang: "fi", grid: 50 });
  });

  it("merges the library: local custom pieces stay, and the backup's own seed copies are kept but hidden", () => {
    restoreAll(
      backupOf({
        "library:v2": [
          { id: "s2", key: "sofa", type: "rect" }, // the other device's sofa
          { id: "c2", name: "Their table", type: "rect" },
        ],
      }),
    );
    const lib = get("library:v2");
    expect(lib.map((d) => d.id)).toEqual(["s1", "c1", "s2", "c2"]);
    expect(lib.find((d) => d.id === "s2").hidden).toBe(true); // plans from that device still find it
    expect(lib.find((d) => d.id === "c2").hidden).toBeUndefined();
  });

  it("is all or nothing when storage fills up", () => {
    const snapshot = backupAll().data;
    const used = Object.entries(snapshot).reduce((s, [k, v]) => s + NS.length + k.length + v.length, 0);
    globalThis.localStorage = fakeStorage(used + 400);
    for (const [k, v] of Object.entries(snapshot)) localStorage.setItem(NS + k, v);
    let err;
    try {
      restoreAll(
        backupOf({
          "plans:index": [{ id: "BIG", name: "Big", updated: 300 }],
          "plan:BIG": { id: "BIG", pad: "x".repeat(2000) },
        }),
      );
    } catch (e) {
      err = e;
    }
    expect(err && err.code).toBe("quota");
    expect(backupAll().data).toEqual(snapshot);
  });
});

describe("plan pictures (review finding 9)", () => {
  beforeEach(() => {
    globalThis.localStorage = fakeStorage();
  });

  it("gives each imported picture its own key and keeps old plans on the legacy key", () => {
    expect(imageKeyOf({ id: "A", image: null })).toBeNull();
    expect(imageKeyOf({ id: "A", image: { natW: 1 } })).toBe("planimg:A");
    const k = newImageKey("A");
    expect(k).toMatch(/^planimg:A:[a-z0-9]+$/);
    expect(imageKeyOf({ id: "A", image: { key: k } })).toBe(k);
  });

  it("prunes pictures nothing shows, and only those", () => {
    put("plan:A", { id: "A", image: { key: "planimg:A:new" } });
    put("planimg:A:new", '"data:new"');
    put("planimg:A:old", '"data:old"'); // replaced earlier
    put("planimg:A", '"data:legacy"'); // from before keys existed
    put("plan:B", { id: "B", image: { natW: 1 } }); // legacy plan still showing its picture
    put("planimg:B", '"data:b"');
    put("planimg:GONE", '"data:gone"'); // plan deleted
    put("plan:BAD", "{broken");
    put("planimg:BAD", '"data:bad"'); // unreadable plan: leave it be

    pruneImages();
    const left = Object.keys(backupAll().data).filter((k) => k.startsWith("planimg:")).sort();
    expect(left).toEqual(["planimg:A:new", "planimg:B", "planimg:BAD"]);
  });

  it("can look at one plan only", () => {
    put("plan:A", { id: "A", image: null });
    put("planimg:A:x", '"a"');
    put("planimg:GONE", '"g"');
    pruneImages("A");
    expect(localStorage.getItem(NS + "planimg:A:x")).toBeNull();
    expect(localStorage.getItem(NS + "planimg:GONE")).not.toBeNull();
  });
});
