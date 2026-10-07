# How the single file became this project

`mokkipohja.html` used to be the whole app: React 18.3.1 inlined, then about
7,000 lines of app code that Babel had compiled from JSX to
`React.createElement` calls. It was turned into `src/` mechanically, not
rewritten, so the result could be checked rather than trusted.

These scripts are the audit record of that port, not part of the build. They
need `@babel/parser`, `@babel/traverse`, `jscodeshift` and `react-codemod`,
which are deliberately not in `package.json`.

## Steps

1. Take the app code: the lines between `document.getElementById("boot").remove();`
   and `/* ---------------- mount ---------------- */` in the old file.
2. Delete every `/*#__PURE__*/` annotation, and put `import React from "react";`
   on top so the codemod recognises the file.
3. Convert to JSX: `jscodeshift --parser=babel -t react-codemod/transforms/create-element-to-jsx.js app.js`.
   All 344 `React.createElement` calls converted.
4. Format: `prettier --print-width 100 --parser babel app.js > app.pretty.js`.
5. Slice: `node slice.cjs app.pretty.js ../../src`. Each top-level declaration
   is copied verbatim, with the comments in front of it, into the module its line
   range maps to. Imports come from Babel's scope analysis. The script checks
   that there are no import cycles and that every non-blank line of
   `app.pretty.js` appears exactly once across the modules: 0 missing, 0 extra.

`main.jsx` and `index.html` were written by hand. `index.html` keeps the old
page's head, styles, loading placeholder and zoom-guard script byte for byte,
and adds a startup error handler, which the old file had as a `try`/`catch`
around everything.

## Parity

`parity.cjs` runs the old file and a new build side by side in Chromium. Both
get the same seeded storage and the same seeded `Math.random`, so generated ids
match too. Each scripted step compares the rendered DOM, every stored key, the
canvas output and the downloaded backup:

```
node parity.cjs old.html ../../dist out/     # old.html: git show <ref>:mokkipohja/mokkipohja.html
```

At the port, all 21 steps were identical:

- empty start, the starter room and a seeded cabin
- the furniture sheet, placing a sofa, dragging it and undoing the drag
- drawing a wall, the section tool and the section view
- 3D orbit, an orbit drag, walk mode and the export sheet
- the plan sheet, switching to Finnish and saving a backup

The step list checks the work: the saved plan shows the sofa placed, moved and
moved back, and the wall count going from 4 to 5.
