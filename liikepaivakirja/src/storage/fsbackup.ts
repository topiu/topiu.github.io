/* storage/fsbackup — Tier A: write backups straight into a folder the user
 * picked once. Chromium desktop only; every call is guarded so the module is
 * safe to import on iOS, where it simply reports no folder.
 *
 * The handle itself is stored in IndexedDB (structured clone, not JSON). Note
 * that a stored handle is not the same as usable access: after a browser
 * restart the permission often returns to "prompt", and re-requesting it
 * requires a user gesture. So the flow is: try silently, fall back to the
 * banner's button.
 */

import { getObj, setObj, delRaw } from "./store";
import { hasDirectoryPicker } from "../platform/share";
import { LATEST_NAME, staleNames } from "../domain/backup";

const HANDLE_KEY = "backup-dir-handle";

export async function getStoredFolder(): Promise<any | null> {
  try {
    return (await getObj<any>(HANDLE_KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function forgetBackupFolder(): Promise<void> {
  try {
    await delRaw(HANDLE_KEY);
  } catch {
    /* ignore */
  }
}

/* "granted" | "prompt" | "denied" | "unavailable" */
export async function folderPermission(handle: any, request = false): Promise<string> {
  try {
    if (!handle || !handle.queryPermission) return "unavailable";
    const opts = { mode: "readwrite" as const };
    let state = await handle.queryPermission(opts);
    if (state !== "granted" && request && handle.requestPermission) {
      state = await handle.requestPermission(opts);
    }
    return state;
  } catch {
    return "denied";
  }
}

/* Must be called from a user gesture. */
export async function pickBackupFolder(): Promise<any | null> {
  if (!hasDirectoryPicker()) return null;
  try {
    const handle = await (window as any).showDirectoryPicker({
      id: "liikepaivakirja-backup",
      mode: "readwrite",
      startIn: "documents",
    });
    if (!handle) return null;
    await setObj(HANDLE_KEY, handle);
    return handle;
  } catch {
    /* cancelled or blocked */
    return null;
  }
}

export interface WriteResult {
  ok: boolean;
  verified: boolean;
  error?: string;
}

async function writeOne(handle: any, name: string, text: string): Promise<void> {
  const fh = await handle.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}

/* Writes the dated file plus the stable latest file, then reads the dated file
   back and compares. An unverified backup is not treated as a backup. */
export async function writeBackupToFolder(
  handle: any,
  filename: string,
  text: string
): Promise<WriteResult> {
  try {
    await writeOne(handle, filename, text);
    await writeOne(handle, LATEST_NAME, text);

    const check = await handle.getFileHandle(filename);
    const back = await (await check.getFile()).text();
    if (back !== text) {
      return { ok: false, verified: false, error: "Takaisinluku ei täsmää." };
    }
    return { ok: true, verified: true };
  } catch (err: any) {
    return { ok: false, verified: false, error: (err && err.message) || "Kirjoitus epäonnistui." };
  }
}

/* Deletes dated backups older than the retention window. Never touches
   LATEST_NAME or any file the app did not create. */
export async function pruneFolder(handle: any, todayKey: string, keepDays?: number): Promise<number> {
  try {
    const names: string[] = [];
    for await (const entry of handle.values()) {
      if (entry.kind === "file") names.push(entry.name);
    }
    const doomed = staleNames(names, todayKey, keepDays);
    for (const n of doomed) await handle.removeEntry(n);
    return doomed.length;
  } catch {
    return 0;
  }
}
