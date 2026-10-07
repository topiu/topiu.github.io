import { uid } from "./core";

/* ---------------- storage ---------------- */

export const KEY_INDEX = "plans:index";
export const KEY_LIB = "library:v2";
export const KEY_SET = "settings:v1";
export const kPlan = (id) => `plan:${id}`;
export const kImg = (id) => `planimg:${id}`;

/* A plan's current picture. Pictures imported since October 2026 get a key of
   their own, kept in doc.image.key, so removing or replacing a picture leaves
   the old pixels in place and Undo can bring them back. Plans from before keep
   theirs under the plan's id. */
export const imageKeyOf = (doc) => (doc && doc.image ? doc.image.key || kImg(doc.id) : null);
export const newImageKey = (planId) => `${kImg(planId)}:${uid()}`;
const planOfImageKey = (k) => k.slice("planimg:".length).split(":")[0];

/* Standalone build: plans live in this browser's localStorage. */
export const NS = "mokkipohja:";
export async function sGet(key) {
  try {
    const v = localStorage.getItem(NS + key);
    return v == null ? null : JSON.parse(v);
  } catch (e) {
    return null;
  }
}
/* The write itself is synchronous; sSetNow is for paths that must finish
   before they return, such as saving while the page is being hidden. */
export function sSetNow(key, val) {
  try {
    localStorage.setItem(NS + key, JSON.stringify(val));
    return true;
  } catch (e) {
    return false;
  }
}
export async function sSet(key, val) {
  return sSetNow(key, val);
}
export async function sDel(key) {
  try {
    localStorage.removeItem(NS + key);
  } catch (e) {}
}
export function backupAll() {
  const out = {
    app: "mokkipohja",
    version: 1,
    saved: new Date().toISOString(),
    data: {},
  };
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(NS)) out.data[k.slice(NS.length)] = localStorage.getItem(k);
  }
  return out;
}
const parse = (s) => {
  try {
    return s == null ? null : JSON.parse(s);
  } catch (e) {
    return undefined; // present but unreadable
  }
};

/* Restore a backup on top of what this device already has.
   Plans and library pieces in the backup replace local ones with the same id;
   local plans and pieces the backup lacks stay, and so do this device's
   settings. Every device seeds its own library with its own ids, so a backup
   seed piece whose key exists here is kept for the plans that use it but
   hidden from the library list. All or nothing: if storage fills up part-way,
   every key written is put back and an error with code "quota" is thrown. */
export function restoreAll(obj) {
  if (!obj || obj.app !== "mokkipohja" || !obj.data || typeof obj.data !== "object")
    throw new Error("not a backup");
  const data = obj.data;
  const writes = new Map();
  for (const [k, v] of Object.entries(data)) {
    if (typeof v !== "string") continue; // every stored value is a string
    if (k === KEY_SET && localStorage.getItem(NS + k) != null) continue;
    writes.set(k, v);
  }
  const mergeById = (key, adjust = (x) => x) => {
    const mine = parse(localStorage.getItem(NS + key));
    const theirs = parse(data[key]);
    if (!Array.isArray(mine) || !Array.isArray(theirs)) return null; // take the backup's as is
    const byId = new Map(mine.map((x) => [x.id, x]));
    for (const x of theirs) byId.set(x.id, byId.has(x.id) ? x : adjust(x, mine));
    return [...byId.values()];
  };
  const index = mergeById(KEY_INDEX);
  if (index)
    writes.set(KEY_INDEX, JSON.stringify(index.sort((a, b) => (b.updated || 0) - (a.updated || 0))));
  const library = mergeById(KEY_LIB, (def, mine) =>
    def.key && mine.some((m) => m.key === def.key) ? { ...def, hidden: true } : def,
  );
  if (library) writes.set(KEY_LIB, JSON.stringify(library));

  const before = new Map([...writes.keys()].map((k) => [k, localStorage.getItem(NS + k)]));
  try {
    for (const [k, v] of writes) localStorage.setItem(NS + k, v);
  } catch (e) {
    for (const [k, v] of before) {
      try {
        if (v == null) localStorage.removeItem(NS + k);
        else localStorage.setItem(NS + k, v);
      } catch (e2) {}
    }
    const err = new Error("storage is full");
    err.code = "quota";
    throw err;
  }
}

/* Delete stored pictures nothing shows any more: those of plans that no longer
   exist, and a plan's earlier pictures other than the one it shows. Call it
   only when no undo history can still point at them: at startup, and when
   leaving a plan (then pass its id to look at that plan only). A plan that
   cannot be read keeps all its pictures. */
export function pruneImages(onlyPlanId) {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(NS + "planimg:")) keys.push(k.slice(NS.length));
  }
  const inUse = new Map();
  for (const k of keys) {
    const pid = planOfImageKey(k);
    if (onlyPlanId && pid !== onlyPlanId) continue;
    if (!inUse.has(pid)) {
      const doc = parse(localStorage.getItem(NS + kPlan(pid)));
      inUse.set(pid, doc === undefined ? undefined : imageKeyOf(doc));
    }
    const keep = inUse.get(pid);
    if (keep === undefined || keep === k) continue;
    try {
      localStorage.removeItem(NS + k);
    } catch (e) {}
  }
}
/* Remove a plan and every picture stored for it. */
export function deletePlanData(id) {
  const doomed = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k === NS + kPlan(id) || k === NS + kImg(id) || (k && k.startsWith(NS + kImg(id) + ":"))) doomed.push(k);
  }
  for (const k of doomed) {
    try {
      localStorage.removeItem(k);
    } catch (e) {}
  }
}
export const emptyDoc = (name) => ({
  id: uid(),
  name: name || "Cabin plan",
  walls: [],
  rooms: [],
  openings: [],
  items: [],
  image: null,
  wallT: 150,
});
