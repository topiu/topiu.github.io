/* domain/load — moved verbatim from liikepaivakirja.jsx (Phase 1 split). */

/* symptom load of one day: sum of severities (unset severity counts as 2) */
export function dayLoad(l) {
  if (!l || !l.flared || !l.flared.length) return 0;
  return l.flared.reduce((sum, id) => sum + ((l.severity && l.severity[id]) || 2), 0);
}
