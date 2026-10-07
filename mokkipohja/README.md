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
    library.js     the seed furniture library; which way pieces face
    labels.js      fitting names into outlines
    plancheck.js   furniture overlaps and door swings
    wallpieces.js  walls as solids: overlaps merged, corners mitred, roof heights
    roofs.js       roof outlines: joined, overhanging, where roofs meet (3D only)
    wallfaces.js   which parts of a wall's faces are indoors (3D only)
    polyclip.js    polygon arithmetic (Clipper) for the two above (3D only)
    walk.js        walking in 3D: start point, wall collision, camera framing
    sun.js         where the sun is at a date, time and place
  storage.js       localStorage keys, backup and restore
  i18n.js          every UI string, English and Finnish
  export/          sheet rendering (canvas) and the minimal PDF writer
  ui/              CabinPlanner (the app), SectionView, ShapeEditor, atoms, glyphs
  view3d/          the 3D view (three.js, loaded on its own; see below)
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
| `planimg:<id>[:<key>]` | background pictures as data URLs (see `image.key` below) |
| `library:v2` | the furniture library: seed pieces plus custom shapes |
| `settings:v1` | `{ lang, grid, showHead, showGrid, showDims, invert3d }` |

A plan is `{ id, name, wallT, walls, rooms, openings, items, image, site }`:

- **walls** `{ id, x1, y1, x2, y2, t }`. A wall generated from a room also has
  `room` (the room's id) and `edge` (the index of the room edge it follows).
- **rooms** `{ id, name, points, ceiling, autoWalls }`:
  - `ceiling` is `{ mode: "flat" | "gable" | "shed", h, eaveH, ridgeH, axis, ridge }`.
  - `autoWalls` is `{ mode: "none" | "centre" | "inside" | "outside", t }`.
- **openings** `{ id, wallId, off, w, kind: "door" | "window", flip, side }`,
  plus optional `sill` and `head`.
- **items** `{ id, defId, x, y, rot }`, where `rot` is in degrees and `defId`
  points into the library.
- **site** `{ north, lat, lon }`, optional: which way north points on the plan
  (degrees clockwise from straight up) and where the cabin is, for the 3D
  sun study. Plans without it read as north up, 61°N 25°E (`siteOf` in
  `domain/sun.js`). Set from the sun study; the plan then shows a north arrow.
- **image** `{ key, natW, natH, mmPerPx, x, y, opacity, locked }`, or `null`.
  `key` names the stored picture. Plans from before October 2026 have no `key`
  and use `planimg:<id>`. Each import gets a new key, so removing or replacing
  a picture leaves the old pixels for Undo. Pictures that no plan shows are
  deleted at startup and when you leave a plan, the two points where undo
  history is discarded.

Library pieces are `{ id, type: "rect" | "circle" | "poly", ... , hz }`. A seed
piece has a `key` (its translation); a custom shape has a `name`. A piece
restored from another device's backup may carry `hidden: true` (see below).

Plan coordinates have y pointing down, as on screen. The 3D view works in
metres with y up: plan x and y become its x and z, so seen from above the
model lies exactly like the plan.

**Old data must keep loading.** Plans saved by any earlier version must open
unchanged, so key names never change and a new field always has a default for
plans that lack it. *Save backup* writes `{ app: "mokkipohja", version: 1,
saved, data }`, where `data` maps each key (without the prefix) to its stored
string, and *Restore* reads the same format.

*Restore* merges the backup into what the device already has:

- Plans and pieces in the backup replace local ones with the same id. Local
  plans the backup lacks stay, and so do this device's settings.
- Every device seeds its own library with its own ids. So a backup's seed piece
  whose `key` already exists here is kept for the plans that use it, but marked
  `hidden` so the library doesn't list two sofas.
- Restore is all or nothing: if storage fills up part-way, every key it wrote is
  put back.

## 3D view

The 3D view is built with three.js, which is most of the app's weight, so it
is a chunk of its own (`ui/View3DLoader.jsx` is the only way in). The plan
fetches it in the background once it has loaded, so 3D still opens at once.
If the fetch fails, the view offers a reload.

- **Orbit** opens framed to fit the screen, with the roof off and the outside
  walls facing the camera cut down to their footprint, so you can see into the
  rooms. With the roof on you see the cabin from outside.
- **Walk** starts just inside the front door (a door with the outdoors on one
  side), looking whichever way sees furthest into the cabin. Drag to look, tap
  the floor to walk there, or use the stick (touch) or WASD (keyboard). Walls
  stop you and doors let you through.
- Walls are logs, with real holes for doors and windows, frames, glass and a
  door leaf standing open towards its swing side. Two walls on the same line,
  as two rooms' centred walls on a shared edge are, are drawn once, and an
  opening in either goes through both. Rooms drawn with a wall each leave two
  walls lying against each other: a door in one goes through the other as a
  plain hole, on the plan, in 3D and for walking. A window drawn running into
  a door is cut back to it. Corners are mitred. A face is dressed as inside
  wall only where it faces a room, below that room's ceiling.
- Roofs follow the ceilings and overhang the outer face of the walls by
  450 mm. Rooms with a flat ceiling at one height that stand together share
  one roof, with no seam over the walls between them; a sloping ceiling has a
  roof of its own. Where two roofs meet, the wall they share goes to the one
  higher along it: the wall rises to that roof, which covers it, and the lower
  roof stops at its face. Each one's eaves end on the line of that wall, and a
  higher eave runs straight on over the corner of a lower roof. A building
  drawn with free walls only has no rooms, so no floor or roof.
- Seed furniture has models of its own, scaled to the piece and always within
  its footprint and height. Custom shapes are their outline raised to their
  height. Unrotated, a model faces plan +y (down the screen); the plan draws the
  back edge of such pieces bold.
- **Sun** (☀) puts the sun where it really is at a time of day and day of
  the year, for the plan's north and latitude, from midnight sun to winter
  dusk; the sky and light follow it. North and latitude are saved with the
  plan. **Picture** (camera) shares the current view as a PNG, or downloads
  it where sharing files is not possible.
- A piece too tall for where it stands gets a red shell and red edges over
  its own look.
- Surfaces are drawn by code (`view3d/textures.js`); there are no image files.
  Nothing is drawn unless something changed, and the sun's shadows are redrawn
  only when what casts them changes, which keeps a phone cool.

Libraries: React and three.js (both MIT), and Angus Johnson's Clipper
(`clipper-lib`, Boost Software License) for the roofs' polygon arithmetic.

## Deploy

The site's deploy workflow builds every folder with a `package.json`, so this
app is built with `BASE_PATH=/mokkipohja/` after `npm ci` and `npm test` pass.
A failing test stops the deploy and leaves the live site as it was. The old
address `/mokkipohja.html` redirects here, so old bookmarks and Home Screen
icons still work.
