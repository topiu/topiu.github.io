/* platform/sw — service worker teardown.
 *
 * Offline support was published and withdrawn. It is withdrawn rather than fixed
 * because it was shipped without a way to test it at runtime and without a way
 * for the user to recover from it: on an iOS Home Screen app there are no
 * developer tools, and the remedy an ordinary person would reach for — clearing
 * website data — destroys the diary. That is the wrong risk for an app whose
 * entire premise is that the data is yours and stays put.
 *
 * Two mechanisms, because one of them has to work without any cooperation from
 * a device that may be serving a stale cached page:
 *
 *   1. public/sw.js is now a self-destroying worker published at the same URL as
 *      the old one. Any browser holding the old worker fetches it on its next
 *      update check, installs it, and it wipes Cache Storage, unregisters itself
 *      and reloads open windows. This is what rescues a device that cannot even
 *      load the new bundle.
 *   2. This module unregisters anything still registered under this scope on
 *      startup, for the case where the page did load but a worker lingers.
 *
 * Neither path touches IndexedDB. Cache Storage and IndexedDB are separate
 * stores; the diary is in the latter and is not involved.
 *
 * If offline comes back, it needs: a build flag so it can be turned off without
 * a deploy, an in-app "poista offline-tila" button, and a manual test on a real
 * Home Screen install before it ships.
 */

import { useSyncExternalStore } from "react";

export type SwState = {
  supported: boolean;
  offlineReady: boolean;
  updateWaiting: boolean;
  error: string | null;
};

/* Inert. Kept so the components that read it need no conditional imports. */
const INERT: SwState = { supported: false, offlineReady: false, updateWaiting: false, error: null };
let state: SwState = INERT;
const subs = new Set<() => void>();

export const getSwState = (): SwState => state;

function subscribe(fn: () => void) {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

export function useSwState(): SwState {
  return useSyncExternalStore(subscribe, getSwState, getSwState);
}

export function swSupported(): boolean {
  try {
    return typeof navigator !== "undefined" && "serviceWorker" in navigator;
  } catch {
    return false;
  }
}

/* Remove any worker registered under this scope, and drop the caches it made.
   Safe to run on every startup: with nothing registered it does nothing. */
export function unregisterServiceWorkers(): void {
  if (!swSupported()) return;
  try {
    void navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister().catch(() => false))))
      .catch(() => {});
  } catch {
    /* ignore */
  }
  try {
    if (typeof caches !== "undefined" && caches.keys) {
      void caches
        .keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k).catch(() => false))))
        .catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

/* Still used by the footer note, and independent of service workers. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    (fn) => {
      window.addEventListener("online", fn);
      window.addEventListener("offline", fn);
      return () => {
        window.removeEventListener("online", fn);
        window.removeEventListener("offline", fn);
      };
    },
    () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
    () => true
  );
}

/* Test seams retained so the existing mount tests keep compiling. */
export function __resetSwState(): void {
  state = INERT;
  subs.forEach((f) => f());
}
export function __setSwState(patch: Partial<SwState>): void {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
}
export function applyUpdate(): void {
  window.location.reload();
}
