/* ui/Library — moved verbatim from liikepaivakirja.jsx (Phase 1 split). */
import { useState, useEffect, useMemo } from "react";
import { Check, X, HelpCircle } from "lucide-react";
import { LIBRARY, LIB_CATS, SCALE_NOTE, SOURCES, SRC_ORDER, regionName, structName, typeLabel } from "../domain";
import { C } from "../styles/tokens";
import { Empty, IconBtn } from "./common";

/* ================================================================== */
/*  LIBRARY                                                            */
/* ================================================================== */
export function SourceBadge({ source, compact }) {
  const meta = SOURCES[source.src];
  if (!meta) return null;
  const measured = source.src === "boren2011";
  const estimate = source.src === "estimate";
  const c = source.edited ? C.inkSoft : measured ? C.pineDeep : estimate ? C.amber : C.slate;
  const bg = source.edited ? C.surfaceSoft : measured ? C.pineTint : estimate ? C.amberTint : C.slateTint;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: c, background: bg, borderRadius: 999, padding: "2px 8px" }}>
        {source.edited ? "Muokattu" : meta.tag}
      </span>
      {!compact && source.note && <span style={{ fontSize: 11.5, color: C.inkFaint }}>{source.note}</span>}
    </div>
  );
}

export function LibraryModal({ existing, onAdd, onClose }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [picked, setPicked] = useState([]);
  const [showSources, setShowSources] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const have = useMemo(() => new Set(existing.map((e) => e.name.toLowerCase())), [existing]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return LIBRARY.filter((e) => {
      if (cat !== "all" && e.cat !== cat) return false;
      if (!needle) return true;
      return (
        e.name.toLowerCase().includes(needle) ||
        Object.keys(e.muscles).some((id) => regionName(id).toLowerCase().includes(needle)) ||
        (e.structures || []).some((id) => structName(id).toLowerCase().includes(needle))
      );
    }).sort((a, b) => (SRC_ORDER[a.src] - SRC_ORDER[b.src]) || a.name.localeCompare(b.name, "fi"));
  }, [q, cat]);

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const commit = () => {
    onAdd(picked);
    onClose();
  };

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(22,36,31,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 12, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Liikekirjasto"
        style={{ background: C.surface, borderRadius: 18, width: "100%", maxWidth: 520, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 8px" }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.inkFaint, fontWeight: 700 }}>Kirjasto</div>
            <h2 style={{ margin: "2px 0 0", fontSize: 17, fontWeight: 600 }}>{LIBRARY.length} liikettä</h2>
          </div>
          <IconBtn label="Sulje" onClick={onClose}><X size={18} /></IconBtn>
        </div>

        <div style={{ padding: "0 16px", flex: 1, overflowY: "auto" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hae liikettä tai lihasryhmää…"
            style={{ width: "100%", border: `1px solid ${C.line}`, borderRadius: 11, background: C.surfaceSoft, fontSize: 15, padding: "11px 12px", color: C.ink, outline: "none" }} />
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", margin: "8px 0" }}>
            <button className="tap" onClick={() => setCat("all")}
              style={{ fontSize: 12, fontWeight: 600, padding: "6px 11px", borderRadius: 999, border: `1px solid ${cat === "all" ? C.pine : C.line}`, background: cat === "all" ? C.pine : C.surface, color: cat === "all" ? "#fff" : C.inkSoft }}>
              Kaikki
            </button>
            {LIB_CATS.map((c) => (
              <button key={c.id} className="tap" onClick={() => setCat(c.id)}
                style={{ fontSize: 12, fontWeight: 600, padding: "6px 11px", borderRadius: 999, border: `1px solid ${cat === c.id ? C.pine : C.line}`, background: cat === c.id ? C.pine : C.surface, color: cat === c.id ? "#fff" : C.inkSoft }}>
                {c.label}
              </button>
            ))}
          </div>

          <button className="tap" onClick={() => setShowSources((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.inkSoft, marginBottom: 8 }}>
            <HelpCircle size={14} /> Mihin kuormitusarvot perustuvat?
          </button>
          {showSources && (
            <div style={{ background: C.surfaceSoft, border: `1px solid ${C.line}`, borderRadius: 12, padding: 12, marginBottom: 10 }}>
              <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.5, marginBottom: 8 }}>{SCALE_NOTE}</div>
              {Object.keys(SOURCES).map((k) => (
                <div key={k} style={{ marginTop: 8 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: C.slate }}>{SOURCES[k].tag}</span>
                  <div style={{ fontSize: 12, color: C.inkSoft, lineHeight: 1.5 }}>{SOURCES[k].text}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
            {rows.length === 0 && <Empty>Ei osumia haulla.</Empty>}
            {rows.map((e, i) => {
              const sel = picked.includes(e.id);
              const dup = have.has(e.name.toLowerCase());
              return (
                <button key={e.id} className="tap" onClick={() => toggle(e.id)}
                  style={{ display: "flex", alignItems: "flex-start", gap: 10, width: "100%", textAlign: "left", padding: "11px 12px", borderTop: i === 0 ? "none" : `1px solid ${C.line}`, background: sel ? C.pineTint : C.surface }}>
                  <span style={{ flex: "0 0 auto", marginTop: 2, width: 20, height: 20, borderRadius: 6, border: sel ? "none" : `2px solid ${C.line}`, background: sel ? C.pine : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {sel && <Check size={13} color="#fff" strokeWidth={3} />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: C.ink }}>
                      {e.name}
                      {dup && <span style={{ fontSize: 11, color: C.inkFaint, fontWeight: 500 }}> · jo listalla</span>}
                    </span>
                    <span style={{ display: "block", fontSize: 12, color: C.inkFaint, marginTop: 2 }}>
                      {typeLabel(e.type)}
                      {e.unit === "min" ? ` · ${e.met} MET` : ""}
                      {" · "}
                      {Object.keys(e.muscles).sort((a, b) => e.muscles[a] - e.muscles[b]).slice(0, 3).map((id) => regionName(id)).join(", ")}
                    </span>
                    <SourceBadge source={{ src: e.src, note: e.note }} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ padding: "10px 16px 16px", borderTop: `1px solid ${C.line}`, background: C.surface }}>
          <button className="tap" onClick={commit} disabled={picked.length === 0}
            style={{ width: "100%", padding: "13px", borderRadius: 12, background: picked.length ? C.pine : C.line, color: picked.length ? "#fff" : C.inkFaint, fontSize: 15, fontWeight: 600 }}>
            {picked.length ? `Lisää valitut (${picked.length})` : "Valitse liikkeitä"}
          </button>
        </div>
      </div>
    </div>
  );
}
