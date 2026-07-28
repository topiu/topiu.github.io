# Liikepäiväkirja — standalone web build

The app off Claude artifacts: a Vite + React + TypeScript project that deploys to
GitHub Pages, plus a self-contained single-file build. This is **Phase 1** of the
native migration plan in `CLAUDE.md` — the same `domain/` layer will be reused by
the Capacitor shell, so none of this work is throwaway.

## Quick start

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # 33 tests: domain invariants, backup logic, mount tests
npm run build          # -> dist/         (GitHub Pages)
npm run build:single   # -> dist-single/index.html (one portable file)
npm run typecheck      # informational, see "Type checking" below
```

## How the port was done

The original 4052-line `liikepaivakirja.jsx` was **moved, not rewritten**.
`tools/slice.py` parses the file's top-level declarations and copies each one
verbatim into its target module, preserving original order so top-level
evaluation order (`REGIONS` → `REGION_BY_ID`, `LIBRARY` → `LIB_BY_ID`) is
unchanged. Only the import headers are generated. A multiset check confirmed the
port contains **exactly** the original's content lines — 0 missing, 0 extra.

Exactly three things are not verbatim, all in `tools/postslice.py` or new files:

1. `window.storage.delete("physio-undo")` → `deleteKey("physio-undo")`.
2. `doseLabel(d, unit)` → `doseLabel(d, unit?)` — type-only, no runtime change.
3. `src/storage/` is new (see below).

Re-running `python3 tools/slice.py && python3 tools/postslice.py` from a
directory containing `liikepaivakirja.jsx` reproduced `src/` exactly at the time
of the port, which is what made the refactor auditable rather than trusted.

**`src/` is now the source of truth.** Features added since the port (the daily
backup, for one) live only there, so re-running the slicer would discard them.
Treat `tools/` as a historical audit record, not a build step.

## Layout

```
src/
  domain/      pure logic, no React, no platform APIs — fully typed, tested
               dates dose taxonomy regions structures library defaults
               steps normalize load exportfmt num  (+ index.ts barrel)
  storage/     store.ts   IndexedDB, same contract as window.storage
               backup.ts  rolling daily snapshots
  platform/    download.ts  Blob download + clipboard
  ui/          App Today History Edit Modals Library BodyMap common
  styles/      tokens.ts   the palette C and FONT
tests/         domain.test.ts  smoke.test.tsx
tools/         slice.py  postslice.py
```

## Storage

`window.storage` is gone; `src/storage/store.ts` exposes the identical async
contract (`loadJSON` / `saveJSON` / `saveJSONDebounced` / `saveJSONNow`), so no
call site changed. The write policy from `CLAUDE.md` §4.1 is retained on purpose
even though IndexedDB has no rate limit: discrete actions write immediately and
never depend on a later flush, an immediate write supersedes any queued debounced
write to the same key, and only high-frequency text input is debounced.

The **data keys are unchanged** (`physio-config`, `physio-logs`, `physio-marks`,
`physio-undo`); isolation comes from a dedicated IndexedDB database name instead.
That matters because GitHub Pages puts every project you publish on the same
`https://<user>.github.io` origin, sharing one storage namespace.

### Durability — read this bit

On the artifact, Claude's storage was the durable copy. Here the browser owns
your data. Three layers, in decreasing order of how much you should trust them:

1. **JSON export to a file.** The only thing that survives a cleared profile, a
   new device or a lost phone. Keep doing it.
2. **`navigator.storage.persist()`**, requested at startup. Asks the browser not
   to evict this origin. Usually granted for installed/Home-Screen web apps.
   A request, never a guarantee.
3. **Daily snapshots** (`storage/backup.ts`), taken once at startup, last 14
   kept. These protect against the *app* writing bad data. They live in the same
   IndexedDB, so they do **not** protect against the browser clearing site data.

On iPhone, **add the site to your Home Screen**. Safari is the most aggressive
about clearing script-writable storage for sites you haven't opened in a while,
and installed web apps are treated far more kindly.

## Deploying to GitHub Pages

1. Push this project to a repo. `.github/workflows/deploy.yml` builds and
   deploys on every push to `main`.
2. Repo → Settings → Pages → **Source: GitHub Actions**.
3. The default base path is `/liikepaivakirja/`, i.e. a project site at
   `https://<user>.github.io/liikepaivakirja/`. This is deliberate — it leaves
   whatever else lives at the root of a `<user>.github.io` repo untouched.
   To serve from the root instead, set a repository variable `BASE_PATH` to `/`
   (Settings → Secrets and variables → Actions → Variables), or build locally
   with `BASE_PATH=/ npm run build`.

**Pick the URL before you start logging data.** IndexedDB is per-origin *and*
per-path-independent, so moving from `/liikepaivakirja/` to `/` keeps your data
(same origin) but moving to a custom domain does not — you'd migrate by
export/import.

## Migrating your data off the artifact

1. Open the published artifact in a desktop browser (not the mobile app — that
   build has no persistent storage) and take a fresh **JSON export**. Save it.
2. Open the standalone app, Historia → import, paste or load that JSON.
3. Verify before you stop using the artifact: check exercise count, symptom
   count, the earliest and latest logged day, and spot-check a day whose dose has
   changed to confirm its snapshot label still reads the historical dose.
4. Export again from the standalone app and diff against the original export.
   Field-for-field equality is the pass condition.

## Type checking

`npm run typecheck` currently reports ~57 errors, all in `src/ui/`, all of the
"TypeScript inferred a narrower prop shape than the untyped JSX actually uses"
family. They are **type-only** — Vite/esbuild strips types without checking, so
the build and runtime are unaffected, and CI does not gate on them.

`domain/`, `storage/` and `platform/` are clean. That asymmetry is intentional:
turning `strict` on now would mean editing thousands of lines we just proved were
moved verbatim. Tighten the UI module by module afterwards, with the tests as a
net.

## Daily file backup

Because browser storage is evictable, the app asks for a file backup once a day.
A dismissible banner appears at the top of **Tänään** when no backup exists for
today; dismissing it stops the nag until tomorrow only. Settings live at the
bottom of **Muokkaa**.

The mechanism depends on what the browser actually allows:

| Tier | Where | Behaviour |
| --- | --- | --- |
| Folder | Chromium desktop | Pick a folder once. Writes `liikepaivakirja-YYYY-MM-DD.json` plus a stable `liikepaivakirja-latest.json`, reads the file back to verify, prunes dated files older than 30 days. Silent after the first grant. |
| Download | anywhere | One tap. Lands in the browser's download folder. |
| Share | iOS/Safari, Android | One tap, then pick the destination in the share sheet. |

Safari ships no File System Access pickers on macOS, iPadOS or iOS in any
version, and neither do Chrome or Firefox on Android — so the folder tier is
Chromium-desktop-only, detected at runtime rather than assumed. On iPhone this is
therefore **a one-tap habit with a reminder, not automation**.

Useful iOS detail: Settings → Safari → Downloads accepts **Other…**, including a
third-party File Provider. Point it at a synced folder (e.g. a Syncthing client)
and a one-tap download leaves the device on its own.

Only the folder tier can verify a write, by reading the file back and comparing.
Download and share record the attempt and say so in the UI — the app does not
claim a backup it cannot confirm.

Retention pruning also only applies to the folder tier; the other two cannot see
where the file went.

## Not included

- **Offline support.** No service worker, so the app needs the network to load
  (data stays local once loaded). Adding `vite-plugin-pwa` is a small job — say
  the word.
- **A restore UI**, for either the in-browser snapshots or a backup file.
  `listSnapshots()` / `readSnapshot(date)` exist and nothing calls them; restoring
  a file today means the existing Historia import.
- **Verification for the download and share tiers.** Not possible from a web
  page — the browser does not report where the file landed.
- Any of the big-screen analytics discussed separately. This build is the
  existing app, faithfully, on your own hosting.
