/* storage/backup.ts
 *
 * The one intentional addition beyond the verbatim port.
 *
 * On the artifact, Claude's storage was the durable copy. Here the browser owns
 * the data, so a corrupt write or a bad import has nothing behind it. This keeps
 * a rolling set of daily snapshots of the three data keys.
 *
 * Deliberately startup-only: it runs once when the app loads, before any edits
 * that day, and never touches the write path during use. That keeps the write
 * policy in store.ts exactly as it was.
 *
 * Scope, stated honestly: this protects against the app writing bad data. It
 * does NOT protect against the browser clearing site data, a cleared profile,
 * or a new device — the snapshots live in the same IndexedDB. Only the JSON
 * export off-device does that.
 */

import { DATA_KEYS } from "../domain/restore";
import { getRaw, getManyRaw, setRaw, delRaw, listKeys } from "./store";

const PREFIX = "snapshot:";
/* single source of truth: domain/restore.ts defines what a complete dataset is */
const KEYS = DATA_KEYS as unknown as string[];
/* daily snapshots kept */
const KEEP = 14;
/* pre-restore snapshots kept, counted separately so trying several restores
   in a row cannot rotate the daily ones out */
const KEEP_PRE = 10;

/* Snapshot ids are the key minus the prefix. A daily one is a bare date key
   ("2026-10-05"); a pre-restore one appends the time ("2026-10-05~160312") so
   it can never collide with the daily one or with another pre-restore one. */
export const snapshotDate = (id: string): string => id.slice(0, 10);
export const isPreRestoreSnapshot = (id: string): boolean => id.length > 10;

function todayKey(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export async function maybeSnapshot(): Promise<boolean> {
  try {
    const key = PREFIX + todayKey();
    const existing = await getRaw(key);
    if (existing != null) return false; /* already snapshotted today */

    /* one transaction, so the parts are consistent with each other */
    const parts = await getManyRaw(KEYS);
    /* nothing to snapshot on a first-ever run */
    if (KEYS.every((k) => parts[k] == null)) return false;

    await setRaw(key, JSON.stringify({ at: new Date().toISOString(), parts }));
    await prune();
    return true;
  } catch {
    return false;
  }
}

export async function prune() {
  const keys = (await listKeys(PREFIX)).sort();
  const daily = keys.filter((k) => !isPreRestoreSnapshot(k.slice(PREFIX.length)));
  const pre = keys.filter((k) => isPreRestoreSnapshot(k.slice(PREFIX.length)));
  const drop = [
    ...daily.slice(0, Math.max(0, daily.length - KEEP)),
    ...pre.slice(0, Math.max(0, pre.length - KEEP_PRE)),
  ];
  for (const k of drop) await delRaw(k);
}

export async function listSnapshots(): Promise<string[]> {
  return (await listKeys(PREFIX)).map((k) => k.slice(PREFIX.length)).sort().reverse();
}

/* Returns the stored parts for a given date, keyed exactly as they are in the
   live store so domain/restore.ts can read either interchangeably. `at` is the
   wall-clock time the snapshot was taken, which is what the picker shows —
   the date alone cannot say whether it predates this morning's edits. */
export async function readSnapshot(
  date: string
): Promise<{ at: string | null; data: Record<string, any> } | null> {
  try {
    const raw = await getRaw(PREFIX + date);
    if (raw == null) return null;
    const obj = JSON.parse(raw);
    const data: Record<string, any> = {};
    for (const k of KEYS) {
      data[k] = obj.parts && obj.parts[k] != null ? JSON.parse(obj.parts[k]) : null;
    }
    return { at: typeof obj.at === "string" ? obj.at : null, data };
  } catch {
    return null;
  }
}

/* A snapshot of the in-memory dataset taken immediately before an import or a
   restore replaces it. Returned as a key and value rather than written here, so
   App can commit it in the same transaction as the overwrite: the state you
   restored *away from* then exists whether or not anything after it succeeds.

   It used to overwrite the day's single snapshot instead. A second restore on
   the same day then overwrote that copy with the first restore's result, while
   the undo slot held the same thing, so the original data existed nowhere. */
export function preRestoreSnapshot(values: Record<string, any>, now: Date = new Date()): { key: string; value: any } {
  const parts: Record<string, string | undefined> = {};
  for (const k of KEYS) parts[k] = values[k] === undefined ? undefined : JSON.stringify(values[k]);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return {
    key: `${PREFIX}${d}~${hh}${mm}${ss}${ms}`,
    /* an object: the JSON layer stringifies it into the stored format */
    value: { at: now.toISOString(), parts },
  };
}
