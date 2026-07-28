#!/usr/bin/env python3
"""Post-slice edits: the only two places where the port is not verbatim."""
import re, sys

p = "liikepaivakirja/src/ui/App.tsx"
s = open(p).read()
old = 'if (hasStore) await window.storage.delete("physio-undo");'
new = 'if (hasStore) await deleteKey("physio-undo");'
if old in s:
    s = s.replace(old, new)
    m = re.search(r'^import \{([^}]*)\} from "\.\./storage/store";$', s, re.M)
    syms = sorted({x.strip() for x in m.group(1).split(",") if x.strip()} | {"deleteKey"})
    s = s[:m.start()] + 'import { %s } from "../storage/store";' % ", ".join(syms) + s[m.end():]
    open(p, "w").write(s)
    print("App.tsx: window.storage.delete -> deleteKey")
else:
    print("App.tsx: already patched")

# doseLabel's second parameter is optional in every call site; mark it so the
# pure layers typecheck cleanly. Type-only, no runtime change.
p = "liikepaivakirja/src/domain/dose.ts"
s = open(p).read()
if "export function doseLabel(d, unit) {" in s:
    s = s.replace("export function doseLabel(d, unit) {",
                  "export function doseLabel(d, unit?) {")
    open(p, "w").write(s)
    print("dose.ts: doseLabel(d, unit?) marked optional")
