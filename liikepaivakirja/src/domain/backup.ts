/* domain/backup — pure scheduling and naming logic for daily file backups.
   No React, no platform APIs, so all of it is testable. */

import { parseKey } from "./dates";

export type BackupMethod = "folder" | "download" | "share";

export interface BackupState {
  /* day key of the most recent backup attempt that we believe reached a file */
  lastDate: string | null;
  lastMethod: BackupMethod | null;
  /* true only when the written file was read back and matched */
  lastVerified: boolean;
  /* day key the banner was dismissed for */
  snoozedFor: string | null;
  /* preference used when no folder handle is available (iOS/Safari) */
  preferred: "download" | "share";
  /* mirrors "a directory handle is stored", for UI without async lookups */
  hasFolder: boolean;
}

export const BACKUP_KEEP_DAYS = 30;
export const LATEST_NAME = "liikepaivakirja-latest.json";

const NAME_RE = /^liikepaivakirja-(\d{4}-\d{2}-\d{2})\.json$/;

export function defaultBackupState(): BackupState {
  return {
    lastDate: null,
    lastMethod: null,
    lastVerified: false,
    snoozedFor: null,
    preferred: "download",
    hasFolder: false,
  };
}

export function backupName(dateKey: string): string {
  return `liikepaivakirja-${dateKey}.json`;
}

export function dateOfBackupName(name: string): string | null {
  const m = NAME_RE.exec(name);
  return m ? m[1] : null;
}

/* Due unless we already backed up today, or the banner was dismissed today. */
export function needsBackup(state: BackupState | null, todayKey: string): boolean {
  if (!state) return true;
  if (state.lastDate === todayKey) return false;
  if (state.snoozedFor === todayKey) return false;
  return true;
}

export function daysBetween(fromKey: string, toKey: string): number {
  const a = parseKey(fromKey).getTime();
  const b = parseKey(toKey).getTime();
  /* rounded, so a DST boundary cannot turn one day into 0.96 */
  return Math.round((b - a) / 86400000);
}

export function backupAgeDays(state: BackupState | null, todayKey: string): number | null {
  if (!state || !state.lastDate) return null;
  return daysBetween(state.lastDate, todayKey);
}

export function backupAgeLabel(state: BackupState | null, todayKey: string): string {
  const n = backupAgeDays(state, todayKey);
  if (n === null) return "Varmuuskopiota ei ole vielä otettu.";
  if (n <= 0) return "Varmuuskopio otettu tänään.";
  if (n === 1) return "Viimeisin varmuuskopio eilen.";
  return `Viimeisin varmuuskopio ${n} päivää sitten.`;
}

/* Severity for the banner: how loudly to phrase the reminder. */
export function backupUrgency(state: BackupState | null, todayKey: string): "none" | "due" | "stale" {
  if (!needsBackup(state, todayKey)) return "none";
  const n = backupAgeDays(state, todayKey);
  if (n === null || n >= 3) return "stale";
  return "due";
}

/* Dated backup files to delete, keeping the newest keepDays worth. Anything
   that is not a dated backup file (including LATEST_NAME) is never returned. */
export function staleNames(
  names: string[],
  todayKey: string,
  keepDays: number = BACKUP_KEEP_DAYS
): string[] {
  return names.filter((n) => {
    const d = dateOfBackupName(n);
    if (!d) return false;
    return daysBetween(d, todayKey) > keepDays;
  });
}
