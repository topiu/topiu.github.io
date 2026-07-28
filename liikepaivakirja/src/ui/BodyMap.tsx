/* ui/BodyMap — moved verbatim from liikepaivakirja.jsx (Phase 1 split). */
import { useState, useEffect, useCallback, useMemo } from "react";
import { X } from "lucide-react";
import { EX_TYPES, INTENSITY, REGIONS, SIDES, SILHOUETTE, STRUCT_BY_ID, isMin, keyOf, mixHex, regionName, regionsOfView, sideOfHalf, structName, structuresOfView, typeLabel } from "../domain";
import { C } from "../styles/tokens";
import { Card, Empty, IconBtn, SectionLabel } from "./common";

/* ================================================================== */
/*  BODY MAP                                                           */
/* ================================================================== */
export function Prim({ s, ...rest }) {
  if (s.t === "rect") return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r} {...rest} />;
  if (s.t === "ellipse") return <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} {...rest} />;
  return <polygon points={s.p.map(([x, y]) => `${x},${y}`).join(" ")} {...rest} />;
}

export const MIRROR = "translate(200,0) scale(-1,1)";

/* fillOf(regionId, side) → colour; strokeOf → {c,w} | null; onTap(regionId, side) */
export function BodyMap({ view, fillOf, strokeOf, onTap, hatchIds, structures }) {
  const halves = [];
  regionsOfView(view).forEach((r) => {
    if (r.m) {
      halves.push({ r, mirrored: false, side: sideOfHalf(view, false) });
      halves.push({ r, mirrored: true, side: sideOfHalf(view, true) });
    } else {
      halves.push({ r, mirrored: false, side: null });
    }
  });
  return (
    <svg viewBox="0 0 200 340" style={{ width: "100%", height: "auto", display: "block", maxHeight: "56vh" }}
      role="img" aria-label={view === "front" ? "Kehokartta, etupuoli" : "Kehokartta, takapuoli"}>
      <defs>
        <pattern id="ptf-hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill={C.surfaceSoft} />
          <line x1="0" y1="0" x2="0" y2="6" stroke={C.line} strokeWidth="2.5" />
        </pattern>
      </defs>
      {/* silhouette */}
      {SILHOUETTE.map((s, i) => (
        <g key={`sil${i}`}>
          <Prim s={s} fill={C.surfaceSoft} stroke={C.line} strokeWidth="1" />
          {s.m && (
            <g transform={MIRROR}>
              <Prim s={s} fill={C.surfaceSoft} stroke={C.line} strokeWidth="1" />
            </g>
          )}
        </g>
      ))}
      {/* regions */}
      {halves.map(({ r, mirrored, side }, i) => {
        const st = strokeOf ? strokeOf(r.id, side) : null;
        const hatched = hatchIds && hatchIds.has(r.id);
        const body = (
          <Prim
            s={r.s}
            fill={hatched ? "url(#ptf-hatch)" : fillOf(r.id, side)}
            stroke={st ? st.c : C.line}
            strokeWidth={st ? st.w : 0.8}
            style={onTap ? { cursor: "pointer" } : undefined}
            onClick={onTap ? () => onTap(r.id, side) : undefined}
          />
        );
        return (
          <g key={`${r.id}${i}`}>{mirrored ? <g transform={MIRROR}>{body}</g> : body}</g>
        );
      })}
      {/* structures: nerves as lines, joints as rings */}
      {structures && structures.show &&
        structuresOfView(view).flatMap((st) => {
          const mirs = st.m ? [false, true] : [false];
          return mirs.map((mir) => {
            const side = st.m ? sideOfHalf(view, mir) : null;
            const sty = structures.styleOf(st.id, side);
            if (!sty) return null;
            const tap = structures.onTap ? () => structures.onTap(st.id, side) : undefined;
            const node =
              st.kind === "nerve" ? (
                <>
                  <polyline points={st.p.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke={sty.c}
                    strokeWidth={sty.w} strokeDasharray={sty.dash} strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points={st.p.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="transparent"
                    strokeWidth="14" style={tap ? { cursor: "pointer" } : undefined} onClick={tap} />
                </>
              ) : (
                <>
                  <circle cx={st.c.cx} cy={st.c.cy} r={sty.r} fill={C.surface} fillOpacity="0.55" stroke={sty.c}
                    strokeWidth={sty.w} strokeDasharray={sty.dash} />
                  <circle cx={st.c.cx} cy={st.c.cy} r="13" fill="transparent"
                    style={tap ? { cursor: "pointer" } : undefined} onClick={tap} />
                </>
              );
            return (
              <g key={`${st.id}${mir ? "m" : ""}`}>{mir ? <g transform={MIRROR}>{node}</g> : node}</g>
            );
          });
        })}
      {/* side legend (front view is mirrored relative to the viewer) */}
      <text x="16" y="20" style={{ fontSize: 11, fontWeight: 700, fill: C.inkFaint }}>
        {view === "front" ? "O" : "V"}
      </text>
      <text x="178" y="20" style={{ fontSize: 11, fontWeight: 700, fill: C.inkFaint }}>
        {view === "front" ? "V" : "O"}
      </text>
    </svg>
  );
}

export function ViewToggle({ view, setView }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, background: C.surfaceSoft, border: `1px solid ${C.line}`, borderRadius: 11, padding: 4 }}>
      {[["front", "Edestä"], ["back", "Takaa"]].map(([id, label]) => (
        <button key={id} className="tap" onClick={() => setView(id)}
          style={{ padding: "8px 0", borderRadius: 8, fontSize: 13.5, fontWeight: 600, color: view === id ? "#fff" : C.inkSoft, background: view === id ? C.pine : "transparent" }}>
          {label}
        </button>
      ))}
    </div>
  );
}

/* ---- picker: intensities for an exercise, sides for a symptom ---- */
export function RegionPicker({ kind, title, valueMap, structMap, onTap, onTapStruct, onClose }) {
  const [view, setView] = useState("back");
  const [layer, setLayer] = useState("muscles"); // muscles | structures
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const structOn = (id) => (kind === "ex" ? (structMap || []).includes(id) : (structMap || {})[id]);

  const fillOf = (id, side) => {
    if (layer === "structures") return C.surfaceSoft;
    const v = valueMap[id];
    if (!v) return C.surface;
    if (kind === "ex") return mixHex(C.pineTint, C.pineDeep, v === 1 ? 1 : v === 2 ? 0.6 : 0.3);
    if (v === "B" || v === side) return C.amber;
    return C.surface;
  };
  const strokeOf = (id) => {
    if (layer === "structures") return null;
    return valueMap[id] ? { c: kind === "ex" ? C.pineDeep : C.amber, w: 1.4 } : null;
  };
  const structStyle = (id, side) => {
    const v = structOn(id);
    const active = kind === "ex" ? !!v : v === "B" || v === side;
    const dim = layer === "muscles";
    const c = active ? (kind === "ex" ? C.slate : C.amber) : dim ? C.slateTint : C.slateSoft;
    return { c, w: active ? 3.4 : 2, r: active ? 8 : 6, dash: active ? undefined : "3 3" };
  };

  const rows = layer === "muscles" ? regionsOfView(view) : structuresOfView(view);
  const tapRow = (id) => (layer === "muscles" ? onTap(id, kind === "sy" ? "L" : null) : onTapStruct(id, kind === "sy" ? "L" : null));

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(22,36,31,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 12, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={kind === "ex" ? "Valitse kohdealueet" : "Valitse sijainti"}
        style={{ background: C.surface, borderRadius: 18, width: "100%", maxWidth: 520, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 8px" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.inkFaint, fontWeight: 700 }}>
              {kind === "ex" ? "Kohdealueet" : "Oireen sijainti"}
            </div>
            <h2 style={{ margin: "2px 0 0", fontSize: 17, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</h2>
          </div>
          <IconBtn label="Sulje" onClick={onClose}><X size={18} /></IconBtn>
        </div>

        <div style={{ padding: "0 16px 16px", overflowY: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, background: C.surfaceSoft, border: `1px solid ${C.line}`, borderRadius: 11, padding: 4, marginBottom: 8 }}>
            {[["muscles", "Lihakset"], ["structures", "Hermot & nivelet"]].map(([id, label]) => (
              <button key={id} className="tap" onClick={() => setLayer(id)}
                style={{ padding: "8px 0", borderRadius: 8, fontSize: 13, fontWeight: 600, color: layer === id ? "#fff" : C.inkSoft, background: layer === id ? (id === "muscles" ? C.pine : C.slate) : "transparent" }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: C.inkSoft, margin: "0 2px 10px", lineHeight: 1.5 }}>
            {layer === "muscles"
              ? kind === "ex"
                ? "Napauta aluetta: pää → sivu → kevyt → pois. Sama liike voi kuormittaa useaa ryhmää eri voimakkuudella."
                : "Napauta puolta, jossa vaiva tuntuu. V = vasen, O = oikea."
              : kind === "ex"
              ? "Valitse mobilisoitavat hermot ja nivelet. Nämä eivät tuota lihaskuormaa, vaan kirjautuvat altistuksena."
              : "Säteilevä tai puutuva oire kannattaa kiinnittää hermoon, ei lihakseen. Nivelvaiva niveleen."}
          </div>
          <ViewToggle view={view} setView={setView} />
          <div style={{ marginTop: 8 }}>
            <BodyMap
              view={view}
              fillOf={fillOf}
              strokeOf={strokeOf}
              onTap={layer === "muscles" ? onTap : undefined}
              structures={{ show: true, styleOf: structStyle, onTap: layer === "structures" ? onTapStruct : undefined }}
            />
          </div>

          {/* precise list for this view + layer */}
          <div style={{ marginTop: 6, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
            {rows.length === 0 && <Empty>Ei kohteita tässä näkymässä.</Empty>}
            {rows.map((r, i) => {
              const v = layer === "muscles" ? valueMap[r.id] : structOn(r.id);
              const activeBg = layer === "muscles" ? (kind === "ex" ? C.pineTint : C.amberTint) : kind === "ex" ? C.slateTint : C.amberTint;
              const activeCol = layer === "muscles" ? (kind === "ex" ? C.pineDeep : C.amber) : kind === "ex" ? C.slate : C.amber;
              return (
                <button key={r.id} className="tap" onClick={() => tapRow(r.id)}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "10px 12px", borderTop: i === 0 ? "none" : `1px solid ${C.line}`, background: v ? activeBg : C.surface }}>
                  <span style={{ flex: 1, fontSize: 13.5, color: C.ink }}>
                    {r.name}
                    {layer === "structures" && <span style={{ color: C.inkFaint }}> · {r.kind === "nerve" ? "hermo" : "nivel"}</span>}
                  </span>
                  {v ? (
                    <span style={{ fontSize: 12, fontWeight: 700, color: activeCol }}>
                      {layer === "muscles"
                        ? kind === "ex"
                          ? INTENSITY[v].label
                          : SIDES[v]
                        : kind === "ex"
                        ? "valittu"
                        : SIDES[v]}
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: C.inkFaint }}>—</span>
                  )}
                </button>
              );
            })}
          </div>
          {kind === "sy" && (
            <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 8, lineHeight: 1.45 }}>
              Listasta napautus säätää vasenta puolta; oikean puolen saat kehokuvasta.
            </div>
          )}
          <button className="tap" onClick={onClose}
            style={{ width: "100%", marginTop: 12, padding: "12px", borderRadius: 12, background: C.pine, color: "#fff", fontSize: 15, fontWeight: 600 }}>
            Valmis
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- load distribution over a date range ---- */
export function BodyLoadSection({ rangeDays, prevDays, logs, exercises, symptoms, rangeLabel, allowDelta }) {
  const [view, setView] = useState("back");
  const [typeFilter, setTypeFilter] = useState("all");
  const [mode, setMode] = useState("dist"); // dist | delta
  const [layer, setLayer] = useState("all"); // muscles | structures | all
  const [overlay, setOverlay] = useState(true);
  const [sel, setSel] = useState(null); // { t:'m'|'s', id }

  const exOf = useMemo(() => {
    const m = {};
    exercises.forEach((e) => (m[e.id] = e));
    return m;
  }, [exercises]);

  /* load per region = Σ (completed sets × intensity weight);
     exposure per structure = Σ sets (unweighted) + day count */
  const computeLoad = useCallback(
    (days) => {
      const out = {};
      const byEx = {};
      const exp = {};
      const expDays = {};
      const expByEx = {};
      days.forEach((d) => {
        const l = logs[keyOf(d)];
        if (!l) return;
        /* endurance is measured in MET-minutes, not sets — never summed with
           strength work; only shown when the endurance filter is selected */
        if (typeFilter === "endurance" && l.mins) {
          Object.keys(l.mins).forEach((exId) => {
            const ex = exOf[exId];
            if (!ex || !isMin(ex)) return;
            const mm = (l.mins[exId] || 0) * (ex.met || 1);
            if (mm <= 0) return;
            Object.keys(ex.muscles || {}).forEach((rid) => {
              const w = INTENSITY[ex.muscles[rid]].w;
              out[rid] = (out[rid] || 0) + mm * w;
              byEx[rid] = byEx[rid] || {};
              byEx[rid][exId] = (byEx[rid][exId] || 0) + mm * w;
            });
            (ex.structures || []).forEach((sid) => {
              exp[sid] = (exp[sid] || 0) + (l.mins[exId] || 0);
              expByEx[sid] = expByEx[sid] || {};
              expByEx[sid][exId] = (expByEx[sid][exId] || 0) + (l.mins[exId] || 0);
            });
          });
        }
        if (!l.sets) return;
        const seenToday = new Set();
        Object.keys(l.sets).forEach((exId) => {
          const ex = exOf[exId];
          if (!ex || isMin(ex)) return;
          if (typeFilter !== "all" && (ex.type || "strength") !== typeFilter) return;
          const sets = l.sets[exId] || 0;
          if (sets <= 0) return;
          Object.keys(ex.muscles || {}).forEach((rid) => {
            const w = INTENSITY[ex.muscles[rid]].w;
            out[rid] = (out[rid] || 0) + sets * w;
            byEx[rid] = byEx[rid] || {};
            byEx[rid][exId] = (byEx[rid][exId] || 0) + sets * w;
          });
          (ex.structures || []).forEach((sid) => {
            exp[sid] = (exp[sid] || 0) + sets;
            expByEx[sid] = expByEx[sid] || {};
            expByEx[sid][exId] = (expByEx[sid][exId] || 0) + sets;
            if (!seenToday.has(sid)) {
              seenToday.add(sid);
              expDays[sid] = (expDays[sid] || 0) + 1;
            }
          });
        });
      });
      return { out, byEx, exp, expDays, expByEx };
    },
    [logs, exOf, typeFilter]
  );

  const cur = useMemo(() => computeLoad(rangeDays), [computeLoad, rangeDays]);
  const prev = useMemo(() => (mode === "delta" && prevDays ? computeLoad(prevDays) : null), [computeLoad, prevDays, mode]);
  const maxLoad = useMemo(() => Math.max(0, ...Object.values(cur.out)), [cur]);

  /* regions no active exercise targets at all (programme blind spots) */
  const mappedIds = useMemo(() => {
    const s = new Set();
    exercises.forEach((e) => {
      if (e.archived) return;
      if (typeFilter !== "all" && (e.type || "strength") !== typeFilter) return;
      if (isMin(e) && typeFilter !== "endurance") return;
      Object.keys(e.muscles || {}).forEach((id) => s.add(id));
    });
    return s;
  }, [exercises, typeFilter]);
  const hatchIds = useMemo(() => {
    const s = new Set();
    REGIONS.forEach((r) => {
      if (!mappedIds.has(r.id)) s.add(r.id);
    });
    return s;
  }, [mappedIds]);

  /* symptom days per region+side */
  const symLoad = useMemo(() => {
    const out = {};
    rangeDays.forEach((d) => {
      const l = logs[keyOf(d)];
      if (!l || !l.flared || !l.flared.length) return;
      l.flared.forEach((sid) => {
        const sy = symptoms.find((s) => s.id === sid);
        if (!sy) return;
        const sev = (l.severity && l.severity[sid]) || 2;
        const add = (map, id, side) => {
          const keys = side === "B" ? [`${id}|L`, `${id}|R`] : [`${id}|${side}`];
          keys.forEach((k) => (map[k] = (map[k] || 0) + sev));
        };
        Object.keys(sy.regions || {}).forEach((rid) => add(out, rid, sy.regions[rid]));
        Object.keys(sy.structures || {}).forEach((stid) => add(out, stid, sy.structures[stid]));
      });
    });
    return out;
  }, [rangeDays, logs, symptoms]);
  const maxSym = useMemo(() => Math.max(0, ...Object.values(symLoad)), [symLoad]);
  const maxExp = useMemo(() => Math.max(0, ...Object.values(cur.exp)), [cur]);

  /* structures deliberately use a neutral scale: with nerves, more is not better */
  const structStyle = (id, side) => {
    if (layer === "muscles") return null;
    const e = cur.exp[id] || 0;
    const symV = side ? symLoad[`${id}|${side}`] || 0 : (symLoad[`${id}|L`] || 0) + (symLoad[`${id}|R`] || 0);
    const sym = overlay && symV > 0;
    const t = maxExp > 0 ? e / maxExp : 0;
    const c = sym ? C.amber : e > 0 ? mixHex(C.slateSoft, C.slate, t) : C.slateTint;
    return { c, w: e > 0 ? 2 + 2.6 * t : 1.6, r: e > 0 ? 6 + 3 * t : 5.5, dash: e > 0 ? undefined : "3 3" };
  };

  const fillOf = (id) => {
    if (layer === "structures") return C.surfaceSoft;
    if (mode === "delta" && prev) {
      const a = prev.out[id] || 0;
      const b = cur.out[id] || 0;
      if (a === 0 && b === 0) return C.surface;
      const denom = Math.max(a, b);
      const rel = (b - a) / denom; // -1..1
      if (Math.abs(rel) < 0.05) return C.surfaceSoft;
      return rel > 0 ? mixHex(C.pineTint, C.pineDeep, Math.min(1, rel)) : mixHex(C.amberTint, C.amber, Math.min(1, -rel));
    }
    const v = cur.out[id] || 0;
    if (v <= 0) return C.surface;
    return mixHex(C.pineTint, C.pineDeep, maxLoad > 0 ? v / maxLoad : 0);
  };
  const strokeOf = (id, side) => {
    if (!overlay || layer === "structures") return null;
    const v = side ? symLoad[`${id}|${side}`] || 0 : (symLoad[`${id}|L`] || 0) + (symLoad[`${id}|R`] || 0);
    if (v <= 0) return null;
    return { c: C.amber, w: 1.5 + 2 * (maxSym > 0 ? v / maxSym : 0) };
  };

  const selInfo = useMemo(() => {
    if (!sel) return null;
    const isM = sel.t === "m";
    const id = sel.id;
    const symNames = symptoms
      .filter((s) => (isM ? (s.regions || {})[id] : (s.structures || {})[id]))
      .map((s) => `${s.name} (${SIDES[isM ? s.regions[id] : s.structures[id]]})`);
    const symDays = (symLoad[`${id}|L`] || 0) + (symLoad[`${id}|R`] || 0);
    if (isM) {
      const load = cur.out[id] || 0;
      const contrib = Object.keys(cur.byEx[id] || {})
        .map((exId) => ({ name: exOf[exId] ? exOf[exId].name : "—", type: exOf[exId] ? typeLabel(exOf[exId].type) : "", v: cur.byEx[id][exId] }))
        .sort((a, b) => b.v - a.v);
      const share = maxLoad > 0 ? Math.round((load / maxLoad) * 100) : 0;
      return { isM, name: regionName(id), metric: `Kuormitus ${Math.round(load * 10) / 10} yks · ${share} % kuormittuneimmasta${mappedIds.has(id) ? "" : " · ei yhtään liikettä kohdistu tähän"}`, contrib, symNames, symDays };
    }
    const e = cur.exp[id] || 0;
    const days = cur.expDays[id] || 0;
    const st = STRUCT_BY_ID[id];
    const contrib = Object.keys(cur.expByEx[id] || {})
      .map((exId) => ({ name: exOf[exId] ? exOf[exId].name : "—", type: exOf[exId] ? typeLabel(exOf[exId].type) : "", v: cur.expByEx[id][exId] }))
      .sort((a, b) => b.v - a.v);
    return {
      isM,
      name: `${structName(id)} · ${st && st.kind === "nerve" ? "hermo" : "nivel"}`,
      metric: e > 0 ? `Altistus ${e} sarjaa · ${days} päivänä` : "Ei mobilisointia tällä välillä",
      contrib,
      symNames,
      symDays,
    };
  }, [sel, cur, exOf, symptoms, symLoad, maxLoad, mappedIds]);

  const chip = (active, label, onClick) => (
    <button key={label} className="tap" onClick={onClick}
      style={{ fontSize: 12, fontWeight: 600, padding: "6px 11px", borderRadius: 999, border: `1px solid ${active ? C.pine : C.line}`, background: active ? C.pine : C.surface, color: active ? "#fff" : C.inkSoft }}>
      {label}
    </button>
  );

  return (
    <>
      <SectionLabel>Kehokartta</SectionLabel>
      <div style={{ fontSize: 12.5, color: C.inkSoft, margin: "-4px 2px 8px", lineHeight: 1.5 }}>
        {typeFilter === "endurance"
          ? `Kestävyys (${rangeLabel}) omalla asteikollaan: MET-minuutit × painotus. Ei summata voimaharjoittelun kanssa, koska yksiköt eivät ole yhteismitallisia.`
          : `Kuormitus lihasryhmittäin (${rangeLabel}) = kuitatut sarjat × painotus (pää 1,0 / sivu 0,6 / kevyt 0,3). Viivoitus = mikään liike ei kohdistu tähän. Kestävyys näkyy omalla suodattimellaan.`}
      </div>
      <Card>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
          {chip(layer === "muscles", "Lihakset", () => setLayer("muscles"))}
          {chip(layer === "structures", "Hermot & nivelet", () => setLayer("structures"))}
          {chip(layer === "all", "Kaikki", () => setLayer("all"))}
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
          {chip(typeFilter === "all", "Kaikki tyypit", () => setTypeFilter("all"))}
          {EX_TYPES.map((t) => chip(typeFilter === t.id, t.label, () => setTypeFilter(t.id)))}
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
          {layer !== "structures" && chip(mode === "dist", "Jakauma", () => setMode("dist"))}
          {layer !== "structures" && allowDelta && chip(mode === "delta", "Muutos", () => setMode("delta"))}
          {chip(overlay, overlay ? "Oireet näkyvissä" : "Oireet piilossa", () => setOverlay((v) => !v))}
        </div>
        <ViewToggle view={view} setView={setView} />
        <div style={{ marginTop: 8 }}>
          <BodyMap
            view={view}
            fillOf={fillOf}
            strokeOf={strokeOf}
            onTap={layer === "structures" ? undefined : (id) => setSel({ t: "m", id })}
            hatchIds={mode === "dist" && layer !== "structures" ? hatchIds : null}
            structures={{ show: layer !== "muscles", styleOf: structStyle, onTap: (id) => setSel({ t: "s", id }) }}
          />
        </div>

        {/* legend */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 11.5, color: C.inkSoft, marginTop: 6 }}>
          {layer !== "structures" && mode === "delta" ? (
            <>
              <LegendSwatch c={C.pineDeep} label="nousi" />
              <LegendSwatch c={C.amber} label="laski" />
              <LegendSwatch c={C.surfaceSoft} label="ennallaan" />
            </>
          ) : layer !== "structures" ? (
            <>
              <LegendSwatch c={C.pineTint} label="vähän" />
              <LegendSwatch c={C.pineDeep} label="paljon" />
              <LegendSwatch c={C.surface} label="ei kuormaa" />
            </>
          ) : null}
          {layer !== "muscles" && <LegendSwatch c={C.surface} border={C.slate} label="mobilisoitu" />}
          {overlay && <LegendSwatch c={C.surface} border={C.amber} label="oire" />}
        </div>
        {layer !== "muscles" && (
          <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 8, lineHeight: 1.45 }}>
            Hermoilla ja nivelillä altistus on neutraali mittari, ei tavoite: enemmän ei ole parempi, ja liika provosoi. Vertaa altistusta oireeseen.
          </div>
        )}

        {selInfo && (
          <div style={{ marginTop: 12, background: C.surfaceSoft, border: `1px solid ${C.line}`, borderRadius: 12, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>{selInfo.name}</span>
              <button className="tap" aria-label="Sulje" onClick={() => setSel(null)} style={{ color: C.inkFaint, display: "flex" }}><X size={15} /></button>
            </div>
            <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 4 }}>{selInfo.metric}</div>
            {selInfo.contrib.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {selInfo.contrib.map((c) => (
                  <div key={c.name} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, padding: "3px 0", color: C.ink }}>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name} <span style={{ color: C.inkFaint }}>· {c.type}</span></span>
                    <span style={{ fontWeight: 600, color: C.inkSoft }}>{Math.round(c.v * 10) / 10}</span>
                  </div>
                ))}
              </div>
            )}
            {selInfo.symNames.length > 0 && (
              <div style={{ fontSize: 12.5, color: C.amber, fontWeight: 600, marginTop: 8 }}>
                Oire tällä kohteella: {selInfo.symNames.join(", ")}
                {selInfo.symDays > 0 ? ` · oirekuorma ${selInfo.symDays}` : " · ei esiintymiä tällä välillä"}
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  );
}

export function LegendSwatch({ c, border, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 12, height: 12, borderRadius: 3, background: c, border: `1.5px solid ${border || C.line}` }} />
      {label}
    </span>
  );
}
