# Mökkipohja

A cabin floor-plan and furniture planner for the phone, published at
`/mokkipohja/`. You draw walls and rooms, add doors and windows, place
furniture, check headroom under sloping ceilings, cut sections, look at it in
3D, and export a scaled PDF sheet. All dimensions are millimetres. There is no
server: plans live in the browser's `localStorage`.

Until October 2026 the app was a single hand-delivered `mokkipohja.html`. It is
now a Vite + React project built by the site's deploy workflow; see
[`tools/port/README.md`](tools/port/README.md) for how the port was done and
checked.

## Quick start

```bash
npm ci
npm run dev            # http://localhost:5173/mokkipohja/
npm test               # unit tests (vitest)
npm run build          # -> dist/          what the deploy publishes
npm run build:single   # -> dist-single/   one self-contained .html, works from disk
```

## Layout

```
src/
  core.js          palette, fonts, uid/clamp/fmt
  domain/          pure logic, no React
    geometry.js    points, polygons, wall and item outlines, triangulation
    snapping.js    snap lines for items and points
    rooms.js       room outlines, automatic room walls, corner snapping
    ceilings.js    flat, gable and shed ceilings; headroom
    openings.js    door and window sill/head defaults
    library.js     the seed furniture library
  storage.js       localStorage keys, backup and restore
  i18n.js          every UI string, English and Finnish
  export/          sheet rendering (canvas) and the minimal PDF writer
  ui/              CabinPlanner (the app), SectionView, ShapeEditor, atoms, glyphs
  view3d/          the 3D view
  main.jsx         mount
tests/             vitest, one file per area
tools/port/        the one-off port from the single file, kept as a record
```

## Data

Everything is stored under the `mokkipohja:` prefix:

| Key | Holds |
| --- | --- |
| `plans:index` | `[{ id, name, updated }]`, the plan list |
| `plan:<id>` | one plan (below) |
| `planimg:<id>` | the plan's background image as a data URL |
| `library:v2` | the furniture library: seed pieces plus custom shapes |
| `settings:v1` | `{ lang, grid, showHead, showGrid, showDims, invert3d }` |

A plan is `{ id, name, wallT, walls, rooms, openings, items, image }`:

- **walls** `{ id, x1, y1, x2, y2, t }`. A wall generated from a room also has
  `room` (the room's id) and `edge` (the index of the room edge it follows).
- **rooms** `{ id, name, points, ceiling, autoWalls }`:
  - `ceiling` is `{ mode: "flat" | "gable" | "shed", h, eaveH, ridgeH, axis, ridge }`.
  - `autoWalls` is `{ mode: "none" | "centre" | "inside" | "outside", t }`.
- **openings** `{ id, wallId, off, w, kind: "door" | "window", flip, side }`,
  plus optional `sill` and `head`.
- **items** `{ id, defId, x, y, rot }`, where `rot` is in degrees and `defId`
  points into the library.
- **image** `{ natW, natH, mmPerPx, x, y, opacity, locked }`, or `null`.

Plan coordinates have y pointing down, as on screen. The 3D view flips y.

**Old data must keep loading.** Plans saved by any earlier version must open
unchanged, so key names never change and a new field always has a default for
plans that lack it. *Save backup* writes `{ app: "mokkipohja", version: 1,
saved, data }`, where `data` maps each key (without the prefix) to its stored
string, and *Restore* reads the same format.

## Deploy

The site's deploy workflow builds every folder with a `package.json`, so this
app is built with `BASE_PATH=/mokkipohja/` after `npm ci` and `npm test` pass.
A failing test stops the deploy and leaves the live site as it was. The old
address `/mokkipohja.html` redirects here, so old bookmarks and Home Screen
icons still work.
