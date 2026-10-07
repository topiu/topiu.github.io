# CLAUDE.md

Working notes for changing Mökkipohja. `README.md` covers what the app does and
how its data is stored; this file covers how to change it without breaking
anyone's plans.

## What this is

A cabin floor-plan planner used on a phone, in Finnish or English, by one
person (Topi). Plans exist only in that phone's `localStorage`, so a bug that
corrupts or drops data cannot be fixed afterwards. Durability comes before
features.

## Non-negotiables

- **Saved plans keep loading.** Never rename a storage key or change the
  meaning of a stored field. Anything new must have a default for plans that
  lack it, applied when the plan is read. Backup files from older versions must
  restore.
- **Millimetres everywhere.** Plan coordinates are mm with y pointing down; the
  screen scale is px per mm. Only the 3D view flips y.
- **Every UI string in both languages.** Add a key to `STR.en` and `STR.fi` in
  `src/i18n.js`. A test fails if the two sets of keys differ.
- **Logic goes in `src/domain/`,** which never imports React, with a test.
  Geometry bugs are the expensive ones here, and only tests catch them.

## Delivery

Changes go in through pull requests to `main`. A merge deploys automatically.
**Settings → Pages → Source** must stay on GitHub Actions: on "Deploy from a
branch", GitHub's own branch build races the deploy and can publish the raw
repository over it.

Before merging:

```bash
npm ci && npm test && npm run build && npm run build:single
# then, from the repository root, exactly what CI runs:
bash .github/scripts/assemble-site.sh && bash .github/scripts/verify-site.sh
```

Then look at the change in a real browser at phone size (390 × 844). Playwright
and Chromium are preinstalled in the Claude sandbox. To start from a known
state, seed `mokkipohja:plans:index` and `mokkipohja:plan:<id>` in
`localStorage` and reload. jsdom has no layout, so it says nothing about how
things look.

For a refactor that should not change behaviour, `tools/port/parity.cjs` runs a
reference build and the new one through the same scripted session and diffs
the DOM, storage and canvas output after every step.

## Traps already hit here

These are the October 2026 review findings, now fixed. Each has a test or a
before/after browser check.

**Room walls follow their edges by index.** A wall generated for a room has
`room` and `edge`, and doors attach to the wall's id. Splicing a corner into
`points` shifted every later edge's doors onto the next wall and dropped the
last edge's. Add and delete corners only through `insertRoomCorner` and
`deleteRoomCorner` in `domain/rooms.js`. They renumber walls, send an opening
on a split edge to its half, and keep openings in place when edges merge
(`tests/corners.test.js`, all three wall modes).

**Rebuilding walls clamps openings.** `rebuildRoomWalls` shrinks a door to fit
its wall. Rebuilding on the live state at every drag move let a wall that was
short for a moment shrink its doors for good. Drags are rebuilt from the state
at the start of the gesture (`g.snapshot`).

**An index can outlive what it points into.** `selVert` survived a switch to a
room with fewer corners, and the render read past the end of `points` and
blanked the app. Effects run after render, so a reset in an effect is not
enough: guard the read itself.

**A debounce must be flushed, never cancelled, before the data changes owner.**
Every plan switch goes through `openDoc`, which writes the pending save first
and clears undo history. Pending saves are also flushed on `pagehide` and when
the page is hidden. The plan list is merged from storage at write time:
writing an in-memory copy put deleted plans back.

**Undo history belongs to one plan.** Keep it across a plan switch and Undo
writes the old plan over the new one.

**Pixels outside the plan document are outside undo.** That's why pictures are
keyed per import and only pruned when no history can need them.

**Restore merges; it doesn't replace.** See the README for the rules.

**There is a root error boundary** (`ui/ErrorBoundary.jsx`), plus one around
the 3D and section views. The fallback can still reload and save a backup.
Treat it as a floor: a throwing render path still needs fixing and a test.

**Number fields commit when you are done.** `NumField` keeps its own text while
you type and commits on blur, Enter, or when it is removed mid-edit. Committing
each keystroke let parents clamp half-typed numbers, and turned "6" on the way
to "6000" into a real wall 6 mm long.

**React wheel listeners are passive.** `preventDefault` in `onWheel` does
nothing, so the plan's wheel handler is a native `{ passive: false }` listener.
React registers `touchmove` passively too.

**A press only drags once it is past `DRAG_SLOP`** (6 px). Before that a tap to
select moved things by the finger's wobble. Undo records exactly the drags
that went live (`g.live`).

**A dragged corner never snaps to its own room's walls.** Those walls sit on,
or just off, the corner itself.

**Each gable slope runs from its own eave.** With the ridge off centre, one
shared slope lifted the nearer eave above the eaves height. `ceilingAt` and
`ceilingCrossings` must agree.

**The sheet image is the whole page.** The PDF writer places it at full page
size. Any extra margin rescales a sheet whose title block states a scale.

**Use `??`, not `||`, for numbers that can be 0** (heights, offsets).

## Design rules

- **The bar holds six buttons:** five drawing tools and More. More shows the
  active tool when one of its tools is on. 3D is the floating button above
  zoom. Check the labels at 320–430 px in both languages: Finnish runs long
  (KALUSTEET).
- **Names go through `fitLabel`** (`domain/labels.js`), so no label is drawn
  wider than its outline. Room labels go through `placeRoomLabel`, so they
  never sit on furniture.
- **`planConflicts`** (`domain/plancheck.js`) is the only source of furniture
  warnings: overlaps (a chair may tuck under a table) and door swings. The plan
  hatches what it reports, and the item panel says which problem it is.
- **`GROUP` in `core.js` holds the group colours** shared by the plan, the
  library and 3D. The export sheet stays monochrome for printing.
- **The first visit follows the phone's language;** a saved choice always
  wins. `<html lang>` follows the app's language.
