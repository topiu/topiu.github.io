/* domain/taxonomy — moved verbatim from liikepaivakirja.jsx (Phase 1 split). */

export const SEVERITY = [
  { v: 1, label: "lievä" },
  { v: 2, label: "kohtalainen" },
  { v: 3, label: "kova" },
];

/* symptom quality per day — the field that separates a nerve day from a muscle day */
export const QUALITIES = [
  { id: "ache", label: "jomotus" },
  { id: "tingle", label: "pistely" },
  { id: "numb", label: "puutuminen" },
  { id: "radiate", label: "säteily" },
];

export const QUALITY_IDS = QUALITIES.map((q) => q.id);

export const qualityLabel = (id) => {
  const q = QUALITIES.find((x) => x.id === id);
  return q ? q.label : "";
};

/* exercise types — load means different things, so they stay separable */
export const EX_TYPES = [
  { id: "strength", label: "Vahvistus" },
  { id: "stretch", label: "Venytys" },
  { id: "stability", label: "Stabilointi" },
  { id: "mobility", label: "Liikkuvuus" },
  { id: "endurance", label: "Kestävyys" },
];

export const EX_TYPE_IDS = EX_TYPES.map((t) => t.id);

export const typeLabel = (id) => {
  const t = EX_TYPES.find((x) => x.id === id);
  return t ? t.label : "Vahvistus";
};

/* intensity of a muscle in an exercise: 1 primary, 2 secondary, 3 light */
export const INTENSITY = { 1: { label: "pää", w: 1 }, 2: { label: "sivu", w: 0.6 }, 3: { label: "kevyt", w: 0.3 } };

export const SIDES = { L: "vasen", R: "oikea", B: "molemmat" };
