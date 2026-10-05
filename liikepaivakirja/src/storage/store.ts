/* storage/store.ts
 *
 * Replaces Claude's `window.storage` with IndexedDB. The exported contract is
 * deliberately identical to the artifact version, so no call site changed:
 *
 *   loadJSON(key, fallback)     -> Promise<any>
 *   saveJSON(key, obj)          -> immediate, fire-and-forget (retried on failure)
 *   saveJSONDebounced(key, obj) -> coalesced (text fields)
 *   saveJSONNow(key, obj)       -> awaited, resolves true only once committed
 *   deleteKey(key)              -> awaited
 *
 * plus loadJSONStrict (throws on a failed read), saveManyNow (atomic multi-key
 * write) and subscribeWriteStatus (tells the UI when writes are failing).
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

/* A cached connection can die under us: iOS drops it when the app sits in the
   background ("Connection to Indexed Database server lost"), and browsers close
   it under storage pressure. Every later transaction on it throws, so the
   cached promise is forgotten as soon as the connection is known to be gone,
   and `run` reopens once if it finds out the hard way. */
function open(): Promise<IDBDatabase> {
  if (!dbp) {
    const p: Promise<IDBDatabase> = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => {
        const db = req.result;
        const forget = () => {
          if (dbp === p) dbp = null;
        };
        db.onclose = forget;
        db.onversionchange = () => {
          db.close();
          forget();
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
    dbp = p;
    /* a failed open must not poison every later attempt */
    p.catch(() => {
      if (dbp === p) dbp = null;
    });
  }
  return dbp;
}

/* `fn` issues its requests and returns either the request whose result is
   wanted, or a function that reads the result once everything has run. The
   promise settles on the *transaction* — resolving on a request's success would
   report a write as done before it committed, and a commit-time abort (a full
   disk usually arrives that way) would then go unnoticed. */
type Body<T> = (s: IDBObjectStore) => IDBRequest | (() => T) | void;

function attempt<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: Body<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    let read: () => T = () => undefined as T;
    const out = fn(tx.objectStore(STORE));
    if (typeof out === "function") read = out;
    else if (out) read = () => out.result as T;
    tx.oncomplete = () => resolve(read());
    tx.onabort = () => reject(tx.error || new DOMException("Transaction aborted", "AbortError"));
  });
}

function run<T>(mode: IDBTransactionMode, fn: Body<T>): Promise<T> {
  return open()
    .then((db) => attempt<T>(db, mode, fn))
    .catch((err) => {
      /* the connection closed without telling us: reopen once */
      if (err && err.name === "InvalidStateError") {
        dbp = null;
        return open().then((db) => attempt<T>(db, mode, fn));
      }
      throw err;
    });
}

/* Test hook: close the cached connection *without* telling the cache, which is
   what an iOS background kill looks like from here. */
export async function __closeConnectionForTests() {
  if (dbp) (await dbp).close();
}

/* ---- raw key/value access (also used by backup.ts) ---- */

export function getRaw(key: string): Promise<string | undefined> {
  return run<string | undefined>("readonly", (s) => s.get(key));
}
/* Several keys read in one transaction, so they are mutually consistent. */
export function getManyRaw(keys: string[]): Promise<Record<string, string | undefined>> {
  return run("readonly", (s) => {
    const out: Record<string, string | undefined> = {};
    keys.forEach((k) => {
      const r = s.get(k);
      r.onsuccess = () => (out[k] = r.result);
    });
    return () => out;
  });
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
    return await loadJSONStrict(key, fallback);
  } catch {
    return fallback;
  }
}

/* For the startup load. An absent key is the fallback, as above, but a failed
   *read* throws instead: treating "could not read" as "empty" made the app seed
   defaults and then write them over the real diary. Unparseable contents are
   moved aside under `corrupt:<key>:<time>` rather than thrown, so a damaged key
   can never lock the app, and never silently vanishes either. */
export async function loadJSONStrict(key: string, fallback: any) {
  if (!hasStore) return fallback;
  let v: string | undefined;
  for (let i = 0; ; i++) {
    try {
      v = await getRaw(key);
      break;
    } catch (err) {
      if (i >= 2) throw err;
      await new Promise((r) => setTimeout(r, 150 * (i + 1)));
    }
  }
  if (v == null) return fallback;
  try {
    return JSON.parse(v);
  } catch {
    try {
      await setRaw(`corrupt:${key}:${new Date().toISOString()}`, v);
    } catch {
      /* best effort */
    }
    return fallback;
  }
}

const _pending: Record<string, string> = {};
const _timers: Record<string, any> = {};

/* Keys whose latest write failed. A fire-and-forget write that fails is
   retried with the same value unless something newer has been written since,
   and the UI is told, because the alternative is a diary that looks saved and
   is not. */
const _failed = new Set<string>();
const _latest: Record<string, string> = {};
const _statusListeners = new Set<(failing: boolean) => void>();
const RETRY_MS = 4000;

function _notify() {
  const failing = _failed.size > 0;
  _statusListeners.forEach((fn) => fn(failing));
}
function _markOk(key: string) {
  if (_failed.delete(key)) _notify();
}
function _markFailed(key: string) {
  if (!_failed.has(key)) {
    _failed.add(key);
    _notify();
  }
}

/* Subscribe to "some write is currently failing". Returns the unsubscribe. */
export function subscribeWriteStatus(fn: (failing: boolean) => void): () => void {
  _statusListeners.add(fn);
  fn(_failed.size > 0);
  return () => {
    _statusListeners.delete(fn);
  };
}

function _writeNow(key: string, s: string) {
  if (!hasStore) return;
  _latest[key] = s;
  setRaw(key, s).then(
    () => _markOk(key),
    () => {
      _markFailed(key);
      /* retry this value only if it is still the newest one for the key */
      if (_latest[key] === s && _pending[key] === undefined) {
        _pending[key] = s;
        _clearTimer(key);
        _timers[key] = setTimeout(() => _flushKey(key), RETRY_MS);
      }
    }
  );
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
/* Other debounced work (App's typed text) registers here so that every path
   that flushes — page hide, backgrounding, applying an update — reaches it. */
const _flushers = new Set<() => void>();
export function onFlush(fn: () => void): () => void {
  _flushers.add(fn);
  return () => {
    _flushers.delete(fn);
  };
}
export function flushAll() {
  _flushers.forEach((fn) => {
    try {
      fn();
    } catch {
      /* one failing flusher must not stop the rest */
    }
  });
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

/* Awaited write — resolves true only once IndexedDB has committed. */
export async function saveJSONNow(key: string, obj: any): Promise<boolean> {
  return saveManyNow({ [key]: obj });
}

/* Several keys written, and optionally deleted, in ONE transaction: either all
   of it commits or none of it does. Import, restore and undo replace the whole
   dataset; doing that key by key could leave half an old diary and half a new
   one, or delete the undo copy after the write it was guarding had failed. */
export async function saveManyNow(values: Record<string, any>, deletes: string[] = []): Promise<boolean> {
  const strings: Record<string, string> = {};
  for (const k of Object.keys(values)) {
    const s = _stringify(values[k]);
    if (s === undefined) return false;
    strings[k] = s;
  }
  const keys = [...Object.keys(strings), ...deletes];
  keys.forEach((k) => {
    _clearTimer(k);
    delete _pending[k];
  });
  if (!hasStore) return false;
  try {
    await run("readwrite", (st) => {
      Object.keys(strings).forEach((k) => st.put(strings[k], k));
      deletes.forEach((k) => st.delete(k));
    });
    Object.keys(strings).forEach((k) => {
      _latest[k] = strings[k];
      _markOk(k);
    });
    return true;
  } catch {
    return false;
  }
}

export async function deleteKey(key: string): Promise<boolean> {
  return saveManyNow({}, [key]);
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

/* Structured (non-JSON) values. IndexedDB stores anything structured-cloneable,
   which includes FileSystemDirectoryHandle — that handle cannot be JSON'd, so it
   bypasses the JSON layer above. */
export function getObj<T = any>(key: string): Promise<T | undefined> {
  return run<T | undefined>("readonly", (s) => s.get(key));
}
export function setObj(key: string, value: any): Promise<unknown> {
  return run("readwrite", (s) => s.put(value, key));
}
