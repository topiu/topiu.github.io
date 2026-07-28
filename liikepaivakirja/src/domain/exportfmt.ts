/* domain/exportfmt — moved verbatim from liikepaivakirja.jsx (Phase 1 split). */
import { humanDate } from "./dates";
import { doseLabel, emptyLog, goalOf } from "./dose";
import { SEVERITY, qualityLabel } from "./taxonomy";

/* ------------------------------------------------------------------ */
/*  Export builders                                                    */
/* ------------------------------------------------------------------ */
export function buildCSV(exercises, symptoms, logs, marks) {
  const SEP = ";";
  const esc = (v) => {
    const s = String(v == null ? "" : v);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const header = [
    "Päivä",
    ...exercises.map((e) => {
      const d = doseLabel(e.dose);
      const arch = e.archived ? " [arkistoitu]" : "";
      return d ? `${e.name} (${d})${arch}` : `${e.name}${arch}`;
    }),
    ...symptoms.map((s) => `Oire: ${s.name}${s.archived ? " [arkistoitu]" : ""}`),
    "Askeleet",
    "Muistiinpano",
    "Merkkipaalut",
  ];
  const marksByDate = {};
  (marks || []).forEach((m) => {
    (marksByDate[m.date] = marksByDate[m.date] || []).push(m.text);
  });
  const dateSet = new Set([...Object.keys(logs), ...Object.keys(marksByDate)]);
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
    lines.push([
      humanDate(k),
      ...ex,
      ...sy,
      l.steps || "",
      (l.note || "").replace(/\r?\n/g, " "),
      (marksByDate[k] || []).join(" | "),
    ]);
  });
  return "\uFEFF" + lines.map((r) => r.map(esc).join(SEP)).join("\r\n");
}

export function buildJSON(exercises, symptoms, logs, marks) {
  return JSON.stringify(
    { app: "Liikepäiväkirja", exportedAt: new Date().toISOString(), version: 7, exercises, symptoms, logs, marks: marks || [] },
    null,
    2
  );
}
