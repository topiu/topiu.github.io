/* ui/ProgramImport — add exercises from pasted text or from a programme link.
 *
 * Both end in the same preview: every row can be unticked, rows already in the
 * programme are shown and skipped, and nothing is added until "Lisää" — the
 * parser is a heuristic and the preview is where a person corrects it.
 */
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { FREQ_DAILY, doseLabel, freqLabel, parseProgramText, rowsToExercises } from "../domain";
import { C } from "../styles/tokens";
import { IconBtn } from "./common";

const norm = (s) => String(s || "").trim().toLowerCase();

export function ProgramImportModal({ existing, fromLink, onAdd, onClose }) {
  const [text, setText] = useState("");
  /* preview rows: { ex, noTarget } — the flag stays here, never in the saved exercise */
  const [parsed, setParsed] = useState(fromLink ? fromLink.map((ex) => ({ ex, noTarget: false })) : null);
  const [off, setOff] = useState({});

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const have = useMemo(() => new Set(existing.map((e) => norm(e.name))), [existing]);
  const rows = parsed || [];
  const chosen = rows.filter((r, i) => !off[i] && !have.has(norm(r.ex.name))).map((r) => r.ex);

  const read = () => {
    const parsedRows = parseProgramText(text);
    const exs = rowsToExercises(parsedRows);
    const next = exs.map((ex, i) => ({ ex, noTarget: !parsedRows[i].dose }));
    setParsed(next);
    /* a line with no target is most likely a heading: start it unticked */
    const o = {};
    next.forEach((r, i) => {
      if (r.noTarget) o[i] = true;
    });
    setOff(o);
  };

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(22,36,31,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 12, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Lisää ohjelma"
        style={{ background: C.surface, borderRadius: 18, width: "100%", maxWidth: 520, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 16px 10px" }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 18, fontWeight: 600 }}>{fromLink ? "Ohjelma linkistä" : "Liitä ohjelma tekstinä"}</h2>
          <IconBtn label="Sulje" onClick={onClose}><X size={18} /></IconBtn>
        </div>
        <div style={{ padding: "0 16px 16px", overflowY: "auto" }}>
          {!fromLink && (
            <>
              <p style={{ fontSize: 13, color: C.inkSoft, margin: "0 2px 8px", lineHeight: 1.5 }}>
                Liitä fysioterapeutin tai valmentajan ohjelma, yksi liike riviltään, esim. <i>Lantionnosto 3x15</i>, <i>Lankku 3 x 30 s</i>, <i>Kävely 30 min</i>. Paperin voi muuttaa tekstiksi haluamallasi työkalulla — sovellus ei lähetä mitään minnekään.
              </p>
              <textarea value={text} onChange={(e) => { setText(e.target.value); setParsed(null); }} rows={7} aria-label="Ohjelman teksti"
                placeholder={"1. Lantionnosto 3x15\n2. Kylkimakuulla loitonnus 3 x 12, 3 krt/vko\n3. Lankku 3 x 30 s"}
                style={{ width: "100%", border: `1px solid ${C.line}`, borderRadius: 11, padding: "10px 11px", fontSize: 14, lineHeight: 1.5, color: C.ink, outline: "none", resize: "vertical", background: C.surfaceSoft }} />
              <button className="tap" onClick={read} disabled={!text.trim()}
                style={{ width: "100%", marginTop: 8, padding: "12px", borderRadius: 12, border: `1px solid ${C.pine}`, background: C.surface, color: C.pineDeep, fontSize: 14.5, fontWeight: 600, opacity: text.trim() ? 1 : 0.5 }}>
                Tulkitse
              </button>
            </>
          )}

          {parsed && (
            <>
              {rows.length === 0 ? (
                <p style={{ fontSize: 13.5, color: C.inkSoft, margin: "12px 2px" }}>Tekstistä ei löytynyt liikkeitä.</p>
              ) : (
                <div style={{ marginTop: fromLink ? 0 : 14, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
                  {rows.map(({ ex: e, noTarget }, i) => {
                    const dup = have.has(norm(e.name));
                    const on = !dup && !off[i];
                    return (
                      <label key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 12px", borderTop: i === 0 ? "none" : `1px solid ${C.line}`, opacity: dup ? 0.55 : 1 }}>
                        <input type="checkbox" checked={on} disabled={dup} onChange={() => setOff((o) => ({ ...o, [i]: !o[i] }))} style={{ marginTop: 3, width: 18, height: 18, accentColor: C.pine }} aria-label={`Lisää ${e.name}`} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: C.ink, overflowWrap: "anywhere" }}>{e.name}</span>
                          <span style={{ display: "block", fontSize: 12.5, color: C.inkSoft, marginTop: 1 }}>
                            {dup
                              ? "on jo ohjelmassa"
                              : [noTarget ? "ei tavoitetta tekstissä — aloitus " + doseLabel(e.dose, e.unit) : doseLabel(e.dose, e.unit), e.freq < FREQ_DAILY ? freqLabel(e.freq) : "päivittäin"].filter(Boolean).join(" · ")}
                          </span>
                          {!dup && e.source && (
                            <span style={{ display: "block", fontSize: 11.5, color: C.inkFaint, marginTop: 1 }}>kohdealueet kirjastosta</span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              {chosen.length > 0 && (
                <button className="tap" onClick={() => onAdd(chosen)}
                  style={{ width: "100%", marginTop: 14, padding: "13px", borderRadius: 13, background: C.pine, color: "#fff", fontSize: 15, fontWeight: 600 }}>
                  Lisää {chosen.length} {chosen.length === 1 ? "liike" : "liikettä"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
