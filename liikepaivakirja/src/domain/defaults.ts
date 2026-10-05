/* domain/defaults — moved verbatim from liikepaivakirja.jsx (Phase 1 split). */
import { EMPTY_DOSE } from "./dose";
import { uid } from "./num";

export const DEFAULT_EXERCISES = [
  { name: "Lonkan loitonnus", type: "strength", muscles: { glute_med: 1, tfl: 2, glute_max: 3, core_deep: 3 } },
  { name: "Dead bug -jalka", type: "stability", muscles: { core_deep: 1, abs: 2, hip_flexor: 2, lumbar: 3 } },
  { name: "Tarjoilijankumarrus", type: "strength", muscles: { hamstring: 1, glute_max: 2, lumbar: 2, thoracic: 3 } },
  { name: "Etureiden venytys", type: "stretch", muscles: { quad: 1, hip_flexor: 2 } },
  { name: "Lonkan sisäkierron venytys", type: "stretch", muscles: { hip_rotators: 1, glute_med: 2, adductor: 3 }, structures: ["j_hip"] },
];

export const DEFAULT_SYMPTOMS = [
  { name: "Selkä", regions: { lumbar: "B" } },
  { name: "Pakara", regions: { glute_max: "B" } },
  { name: "Nivunen", regions: { adductor: "B" } },
];

export const seedExercises = () =>
  DEFAULT_EXERCISES.map((d) => ({ id: uid(), name: d.name, desc: "", type: d.type, muscles: { ...d.muscles }, structures: [...(d.structures || [])], dose: { ...EMPTY_DOSE } }));

export const seedSymptoms = () => DEFAULT_SYMPTOMS.map((d) => ({ id: uid(), name: d.name, regions: { ...d.regions }, structures: {} }));

/* ids an item of each list is referenced by in the logs */
export function usedIdsInLogs(logs, which: "ex" | "sy"): Set<string> {
  const out = new Set<string>();
  Object.values(logs || {}).forEach((l: any) => {
    if (!l) return;
    if (which === "ex") {
      [l.sets, l.mins, l.goal].forEach((m) => m && Object.keys(m).forEach((id) => out.add(id)));
    } else {
      (l.flared || []).forEach((id) => out.add(String(id)));
      [l.severity, l.quality].forEach((m) => m && Object.keys(m).forEach((id) => out.add(id)));
    }
  });
  return out;
}

/* "Palauta oletukset" without orphaning history. Every log is keyed by item id,
   and the reset used to replace the list with freshly generated ids, so one tap
   detached every logged session from its exercise. Now:
     - a default whose name matches an existing item keeps that item's id;
     - an existing item that is not a default but has logged history is kept,
       archived, so its history stays readable and restorable;
     - only items with no history at all are removed. */
export function resetToDefaults(current: any[], seeds: any[], used: Set<string>, todayKey?: string) {
  const byName = new Map((current || []).map((i) => [String(i.name || "").trim().toLowerCase(), i]));
  const next = seeds.map((s) => {
    const m = byName.get(s.name.trim().toLowerCase());
    return m ? { ...s, id: m.id } : todayKey ? { ...s, added: todayKey } : s;
  });
  const kept = new Set(next.map((i) => i.id));
  const archived = (current || [])
    .filter((i) => !kept.has(i.id) && used.has(i.id))
    .map((i) => ({ ...i, archived: true }));
  return [...next, ...archived];
}
