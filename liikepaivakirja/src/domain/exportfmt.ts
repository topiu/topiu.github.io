/* domain/exportfmt — moved verbatim from liikepaivakirja.jsx (Phase 1 split). */
import { humanDate } from "./dates";
import { doseLabel, emptyLog, goalOf } from "./dose";
import { psfsEntry, psfsMean } from "./psfs";
import { SEVERITY, qualityLabel } from "./taxonomy";

/* ------------------------------------------------------------------ */
/*  Export builders                                                    */
/* ------------------------------------------------------------------ */
export function buildCSV(exercises, symptoms, logs, marks, psfs) {
  const SEP = ";";
  const esc = (v) => {
    const s = String(v == null ? "" : v);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  /* PSFS is fortnightly, so most rows are blank — that is the honest shape and
     a spreadsheet filter handles it. Retired activities stay as columns so the
     history they hold does not vanish from the sheet. */
  const psfsCols = psfs && psfs.activities ? psfs.activities : [];
  const header = [
    "Päivä",
    ...exercises.map((e) => {
      const d = doseLabel(e.dose);
      const arch = e.archived ? " [arkistoitu]" : "";
      return d ? `${e.name} (${d})${arch}` : `${e.name}${arch}`;
    }),
    ...symptoms.map((s) => `Oire: ${s.name}${s.archived ? " [arkistoitu]" : ""}`),
    ...psfsCols.map((a) => `PSFS: ${a.name}`),
    ...(psfsCols.length ? ["PSFS keskiarvo"] : []),
    "Askeleet",
    "Muistiinpano",
    "Merkkipaalut",
  ];
  const marksByDate = {};
  (marks || []).forEach((m) => {
    (marksByDate[m.date] = marksByDate[m.date] || []).push(m.text);
  });
  const dateSet = new Set([
    ...Object.keys(logs),
    ...Object.keys(marksByDate),
    ...Object.keys((psfs && psfs.entries) || {}),
  ]);
  const dates = [...dateSet].sort();
  const lines = [header];
  dates.forEach((k) => {
    const l = logs[k] || emptyLog();
    const ex = exercises.map((e) => {
      if (e.unit === "min") {
        const m = (l.mins && l.mins[e.id]) || 0;
        return m ? `${m} min` : "";
      }
      const done = (l.sets && l.sets[e.id]) || 0;
      return `${done}/${goalOf(l, e)}`;
    });
    const sy = symptoms.map((s) => {
      if (!l.flared || !l.flared.includes(s.id)) return "";
      const v = l.severity && l.severity[s.id];
      const sev = SEVERITY.find((x) => x.v === v);
      const q = l.quality && l.quality[s.id];
      const base = sev ? sev.label : "kyllä";
      return q ? `${base} / ${qualityLabel(q)}` : base;
    });
    const pe = psfsEntry(psfs, k);
    const pm = psfsMean(pe);
    const ps = psfsCols.map((a) => (pe && pe[a.id] != null ? pe[a.id] : ""));
    lines.push([
      humanDate(k),
      ...ex,
      ...sy,
      ...ps,
      ...(psfsCols.length ? [pm ? pm.mean : ""] : []),
      l.steps || "",
      (l.note || "").replace(/\r?\n/g, " "),
      (marksByDate[k] || []).join(" | "),
    ]);
  });
  return "\uFEFF" + lines.map((r) => r.map(esc).join(SEP)).join("\r\n");
}

/* version 8 added `psfs`, version 9 adds `questions`. Older files import cleanly
   — parseImport normalizes a missing key to an empty value — and a newer file
   read by an older build simply ignores the extra field, so both directions stay
   safe. The rule that produced version 9: every key in DATA_KEYS must appear
   here, or a restore from file silently drops it. */
export function buildJSON(exercises, symptoms, logs, marks, psfs, questions?) {
  return JSON.stringify(
    {
      app: "Liikepäiväkirja",
      exportedAt: new Date().toISOString(),
      version: 9,
      exercises,
      symptoms,
      logs,
      marks: marks || [],
      psfs: psfs || { activities: [], entries: {} },
      questions: typeof questions === "string" ? questions : "",
    },
    null,
    2
  );
}
