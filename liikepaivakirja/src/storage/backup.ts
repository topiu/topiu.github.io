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
import { getRaw, setRaw, delRaw, listKeys } from "./store";

const PREFIX = "snapshot:";
/* single source of truth: domain/restore.ts defines what a complete dataset is */
const KEYS = DATA_KEYS as unknown as string[];
const KEEP = 14;

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

    const parts: Record<string, string | undefined> = {};
    for (const k of KEYS) parts[k] = await getRaw(k);
    /* nothing to snapshot on a first-ever run */
    if (KEYS.every((k) => parts[k] == null)) return false;

    await setRaw(key, JSON.stringify({ at: new Date().toISOString(), parts }));
    await prune();
    return true;
  } catch {
    return false;
  }
}

async function prune() {
  const keys = (await listKeys(PREFIX)).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - KEEP))) {
    await delRaw(k);
  }
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

/* Take a snapshot right now under an explicit date key, overwriting today's.
   Used immediately before a restore: `physio-undo` already makes one restore
   reversible, and this makes the state you restored *from* recoverable after a
   second restore has consumed the undo slot. */
export async function forceSnapshot(): Promise<boolean> {
  try {
    await delRaw(PREFIX + todayKey());
    return await maybeSnapshot();
  } catch {
    return false;
  }
}
