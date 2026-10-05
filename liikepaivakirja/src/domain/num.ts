/* domain/num — moved verbatim from liikepaivakirja.jsx (Phase 1 split). */

/* ------------------------------------------------------------------ */
/*  Dose helpers                                                       */
/* ------------------------------------------------------------------ */
/* The leading whole number, or null. It used to strip every non-digit, so a
   typed range "8-12" became 812 and "2.5" became 25. */
export const toNum = (v) => {
  if (v == null) return null;
  const m = String(v).trim().match(/^\d+/);
  const n = m ? parseInt(m[0], 10) : 0;
  return !n || n <= 0 ? null : n;
};

/* linear hex colour mix for the heat scale */
export function mixHex(a, b, t) {
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  const k = Math.max(0, Math.min(1, t));
  const c = (x, y) => Math.round(x + (y - x) * k);
  return `#${[c(r1, r2), c(g1, g2), c(b1, b2)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export let idc = 0;

export function uid() {
  return `${Date.now().toString(36)}${(idc++).toString(36)}`;
}
