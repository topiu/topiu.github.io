/* storage/backupState — one shared piece of state read by both the banner in
   Tänään and the settings block in Muokkaa, without threading props through
   App. A module-level store plus useSyncExternalStore keeps the two views
   consistent within a session. */

import { useEffect, useSyncExternalStore } from "react";
import { loadJSON, saveJSON } from "./store";
import { BackupState, defaultBackupState } from "../domain/backup";

const KEY = "physio-backup";

let state: BackupState = defaultBackupState();
let loaded = false;
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();

function emit() {
  subs.forEach((f) => f());
}

export function getBackupState(): BackupState {
  return state;
}

export function patchBackupState(patch: Partial<BackupState>) {
  state = { ...state, ...patch };
  saveJSON(KEY, state);
  emit();
}

export function initBackupState(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (!loading) {
    loading = loadJSON(KEY, null).then((stored) => {
      state = { ...defaultBackupState(), ...(stored || {}) };
      loaded = true;
      emit();
    });
  }
  return loading;
}

function subscribe(fn: () => void) {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

export function useBackupState(): BackupState {
  useEffect(() => {
    void initBackupState();
  }, []);
  return useSyncExternalStore(subscribe, getBackupState, getBackupState);
}
