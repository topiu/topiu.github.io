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
