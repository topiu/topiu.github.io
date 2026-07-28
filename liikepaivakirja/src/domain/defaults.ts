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
