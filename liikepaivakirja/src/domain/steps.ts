/* domain/steps — moved verbatim from liikepaivakirja.jsx (Phase 1 split). */
import { DATE_RE, toDateKey } from "./dates";

export const STEP_DATE_KEYS = ["date", "day", "start", "startdate", "datetime", "timestamp", "päivä", "pvm"];

export const STEP_VALUE_KEYS = ["steps", "value", "qty", "quantity", "count", "sum", "total", "askeleet"];

export function pickKey(obj, names) {
  const keys = Object.keys(obj);
  for (const n of names) {
    const hit = keys.find((k) => k.toLowerCase().replace(/[_\s]/g, "") === n);
    if (hit !== undefined) return hit;
  }
  return null;
}

export function stepRowsFromArray(arr) {
  const rows = [];
  arr.forEach((item) => {
    if (Array.isArray(item) && item.length >= 2) {
      const d = toDateKey(item[0]);
      const v = parseInt(String(item[1]).replace(/[^0-9]/g, ""), 10);
      if (d && v > 0) rows.push({ date: d, steps: v });
      return;
    }
    if (item && typeof item === "object") {
      const dk = pickKey(item, STEP_DATE_KEYS);
      const vk = pickKey(item, STEP_VALUE_KEYS);
      if (dk == null || vk == null) return;
      const d = toDateKey(item[dk]);
      const v = Math.round(Number(item[vk]));
      if (d && v > 0) rows.push({ date: d, steps: v });
    }
  });
  return rows;
}

export function parseSteps(text) {
  const t = (text || "").trim();
  if (!t) return { ok: false, error: "Ei sisältöä." };
  /* 1) JSON in several shapes */
  try {
    const data = JSON.parse(t);
    let rows = [];
    if (Array.isArray(data)) rows = stepRowsFromArray(data);
    else if (data && typeof data === "object") {
      /* Health Auto Export style: data.metrics[].data[] */
      const metrics = data.data && Array.isArray(data.data.metrics) ? data.data.metrics : Array.isArray(data.metrics) ? data.metrics : null;
      if (metrics) {
        metrics.forEach((mt) => {
          const name = String((mt && mt.name) || "").toLowerCase();
          if (name && !name.includes("step") && !name.includes("askel")) return;
          if (Array.isArray(mt.data)) rows = rows.concat(stepRowsFromArray(mt.data));
        });
      }
      if (!rows.length && Array.isArray(data.steps)) rows = stepRowsFromArray(data.steps);
      if (!rows.length) {
        /* plain map { "2026-07-20": 12345 } */
        Object.keys(data).forEach((k) => {
          const d = toDateKey(k);
          const v = Math.round(Number(data[k]));
          if (d && v > 0) rows.push({ date: d, steps: v });
        });
      }
    }
    if (rows.length) return dedupeSteps(rows);
    return { ok: false, error: "JSON tunnistettiin, mutta askeltietoja ei löytynyt. Tarvitaan päivämäärä ja lukumäärä." };
  } catch {
    /* not JSON — fall through to delimited text */
  }
  /* 2) CSV / TSV / semicolon, optional header */
  const rows = [];
  t.split(/\r?\n/).forEach((line) => {
    if (!line.trim()) return;
    const parts = line.split(/[;,\t]/).map((x) => x.trim().replace(/^"|"$/g, ""));
    if (parts.length < 2) return;
    const d = toDateKey(parts[0]);
    const v = parseInt(parts[1].replace(/[^0-9]/g, ""), 10);
    if (d && v > 0) rows.push({ date: d, steps: v });
  });
  if (rows.length) return dedupeSteps(rows);
  return { ok: false, error: "Muotoa ei tunnistettu. Odotettu JSON tai rivit muodossa 2026-07-20;8432." };
}

export function dedupeSteps(rows) {
  /* same day appearing twice: keep the larger count (partial vs full day) */
  const map = {};
  rows.forEach(({ date, steps }) => {
    if (!DATE_RE.test(date)) return;
    map[date] = Math.max(map[date] || 0, Math.min(steps, 200000));
  });
  const out = Object.keys(map).sort().map((date) => ({ date, steps: map[date] }));
  if (!out.length) return { ok: false, error: "Kelvollisia päiviä ei löytynyt." };
  return { ok: true, rows: out, from: out[0].date, to: out[out.length - 1].date };
}
