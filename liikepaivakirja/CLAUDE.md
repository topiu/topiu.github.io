# CLAUDE.md

Working notes for changing this codebase. `README.md` documents what the app
**does**; this file is about how to change it without breaking things, and which
mistakes have already been made here so they are not made twice.

Read this, then `README.md`, then the file you are actually touching.

---

## What this is

`Liikepäiväkirja` — a Finnish-language physiotherapy exercise and symptom diary.
React + Vite + TypeScript PWA, ~8.6k lines of source and ~2k of tests, published
to GitHub Pages at `/liikepaivakirja/`. Single user (Topi), who reads it on a
phone. It began as a physiotherapist's prescription and grew from a Claude
artifact into this repo.

**There is no server and no account.** Every entry lives in the browser's
IndexedDB on one device. That single fact drives most of the design: durability
work is not optional polish, it is the core feature.

---

## The delivery loop — read this before writing any code

The user is on a phone and does not edit files. Changes ship as a **zip applied by
a GitHub Action**. Getting this wrong wastes a whole round, so:

1. **Clone the repo first.** `git clone --depth 1 https://github.com/topiu/topiu.github.io.git`
   (`github.com` is reachable from the sandbox.) Never work from memory of the
   code — it has moved on.
2. **Re-clone before packaging.** The user may or may not have applied the
   previous zip. Compute the change set by diffing your working tree against a
   *fresh* clone, not against an older one:
   `diff -rq /tmp/fresh/liikepaivakirja . | grep -v node_modules`
3. **Ship only changed files**, at paths relative to the app folder.
   Apply settings to state in the reply: `dest` = `liikepaivakirja`,
   `strip_root` = **no**, `mode` = **merge**.
4. **`merge` cannot delete.** If a file must go away, it has to be neutralised in
   place or the user has to delete it by hand. Plan for that.
5. **Verify like the workflow does**, on a clean clone with the zip applied:
   `npm ci && npm test && BASE_PATH=/liikepaivakirja/ npm run build`, then run the
   deploy job's assemble script and its verification step.
6. **`package.json` and `package-lock.json` travel together.** `npm ci` fails if
   they disagree, and the deploy fails with them.

Files under `.github/workflows/` **cannot** be shipped this way — a token without
the `workflow` scope is refused. Paste that content into the reply for hand
editing instead.

---

## Commands

```
npm ci                                   # match the lockfile, as CI does
npm test                                 # vitest, ~260 tests
npm run typecheck                        # tsc --noEmit — see caveat below
BASE_PATH=/liikepaivakirja/ npm run build   # what the deploy runs
npm run build:single                     # one self-contained .html, no worker
npm run dev
```

Both build targets must pass before shipping. `build:single` is a real target, not
a curiosity, and the service worker is deliberately absent from it.

**`npm run typecheck` does not currently pass** — around 32 pre-existing errors
(down from 73 once the shared components' optional props were typed `any`):
mostly untyped refs read as `{}` in App, a few `unknown` arithmetic complaints.
It is **not** in the deploy path; the workflow runs `npm test` and
`npm run build` only. So: do not treat a red typecheck as
something you broke, and do not claim it clean. Compare the error count against a
pristine clone before and after a change, and keep it from growing.

---

## Layout

```
src/domain/    pure logic — no React, no platform APIs, heavily tested
               backup dates defaults dose exportfmt freq gym help library
               load morning normalize num phase programtext psfs regions
               report reportview restore steps structures swipe taxonomy
               templates                            (+ index.ts barrel)
src/storage/   store.ts (IndexedDB + async bridge), backup.ts (snapshots),
               backupState.ts, fsbackup.ts
src/platform/  download.ts share.ts sw.ts sound.ts wakelock.ts
                                                 (browser capability wrappers)
src/ui/        App Today Focus History ExerciseChart Edit Modals Library
               BodyMap common Backup Help Psfs Report Restore Update
               Templates ProgramImport Phase           swipe.ts (hook)
               ErrorBoundary (one per tab, per modal and per day)
tests/         mirrors domain/ plus mount tests
```

Each `src/*/` folder also holds a one-line `README` naming its job; those are
copied into the build output and are harmless there.

`src/ui/App.tsx` is about 1200 lines and owns all state, every mutation and every
persistence call. Views are presentational and receive callbacks. When adding a
feature, the state and the writes go in `App.tsx`; the rendering does not.

---

## Non-negotiables

**Language.** Finnish for every user-facing string and for user-facing variable
names. English for code structure, comments and commit messages. No exceptions —
mixed-language UI strings are a bug.

**Domain purity.** `src/domain/**` imports no React and touches no browser API. If
logic can go there, it goes there, because that is what can be tested. Content
that is plain data (`taxonomy.ts`, `help.ts`) belongs there too.

**History is immutable.** Each day's log freezes the dose *and frequency* in force
that day (`doseSnapshotOf`). Changing a prescription must never make past days
read as incomplete. `goalOf` / `goalMinOf` / `goalFreqOf` read the snapshot and
fall back to current. Anything computing adherence uses them — never `ex.dose`.

**One definition of "done".** `isCompleteOn` in `domain/dose.ts`. The daily view,
the weekly counter and the report all call it. They used to have three copies and
disagreed.

**Every data key must round-trip.** `DATA_KEYS` in `domain/restore.ts` is the
list. Each entry must appear in `buildJSON` (export), in `parseImport`, in
`storage/backup.ts` `KEYS` (snapshots), and in App's import/undo paths. A key
missing from any one of those is silent data loss. There is a test for the export
side; add to it when adding a key. Bump the JSON `version` when the shape grows.

**Device preferences are not diary data.** `physio-ui` and `physio-offline` are
deliberately outside `DATA_KEYS`, the export and the snapshots. `physio-offline`
is in localStorage because it must be readable synchronously before React mounts.

**The app records, it does not judge.** No advice about whether pain is
acceptable, no "improving" verdicts, no trend arrows on symptom counts. The one
interpretive statement anywhere is the PSFS band, and that threshold is published
rather than ours. Interpretation belongs to the physiotherapist.

**Setup is pick-then-adjust.** Every new field gets a working default, and no
feature may add a required setup step. Heavy first setup is how apps like this
drift: each feature adds a knob, defaults do not encode the real-world shape,
and the person fills in a form before the first ordinary day. Templates, library
starting targets and the compact editor exist because of this rule.

**Friction is a feature killer.** Daily logging has to stay under about thirty
seconds or it stops happening. Anything added to `Today` must justify its vertical
space; controls that do nothing are hidden, not greyed out.

---

## Traps already hit here

**A `const` arrow read above its own declaration throws, and a render throw took
the whole app down.** `TrendChart` built its steps polyline one line above the
`xC` x-scale it calls; `const` hoists into the temporal dead zone, so this is a
`ReferenceError` at render time, not a lint nit. It blanked the app for every
Historia range except the 14 pv default — because 14 pv renders a different
branch entirely, and the long-range branch had no test. Two rules came out of it:
order a chart body **geometry → scales → point lists**, and when a view is only
reachable through a control, the test has to press the control. There is now an
`ErrorBoundary` per tab (`ui/ErrorBoundary.tsx`), so the same class of bug costs
one view instead of the whole screen — treat that as a floor, not a licence, and
never as a reason to leave a throwing path untested.

**React state updaters run during render, not during the event.** Counting inside
`setLogs(prev => …)` and reading the count afterwards gives zero. Decide
everything synchronously against committed state, then apply. This shipped as a
bug in the one-tap programme button; a mount test caught it.

**React registers `touchmove` passively.** `preventDefault()` inside an
`onTouchMove` prop is silently a no-op, so anything that must cancel scrolling has
to attach its own listener with `{ passive: false }`. This shipped as a bug: the
swipe pane slid sideways while the page scrolled underneath it, and the leftover
vertical velocity kept coasting after release. `preventDefault` only after an axis
lock, never before, or vertical scrolling gets blocked.

**A `useEffect` over a plain ref does not see a late-mounting node.** Tänään is
not rendered until IndexedDB answers, so an effect attaching a listener ran
against a null ref and never re-ran — the gesture was dead in production, not just
in tests. Use a **callback ref** for anything that attaches to a DOM node, and
read changing handlers through a ref so the listener need not detach.

**Do not put per-frame values in React state.** The swipe drag offset is written
straight to `style.transform` through a ref, because re-rendering the whole Tänään
subtree on every `touchmove` drops frames. See the long comment in `ui/swipe.ts`.
The pane carries `data-day-pane` so tests can read the DOM, which is where the
value actually lives.

**Testing Library has no auto-cleanup here** — vitest globals are off, so its
`afterEach` never registers and every `render` accumulates in the document. Scope
queries with `within(container)`, or use `getAllByText(...)[0]`. Portalled UI
(the report modal) is outside `container`; query `document.body` for it.

**Test files need `// @vitest-environment jsdom`** as a docblock comment. There is
no vitest config file.

**Never make a test depend on wall-clock elapsed time.** A failing test fails the
deploy. `tests/dayswipe.test.tsx` freezes `Date.now`.

**Give each mount-test file its own `fake-indexeddb`.** Storage persists across
tests within a file, so a suite that needs an empty diary (`onboarding.test.tsx`)
gets its own file, and resets the keys it depends on in `beforeEach`.

**Do not replace a range of `README.md` by slicing between two headings.** Doing
that silently deleted three unrelated sections. Insert with a single targeted
`replace` on a unique anchor, then `grep '^## '` to confirm nothing vanished.

**"Could not read" is not "empty".** `loadJSON` returns its fallback for a
missing key, and it used to do the same when the read *failed* — so one flaky
read at startup seeded the default programme over the real one, and an empty
`logs` let the first tap write one day over the whole history. Startup uses
`loadJSONStrict`, which throws on a failed read; anything that decides what to
*write* from what it read must not use the forgiving variant.

**A write is done when its transaction completes**, not when its request
succeeds — a commit-time abort (a full disk) arrives after `success`. Writes
that replace the dataset (import, restore, undo) go through `saveManyNow`, one
transaction for every key plus the undo copy and the pre-restore snapshot, and
the screen changes only after it commits.

**Debounced text needs an owner that outlives the field.** A timer inside the
input component dies when it unmounts — a swipe to another day — and React does
not deliver the `blur` of a node it is removing, so `onBlur` is no safety net
either. Typed text is scheduled in App, keyed by what it writes and the day it
was typed on, and registered with `onFlush` so `flushAll` (page hide,
backgrounding, applying an update) reaches it.

**IDs are history.** Every log entry is keyed by exercise or symptom id. Anything
that regenerates ids — a reset to defaults, a re-seed — detaches every logged
session from its exercise. `resetToDefaults` keeps matching ids and archives
items with history instead of dropping them.

**jsdom has no layout, so overlap passes every test.** The set balls ran under
exercise names on phones for months with the suite green. After touching a
Tänään row, look at it in a real browser at 320, 375, 390 and 430 px with a
programme that has 5–10-set exercises, weekly badges and long Finnish names:
Playwright and Chromium are preinstalled in the Claude sandbox (seed IndexedDB
from a same-origin static file such as `manifest.webmanifest` before the app
loads, or its first-run seed overwrites yours).

**`Number(null)` is `0`.** A normaliser that does `Number(v)` turns "not
recorded" into zero; a mount test caught hold sets being stored with `reps: 0`,
which reads "0 × …", before it shipped. Check `v == null` before converting.

**Watch for `-0`.** `Math.abs`/sign arithmetic returning `-0` puts `-0px` into a
transform. Guard the zero case.

---

## Service workers and offline

Offline has been shipped, withdrawn and reshipped. The rules that came out of it:

- **Navigations are NetworkFirst; `navigateFallback` is off.** Hashed assets are
  immutable so precaching them cache-first is fine, but the HTML entry point is
  the one file whose staleness can strand a device. Never precache `index.html`.
- **Never ship a worker without a runtime escape hatch.** `?sw=off` persists an
  opt-out and works on an iOS Home Screen install, where there are no developer
  tools and the remedy a user would reach for — clearing website data — destroys
  the diary. There is also a switch under Muokkaa.
- **Updates are offered, not applied.** `skipWaiting: false`, a banner, and
  `flushAll()` before handing over. The app writes to IndexedDB continuously.
- `public/sw.js` is a self-destroying worker parked at the *old* worker's URL. The
  live worker is `service-worker.js`. Do not delete `public/sw.js` until every
  device has loaded the app online at least once.
- Registration is untestable here (jsdom has no `ServiceWorkerContainer`). The
  pure parts are tested; the rest is verified by hand after deploying.

---

## When the site looks broken

**Check the deploy before suspecting the app.** This has cost two rounds, once
with a whole feature withdrawn for a fault it did not have.

Symptoms of Pages serving the repository branch instead of the Actions artifact:
the root shows a bare default page (Jekyll rendering the one-line root
`README.md`), and `/liikepaivakirja/` shows the app's own "ei latautunut" fallback
because the *unbuilt* `index.html` points at `/src/main.tsx`, which 404s. `?sw=off`
does nothing in that state, correctly — no JavaScript ever ran.

In order:

1. **BUILD_ID** under Muokkaa → Offline ja versio. If it is not the deploy just
   run, the deploy did not land and nothing in the app is at fault.
2. **Settings → Pages → Source** must say GitHub Actions.
3. The latest Deploy run: green, not cancelled, not failed.

The workflow now runs `configure-pages` *before* the build, uses
`cancel-in-progress: false`, and verifies that every asset an `index.html`
references exists in the artifact. Uploading a zip through the web UI is itself a
push and starts a deploy; let it finish before dispatching another.

---

## Adding a feature — the shape that works

1. **Ask first, then build.** The user prefers a shortlist of options with
   trade-offs and picks from it. Do not build the whole list.
2. **Pure logic into `domain/`, with tests, before any UI.** Include tests that
   fail if an invariant regresses, and say in a comment which invariant.
3. **State and persistence into `App.tsx`.** Immediate write for a discrete
   action, debounced for text input.
4. **New storage key?** Walk the round-trip checklist above.
5. **Docs.** Update `README.md` with the reasoning, not just the behaviour —
   including what was deliberately *not* built, so the decision does not get
   re-litigated from memory later.
6. **Report the honest state.** Say what is untested and why, and flag design
   calls that need a human's judgement in the hand rather than presenting them as
   settled.
