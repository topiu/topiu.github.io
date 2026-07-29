# Liikepäiväkirja — standalone web build

The app off Claude artifacts: a Vite + React + TypeScript project that deploys to
GitHub Pages, plus a self-contained single-file build. This is **Phase 1** of the
native migration plan in `CLAUDE.md` — the same `domain/` layer will be reused by
the Capacitor shell, so none of this work is throwaway.

## Quick start

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # 168 tests: domain invariants, backup logic, mount tests
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
               steps normalize load exportfmt num
               freq help psfs report reportview restore swipe
                                                 (+ index.ts barrel)
  storage/     store.ts   IndexedDB, same contract as window.storage
               backup.ts  rolling daily snapshots
  platform/    download.ts  Blob download + clipboard
               share.ts     share-sheet + directory-picker capability
               sw.ts        service worker registration, opt-out, BUILD_ID
  ui/          App Today History Edit Modals Library BodyMap common
               Help Psfs Report Restore Update  swipe.ts (hook)
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

The data keys are `physio-config`, `physio-logs`, `physio-marks`, `physio-undo`,
`physio-psfs` and `physio-questions`, plus `physio-ui` for dismissed-hint state
and `physio-offline` in localStorage for the offline opt-out. The last two are
per-device preferences rather than diary data, so they are deliberately outside
`DATA_KEYS`, the export and the snapshots. The first four are byte-identical to the
artifact build, so an export from either side still imports into the other;
isolation comes from a dedicated IndexedDB database name instead.
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

All three are now readable from **Muokkaa → Palautus** (see below). Every key in
`DATA_KEYS` must appear in `buildJSON`, or a restore from file silently drops it;
that rule is what took the export format to version 9, and there is a test that
fails if a key is added without being exported.

On iPhone, **add the site to your Home Screen**. Safari is the most aggressive
about clearing script-writable storage for sites you haven't opened in a while,
and installed web apps are treated far more kindly.

## Raportti fysioterapeutille

The CSV export answers "give me everything". A physiotherapist has about two
minutes and a different question, so **Historia → Raportti fysioterapeutille**
builds a one-page summary: adherence, function, symptoms, dose changes,
milestones, recent notes, and a free-text block for what you want to ask.

Three ways out, because exactly one of them works everywhere this app runs:

| Action | Where it works | Notes |
| --- | --- | --- |
| Tulosta | Desktop, mobile Safari **tabs** | Real PDF via the browser's print dialog. |
| Lataa .html | Everywhere | Self-contained file, no external assets. Opens on any machine, prints from there, attaches to an email. |
| Kopioi | Everywhere | Plain text for a message or email body. |

An iOS Home Screen web app has no share button and no print, so `window.print()`
is a convenience, not the mechanism — the downloadable `.html` is the path that
always works, and the UI says so.

`domain/report.ts` builds the model, `domain/reportview.ts` renders it to
strings. The preview, the printed page and the downloaded file all come from the
same `reportBodyHTML` output, so the preview cannot lie about what gets sent. The
modal mounts through a portal to `<body>` so that one print rule —
`body > *:not(.rpt-portal) { display: none }` — hides the entire app.

Three things the numbers do deliberately:

1. Adherence is scored against the dose **in force on each day**, via the
   existing per-day snapshot. Changing a prescription never rewrites history.
2. The denominator is **what the prescription asked for**, not calendar days.
   A 3×/week exercise over four weeks is scored out of 12. Before frequencies
   existed the denominator was calendar days, which meant such an exercise could
   never score above about 43 % however perfectly it was followed — a real defect,
   not a rounding quirk. Over-delivery is reported above 100 % rather than capped.
3. Each exercise's window starts the day it first appears in the log, not at
   the start of the range, so an exercise added last week does not read as three
   weeks of missed sessions. The page prints that start date.
3. Nothing is interpreted. No trend arrows, no "improving", no advice. The single
   interpretive statement on the page is the PSFS band, and that threshold is
   published rather than ours.

## PSFS — toimintakyky

The **Patient-Specific Functional Scale**, on Tänään. You name three to five
everyday things the problem is currently getting in the way of, then score each
0 ("en pysty lainkaan") to 10 ("kuten ennen vaivaa"). The mean is the number a
physiotherapist reads, and they know the instrument by that name.

It fits this app because it is the one validated measure whose *content* the
patient supplies — like the exercise and symptom lists already here. A fixed
region-specific questionnaire (Oswestry, HAGOS, iHOT) would have to ship
verbatim, is longer, and is licence-encumbered; the PSFS ships as a scale and a
rule, and the Finnish wording in `ui/Psfs.tsx` is ours.

Two design points:

- **Fortnightly, not daily.** `psfsDue` enforces a 14-day interval and the card
  collapses to one line when nothing is due. The daily screen has to stay fast,
  and daily scoring would manufacture variation that looks like signal.
- **Two different thresholds, not one.** Minimal important differences for the
  *mean* are about 1.3 / 2.3 / 2.7 (small / medium / large). The minimal
  detectable change for a *single* activity is about 3 points — so single
  activities are shown as raw numbers and never labelled "parantunut". Conflating
  the two is the standard way to read improvement into noise.

Retiring an activity keeps its scored history in the report; "poista kokonaan"
purges it, and the UI says which is which. The JSON export is now **version 8**
and carries `psfs`; a v7 file still imports (a missing key normalizes to an empty
PSFS), and an older build reading a v8 file just ignores the field.

## Offline

Offline shipped, was withdrawn the same day, and is back — built differently.

### What went wrong the first time

Not what was assumed. The app went blank and the root of the user site showed a
bare default page, which was blamed on the service worker; a kill switch was
shipped to retire it. The kill switch was the right precaution but the diagnosis
was probably wrong, because **the root page was the giveaway**: a service worker
scoped to `/liikepaivakirja/` cannot affect `/` at all.

The symptoms are the exact signature of GitHub Pages serving the **repository
branch** instead of the Actions artifact:

| What was seen | What branch-serving produces |
| --- | --- |
| Root shows a bare default page | Jekyll renders `README.md`, which is one line: `# topiu.github.io` |
| `/liikepaivakirja/` is blank | The *source* `index.html` is served, and its `<script src="/src/main.tsx">` only exists after a build, so it 404s |
| The app list is empty | `apps.json` is generated by the workflow and exists only in the artifact |

`actions/configure-pages@v5` sets the source to "GitHub Actions", but it runs
*after* the build step — so a deploy that fails while building never reaches it and
leaves the source wherever it was. If the app is ever blank again, **check
Settings → Pages → Source before suspecting the code.**

Two things now make this diagnosable in one glance instead of by inference:

- **BUILD_ID** is compiled in and shown under Muokkaa → Offline ja versio. If the
  timestamp is not the deploy you just ran, the deploy did not land, and nothing
  in the app is at fault.
- **`index.html` carries placeholder content** inside `#root`, which React replaces
  on mount. A bundle that never loads now shows "Liikepäiväkirja ei latautunut"
  with the escape hatch, rather than a white screen. This is what a raw-source
  deploy looks like from now on.

### How this attempt differs

**Navigations are NetworkFirst, and `navigateFallback` is off.** This is the
important one. Hashed assets are immutable, so precaching them cache-first is
safe; the HTML entry point is the single file whose staleness can strand a device.
It is now fetched fresh whenever there is a network, with a 4-second timeout and
the cached copy as fallback — so a fixed deploy heals on one refresh, and the
brick scenario is removed rather than given a remedy.

**Three ways out**, in descending order of how bad things have to be:

1. **`?sw=off`** on the URL. Unregisters every worker under the scope, deletes the
   caches, and persists the choice. This is the one that matters: it works on an
   iOS Home Screen install, where there are no developer tools, because the same
   URL can be opened in Safari with a query string typed on the end. `?sw=on`
   restores it. `?nosw` is accepted too, because in a panic what gets typed is not
   necessarily what was documented.
2. **Offline-tila switch** under Muokkaa, for the ordinary case.
3. **`public/sw.js`** is still the self-destroying worker from the rollback, sitting
   at the URL the *old* worker occupied. The new worker is at `service-worker.js`,
   so the two cannot shadow each other, and a device that never came back gets its
   old worker retired on its next visit. Such a device may reload itself once on
   that visit; that is the kill switch doing its job. `public/sw.js` can be deleted
   once every device has loaded the app once online.

The preference lives in **localStorage**, not the IndexedDB store: it has to be
readable synchronously before React mounts, and one reason to switch offline off
is IndexedDB itself misbehaving. It is a per-device setting, so it is absent from
`DATA_KEYS` and from the export.

**Scope** is still `/liikepaivakirja/`, because the worker is emitted next to
`index.html`. On a user site this matters: a root-scoped worker would take over
`landing/`, `mokkipohja.html` and every future sibling project.

**Updates are offered, not applied.** `skipWaiting: false`, and a banner on Tänään
that runs `flushAll()` before handing over. `autoUpdate` would swap assets under a
running session, and this app writes to IndexedDB continuously.

Offline capability still arrives on the **second** load; the footer says so until
it is genuinely true. The single-file build has no worker — that target is opened
from disk, where there is nothing to cache and no origin to scope to.

### Still not verified here

`platform/sw.ts` registration is not covered by a test: jsdom has no
`ServiceWorkerContainer`, and mocking the whole lifecycle would test the mock. The
pure parts — the URL override parser and the preference — are tested, and the
state-to-UI path has a mount test. **Verify by hand after deploying:** check
BUILD_ID matches, reload once, then go offline and reload again.

## Tiheys — "× viikossa"

Every exercise used to be implicitly due every day. An exercise is now prescribed
a weekly count from 1 to 7, set with the **Tiheys** stepper under Muokkaa. 7 means
daily and is the default, so nothing that existed before this change behaves or
scores differently.

A weekly count rather than named weekdays, deliberately. "Three times this week"
is how these prescriptions are actually given, it is less to configure, and naming
the days would invent a notion of being *late* that the physiotherapist never
prescribed.

- On **Tänään**, an exercise below daily carries a `2/3 vk` badge — sessions
  completed this Monday–Sunday week against the target. A session logged later in
  the same week still counts toward that week.
- Changing a frequency is annotated in the timeline exactly like a dose change,
  and it is **snapshotted per day** alongside the dose. Raising 3× to 5× does not
  retroactively turn completed weeks into missed ones.
- The report scores against it; see the note above about the denominator.

## Yhden napautuksen ohjelma

**Merkitse ohjelma tehdyksi** on Tänään fills every exercise still owed to the
dose in force today.

Not "same as yesterday", which was the obvious version and the wrong one:
yesterday may have been a partial day, and copying it forward quietly launders a
missed session into the new normal. Today's prescription is the reference.

Three rules that keep it honest:

- It **never reduces** a value, so a deliberate overdrive entry survives.
- It **skips anything whose weekly target is already met**. The button removes
  friction; it is not there to talk anyone into extra sessions.
- It **disappears when nothing is owed**, rather than sitting there greyed out. On
  the one screen that has to stay fast, a control that does nothing is noise.

A bulk write gets an undo: the exact log object from before the fill is held for
nine seconds and restored wholesale, rather than trying to subtract what was
added.

## Oireen kirjaus yhdellä napautuksella

The three severity buttons are the **primary** control, sitting on the symptom's
own row. One tap both flares the symptom and grades it. Tapping the level that is
already active clears the entry. Quality stays optional and appears below only
once something is flared.

Logging a symptom went from two or three taps to one, and grading it can no
longer be forgotten — which was the common failure, because the old flow let you
toggle the symptom on and walk away before picking a level.

Deliberate consequences:

- **A level is now required to flare a symptom.** "It came back but I have no idea
  how badly" is no longer expressible. That state was cheap to produce and useless
  to read — the report's mean severity had to ignore it — so requiring a level
  makes the record more complete rather than less honest.
- **Days recorded before this change still load correctly**, showing as flared with
  no level selected. Since no level button is active on such a day, there is
  nothing to tap twice, which is why an explicit **Poista** button exists on the
  quality row. It is the only way to clear those entries, and it is also the
  obvious way to undo a mis-tap without working out which level is active.
- **Nothing is ever flared by default**, and the row wraps rather than truncating
  on a narrow screen: "kohtalainen" is a long word and a clipped symptom name is
  worse than a second line.

The old `toggleSymptom` and `setSeverity` handlers are gone rather than kept
alongside. Two ways to reach the same state is how the two controls drifted apart
in the first place.

## Ohjeet ja ensimmäinen käynnistys

Two separate things, because they answer different questions at different times.

**The first-run card** appears on Tänään only while the diary is genuinely empty —
no logged days, no milestones, no PSFS assessments — and retires itself the moment
anything is recorded. Three numbered steps and two buttons; no modal, nothing
gated behind it. Onboarding that outstays its welcome is clutter on the one screen
that has to stay fast.

It is gated on the load having finished, so it cannot flash on every startup
before IndexedDB has answered, and dismissal is remembered in `physio-ui`.

It also offers a **restore**, which covers the case the emptiness check cannot
distinguish: an empty diary is either a new install or a lost one, and the second
wants a backup file rather than a welcome.

**The help panel** is reachable from the `?` in the header at any time, not only
when empty. The questions it answers — what is PSFS, where does my data live, what
is in the report — come up months in. Sections start collapsed and only one opens
at a time, so it reads as a list of questions instead of a wall of prose. BUILD_ID
is at the bottom.

Content lives in `domain/help.ts` as data rather than in JSX, for the same reason
`taxonomy.ts` does: it can then be asserted against. Three of those assertions are
deliberate tripwires rather than coverage —

- the storage section must still say the data is only on this device **and** must
  still say `varmuuskopio`;
- the offline section must still contain `?sw=off`;
- paragraphs are capped in length and sections in number.

Help nobody reads because it is too long is worse than no help, and "tidying up
for length" is exactly how the backup warning would quietly go missing.

There is a second audience worth keeping in mind for the wording: a
physiotherapist who has been sent the URL or a report and wants to know what they
are looking at. That is why "Mikä tämä on" leads with what the app does *not*
claim to be — it records, it does not judge whether pain is acceptable.

## Päivän vaihto pyyhkäisyllä

Drag left or right anywhere in the Tänään pane to change day: right goes back,
left forward, bounded at today. Alternating-day programmes mean the previous day
gets consulted constantly, and two taps on a 20px arrow was the wrong price.

**The pane follows the finger, and a pill names the day a release would land on.**
The first version committed on release and *then* played a slide-in, which was the
wrong way round: the feedback arrived after the decision, so the gesture could not
teach itself — you had to already know it existed, and know what it would do,
before it would tell you anything. Now both facts are available while there is
still time to slide back and abort.

Travel is one-to-one up to the 56px commit threshold, then compressed threefold
and capped at 120px. The change in resistance is the point: the commit moment is
*felt*, not just labelled. A forward drag past today gets a stiff 26px leash, so
the end of the range announces itself during the gesture rather than after it, and
no pill appears because no promise is being made.

**Coexisting with the browser's own gesture.** iOS Safari's back/forward swipe
cannot be cancelled — `touchstart` in the edge strip is not reliably cancelable and
`preventDefault` does not stop the navigation. There is no way to win it, so the
app declines it: a gesture is ignored unless it *starts* more than
`SWIPE_EDGE_PX` (44) from either side, wider than the ~20px Safari claims and equal
to Apple's minimum touch target. On a viewport too narrow to hold two strips and a
usable middle, swiping disables itself rather than shrinking them.

**Coexisting with vertical scrolling.** The axis is decided once, from the first
10px, then honoured for the rest of the gesture; re-deciding on every move is how
swipe handlers steal the end of a flick. An exact diagonal goes to the scroller.
If the gesture turns out to be vertical after the pane has already moved, the pane
is handed back with a transition. Listeners are all **passive** — nothing needs
`preventDefault`, since a horizontal drag has nothing to scroll.

Text fields and anything marked `data-noswipe` keep their own horizontal drags
(in a textarea that is a caret selection). Multi-touch is ignored so pinch cannot
turn the page, and `touch-action` is `pan-y pinch-zoom` rather than `pan-y` so the
gesture does not cost anyone text zoom.

### Why ui/swipe.ts writes to the DOM directly

The drag offset is **not** React state. Tänään renders a whole day — hero ring,
every exercise, every symptom, the PSFS card — and re-rendering that subtree on
every `touchmove` would drop frames on a phone. The offset goes straight to the
pane's `style.transform` through a ref, and the pill's label through another.
React owns *which* day is shown; `ui/swipe.ts` owns where the pane sits while a
finger is on it. They cannot fight, because the transform is always reset before
React is told anything.

The pane therefore must not be keyed — `data-day-pane` marks it, and is also the
hook the tests assert on, since the DOM is where the drag actually lives.

On commit the pane continues the way the finger went and fades out, the day is
swapped while it is invisible, and it arrives from the opposite side. The
crossfade is what hides the jump: only one day is rendered, so there is no
neighbour to slide across, and fading at the swap point means there is nothing to
see at the moment the content changes. Rendering the adjacent days properly would
be a real carousel — three heavy subtrees and three sets of live mutations — which
is not worth it for a gesture this short.

`prefers-reduced-motion` commits instantly with no animation. The drag itself is
kept: it is direct manipulation rather than decoration, and removing it would take
away the only in-gesture feedback there is.

The geometry is pure in `domain/swipe.ts`; `tests/dayswipe.test.tsx` drives real
touch events through the mounted app and reads the transform and the pill off the
DOM, including the edge refusal, the boundary leash and the textarea case.

## Palautus

`listSnapshots()` and `readSnapshot()` existed since the port with nothing able
to call them. **Muokkaa → Palautus** is that half, collapsed by default because
it is the most destructive control in the app.

Everything goes through one two-step flow: pick a source, read what would
change, then confirm.

- **Laitteen sisäiset kopiot** — the 14 daily snapshots, with the time each was
  taken. The date alone cannot tell you whether a snapshot predates this
  morning's edits.
- **Varmuuskopiotiedosto** — pick a `.json` and see what is in it. This is the
  "check my backup" path, and it is the same flow stopped after step one, so
  verification needs no separate code to keep honest. A backup you have never
  read back is a hope, not a backup.

The confirm step reports `diffDatasets`: counts before and after, and the days
that would **stop existing**. Lost days are counted directly rather than inferred
from totals, because a net day-count delta of zero can still hide one day being
swapped for another. A restore that changes nothing is reported as such — which
is the expected result when you are only verifying.

Applying reuses App's `applyImport`, so there is one write-everything path rather
than two that must agree, and a restore is undoable via `physio-undo`.
`forceSnapshot()` runs first, so the state you restored *away* from survives a
second restore consuming the undo slot.

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

- **Verification for the download and share tiers.** Not possible from a web
  page — the browser does not report where the file landed.
- **A test for service worker registration.** See above; verify by hand.
- **Selective restore.** A restore is all-or-nothing. Merging one day out of a
  snapshot into current data is a different and much harder feature.
- **A next-day pain field.** Discussed but not built: pain *during* / *right
  after* / *24 h after* a session, which is what a physio actually asks and what
  would sharpen the existing lag analysis.
- **Planning future days.** Deliberately not built. A diary you can fill in
  before the event stops being evidence, and the physiotherapist cannot tell an
  intention from a record. If it is ever added, planned and actual have to be
  visibly separate layers and planned must never count toward adherence.
- **Charts in the report.** The PSFS grid is a table on purpose — it prints
  cleanly in black and white and survives being photocopied.
- Any of the other big-screen analytics discussed separately.
