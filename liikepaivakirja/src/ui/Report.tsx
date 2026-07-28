/* ui/Report — the clinician one-pager.
 *
 * Three ways out, because exactly one of them works in every place this app runs:
 *
 *   Tulosta       window.print(). Real PDF on desktop and in mobile Safari tabs.
 *                 Not available inside an iOS Home Screen web app — standalone
 *                 mode has no share button and no print — which is why it is not
 *                 the only option.
 *   Lataa .html   A self-contained file. Opens in any browser, prints from there,
 *                 attaches to an email. This is the path that always works.
 *   Kopioi teksti Plain text for a message or an email body, no attachment.
 *
 * The preview is the same HTML string the file contains, injected rather than
 * re-rendered as JSX, so there is one renderer and the preview cannot lie about
 * what the physiotherapist will see.
 *
 * Printing needs the report to be a direct child of <body>, so this mounts
 * through a portal: `body > *:not(.rpt-portal) { display: none }` in the print
 * media query then hides the whole app in one rule, with no reliance on the
 * stacking context that the fixed-position modals elsewhere depend on.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Download, Printer, X } from "lucide-react";
import { buildReport, keyOf, reportBodyHTML, reportCSS, reportDocument, reportText, startOfToday } from "../domain";
import { copyText, download } from "../platform/download";
import { C } from "../styles/tokens";
import { IconBtn } from "./common";

const RANGES = [
  [30, "30 pv"],
  [90, "90 pv"],
  [0, "Kaikki"],
] as const;

const printCSS = `
@media print {
  body > *:not(.rpt-portal) { display: none !important; }
  .rpt-portal { position: static !important; inset: auto !important; overflow: visible !important;
    background: #fff !important; padding: 0 !important; z-index: auto !important; }
  .rpt-chrome { display: none !important; }
  .rpt-sheetwrap { border: 0 !important; border-radius: 0 !important; padding: 0 !important;
    box-shadow: none !important; max-width: none !important; margin: 0 !important; overflow: visible !important; }
}
`;

export function ReportModal({ exercises, symptoms, logs, marks, psfs, questions, setQuestions, onClose }) {
  const [days, setDays] = useState(30);
  const [msg, setMsg] = useState("");

  const model = useMemo(
    () => buildReport({ exercises, symptoms, logs, marks, psfs, today: startOfToday(), days }),
    [exercises, symptoms, logs, marks, psfs, days]
  );
  const body = useMemo(() => reportBodyHTML(model, { questions }), [model, questions]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filename = `liikepaivakirja-raportti-${keyOf(startOfToday())}.html`;

  const doPrint = () => {
    setMsg("");
    try {
      window.print();
    } catch {
      setMsg("Tulostus ei ole käytettävissä tässä näkymässä — lataa .html-tiedosto ja tulosta se selaimessa.");
    }
  };
  const doDownload = () => {
    const ok = download(filename, reportDocument(model, { questions }), "text/html");
    setMsg(ok ? `Ladattu: ${filename}` : "Lataus estettiin — käytä Kopioi teksti.");
  };
  const doCopy = async () => {
    const ok = await copyText(reportText(model, { questions }));
    setMsg(ok ? "Yhteenveto kopioitu tekstinä." : "Kopiointi ei onnistunut. Lataa .html-tiedosto.");
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="rpt-portal"
      style={{ position: "fixed", inset: 0, background: C.bg, overflowY: "auto", zIndex: 60, padding: "0 0 40px" }}
    >
      <style dangerouslySetInnerHTML={{ __html: reportCSS + printCSS }} />

      <div
        className="rpt-chrome"
        style={{ position: "sticky", top: 0, background: C.surface, borderBottom: `1px solid ${C.line}`, padding: "12px 16px", zIndex: 2 }}
      >
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Raportti fysioterapeutille</h2>
              <div style={{ fontSize: 12, color: C.inkFaint, marginTop: 1 }}>Yksi sivu, tulostettavaksi tai liitteeksi</div>
            </div>
            <IconBtn label="Sulje" onClick={onClose}>
              <X size={18} />
            </IconBtn>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, background: C.surfaceSoft, border: `1px solid ${C.line}`, borderRadius: 11, padding: 4, marginTop: 10 }}>
            {RANGES.map(([v, label]) => (
              <button
                key={v}
                className="tap"
                onClick={() => setDays(v)}
                style={{ padding: "8px 0", borderRadius: 8, fontSize: 13, fontWeight: 600, color: days === v ? "#fff" : C.inkSoft, background: days === v ? C.pine : "transparent" }}
              >
                {label}
              </button>
            ))}
          </div>

          <label style={{ display: "block", marginTop: 10 }}>
            <span style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.inkSoft, fontWeight: 700 }}>
              Kysymykset ja huomiot
            </span>
            <textarea
              value={questions}
              onChange={(e) => setQuestions(e.target.value)}
              rows={3}
              placeholder="Mitä haluat kysyä vastaanotolla? Yksi asia riviä kohti."
              style={{ width: "100%", marginTop: 5, resize: "vertical", border: `1px solid ${C.line}`, borderRadius: 11, padding: "10px 12px", fontSize: 14.5, lineHeight: 1.5, color: C.ink, background: C.surface, outline: "none" }}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 8 }}>
            <ActionBtn onClick={doPrint} primary>
              <Printer size={17} /> Tulosta
            </ActionBtn>
            <ActionBtn onClick={doDownload}>
              <Download size={17} /> Lataa
            </ActionBtn>
            <ActionBtn onClick={doCopy}>
              <Copy size={17} /> Kopioi
            </ActionBtn>
          </div>

          {msg && <div style={{ fontSize: 12.5, color: C.pineDeep, fontWeight: 600, marginTop: 8, lineHeight: 1.45 }}>{msg}</div>}
          <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 8, lineHeight: 1.5 }}>
            Kotivalikosta avatussa sovelluksessa iOS ei tarjoa tulostusta — lataa silloin .html ja avaa se
            Safarissa.
          </div>
        </div>
      </div>

      <div
        className="rpt-sheetwrap"
        style={{ maxWidth: 760, margin: "16px auto", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: "20px 22px", boxShadow: "0 1px 3px rgba(22,36,31,0.06)" }}
      >
        <div className="rpt" dangerouslySetInnerHTML={{ __html: body }} />
      </div>
    </div>,
    document.body
  );
}

function ActionBtn({ children, onClick, primary }: any) {
  return (
    <button
      className="tap"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "11px 4px",
        borderRadius: 11,
        border: `1px solid ${C.pine}`,
        background: primary ? C.pine : C.surface,
        color: primary ? "#fff" : C.pineDeep,
        fontSize: 14,
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}
