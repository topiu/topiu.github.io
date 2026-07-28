/* ui/Edit — moved verbatim from liikepaivakirja.jsx (Phase 1 split). */
import { useState, useRef } from "react";
import { ChevronRight, X, ArrowUp, ArrowDown, Archive, ArchiveRestore, BookOpen } from "lucide-react";
import { EX_TYPES, SIDES, doseLabel, isMin, regionName, structName } from "../domain";
import { C } from "../styles/tokens";
import { RegionPicker } from "./BodyMap";
import { LibraryModal, SourceBadge } from "./Library";
import { AddRow, Card, MiniBtn, NumField, ResetBtn, SectionLabel } from "./common";

/* ================================================================== */
/*  EDIT                                                               */
/* ================================================================== */
export function EditView({ exercises, symptoms, renameItem, setDose, setDesc, setExType, cycleExMuscle, toggleSymRegion, toggleExStructure, toggleSymStructure, addItem, removeItem, moveItem, resetList, archiveItem, addFromLibrary, logDoseChange }) {
  const [exDraft, setExDraft] = useState("");
  const [syDraft, setSyDraft] = useState("");
  const [picker, setPicker] = useState(null); // { kind:'ex'|'sy', id }
  const [libOpen, setLibOpen] = useState(false);
  /* snapshot dose label when a dose field gains focus; compare on blur */
  const doseSnap = useRef({});
  const exercisesRef = useRef(exercises);
  exercisesRef.current = exercises;
  const onDoseFocus = (id) => {
    if (doseSnap.current[id] === undefined) {
      const ex = exercisesRef.current.find((e) => e.id === id);
      doseSnap.current[id] = ex ? doseLabel(ex.dose) : "";
    }
  };
  const onDoseBlur = (id) => {
    // wait a tick: focus may move between fields of the same exercise
    setTimeout(() => {
      const active = document.activeElement;
      if (active && active.dataset && active.dataset.doseEx === id) return;
      const before = doseSnap.current[id];
      if (before === undefined) return;
      delete doseSnap.current[id];
      const ex = exercisesRef.current.find((e) => e.id === id);
      if (!ex) return;
      logDoseChange(ex.name, before, doseLabel(ex.dose));
    }, 120);
  };

  return (
    <div className="rise">
      {/* Exercises */}
      <SectionLabel>Liikkeet</SectionLabel>
      <div style={{ fontSize: 12.5, color: C.inkSoft, margin: "-4px 2px 8px", lineHeight: 1.5 }}>
        Toistoluokka: <b>Sarjat</b> = montako kertaa (kuitattava määrä), <b>Toistot</b> = toistoa/kerta, <b>Pito</b> = sekunteina. Esim. 2 × 5 → Sarjat 2, Toistot 5. 10 × 10 s pito → Sarjat 10, Pito 10.
      </div>
      <button className="tap" onClick={() => setLibOpen(true)}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", marginBottom: 10, padding: "12px", borderRadius: 13, border: `1px solid ${C.pine}`, background: C.surface, color: C.pineDeep, fontSize: 15, fontWeight: 600 }}>
        <BookOpen size={17} /> Lisää kirjastosta
      </button>
      <Card style={{ padding: 8 }}>
        {exercises.filter((e) => !e.archived).map((e, i) => (
          <div key={e.id} style={{ background: C.surfaceSoft, border: `1px solid ${C.line}`, borderRadius: 12, padding: 10, marginTop: i === 0 ? 0 : 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input value={e.name} onChange={(ev) => renameItem("ex", e.id, ev.target.value)} aria-label="Liikkeen nimi"
                style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", fontSize: 15, fontWeight: 600, padding: "6px 4px", color: C.ink, outline: "none" }} />
              <MiniBtn label="Ylös" disabled={i === 0} onClick={() => moveItem("ex", e.id, -1)}><ArrowUp size={16} /></MiniBtn>
              <MiniBtn label="Alas" onClick={() => moveItem("ex", e.id, 1)}><ArrowDown size={16} /></MiniBtn>
              <MiniBtn label="Arkistoi" onClick={() => archiveItem("ex", e.id, true)}><Archive size={16} /></MiniBtn>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {isMin(e) && (
                <>
                  <NumField label="Minuutit" value={e.dose.min} placeholder="–" onChange={(v) => setDose(e.id, "min", v)} exId={e.id} onDoseFocus={onDoseFocus} onDoseBlur={onDoseBlur} />
                  <span style={{ paddingBottom: 9, fontSize: 12.5, color: C.inkFaint }}>MET {e.met || "–"}</span>
                </>
              )}
              {!isMin(e) && <NumField label="Sarjat" value={e.dose.sets} placeholder="–" onChange={(v) => setDose(e.id, "sets", v)} exId={e.id} onDoseFocus={onDoseFocus} onDoseBlur={onDoseBlur} />}
              {!isMin(e) && <span style={{ paddingBottom: 9, color: C.inkFaint, fontSize: 15 }}>×</span>}
              {!isMin(e) && <NumField label="Toistot" value={e.dose.reps} placeholder="–" onChange={(v) => setDose(e.id, "reps", v)} exId={e.id} onDoseFocus={onDoseFocus} onDoseBlur={onDoseBlur} />}
              {!isMin(e) && <NumField label="Pito (s)" value={e.dose.hold} placeholder="–" onChange={(v) => setDose(e.id, "hold", v)} exId={e.id} onDoseFocus={onDoseFocus} onDoseBlur={onDoseBlur} />}
              <span style={{ paddingBottom: 9, marginLeft: "auto", fontSize: 13, fontWeight: 600, color: doseLabel(e.dose, e.unit) ? C.pineDeep : C.inkFaint }}>
                {doseLabel(e.dose, e.unit) || "ei annosta"}
              </span>
            </div>
            <textarea
              value={e.desc || ""}
              onChange={(ev) => setDesc(e.id, ev.target.value)}
              placeholder="Suoritusohje (valinnainen) — näkyy Tänään-näkymässä ?-pallosta…"
              rows={2}
              style={{ width: "100%", marginTop: 8, border: `1px solid ${C.line}`, borderRadius: 9, background: C.surface, resize: "vertical", padding: "9px 10px", fontSize: 13.5, lineHeight: 1.45, color: C.ink, outline: "none" }}
            />
            <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
              {EX_TYPES.map((t) => {
                const sel = (e.type || "strength") === t.id;
                return (
                  <button key={t.id} className="tap" onClick={() => setExType(e.id, t.id)}
                    style={{ fontSize: 12, fontWeight: 600, padding: "5px 10px", borderRadius: 999, border: `1px solid ${sel ? C.pine : C.line}`, background: sel ? C.pine : C.surface, color: sel ? "#fff" : C.inkSoft }}>
                    {t.label}
                  </button>
                );
              })}
            </div>
            <button className="tap" onClick={() => setPicker({ kind: "ex", id: e.id })}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", marginTop: 8, padding: "9px 10px", borderRadius: 9, border: `1px solid ${C.line}`, background: C.surface, textAlign: "left" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.inkSoft }}>Kohdealueet</span>
              <span style={{ flex: 1, fontSize: 12.5, color: Object.keys(e.muscles || {}).length || (e.structures || []).length ? C.pineDeep : C.inkFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {[
                  ...Object.keys(e.muscles || {})
                    .sort((a, b) => e.muscles[a] - e.muscles[b])
                    .map((id) => regionName(id)),
                  ...(e.structures || []).map((id) => structName(id)),
                ].join(", ") || "ei valintoja"}
              </span>
              <ChevronRight size={15} style={{ color: C.inkFaint }} />
            </button>
            {e.source && <SourceBadge source={e.source} />}
          </div>
        ))}
        <AddRow value={exDraft} setValue={setExDraft} placeholder="Lisää liike…" onAdd={() => { addItem("ex", exDraft); setExDraft(""); }} />
      </Card>
      <ArchivedList which="ex" items={exercises.filter((e) => e.archived)} restore={archiveItem} remove={removeItem} />
      <ResetBtn onClick={() => resetList("ex")} />

      <div style={{ height: 10 }} />

      {/* Symptoms */}
      <SectionLabel>Oireet</SectionLabel>
      <Card style={{ padding: 8 }}>
        {symptoms.filter((s) => !s.archived).map((s, i) => (
          <div key={s.id} style={{ padding: "6px 2px", borderTop: i === 0 ? "none" : `1px solid ${C.line}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input value={s.name} onChange={(ev) => renameItem("sy", s.id, ev.target.value)} aria-label="Oireen nimi"
                style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", fontSize: 15, fontWeight: 500, padding: "8px 6px", color: C.ink, outline: "none" }} />
              <MiniBtn label="Ylös" disabled={i === 0} onClick={() => moveItem("sy", s.id, -1)}><ArrowUp size={16} /></MiniBtn>
              <MiniBtn label="Alas" onClick={() => moveItem("sy", s.id, 1)}><ArrowDown size={16} /></MiniBtn>
              <MiniBtn label="Arkistoi" onClick={() => archiveItem("sy", s.id, true)}><Archive size={16} /></MiniBtn>
            </div>
            <button className="tap" onClick={() => setPicker({ kind: "sy", id: s.id })}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", marginTop: 2, marginBottom: 4, padding: "8px 8px", borderRadius: 9, border: `1px solid ${C.line}`, background: C.surfaceSoft, textAlign: "left" }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.inkSoft }}>Sijainti</span>
              <span style={{ flex: 1, fontSize: 12.5, color: Object.keys(s.regions || {}).length || Object.keys(s.structures || {}).length ? C.amber : C.inkFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {[
                  ...Object.keys(s.regions || {}).map((id) => `${regionName(id)} (${SIDES[s.regions[id]]})`),
                  ...Object.keys(s.structures || {}).map((id) => `${structName(id)} (${SIDES[s.structures[id]]})`),
                ].join(", ") || "ei valintoja"}
              </span>
              <ChevronRight size={15} style={{ color: C.inkFaint }} />
            </button>
          </div>
        ))}
        <AddRow value={syDraft} setValue={setSyDraft} placeholder="Lisää oire…" onAdd={() => { addItem("sy", syDraft); setSyDraft(""); }} />
      </Card>
      <ArchivedList which="sy" items={symptoms.filter((s) => s.archived)} restore={archiveItem} remove={removeItem} />
      <ResetBtn onClick={() => resetList("sy")} />

      {libOpen && <LibraryModal existing={exercises} onAdd={addFromLibrary} onClose={() => setLibOpen(false)} />}
      {picker && picker.kind === "ex" && (() => {
        const ex = exercises.find((x) => x.id === picker.id);
        if (!ex) return null;
        return (
          <RegionPicker
            kind="ex"
            title={ex.name}
            valueMap={ex.muscles || {}}
            structMap={ex.structures || []}
            onTap={(regionId) => cycleExMuscle(ex.id, regionId)}
            onTapStruct={(structId) => toggleExStructure(ex.id, structId)}
            onClose={() => setPicker(null)}
          />
        );
      })()}
      {picker && picker.kind === "sy" && (() => {
        const sy = symptoms.find((x) => x.id === picker.id);
        if (!sy) return null;
        return (
          <RegionPicker
            kind="sy"
            title={sy.name}
            valueMap={sy.regions || {}}
            structMap={sy.structures || {}}
            onTap={(regionId, side) => toggleSymRegion(sy.id, regionId, side)}
            onTapStruct={(structId, side) => toggleSymStructure(sy.id, structId, side)}
            onClose={() => setPicker(null)}
          />
        );
      })()}
    </div>
  );
}

/* archived items: hidden from daily use, history preserved; restore or delete permanently */
export function ArchivedList({ which, items, restore, remove }) {
  if (!items.length) return null;
  return (
    <>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.inkFaint, fontWeight: 700, margin: "10px 2px 6px" }}>
        Arkistoidut ({items.length})
      </div>
      <Card style={{ padding: 8, background: C.surfaceSoft }}>
        {items.map((it, i) => (
          <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 2px", borderTop: i === 0 ? "none" : `1px solid ${C.line}` }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, color: C.inkSoft, padding: "2px 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {it.name}
              {which === "ex" && doseLabel(it.dose) && <span style={{ color: C.inkFaint }}> · {doseLabel(it.dose)}</span>}
            </span>
            <MiniBtn label="Palauta käyttöön" onClick={() => restore(which, it.id, false)}><ArchiveRestore size={16} /></MiniBtn>
            <MiniBtn label="Poista pysyvästi" danger onClick={() => remove(which, it.id)}><X size={16} /></MiniBtn>
          </div>
        ))}
        <div style={{ fontSize: 11.5, color: C.inkFaint, padding: "8px 6px 2px", lineHeight: 1.4 }}>
          Arkistoidut eivät näy Tänään-listalla, mutta historia ja porautumiset säilyvät. Poisto on pysyvä.
        </div>
      </Card>
    </>
  );
}
