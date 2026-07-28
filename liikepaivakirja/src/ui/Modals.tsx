/* ui/Modals — moved verbatim from liikepaivakirja.jsx (Phase 1 split). */
import { useState, useEffect, useRef, useMemo } from "react";
import { Check, X, RotateCcw, HelpCircle, Download, Upload, Copy } from "lucide-react";
import { buildCSV, buildJSON, humanDate, keyOf, parseImport, parseSteps, startOfToday } from "../domain";
import { copyText, download } from "../platform/download";
import { C } from "../styles/tokens";
import { IconBtn } from "./common";

/* ================================================================== */
/*  EXPORT MODAL                                                       */
/* ================================================================== */
export function ExportModal({ exercises, symptoms, logs, marks, psfs, onClose }) {
  const [fmt, setFmt] = useState("csv");
  const [msg, setMsg] = useState("");
  const taRef = useRef(null);
  const count = Object.keys(logs).length;
  const text = useMemo(
    () => (fmt === "csv" ? buildCSV(exercises, symptoms, logs, marks, psfs) : buildJSON(exercises, symptoms, logs, marks, psfs)),
    [fmt, exercises, symptoms, logs, marks, psfs]
  );
  const filename = `liikepaivakirja-${keyOf(startOfToday())}.${fmt}`;

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const doCopy = async () => {
    let ok = await copyText(text);
    if (!ok && taRef.current) {
      try {
        taRef.current.focus();
        taRef.current.select();
        ok = document.execCommand("copy");
      } catch {
        /* ignore */
      }
    }
    setMsg(ok ? "Kopioitu leikepöydälle." : "Valitse teksti alta ja kopioi käsin.");
  };
  const doDownload = () => {
    const ok = download(filename, text, fmt === "csv" ? "text/csv" : "application/json");
    setMsg(ok ? `Ladattu: ${filename}` : "Lataus estetty tässä näkymässä — käytä Kopioi.");
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(22,36,31,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 12, zIndex: 50 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Vie tiedot"
        style={{ background: C.surface, borderRadius: 18, width: "100%", maxWidth: 520, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 12px" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Vie tiedot</h2>
          <IconBtn label="Sulje" onClick={onClose}><X size={18} /></IconBtn>
        </div>

        <div style={{ padding: "0 16px 16px", overflowY: "auto" }}>
          {/* format toggle */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, background: C.surfaceSoft, border: `1px solid ${C.line}`, borderRadius: 12, padding: 4 }}>
            {[["csv", "CSV (taulukko)"], ["json", "JSON (varmuuskopio)"]].map(([id, label]) => (
              <button key={id} className="tap" onClick={() => { setFmt(id); setMsg(""); }}
                style={{ padding: "9px 0", borderRadius: 9, fontSize: 13.5, fontWeight: 600, color: fmt === id ? "#fff" : C.inkSoft, background: fmt === id ? C.pine : "transparent" }}>
                {label}
              </button>
            ))}
          </div>

          <p style={{ fontSize: 12.5, color: C.inkSoft, margin: "10px 2px", lineHeight: 1.5 }}>
            {fmt === "csv"
              ? "Avautuu Excelissä tai Google Sheetsissä. Sopii lähetettäväksi fyssarille."
              : "Sisältää kaikki liikkeet, oireet ja merkinnät kokonaisuudessaan varmuuskopiota varten."}
            {count === 0 && " (Ei vielä merkintöjä — tiedostoon tulee vain otsikot.)"}
          </p>

          <textarea
            ref={taRef}
            readOnly
            value={text}
            onFocus={(e) => e.target.select()}
            style={{ width: "100%", height: 190, resize: "vertical", border: `1px solid ${C.line}`, borderRadius: 12, padding: 12, fontSize: 12, lineHeight: 1.45, fontFamily: "ui-monospace, Menlo, Consolas, monospace", color: C.ink, background: C.surfaceSoft, outline: "none" }}
          />

          {msg && <div style={{ fontSize: 12.5, color: C.pineDeep, fontWeight: 600, marginTop: 8 }}>{msg}</div>}

          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button className="tap" onClick={doCopy}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px", borderRadius: 12, background: C.pine, color: "#fff", fontSize: 15, fontWeight: 600 }}>
              <Copy size={17} /> Kopioi
            </button>
            <button className="tap" onClick={doDownload}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px", borderRadius: 12, border: `1px solid ${C.pine}`, background: C.surface, color: C.pineDeep, fontSize: 15, fontWeight: 600 }}>
              <Download size={17} /> Lataa
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  IMPORT MODAL                                                       */
/* ================================================================== */
export function ImportModal({ onApply, onUndo, canUndo, onClose }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || "");
      setText(content);
      const res = parseImport(content);
      if (res.ok) {
        setPreview(res);
        setError("");
      } else {
        setPreview(null);
        setError(res.error);
      }
    };
    reader.onerror = () => setError("Tiedoston luku epäonnistui. Liitä sisältö käsin alle.");
    reader.readAsText(f);
    e.target.value = "";
  };

  const onText = (v) => {
    setText(v);
    setPreview(null);
    setError("");
  };
  const check = () => {
    const res = parseImport(text);
    if (!res.ok) {
      setError(res.error);
      setPreview(null);
    } else {
      setError("");
      setPreview(res);
    }
  };
  const apply = async () => {
    if (!preview || saving) return;
    setSaving(true);
    try {
      await onApply(preview);
    } catch {
      /* ignore */
    }
    setSaving(false);
    setDone(true);
  };
  const undo = () => {
    onUndo && onUndo();
    onClose();
  };

  const outlineBtn = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: "11px",
    borderRadius: 12,
    border: `1px solid ${C.line}`,
    background: C.surface,
    color: C.ink,
    fontSize: 14.5,
    fontWeight: 600,
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(22,36,31,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 12, zIndex: 50 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Tuo tiedot"
        style={{ background: C.surface, borderRadius: 18, width: "100%", maxWidth: 520, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 12px" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Tuo tiedot</h2>
          <IconBtn label="Sulje" onClick={onClose}><X size={18} /></IconBtn>
        </div>

        <div style={{ padding: "0 16px 16px", overflowY: "auto" }}>
          {done ? (
            <div style={{ padding: "6px 2px 4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, color: C.pineDeep }}>
                <Check size={18} /> Tiedot tuotu ja tallennettu.
              </div>
              <p style={{ fontSize: 12.5, color: C.inkSoft, margin: "8px 2px 0", lineHeight: 1.5 }}>
                Väärä tiedosto? Voit kumota tuonnin ja palauttaa edelliset tiedot.
              </p>
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button className="tap" onClick={undo}
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px", borderRadius: 12, border: `1px solid ${C.amberLine}`, background: C.amberTint, color: C.amber, fontSize: 15, fontWeight: 600 }}>
                  <RotateCcw size={16} /> Kumoa tuonti
                </button>
                <button className="tap" onClick={onClose}
                  style={{ flex: 1, padding: "12px", borderRadius: 12, background: C.pine, color: "#fff", fontSize: 15, fontWeight: 600 }}>
                  Valmis
                </button>
              </div>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 12.5, color: C.inkSoft, margin: "0 2px 12px", lineHeight: 1.5 }}>
                Liitä aiemmin viedyn <b>JSON</b>-tiedoston sisältö alle tai valitse tiedosto. Tuonti korvaa nykyiset liikkeet, oireet ja merkinnät.
              </p>

              {canUndo && (
                <button className="tap" onClick={undo}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", marginBottom: 10, padding: "11px", borderRadius: 12, border: `1px solid ${C.amberLine}`, background: C.amberTint, color: C.amber, fontSize: 14, fontWeight: 600 }}>
                  <RotateCcw size={16} /> Palauta edellistä tuontia edeltäneet tiedot
                </button>
              )}

              <input type="file" accept=".json,application/json" ref={fileRef} onChange={onFile} style={{ display: "none" }} />
              <button className="tap" onClick={() => fileRef.current && fileRef.current.click()} style={{ ...outlineBtn, width: "100%", marginBottom: 10 }}>
                <Upload size={17} /> Valitse tiedosto
              </button>

              <textarea
                value={text}
                onChange={(e) => onText(e.target.value)}
                placeholder='Liitä JSON tähän… esim. {"app":"Liikepäiväkirja", ...}'
                style={{ width: "100%", height: 150, resize: "vertical", border: `1px solid ${C.line}`, borderRadius: 12, padding: 12, fontSize: 12, lineHeight: 1.45, fontFamily: "ui-monospace, Menlo, Consolas, monospace", color: C.ink, background: C.surfaceSoft, outline: "none" }}
              />

              {error && (
                <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: C.amber, background: C.amberTint, border: `1px solid ${C.amberLine}`, borderRadius: 10, padding: "10px 12px" }}>
                  {error}
                </div>
              )}

              {preview ? (
                <div style={{ marginTop: 12, background: C.surfaceSoft, border: `1px solid ${C.line}`, borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.5 }}>
                    Löytyi <b>{preview.counts.ex}</b> liikettä, <b>{preview.counts.sy}</b> oiretta, <b>{preview.counts.days}</b> päivän merkinnät, <b>{preview.counts.marks}</b> merkkipaalua ja <b>{preview.counts.psfs}</b> PSFS-arviota.
                  </div>
                  <div style={{ fontSize: 12.5, color: C.amber, fontWeight: 600, marginTop: 6 }}>
                    Tämä korvaa kaikki nykyiset tiedot.
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                    <button className="tap" onClick={apply} disabled={saving}
                      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px", borderRadius: 12, background: C.amber, color: "#fff", fontSize: 15, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
                      {saving ? "Tallennetaan…" : "Korvaa tiedot"}
                    </button>
                    <button className="tap" onClick={() => setPreview(null)} disabled={saving} style={{ ...outlineBtn, flex: 1, opacity: saving ? 0.5 : 1 }}>
                      Takaisin
                    </button>
                  </div>
                </div>
              ) : (
                <button className="tap" onClick={check} disabled={!text.trim()}
                  style={{ width: "100%", marginTop: 12, padding: "12px", borderRadius: 12, background: text.trim() ? C.pine : C.line, color: text.trim() ? "#fff" : C.inkFaint, fontSize: 15, fontWeight: 600 }}>
                  Jatka
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  STEP IMPORT MODAL                                                  */
/* ================================================================== */
export function StepsModal({ onApply, onClose }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [showHow, setShowHow] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const check = (raw) => {
    const r = parseSteps(raw);
    if (r.ok) {
      setPreview(r);
      setError("");
    } else {
      setPreview(null);
      setError(r.error);
    }
  };
  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const c = String(reader.result || "");
      setText(c);
      check(c);
    };
    reader.onerror = () => setError("Tiedoston luku epäonnistui. Liitä sisältö käsin.");
    reader.readAsText(f);
    e.target.value = "";
  };
  const apply = async () => {
    if (!preview || saving) return;
    setSaving(true);
    let n = 0;
    try {
      n = await onApply(preview.rows);
    } catch {
      /* ignore */
    }
    setSaving(false);
    setResult({ changed: n, total: preview.rows.length });
  };

  const outlineBtn = { display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "11px", borderRadius: 12, border: `1px solid ${C.line}`, background: C.surface, color: C.ink, fontSize: 14.5, fontWeight: 600 };

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(22,36,31,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 12, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Tuo askeleet"
        style={{ background: C.surface, borderRadius: 18, width: "100%", maxWidth: 520, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 10px" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Tuo askeleet</h2>
          <IconBtn label="Sulje" onClick={onClose}><X size={18} /></IconBtn>
        </div>

        <div style={{ padding: "0 16px 16px", overflowY: "auto" }}>
          {result ? (
            <div style={{ padding: "6px 2px 4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, color: C.pineDeep }}>
                <Check size={18} /> {result.changed} päivää päivitetty ({result.total} luettu).
              </div>
              <p style={{ fontSize: 12.5, color: C.inkSoft, margin: "8px 2px 0", lineHeight: 1.5 }}>
                Liikkeisiin, oireisiin tai muistiinpanoihin ei koskettu. Voit ajaa tuonnin uudelleen milloin vain.
              </p>
              <button className="tap" onClick={onClose}
                style={{ width: "100%", marginTop: 14, padding: "12px", borderRadius: 12, background: C.pine, color: "#fff", fontSize: 15, fontWeight: 600 }}>
                Valmis
              </button>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 12.5, color: C.inkSoft, margin: "0 2px 10px", lineHeight: 1.5 }}>
                Liitä Terveys-datasta viety lista tai valitse tiedosto. Tuonti <b>yhdistää</b> askeleet päiviin eikä muuta muita tietoja.
              </p>

              <button className="tap" onClick={() => setShowHow((v) => !v)}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.inkSoft, marginBottom: 8 }}>
                <HelpCircle size={14} /> Miten saan askeleet iPhonesta?
              </button>
              {showHow && (
                <div style={{ background: C.surfaceSoft, border: `1px solid ${C.line}`, borderRadius: 12, padding: 12, marginBottom: 10, fontSize: 12.5, color: C.ink, lineHeight: 1.55 }}>
                  <b>Pikakomennot-sovelluksella (ei lisäsovelluksia):</b>
                  <div style={{ marginTop: 6 }}>
                    1. Uusi pikakomento → <i>Find All Health Samples Where</i> → tyyppi <i>Steps</i>, rajaa päivämäärillä.<br />
                    2. <i>Calculate Statistics</i> → <i>Sum</i>.<br />
                    3. <i>Text</i>-toiminto, johon kirjoitat rivin <code>2026-07-20;[summa]</code> — tai toista päiväsilmukassa.<br />
                    4. <i>Copy to Clipboard</i> ja liitä tähän.
                  </div>
                  <div style={{ marginTop: 8, color: C.inkSoft }}>
                    Puhelimen täytyy olla lukitsematon kun komento ajetaan, muuten terveysdataan ei pääse. Myös Terveys-dataa JSONiksi vievät apusovellukset kelpaavat — jäsennin tunnistaa yleisimmät muodot.
                  </div>
                  <div style={{ marginTop: 8, color: C.inkSoft }}>
                    Hyväksytyt muodot: <code>[{"{"}"date":"2026-07-20","steps":8432{"}"}]</code>, <code>{"{"}"2026-07-20":8432{"}"}</code> tai rivit <code>2026-07-20;8432</code>.
                  </div>
                </div>
              )}

              <input type="file" accept=".json,.csv,.txt,text/plain,application/json" ref={fileRef} onChange={onFile} style={{ display: "none" }} />
              <button className="tap" onClick={() => fileRef.current && fileRef.current.click()} style={{ ...outlineBtn, width: "100%", marginBottom: 10 }}>
                <Upload size={17} /> Valitse tiedosto
              </button>

              <textarea
                value={text}
                onChange={(e) => { setText(e.target.value); setPreview(null); setError(""); }}
                placeholder={'2026-07-20;8432\n2026-07-21;10250'}
                style={{ width: "100%", height: 130, resize: "vertical", border: `1px solid ${C.line}`, borderRadius: 12, padding: 12, fontSize: 12.5, lineHeight: 1.45, fontFamily: "ui-monospace, Menlo, Consolas, monospace", color: C.ink, background: C.surfaceSoft, outline: "none" }}
              />

              {error && (
                <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: C.amber, background: C.amberTint, border: `1px solid ${C.amberLine}`, borderRadius: 10, padding: "10px 12px" }}>
                  {error}
                </div>
              )}

              {preview ? (
                <div style={{ marginTop: 12, background: C.surfaceSoft, border: `1px solid ${C.line}`, borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.5 }}>
                    Löytyi <b>{preview.rows.length}</b> päivää: {humanDate(preview.from)} – {humanDate(preview.to)}.
                  </div>
                  <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 4 }}>
                    Keskimäärin {Math.round(preview.rows.reduce((a, b) => a + b.steps, 0) / preview.rows.length).toLocaleString("fi-FI")} askelta/pv.
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                    <button className="tap" onClick={apply} disabled={saving}
                      style={{ flex: 1, padding: "12px", borderRadius: 12, background: C.pine, color: "#fff", fontSize: 15, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
                      {saving ? "Tallennetaan…" : "Yhdistä askeleet"}
                    </button>
                    <button className="tap" onClick={() => setPreview(null)} disabled={saving} style={{ ...outlineBtn, flex: 1 }}>
                      Takaisin
                    </button>
                  </div>
                </div>
              ) : (
                <button className="tap" onClick={() => check(text)} disabled={!text.trim()}
                  style={{ width: "100%", marginTop: 12, padding: "12px", borderRadius: 12, background: text.trim() ? C.pine : C.line, color: text.trim() ? "#fff" : C.inkFaint, fontSize: 15, fontWeight: 600 }}>
                  Jatka
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
