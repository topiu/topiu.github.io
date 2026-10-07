import { uid } from "./core";

/* ---------------- storage ---------------- */

export const KEY_INDEX = "plans:index";
export const KEY_LIB = "library:v2";
export const KEY_SET = "settings:v1";
export const kPlan = (id) => `plan:${id}`;
export const kImg = (id) => `planimg:${id}`;

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
export async function sSet(key, val) {
  try {
    localStorage.setItem(NS + key, JSON.stringify(val));
    return true;
  } catch (e) {
    return false;
  }
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
export function restoreAll(obj) {
  if (!obj || obj.app !== "mokkipohja" || !obj.data) throw new Error("not a backup");
  for (const k of Object.keys(obj.data)) localStorage.setItem(NS + k, obj.data[k]);
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
