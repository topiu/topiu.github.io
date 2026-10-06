/* ui/Phase — starting a new programme phase.
 *
 * One small decision screen: what to call it, whether the current exercises
 * step aside (archived — their history stays, and any that continue are
 * revived with it when the new programme is added), and where the new
 * programme comes from. A milestone marks the day, so Historia, the trend
 * chart and the report all show where the phase began.
 */
import { useEffect, useState } from "react";
import { ClipboardPaste, LayoutList, Plus, X } from "lucide-react";
import { C } from "../styles/tokens";
import { IconBtn } from "./common";

export function PhaseModal({ defaultName, onStart, onClose }) {
  const [name, setName] = useState(defaultName);
  const [archive, setArchive] = useState(true);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const btn = { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "12px", borderRadius: 12, border: `1px solid ${C.pine}`, background: C.surface, color: C.pineDeep, fontSize: 14.5, fontWeight: 600, marginTop: 8 };
  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(22,36,31,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 12, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Uusi vaihe"
        style={{ background: C.surface, borderRadius: 18, width: "100%", maxWidth: 520, padding: 16, boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 18, fontWeight: 600 }}>Uusi vaihe</h2>
          <IconBtn label="Sulje" onClick={onClose}><X size={18} /></IconBtn>
        </div>
        <p style={{ fontSize: 13, color: C.inkSoft, margin: "0 2px 10px", lineHeight: 1.5 }}>
          Kun ohjelma vaihtuu. Päivä merkitään merkkipaaluksi, ja raportin voi rajata tähän vaiheeseen.
        </p>
        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.inkSoft, margin: "0 2px 4px" }}>Vaiheen nimi</label>
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Vaiheen nimi"
          style={{ width: "100%", border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 11px", fontSize: 15, color: C.ink, outline: "none" }} />
        <label style={{ display: "flex", gap: 9, alignItems: "flex-start", marginTop: 12, fontSize: 13.5, color: C.ink, lineHeight: 1.45 }}>
          <input type="checkbox" checked={archive} onChange={() => setArchive((v) => !v)} style={{ width: 18, height: 18, marginTop: 1, accentColor: C.pine }} />
          <span>
            Arkistoi nykyiset liikkeet
            <span style={{ display: "block", fontSize: 12, color: C.inkFaint }}>Historia säilyy. Jatkuvat liikkeet palaavat historioineen, kun lisäät ne uudelleen.</span>
          </span>
        </label>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.inkSoft, margin: "14px 2px 0" }}>Uuden vaiheen liikkeet</div>
        <button className="tap" style={btn} onClick={() => onStart(name, archive, "template")}><LayoutList size={16} /> Pohjasta</button>
        <button className="tap" style={btn} onClick={() => onStart(name, archive, "text")}><ClipboardPaste size={16} /> Tekstinä</button>
        <button className="tap" style={{ ...btn, border: `1px solid ${C.line}`, color: C.inkSoft }} onClick={() => onStart(name, archive, "none")}><Plus size={16} /> Lisään itse</button>
      </div>
    </div>
  );
}
