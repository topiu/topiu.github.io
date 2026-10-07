// Slices the converted single-file app into ES modules without rewriting it.
//
//   node slice.cjs <app.pretty.js> <outDir>
//
// Every top-level statement is copied verbatim (with the comments in front of
// it) into the module its line range maps to, prefixed with `export`. Imports
// are generated from Babel's scope analysis: a module imports exactly the
// program-level names it references that another module declares. A line
// multiset check at the end proves nothing was dropped or duplicated.
const fs = require("fs");
const path = require("path");
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const [srcPath, outDir] = process.argv.slice(2);
const src = fs.readFileSync(srcPath, "utf8");
const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });

// line ranges in app.pretty.js -> module (first match wins); see the section map
const RANGES = [
  [1, 36, "core.js"],
  [37, 236, "domain/geometry.js"],
  [237, 352, "domain/snapping.js"],
  [353, 609, "domain/rooms.js"],
  [610, 683, "domain/ceilings.js"],
  [684, 1051, "i18n.js"],
  [1052, 1412, "export/sheet.js"],
  [1413, 1496, "export/pdf.js"],
  [1497, 1651, "domain/library.js"],
  [1652, 1710, "storage.js"],
  [1711, 1789, "ui/glyphs.jsx"],
  [1790, 1970, "ui/atoms.jsx"],
  [1971, 2342, "ui/ShapeEditor.jsx"],
  [2343, 2493, "view3d/common.js"],
  [2494, 2749, "view3d/scene.js"],
  [2750, 3070, "view3d/raster.js"],
  [3071, 3718, "view3d/View3D.jsx"],
  [3719, 3990, "ui/SectionView.jsx"],
  [3991, 99999, "ui/CabinPlanner.jsx"],
];
// declarations that belong with the domain rather than where they happened to sit
const OVERRIDES = {
  DEF_WALL_H: "domain/openings.js",
  openSill: "domain/openings.js",
  openHead: "domain/openings.js",
  pointInTri: "domain/geometry.js",
  triangulate: "domain/geometry.js",
};
const REACT_HOOKS_LINE = 2; // const { useState, ... } = React;

const program = ast.program.body;
let programScope = null;
traverse(ast, { Program(p) { programScope = p.scope; p.stop(); } });

const declared = (n) => {
  if (n.type === "FunctionDeclaration" || n.type === "ClassDeclaration") return [n.id.name];
  if (n.type === "VariableDeclaration")
    return n.declarations.flatMap((d) =>
      d.id.type === "Identifier" ? [d.id.name] : d.id.properties.map((p) => p.value.name));
  return [];
};

const stmts = program.map((n, i) => {
  const names = declared(n);
  const line = n.loc.start.line;
  let mod = null;
  if (n.type === "ImportDeclaration" || line === REACT_HOOKS_LINE) mod = "react";
  else mod = (names.length && OVERRIDES[names[0]]) || RANGES.find(([a, b]) => line >= a && line <= b)[2];
  // text from the end of the previous statement, so leading comments travel with it
  const from = i === 0 ? 0 : program[i - 1].end;
  return { i, n, names, mod, from, to: n.end, refs: new Set() };
});

const owner = new Map();
for (const s of stmts) for (const nm of s.names) owner.set(nm, s.mod);
owner.set("React", "react");

// references from each statement to program-level bindings
traverse(ast, {
  "Identifier|JSXIdentifier"(p) {
    const name = p.node.name;
    if (p.isJSXIdentifier()) {
      const parent = p.parent;
      const isTag = parent.type === "JSXOpeningElement" || parent.type === "JSXClosingElement";
      const isMemberRoot = parent.type === "JSXMemberExpression" && parent.object === p.node;
      if (!((isTag && /^[A-Z]/.test(name)) || isMemberRoot)) return;
    } else if (!p.isReferencedIdentifier()) return;
    const b = p.scope.getBinding(name);
    if (!b || b.scope !== programScope) return;
    let top = p;
    while (top.parentPath && top.parentPath.node !== ast.program) top = top.parentPath;
    const s = stmts[program.indexOf(top.node)];
    if (s) s.refs.add(name);
  },
});

const modules = new Map();
for (const s of stmts) {
  if (s.mod === "react") continue;
  if (!modules.has(s.mod)) modules.set(s.mod, []);
  modules.get(s.mod).push(s);
}

const rel = (from, to) => {
  let r = path.relative(path.dirname(from), to).replace(/\\/g, "/");
  return r.startsWith(".") ? r : "./" + r;
};

const graph = {};
let emittedLines = [];
for (const [mod, list] of modules) {
  const own = new Set(list.flatMap((s) => s.names));
  const need = new Map(); // module -> Set(names)
  for (const s of list)
    for (const r of s.refs) {
      if (own.has(r)) continue;
      const m = owner.get(r);
      if (!m) throw new Error(`no owner for ${r} (used in ${mod})`);
      if (!need.has(m)) need.set(m, new Set());
      need.get(m).add(r);
    }
  graph[mod] = [...need.keys()].filter((m) => m !== "react");
  const imports = [];
  const react = need.get("react");
  if (react) {
    const hooks = [...react].filter((n) => n !== "React").sort();
    const def = react.has("React") ? "React" : "";
    imports.push(`import ${[def, hooks.length ? `{ ${hooks.join(", ")} }` : ""].filter(Boolean).join(", ")} from "react";`);
  }
  for (const [m, names] of [...need].filter(([m]) => m !== "react").sort())
    imports.push(`import { ${[...names].sort().join(", ")} } from "${rel(mod, m).replace(/\.jsx?$/, "")}";`);

  let body = "";
  for (const s of list) {
    const lead = src.slice(s.from, s.n.start);
    const decl = src.slice(s.n.start, s.to);
    body += lead + (s.names.length ? "export " : "") + decl;
  }
  // count what was actually written, minus the export prefixes this script added
  emittedLines.push(...body.split("\n").map((l) => l.replace(/^export /, "")));
  const text = (imports.length ? imports.join("\n") + "\n" : "") + body.replace(/^\n+/, "\n") + "\n";
  const out = path.join(outDir, mod);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text);
  console.log(`${mod.padEnd(24)} ${String(text.split("\n").length).padStart(5)} lines  imports: ${graph[mod].join(", ") || "-"}`);
}

// cycle check
const seen = new Set(), stack = new Set(), cycles = [];
const dfs = (m, trail) => {
  if (stack.has(m)) { cycles.push([...trail.slice(trail.indexOf(m)), m].join(" -> ")); return; }
  if (seen.has(m)) return;
  seen.add(m); stack.add(m);
  for (const d of graph[m] || []) dfs(d, [...trail, d]);
  stack.delete(m);
};
for (const m of Object.keys(graph)) dfs(m, [m]);
console.log(cycles.length ? "CYCLES:\n  " + [...new Set(cycles)].join("\n  ") : "no import cycles");

// multiset check: every non-blank source line appears exactly as often in the modules
const count = (lines) => lines.map((l) => l.trim()).filter(Boolean).reduce((m, l) => m.set(l, (m.get(l) || 0) + 1), new Map());
// the React import and hook destructuring are replaced by generated imports
const reactLines = new Set(stmts.filter((s) => s.mod === "react").flatMap((s) => {
  const out = [];
  for (let l = s.n.loc.start.line; l <= s.n.loc.end.line; l++) out.push(l);
  return out;
}));
const want = count(src.split("\n").filter((_, i) => !reactLines.has(i + 1)));
const got = count(emittedLines);
let missing = 0, extra = 0;
for (const [l, c] of want) if ((got.get(l) || 0) < c) { missing += c - (got.get(l) || 0); if (missing < 6) console.log("  missing:", l); }
for (const [l, c] of got) if ((want.get(l) || 0) < c) { extra += c - (want.get(l) || 0); if (extra < 6) console.log("  extra:", l); }
console.log(`line multiset: ${missing} missing, ${extra} extra`);
