#!/usr/bin/env python3
"""Split liikepaivakirja.jsx into the Phase-1 module structure.

Behaviour-preserving by construction: every byte of every declaration is moved
verbatim; only the import headers are generated. Declarations keep their
original relative order inside each target module, so top-level evaluation
order (REGIONS -> REGION_BY_ID etc.) is unchanged.
"""
import re
import os
import sys
from collections import OrderedDict

SRC = "liikepaivakirja.jsx"
OUT = "liikepaivakirja/src"

# ---------------------------------------------------------------- decl parsing
DECL = re.compile(
    r"^(?:export\s+default\s+(?:async\s+)?function|export\s+(?:async\s+)?function"
    r"|(?:async\s+)?function|const|let|var)\s+"
    r"([A-Za-z_$][\w$]*)"
)

# Line ranges (1-based, inclusive) dropped from the port.
DROP = [
    (1, 20),    # original import block, regenerated per module
    (480, 575),  # window.storage helpers, replaced by storage/store.ts
]

# -------------------------------------------------------------- symbol -> file
MAP = {
    # styles
    "C": "styles/tokens", "FONT": "styles/tokens",
    # pure utilities
    "toNum": "domain/num", "idc": "domain/num", "uid": "domain/num",
    "mixHex": "domain/num",
    # dates
    "WD_SHORT": "domain/dates", "WD_LONG": "domain/dates", "keyOf": "domain/dates",
    "addDays": "domain/dates", "startOfToday": "domain/dates",
    "shortDate": "domain/dates", "humanDate": "domain/dates",
    "startOfWeek": "domain/dates", "parseKey": "domain/dates",
    "DATE_RE": "domain/dates", "toDateKey": "domain/dates",
    # dose / log shape
    "EMPTY_DOSE": "domain/dose", "doseLabel": "domain/dose",
    "targetSets": "domain/dose", "isMin": "domain/dose", "targetMin": "domain/dose",
    "goalSetsOfEntry": "domain/dose", "goalOf": "domain/dose",
    "dayDoseOf": "domain/dose", "goalMinOf": "domain/dose",
    "emptyLog": "domain/dose", "isEmptyLog": "domain/dose",
    # taxonomy
    "SEVERITY": "domain/taxonomy", "QUALITIES": "domain/taxonomy",
    "QUALITY_IDS": "domain/taxonomy", "qualityLabel": "domain/taxonomy",
    "EX_TYPES": "domain/taxonomy", "EX_TYPE_IDS": "domain/taxonomy",
    "typeLabel": "domain/taxonomy", "INTENSITY": "domain/taxonomy",
    "SIDES": "domain/taxonomy",
    # anatomy
    "REGIONS": "domain/regions", "REGION_BY_ID": "domain/regions",
    "regionName": "domain/regions", "regionsOfView": "domain/regions",
    "SILHOUETTE": "domain/regions", "sideOfHalf": "domain/regions",
    "STRUCTURES": "domain/structures", "STRUCT_BY_ID": "domain/structures",
    "structName": "domain/structures", "structuresOfView": "domain/structures",
    # library
    "SOURCES": "domain/library", "SRC_ORDER": "domain/library",
    "SCALE_NOTE": "domain/library", "LIB_CATS": "domain/library",
    "L": "domain/library", "ST": "domain/library", "CARDIO_DOSE": "domain/library",
    "LIBRARY": "domain/library", "LIB_BY_ID": "domain/library",
    # seeds
    "DEFAULT_EXERCISES": "domain/defaults", "DEFAULT_SYMPTOMS": "domain/defaults",
    "seedExercises": "domain/defaults", "seedSymptoms": "domain/defaults",
    # steps
    "STEP_DATE_KEYS": "domain/steps", "STEP_VALUE_KEYS": "domain/steps",
    "pickKey": "domain/steps", "stepRowsFromArray": "domain/steps",
    "parseSteps": "domain/steps", "dedupeSteps": "domain/steps",
    # normalisation / migration
    "normalizeExercises": "domain/normalize", "normalizeMuscles": "domain/normalize",
    "normalizeExStructures": "domain/normalize",
    "normalizeSymptomRegions": "domain/normalize",
    "normalizeSymptomStructures": "domain/normalize",
    "normalizeSymptoms": "domain/normalize", "normalizeLogs": "domain/normalize",
    "normalizeMarks": "domain/normalize", "parseImport": "domain/normalize",
    # load model + export formats
    "dayLoad": "domain/load",
    "buildCSV": "domain/exportfmt", "buildJSON": "domain/exportfmt",
    # platform
    "download": "platform/download", "copyText": "platform/download",
    # ui
    "App": "ui/App",
    "TodayView": "ui/Today", "MarksEditor": "ui/Today", "StepsField": "ui/Today",
    "ExerciseRow": "ui/Today", "MinuteTracker": "ui/Today",
    "SetTracker": "ui/Today", "RangeArc": "ui/Today",
    "HistoryView": "ui/History", "WeeklyTrends": "ui/History",
    "MonthHeatmaps": "ui/History", "SymptomModal": "ui/History",
    "TrendChart": "ui/History",
    "EditView": "ui/Edit", "ArchivedList": "ui/Edit",
    "ExportModal": "ui/Modals", "ImportModal": "ui/Modals", "StepsModal": "ui/Modals",
    "SourceBadge": "ui/Library", "LibraryModal": "ui/Library",
    "Prim": "ui/BodyMap", "MIRROR": "ui/BodyMap", "BodyMap": "ui/BodyMap",
    "ViewToggle": "ui/BodyMap", "RegionPicker": "ui/BodyMap",
    "BodyLoadSection": "ui/BodyMap", "LegendSwatch": "ui/BodyMap",
    "Card": "ui/common", "SectionLabel": "ui/common", "Empty": "ui/common",
    "Stat": "ui/common", "IconBtn": "ui/common", "MiniBtn": "ui/common",
    "NumField": "ui/common", "AddRow": "ui/common", "ResetBtn": "ui/common",
    "Style": "ui/common",
}

# Symbols that live outside the sliced file (hand-written modules).
EXTERNAL = {
    "loadJSON": "storage/store", "saveJSON": "storage/store",
    "saveJSONDebounced": "storage/store", "saveJSONNow": "storage/store",
    "deleteKey": "storage/store", "hasStore": "storage/store",
    "flushAll": "storage/store",
}

# Never auto-import these: short names that also occur as string literals
# ("L"/"R" side codes) or are only used inside their own module.
DENY = {"L", "ST", "idc"}

TSX = {"ui/App", "ui/Today", "ui/History", "ui/Edit", "ui/Modals", "ui/Library",
       "ui/BodyMap", "ui/common"}

LUCIDE = ["ChevronLeft", "ChevronRight", "Check", "Plus", "Minus", "X", "ArrowUp",
          "ArrowDown", "RotateCcw", "Archive", "ArchiveRestore", "Zap", "HelpCircle",
          "BookOpen", "Download", "Upload", "Copy"]
HOOKS = ["useState", "useEffect", "useRef", "useCallback", "useMemo"]


def dropped(n):
    return any(a <= n <= b for a, b in DROP)


def main():
    lines = open(SRC, encoding="utf-8").read().split("\n")
    n = len(lines)

    # 1. find declaration start lines (1-based)
    starts = []
    for i, ln in enumerate(lines, start=1):
        if dropped(i):
            continue
        m = DECL.match(ln)
        if m:
            starts.append((i, m.group(1)))

    # 2. walk backwards over attached comment/banner lines
    def attach(idx):
        j = idx - 1
        while j >= 1 and not dropped(j):
            s = lines[j - 1].strip()
            if s.startswith("/*") or s.startswith("*") or s.startswith("//") \
                    or s.endswith("*/") or s == "":
                j -= 1
            else:
                break
        # do not swallow blank lines that precede the banner
        while j + 1 <= idx - 1 and lines[j].strip() == "":
            j += 1
        return j + 1

    blocks = []
    for k, (start, name) in enumerate(starts):
        top = attach(start)
        end = (attach(starts[k + 1][0]) - 1) if k + 1 < len(starts) else n
        while end > start and lines[end - 1].strip() == "":
            end -= 1
        blocks.append((name, top, end))

    unmapped = sorted({nm for nm, _, _ in blocks if nm not in MAP})
    if unmapped:
        print("UNMAPPED SYMBOLS:", unmapped, file=sys.stderr)
        return 1

    # 3. group text per module, preserving original order
    mods = OrderedDict()
    for name, a, b in blocks:
        keep = [lines[i - 1] for i in range(a, b + 1) if not dropped(i)]
        while keep and keep[-1].strip() == "":
            keep.pop()
        mods.setdefault(MAP[name], []).append((name, "\n".join(keep)))

    # 4. work out which module owns each symbol
    owner = dict(MAP)
    owner.update(EXTERNAL)

    def relpath(frm, to):
        if to.startswith("domain/") and frm.startswith("domain/"):
            return "./" + to.split("/")[1]
        fdir = frm.split("/")[0]
        tdir, tname = to.split("/")
        if fdir == tdir:
            return "./" + tname
        # a ui/ file pulling domain code goes through the barrel
        if tdir == "domain":
            return "../domain"
        return f"../{tdir}/{tname}"

    os.makedirs(OUT, exist_ok=True)
    for mod, decls in mods.items():
        local = {nm for nm, _ in decls}
        body = "\n\n".join(t for _, t in decls)
        is_tsx = mod in TSX

        # generated imports
        need = {}
        for sym, home in owner.items():
            if sym in local or home == mod or sym in DENY:
                continue
            if re.search(r"(?:(?<![\w$.])|(?<=\.\.\.))" + re.escape(sym) + r"(?![\w$])", body):
                need.setdefault(relpath(mod, home), set()).add(sym)
        # exercise the domain barrel rather than 12 separate specifiers
        head = []
        if is_tsx:
            hooks = [h for h in HOOKS
                     if re.search(r"(?<![\w$.])" + h + r"(?![\w$])", body)]
            react = "import React" if re.search(r"(?<![\w$.])React\.", body) else "import"
            if hooks:
                head.append(f'{react}{"," if react.endswith("React") else ""} '
                            f'{{ {", ".join(hooks)} }} from "react";'
                            if react.endswith("React")
                            else f'import {{ {", ".join(hooks)} }} from "react";')
            elif react.endswith("React"):
                head.append('import React from "react";')
            icons = [i for i in LUCIDE
                     if re.search(r"(?<![\w$.])" + i + r"(?![\w$])", body)]
            if icons:
                head.append(f'import {{ {", ".join(icons)} }} from "lucide-react";')
        for path in sorted(need):
            syms = ", ".join(sorted(need[path]))
            head.append(f'import {{ {syms} }} from "{path}";')

        # export every declaration
        for nm in local:
            body = re.sub(r"(?m)^((?:async\s+)?function\s+" + re.escape(nm) + r"\b)",
                          r"export \1", body)
            body = re.sub(r"(?m)^((?:const|let|var)\s+" + re.escape(nm) + r"\b)",
                          r"export \1", body)

        banner = (f"/* {mod} — moved verbatim from liikepaivakirja.jsx "
                  f"(Phase 1 split). */\n")
        text = banner + ("\n".join(head) + "\n\n" if head else "\n") + body + "\n"
        dest = os.path.join(OUT, mod + (".tsx" if is_tsx else ".ts"))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        open(dest, "w", encoding="utf-8").write(text)
        print(f"{dest:44s} {len(text.splitlines()):5d} lines  "
              f"({len(decls)} decls)")

    # 5. domain barrel
    dmods = sorted({m.split("/")[1] for m in mods if m.startswith("domain/")})
    with open(os.path.join(OUT, "domain/index.ts"), "w", encoding="utf-8") as f:
        f.write("/* Barrel for the pure domain layer — no React, no platform APIs. */\n")
        for m in dmods:
            f.write(f'export * from "./{m}";\n')
    print("domain barrel:", dmods)
    return 0


if __name__ == "__main__":
    sys.exit(main())
