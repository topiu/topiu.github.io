/* ui/common — moved verbatim from liikepaivakirja.jsx (Phase 1 split). */
import { Plus, RotateCcw } from "lucide-react";
import { C } from "../styles/tokens";

export function AddRow({ value, setValue, placeholder, onAdd }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
      <input value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onAdd()} placeholder={placeholder}
        style={{ flex: 1, minWidth: 0, border: `1px solid ${C.line}`, borderRadius: 10, background: C.surface, fontSize: 15, padding: "10px 12px", color: C.ink, outline: "none" }} />
      <button className="tap" onClick={onAdd} aria-label="Lisää"
        style={{ flex: "0 0 auto", width: 42, height: 42, borderRadius: 10, background: C.pine, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Plus size={20} color="#fff" strokeWidth={2.5} />
      </button>
    </div>
  );
}

export function ResetBtn({ onClick }) {
  return (
    <button className="tap" onClick={onClick}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, margin: "8px 2px 0", fontSize: 13, fontWeight: 600, color: C.inkSoft }}>
      <RotateCcw size={14} /> Palauta oletukset
    </button>
  );
}

/* ================================================================== */
/*  Small shared pieces                                               */
/* ================================================================== */
export function Card({ children, style }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: 16, marginBottom: 16, ...style }}>
      {children}
    </div>
  );
}

export function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: C.inkSoft, fontWeight: 700, margin: "6px 2px 9px" }}>
      {children}
    </div>
  );
}

export function Empty({ children }) {
  return <div style={{ padding: "16px 12px", color: C.inkFaint, fontSize: 14 }}>{children}</div>;
}

export function Stat({ value, unit, label, accent }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 10px", textAlign: "center" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 3 }}>
        <span style={{ fontSize: 30, fontWeight: 300, color: accent, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{value}</span>
        <span style={{ fontSize: 12, color: C.inkFaint, fontWeight: 600 }}>{unit}</span>
      </div>
      <div style={{ marginTop: 6, fontSize: 11.5, color: C.inkSoft, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

export function IconBtn({ children, onClick, label, disabled }) {
  return (
    <button className="tap" onClick={onClick} disabled={disabled} aria-label={label}
      style={{ width: 42, height: 42, borderRadius: 12, border: `1px solid ${C.line}`, background: C.surface, display: "flex", alignItems: "center", justifyContent: "center", color: disabled ? C.inkFaint : C.ink, opacity: disabled ? 0.5 : 1 }}>
      {children}
    </button>
  );
}

export function MiniBtn({ children, onClick, label, disabled, danger }) {
  return (
    <button className="tap" onClick={onClick} disabled={disabled} aria-label={label}
      style={{ width: 34, height: 34, flex: "0 0 auto", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", color: disabled ? C.inkFaint : danger ? C.amber : C.inkSoft, opacity: disabled ? 0.4 : 1, background: "transparent" }}>
      {children}
    </button>
  );
}

export function NumField({ label, value, onChange, placeholder, exId, onDoseFocus, onDoseBlur }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 10.5, letterSpacing: "0.04em", color: C.inkFaint, fontWeight: 700, textTransform: "uppercase" }}>{label}</span>
      <input
        value={value == null ? "" : value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={exId && onDoseFocus ? () => onDoseFocus(exId) : undefined}
        onBlur={exId && onDoseBlur ? () => onDoseBlur(exId) : undefined}
        data-dose-ex={exId || undefined}
        inputMode="numeric"
        placeholder={placeholder}
        style={{ width: 54, textAlign: "center", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 6px", fontSize: 15, background: C.surface, color: C.ink, outline: "none" }}
      />
    </label>
  );
}

export function Style() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
        .ptf, .ptf * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        .ptf button { font: inherit; color: inherit; cursor: pointer; border: none; background: none; }
        .ptf button:disabled { cursor: default; }
        .ptf input, .ptf textarea { font: inherit; }
        .ptf *:focus { outline: none; }
        .ptf *:focus-visible { outline: 2px solid ${C.pine}; outline-offset: 2px; border-radius: 8px; }
        .ptf .tap:not(:disabled):active { transform: scale(0.98); }
        .ptf textarea::placeholder, .ptf input::placeholder { color: ${C.inkFaint}; }
        @keyframes ptf-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .ptf .rise { animation: ptf-rise .35s ease both; }
        /* Day-swipe feedback. Short and small on purpose: this is a page turn,
           not a transition, and anything longer gets in the way of a second
           swipe. The reduced-motion rule below disables all three. */
        @keyframes ptf-day-next { from { opacity: .35; transform: translate3d(16px,0,0); } to { opacity: 1; transform: none; } }
        @keyframes ptf-day-prev { from { opacity: .35; transform: translate3d(-16px,0,0); } to { opacity: 1; transform: none; } }
        @keyframes ptf-day-bump { 0%, 100% { transform: none; } 45% { transform: translate3d(-9px,0,0); } }
        .ptf .day-in-next { animation: ptf-day-next .2s ease-out both; }
        .ptf .day-in-prev { animation: ptf-day-prev .2s ease-out both; }
        .ptf .day-bump { animation: ptf-day-bump .24s ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .ptf *, .ptf .rise { animation: none !important; transition: none !important; }
        }
      `,
      }}
    />
  );
}
