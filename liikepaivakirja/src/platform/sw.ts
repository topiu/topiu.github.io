/* platform/sw — service worker registration, and the ways out of it.
 *
 * Offline was published once and withdrawn the same day. The withdrawal note said
 * what a second attempt would need first: a way to turn it off without a deploy,
 * a visible switch inside the app, and a build identifier so that "did the deploy
 * take effect" is answerable by looking rather than by inference. This is that.
 *
 * Three ways out, in descending order of how bad things have to be:
 *
 *   1. `?sw=off` in the URL. Unregisters every worker under this scope, deletes
 *      the caches, and *persists* the choice. This is the one that matters: it
 *      works on an iOS Home Screen install, where there are no developer tools,
 *      because the same URL can always be opened in Safari with a query string
 *      typed on the end. `?sw=on` puts it back.
 *   2. The Offline-tila switch under Muokkaa, for the ordinary case.
 *   3. `public/sw.js` is still the self-destroying worker from the rollback, at the
 *      URL the *old* worker occupied, so a device that never came back gets
 *      retired by it. The new worker is at `service-worker.js`, so the two cannot
 *      shadow each other.
 *
 * The preference lives in localStorage rather than the app's IndexedDB store for
 * two reasons: it must be readable synchronously before React mounts, and one
 * situation in which you would want to switch offline off is IndexedDB itself
 * misbehaving. It is a per-device setting, not diary data, so it is deliberately
 * absent from DATA_KEYS and from the export.
 *
 * Updates are offered, not applied. The app writes to IndexedDB continuously —
 * debounced note text, a queued dose edit — so reloading mid-write remains a
 * small but real way to lose a keystroke.
 */

import { useSyncExternalStore } from "react";
import { flushAll } from "../storage/store";

declare const __BUILD_ID__: string;

export const BUILD_ID: string = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";

const PREF_KEY = "physio-offline";
const SW_FILE = "service-worker.js";

export type SwState = {
  /* the browser has the API, in a context allowed to use it */
  supported: boolean;
  /* the user's choice; offline is on unless switched off */
  enabled: boolean;
  /* a worker controls this page, so the next cold start works without network */
  offlineReady: boolean;
  /* a newer version is installed and waiting for permission to take over */
  updateWaiting: boolean;
  /* registration failed; surfaced, never thrown */
  error: string | null;
};

let state: SwState = { supported: false, enabled: true, offlineReady: false, updateWaiting: false, error: null };
const subs = new Set<() => void>();
let reg: ServiceWorkerRegistration | null = null;
let reloading = false;

function set(patch: Partial<SwState>) {
  const next = { ...state, ...patch };
  /* useSyncExternalStore compares by identity; avoid pointless churn */
  if (
    next.supported === state.supported &&
    next.enabled === state.enabled &&
    next.offlineReady === state.offlineReady &&
    next.updateWaiting === state.updateWaiting &&
    next.error === state.error
  ) {
    return;
  }
  state = next;
  subs.forEach((f) => f());
}

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

/* ------------------------------------------------------------------ */
/*  The URL escape hatch — pure, so it is testable                     */
/* ------------------------------------------------------------------ */
/* Accepts ?sw=off / ?sw=on, plus ?nosw as a shorthand for off: in a panic the
   thing you remember typing is not necessarily the thing that was documented. */
export function swOverrideFromSearch(search: string): "on" | "off" | null {
  if (!search) return null;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  } catch {
    return null;
  }
  if (params.has("nosw")) return "off";
  const v = (params.get("sw") || "").toLowerCase();
  if (v === "off" || v === "0" || v === "false") return "off";
  if (v === "on" || v === "1" || v === "true") return "on";
  return null;
}

/* ------------------------------------------------------------------ */
/*  Preference                                                         */
/* ------------------------------------------------------------------ */
export function offlineEnabled(): boolean {
  try {
    return window.localStorage.getItem(PREF_KEY) !== "off";
  } catch {
    /* private mode or storage disabled: default on, and registration simply
       fails harmlessly if it cannot proceed */
    return true;
  }
}

function writePref(on: boolean) {
  try {
    if (on) window.localStorage.removeItem(PREF_KEY);
    else window.localStorage.setItem(PREF_KEY, "off");
  } catch {
    /* the switch still takes effect for this session */
  }
}

/* ------------------------------------------------------------------ */
/*  Teardown                                                           */
/* ------------------------------------------------------------------ */
/* Removes every worker under this scope and the caches they made. Cache Storage
   only: IndexedDB, and therefore the diary, is never touched by this. */
export async function tearDown(): Promise<void> {
  if (!swSupported()) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
  } catch {
    /* ignore */
  }
  try {
    if (typeof caches !== "undefined" && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {
    /* ignore */
  }
  reg = null;
  set({ offlineReady: false, updateWaiting: false });
}

/* ------------------------------------------------------------------ */
/*  Registration                                                       */
/* ------------------------------------------------------------------ */
/* A waiting worker only counts as an update when something already controls the
   page. On a first visit it installs and waits with no controller, and calling
   that an update would ask the user to reload a page they just opened. */
function noteWaiting() {
  set({ updateWaiting: !!(reg && reg.waiting && navigator.serviceWorker.controller) });
}

function doRegister() {
  const base = import.meta.env.BASE_URL || "/";
  navigator.serviceWorker
    .register(`${base}${SW_FILE}`, { scope: base })
    .then((r) => {
      reg = r;
      noteWaiting();
      r.addEventListener("updatefound", () => {
        const installing = r.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed") noteWaiting();
          if (installing.state === "activated") set({ offlineReady: true });
        });
      });
      /* Pages deploys are manual and infrequent, so a check whenever the app
         becomes visible or the connection returns is enough — no polling timer */
      const check = () => {
        if (document.visibilityState === "visible") void r.update().catch(() => {});
      };
      document.addEventListener("visibilitychange", check);
      window.addEventListener("online", check);
    })
    .catch((err) => {
      set({ error: err && err.message ? String(err.message) : "rekisteröinti ei onnistunut" });
    });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    set({ offlineReady: true });
    if (reloading) {
      reloading = false;
      window.location.reload();
    }
  });
}

/* Called once from main.tsx. The URL override is honoured before anything else,
   so a device serving a stale shell can still be rescued by a query string. */
export function initServiceWorker(): void {
  if (!swSupported()) {
    set({ supported: false });
    return;
  }
  const override = swOverrideFromSearch(typeof location === "undefined" ? "" : location.search);
  if (override) writePref(override === "on");

  const enabled = offlineEnabled();
  set({ supported: true, enabled, offlineReady: !!navigator.serviceWorker.controller });

  if (!enabled) {
    void tearDown();
    return;
  }
  doRegister();
}

export async function setOfflineEnabled(on: boolean): Promise<void> {
  writePref(on);
  set({ enabled: on });
  if (on) {
    if (swSupported()) doRegister();
  } else {
    await tearDown();
  }
}

/* Hand control to the waiting worker, then reload. Debounced writes are flushed
   first: they are the only state outside IndexedDB when the page is replaced. */
export function applyUpdate(): void {
  try {
    flushAll();
  } catch {
    /* a failed flush must not block the update */
  }
  const waiting = reg && reg.waiting;
  if (!waiting) {
    window.location.reload();
    return;
  }
  reloading = true;
  waiting.postMessage({ type: "SKIP_WAITING" });
  /* controllerchange is the happy path; this covers a worker that never
     activates and would otherwise leave the banner up forever */
  window.setTimeout(() => {
    if (reloading) {
      reloading = false;
      window.location.reload();
    }
  }, 2500);
}

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

/* Test seams. The module holds process-wide state, which is right in a browser
   and awkward in a test file that mounts the app repeatedly. */
export function __resetSwState(): void {
  state = { supported: false, enabled: true, offlineReady: false, updateWaiting: false, error: null };
  reg = null;
  reloading = false;
  subs.forEach((f) => f());
}
export function __setSwState(patch: Partial<SwState>): void {
  set(patch);
}
