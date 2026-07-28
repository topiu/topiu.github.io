/* storage/store.ts
 *
 * Replaces Claude's `window.storage` with IndexedDB. The exported contract is
 * deliberately identical to the artifact version, so no call site changed:
 *
 *   loadJSON(key, fallback)     -> Promise<any>
 *   saveJSON(key, obj)          -> immediate, fire-and-forget
 *   saveJSONDebounced(key, obj) -> coalesced (text fields)
 *   saveJSONNow(key, obj)       -> awaited, resolves true only once written
 *   deleteKey(key)              -> awaited
 *
 * Write policy (§4.1 of CLAUDE.md) is retained verbatim even though IndexedDB
 * has no rate limit: discrete actions write immediately and never depend on a
 * later flush, an immediate write supersedes any queued debounced write to the
 * same key, and only high-frequency text input is debounced. The rationale is
 * no longer the rate limiter but the invariant it protected — a one-shot user
 * action must be durable before the UI reports success.
 *
 * DB_NAME isolates this app from everything else on the origin. That matters:
 * GitHub Pages puts every project you publish on the same
 * https://<user>.github.io origin, which shares one IndexedDB namespace.
 * A dedicated database name means the storage keys stay byte-identical to the
 * artifact version, so an export from either side imports into the other.
 */

const DB_NAME = "liikepaivakirja";
const DB_VERSION = 1;
const STORE = "kv";

export const hasStore = typeof indexedDB !== "undefined";

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    /* a failed open must not poison every later attempt */
    dbp.catch(() => {
      dbp = null;
    });
  }
  return dbp;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

/* ---- raw key/value access (also used by backup.ts) ---- */

export function getRaw(key: string): Promise<string | undefined> {
  return run<string | undefined>("readonly", (s) => s.get(key));
}
export function setRaw(key: string, value: string): Promise<unknown> {
  return run("readwrite", (s) => s.put(value, key));
}
export function delRaw(key: string): Promise<unknown> {
  return run("readwrite", (s) => s.delete(key));
}
export function listKeys(prefix = ""): Promise<string[]> {
  return run<IDBValidKey[]>("readonly", (s) => s.getAllKeys()).then((ks) =>
    ks.map(String).filter((k) => k.startsWith(prefix))
  );
}

/* ---- JSON layer: same signatures as the artifact build ---- */

export async function loadJSON(key: string, fallback: any) {
  try {
    if (!hasStore) return fallback;
    const v = await getRaw(key);
    if (v == null) return fallback;
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

const _pending: Record<string, string> = {};
const _timers: Record<string, any> = {};

function _writeNow(key: string, s: string) {
  try {
    if (hasStore) void setRaw(key, s).catch(() => {});
  } catch {
    /* silent */
  }
}
function _clearTimer(key: string) {
  if (_timers[key]) {
    clearTimeout(_timers[key]);
    delete _timers[key];
  }
}
function _flushKey(key: string) {
  const v = _pending[key];
  if (v === undefined) return;
  delete _pending[key];
  _clearTimer(key);
  _writeNow(key, v);
}
export function flushAll() {
  Object.keys(_pending).forEach(_flushKey);
}
function _stringify(obj: any): string | undefined {
  try {
    return JSON.stringify(obj);
  } catch {
    return undefined;
  }
}

export function saveJSON(key: string, obj: any) {
  const s = _stringify(obj);
  if (s === undefined) return;
  /* supersede any queued debounced write to the same key */
  _clearTimer(key);
  delete _pending[key];
  _writeNow(key, s);
}

export function saveJSONDebounced(key: string, obj: any) {
  const s = _stringify(obj);
  if (s === undefined) return;
  _pending[key] = s; /* snapshot value now; state may change before flush */
  _clearTimer(key);
  _timers[key] = setTimeout(() => _flushKey(key), 700);
}

/* Awaited write — resolves only once IndexedDB has committed. Used for
   one-shot critical operations (import/undo); call these sequentially. */
export async function saveJSONNow(key: string, obj: any): Promise<boolean> {
  const s = _stringify(obj);
  if (s === undefined) return false;
  _clearTimer(key);
  delete _pending[key];
  try {
    if (hasStore) {
      await setRaw(key, s);
      return true;
    }
  } catch {
    /* silent */
  }
  return false;
}

export async function deleteKey(key: string): Promise<boolean> {
  _clearTimer(key);
  delete _pending[key];
  try {
    if (hasStore) {
      await delRaw(key);
      return true;
    }
  } catch {
    /* silent */
  }
  return false;
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushAll);
  window.addEventListener("beforeunload", flushAll);
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushAll();
    });
  }
}

/* Ask the browser not to evict this origin's storage under pressure. Granted
   automatically for installed/Home-Screen web apps in most browsers; this is
   a request, never a guarantee, and it is not a substitute for exporting. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch {
    /* ignore */
  }
  return false;
}
