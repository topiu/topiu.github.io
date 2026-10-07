import { useEffect, useRef, useState } from "react";
import { C, MONO, SANS } from "../core";

/* ---------------- small UI atoms ---------------- */

export const Label = ({ children, style }) => (
  <div
    style={{
      fontFamily: SANS,
      fontSize: 9.5,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: C.dim,
      fontWeight: 600,
      ...style,
    }}
  >
    {children}
  </div>
);
export function Btn({ children, onClick, active, tone, wide, small, style, title }) {
  const bg = active ? C.accent : tone === "bad" ? "rgba(180,64,47,0.18)" : C.chrome3;
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        background: bg,
        color: tone === "bad" && !active ? "#F0A79A" : C.text,
        border: `1px solid ${active ? C.accent : C.line}`,
        borderRadius: 8,
        padding: small ? "6px 9px" : "9px 12px",
        fontFamily: SANS,
        fontSize: small ? 12 : 13,
        fontWeight: 500,
        cursor: "pointer",
        flex: wide ? 1 : "none",
        whiteSpace: "nowrap",
        lineHeight: 1.1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
/* A number field that commits when you are done, not on every keystroke.
   Committing each keystroke let the parent clamp a half-typed number (typing
   2600 into a field clamped to 800–8000 went 2 -> 800 -> 8006 -> 8000) and
   then wrote the clamped value back into the box mid-typing. Worse, every
   keystroke was an edit: a corner X field passed through "6" on its way to
   6000 and rebuilt the room's walls 6 mm long, shrinking their doors. */
export function NumField({ label, value, onChange, suffix, w }) {
  const [txt, setTxt] = useState(String(value ?? ""));
  const [shown, setShown] = useState(0); // bumped after a commit to show what was stored
  const dirty = useRef(false);
  const latest = useRef({ txt, onChange });
  latest.current = { txt, onChange };
  useEffect(() => {
    if (!dirty.current) setTxt(String(value ?? ""));
  }, [value, shown]);
  const commit = () => {
    if (!dirty.current) return;
    dirty.current = false;
    const v = parseFloat(latest.current.txt.replace(",", "."));
    if (!isNaN(v)) latest.current.onChange(v);
    setShown((n) => n + 1);
  };
  // React sends no blur for a field it removes mid-edit (selecting something
  // else swaps the panel), so a removed field commits on its way out
  useEffect(() => () => commit(), []);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 3,
        width: w,
      }}
    >
      <Label>{label}</Label>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: C.chrome,
          border: `1px solid ${C.line}`,
          borderRadius: 7,
        }}
      >
        <input
          value={txt}
          inputMode="decimal"
          onChange={(e) => {
            dirty.current = true;
            setTxt(e.target.value);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            outline: "none",
            color: C.text,
            fontFamily: MONO,
            fontSize: 14,
            padding: "7px 8px",
            fontVariantNumeric: "tabular-nums",
          }}
        />
        {suffix && (
          <span
            style={{
              fontFamily: MONO,
              fontSize: 11,
              color: C.dim,
              paddingRight: 8,
            }}
          >
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
export function Sheet({ open, onClose, title, children, maxH = "80vh" }) {
  if (!open) return null;
  return (
    <div
      onPointerDown={onClose}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(10,16,18,0.55)",
        display: "flex",
        alignItems: "flex-end",
        zIndex: 40,
      }}
    >
      <div
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxHeight: maxH,
          background: C.chrome2,
          borderTop: `1px solid ${C.line}`,
          borderRadius: "16px 16px 0 0",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 -20px 50px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px 10px",
            borderBottom: `1px solid ${C.line}`,
            flexShrink: 0,
          }}
        >
          <Label
            style={{
              fontSize: 10.5,
              color: C.text,
            }}
          >
            {title}
          </Label>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: C.dim,
              fontSize: 22,
              lineHeight: 1,
              cursor: "pointer",
              padding: "0 4px",
            }}
          >
            ×
          </button>
        </div>
        <div
          style={{
            overflowY: "auto",
            padding: 16,
            paddingBottom: 28,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
