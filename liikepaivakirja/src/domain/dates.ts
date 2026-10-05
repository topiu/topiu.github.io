/* domain/dates — moved verbatim from liikepaivakirja.jsx (Phase 1 split). */

/* ------------------------------------------------------------------ */
/*  Date helpers (local, Finnish)                                      */
/* ------------------------------------------------------------------ */
export const WD_SHORT = ["Su", "Ma", "Ti", "Ke", "To", "Pe", "La"];

export const WD_LONG = [
  "Sunnuntai",
  "Maanantai",
  "Tiistai",
  "Keskiviikko",
  "Torstai",
  "Perjantai",
  "Lauantai",
];

export const keyOf = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const startOfToday = () => {
  const x = new Date();
  x.setHours(0, 0, 0, 0);
  return x;
};

export const shortDate = (d) => `${WD_SHORT[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;

export const humanDate = (k) => {
  const [y, m, d] = k.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${WD_SHORT[dt.getDay()]} ${d}.${m}.${y}`;
};

/* ------------------------------------------------------------------ */
/*  Step import — tolerant parser, because Shortcuts output varies      */
/* ------------------------------------------------------------------ */
/* a real calendar date as a key, or null — "2026-20-07" is not one */
function validKey(y, m, d) {
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? keyOf(dt) : null;
}

export function toDateKey(v) {
  if (v == null) return null;
  const str = String(v).trim();
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/); /* ISO, with or without time */
  if (m) {
    /* A timestamp with a zone names an instant, and the diary day is the
       *local* day of that instant: 2026-07-19T21:00:00Z is 20 July in Finland. */
    if (/^[T ]\d.*(Z|[+-]\d{2}:?\d{2})$/i.test(m[4])) {
      const d = new Date(str.replace(" ", "T"));
      if (!isNaN(d.getTime())) return keyOf(d);
    }
    return validKey(+m[1], +m[2], +m[3]);
  }
  m = str.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/); /* 20.7.2026 or 20/7/2026 */
  if (m) {
    const k = validKey(+m[3], +m[2], +m[1]);
    if (k) return k;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) return keyOf(d);
  return null;
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ------------------------------------------------------------------ */
/*  Week helpers (Monday-start) for long-range aggregation             */
/* ------------------------------------------------------------------ */
export function startOfWeek(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // Mon=0
  x.setDate(x.getDate() - day);
  return x;
}

export function parseKey(k) {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}
