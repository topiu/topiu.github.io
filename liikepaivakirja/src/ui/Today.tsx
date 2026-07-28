/* ui/Today — moved verbatim from liikepaivakirja.jsx (Phase 1 split). */
import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Check, Plus, Minus, X, Zap, HelpCircle } from "lucide-react";
import { QUALITIES, SEVERITY, WD_LONG, addDays, dayDoseOf, doseLabel, goalMinOf, goalOf, isMin } from "../domain";
import { C } from "../styles/tokens";
import { Card, Empty, IconBtn, MiniBtn, SectionLabel } from "./common";

/* ================================================================== */
/*  TODAY                                                              */
/* ================================================================== */
export function TodayView({
  selected,
  setSelected,
  isToday,
  isYesterday,
  exercises,
  symptoms,
  log,
  setExerciseSets,
  setExerciseMins,
  toggleSymptom,
  setSeverity,
  setQuality,
  setSteps,
  onNoteChange,
  commitNote,
  marks,
  addMark,
  removeMark,
}) {
  const doneCount = exercises.filter((e) =>
    isMin(e) ? (log.mins[e.id] || 0) >= goalMinOf(log, e) : (log.sets[e.id] || 0) >= goalOf(log, e)
  ).length;
  const total = exercises.length;

  return (
    <div className="rise">
      {/* Date nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <IconBtn label="Edellinen päivä" onClick={() => setSelected(addDays(selected, -1))}>
          <ChevronLeft size={20} />
        </IconBtn>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            {WD_LONG[selected.getDay()]} {selected.getDate()}.{selected.getMonth() + 1}.
          </div>
          {(isToday || isYesterday) && (
            <div style={{ fontSize: 12, color: C.pineDeep, fontWeight: 600 }}>{isToday ? "tänään" : "eilen"}</div>
          )}
        </div>
        <IconBtn label="Seuraava päivä" disabled={isToday} onClick={() => !isToday && setSelected(addDays(selected, 1))}>
          <ChevronRight size={20} />
        </IconBtn>
      </div>

      {/* Hero ring */}
      <Card style={{ textAlign: "center", paddingTop: 26, paddingBottom: 22 }}>
        <RangeArc done={doneCount} total={total} />
        <div style={{ marginTop: 10, fontSize: 13, color: C.inkSoft }}>
          {total === 0
            ? "Lisää liikkeitä Muokkaa-välilehdeltä"
            : doneCount === total
            ? "Kaikki liikkeet tehty 🌿"
            : `${total - doneCount} liikettä jäljellä`}
        </div>
      </Card>

      {/* Exercises */}
      <SectionLabel>Liikkeet</SectionLabel>
      <Card style={{ padding: 6 }}>
        {exercises.length === 0 && <Empty>Ei liikkeitä vielä.</Empty>}
        {exercises.map((e, i) => (
          <ExerciseRow
            key={e.id}
            ex={e}
            completed={log.sets[e.id] || 0}
            dayGoal={goalOf(log, e)}
            dayDose={dayDoseOf(log, e)}
            minutes={log.mins[e.id] || 0}
            goalMin={goalMinOf(log, e)}
            onSet={(n) => setExerciseSets(e.id, n)}
            onMin={(m) => setExerciseMins(e.id, m)}
            isFirst={i === 0}
          />
        ))}
      </Card>

      {/* Symptoms */}
      <SectionLabel>Oireet</SectionLabel>
      <div style={{ fontSize: 12.5, color: C.inkSoft, margin: "-4px 2px 8px" }}>
        Merkitse, jos jokin vaiva on uusinut tänään.
      </div>
      <Card style={{ padding: 6 }}>
        {symptoms.length === 0 && <Empty>Ei oireita seurannassa.</Empty>}
        {symptoms.map((s, i) => {
          const on = log.flared.includes(s.id);
          return (
            <div key={s.id} style={{ borderTop: i === 0 ? "none" : `1px solid ${C.line}`, background: on ? C.amberTint : "transparent", borderRadius: 11, transition: "background .16s" }}>
              <button className="tap" onClick={() => toggleSymptom(s.id)}
                style={{ display: "flex", alignItems: "center", gap: 13, width: "100%", textAlign: "left", padding: "13px 12px" }}>
                <span style={{ flex: "0 0 auto", width: 26, height: 26, borderRadius: "50%", border: on ? "none" : `2px solid ${C.line}`, background: on ? C.amber : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {on && <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#fff" }} />}
                </span>
                <span style={{ fontSize: 15.5, fontWeight: 500, color: on ? C.amber : C.ink, flex: 1 }}>{s.name}</span>
                <span style={{ fontSize: 13, color: on ? C.amber : C.inkFaint }}>{on ? "uusi" : "ei oiretta"}</span>
              </button>
              {on && (
                <div style={{ padding: "0 12px 13px 51px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12.5, color: C.inkSoft }}>Voimakkuus:</span>
                    {SEVERITY.map((sv) => {
                      const sel = log.severity[s.id] === sv.v;
                      return (
                        <button key={sv.v} className="tap" onClick={() => setSeverity(s.id, sv.v)}
                          style={{ fontSize: 12.5, fontWeight: 600, padding: "5px 11px", borderRadius: 999, border: `1px solid ${sel ? C.amber : C.amberLine}`, background: sel ? C.amber : "transparent", color: sel ? "#fff" : C.amber }}>
                          {sv.label}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
                    <span style={{ fontSize: 12.5, color: C.inkSoft }}>Laatu:</span>
                    {QUALITIES.map((q) => {
                      const sel = log.quality[s.id] === q.id;
                      return (
                        <button key={q.id} className="tap" onClick={() => setQuality(s.id, q.id)}
                          style={{ fontSize: 12.5, fontWeight: 600, padding: "5px 11px", borderRadius: 999, border: `1px solid ${sel ? C.slate : C.line}`, background: sel ? C.slate : "transparent", color: sel ? "#fff" : C.slate }}>
                          {q.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </Card>

      {/* Steps */}
      <SectionLabel>Askeleet</SectionLabel>
      <StepsField key={`s-${log.steps || 0}`} value={log.steps || 0} onCommit={setSteps} />

      {/* Note */}
      <SectionLabel>Muistiinpano</SectionLabel>
      <Card style={{ padding: 4 }}>
        <textarea
          defaultValue={log.note}
          onChange={onNoteChange}
          onBlur={(e) => commitNote(e.target.value)}
          placeholder="Miltä tuntui? Muuta huomioitavaa…"
          rows={3}
          style={{ width: "100%", border: "none", resize: "vertical", background: "transparent", padding: "12px", fontSize: 15, lineHeight: 1.45, color: C.ink, outline: "none" }}
        />
      </Card>

      {/* Milestones */}
      <SectionLabel>Merkkipaalut</SectionLabel>
      <div style={{ fontSize: 12.5, color: C.inkSoft, margin: "-4px 2px 8px" }}>
        Esim. fyssarikäynti, annosmuutos, flunssaviikko — näkyvät trendikäyrällä.
      </div>
      <MarksEditor marks={marks} addMark={addMark} removeMark={removeMark} />
    </div>
  );
}

export function MarksEditor({ marks, addMark, removeMark }) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    if (!draft.trim()) return;
    addMark(draft);
    setDraft("");
  };
  return (
    <Card style={{ padding: 8 }}>
      {marks.map((m, i) => (
        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 4px", borderTop: i === 0 ? "none" : `1px solid ${C.line}` }}>
          <span aria-hidden="true" style={{ flex: "0 0 auto", width: 8, height: 8, borderRadius: 2, transform: "rotate(45deg)", background: C.pineDeep }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: C.ink, lineHeight: 1.4 }}>
            {m.text}
            {m.auto && <span style={{ fontSize: 11, color: C.inkFaint }}> · autom.</span>}
          </span>
          <MiniBtn label="Poista merkkipaalu" danger onClick={() => removeMark(m.id)}>
            <X size={15} />
          </MiniBtn>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: marks.length ? 6 : 0, paddingTop: marks.length ? 8 : 2, borderTop: marks.length ? `1px solid ${C.line}` : "none" }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Lisää merkkipaalu tälle päivälle…"
          style={{ flex: 1, minWidth: 0, border: `1px solid ${C.line}`, borderRadius: 10, background: C.surfaceSoft, fontSize: 14.5, padding: "9px 12px", color: C.ink, outline: "none" }}
        />
        <button className="tap" onClick={submit} aria-label="Lisää merkkipaalu"
          style={{ flex: "0 0 auto", width: 38, height: 38, borderRadius: 10, background: C.pine, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Plus size={18} color="#fff" strokeWidth={2.5} />
        </button>
      </div>
    </Card>
  );
}

/* steps are typed, so writes are debounced to respect the storage rate limit */
export function StepsField({ value, onCommit }) {
  const t = useRef();
  const change = (e) => {
    const v = e.target.value;
    clearTimeout(t.current);
    t.current = setTimeout(() => onCommit(v), 700);
  };
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <Card style={{ padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <input
          defaultValue={value ? String(value) : ""}
          onChange={change}
          onBlur={(e) => {
            clearTimeout(t.current);
            onCommit(e.target.value);
          }}
          inputMode="numeric"
          placeholder="0"
          aria-label="Päivän askeleet"
          style={{ flex: 1, minWidth: 0, border: `1px solid ${C.line}`, borderRadius: 10, background: C.surfaceSoft, fontSize: 17, fontWeight: 600, padding: "10px 12px", color: C.ink, outline: "none", fontVariantNumeric: "tabular-nums" }}
        />
        <span style={{ fontSize: 13, color: C.inkSoft, fontWeight: 600 }}>askelta</span>
      </div>
      <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 8, lineHeight: 1.45 }}>
        Syötä käsin tai tuo Terveys-sovelluksesta Historia-välilehden kautta. Askeleet ovat kontekstitietoa — niitä ei lasketa lihaskuormitukseen, jotta kirjattu kävelylenkki ei tule mukaan kahdesti.
      </div>
    </Card>
  );
}

/* one exercise row with set tracking; supports logging beyond the goal ("overdrive") */
export function ExerciseRow({ ex, completed, dayGoal, dayDose, minutes, goalMin, onSet, onMin, isFirst }) {
  const [showHelp, setShowHelp] = useState(false);
  const minute = isMin(ex);
  const target = minute ? goalMin : dayGoal;
  const done = minute ? minutes : completed;
  const complete = done >= target;
  const over = done > target;
  const label = minute ? doseLabel(ex.dose, "min") : doseLabel(ex.dose);
  const dayLabel = minute ? (dayDose && dayDose.min ? `${dayDose.min} min` : "") : doseLabel(dayDose);
  const stale = done > 0 && dayLabel !== label; // logged under a different dose than the current one
  const hasDesc = ex.desc && ex.desc.trim();

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 13,
        padding: "12px",
        borderRadius: 11,
        background: complete ? C.pineTint : "transparent",
        borderTop: isFirst ? "none" : `1px solid ${C.line}`,
        transition: "background .16s",
      }}
    >
      <button
        className="tap"
        aria-label={complete ? "Merkitse tekemättömäksi" : "Merkitse tehdyksi"}
        onClick={() => (minute ? onMin(complete ? 0 : target) : onSet(complete ? 0 : target))}
        style={{ flex: "0 0 auto", width: 26, height: 26, borderRadius: "50%", border: complete ? "none" : `2px solid ${C.line}`, background: complete ? (over ? C.pineDeep : C.pine) : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "background .16s, border-color .16s" }}
      >
        {complete && (over ? <Zap size={14} color="#fff" strokeWidth={2.5} fill="#fff" /> : <Check size={16} color="#fff" strokeWidth={3} />)}
      </button>

      <button
        className="tap"
        onClick={() => (minute ? onMin(complete && !over ? 0 : target) : onSet(complete && !over ? 0 : target))}
        style={{ flex: 1, minWidth: 0, textAlign: "left", background: "transparent" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 15.5, fontWeight: 500, color: complete ? C.pineDeep : C.ink }}>{ex.name}</span>
          {hasDesc && (
            <span
              role="button"
              tabIndex={0}
              aria-label={`Ohje: ${ex.name}`}
              onClick={(e) => { e.stopPropagation(); setShowHelp((v) => !v); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setShowHelp((v) => !v); } }}
              style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: showHelp ? C.pine : C.inkFaint }}
            >
              <HelpCircle size={16} />
            </span>
          )}
        </div>
        {(label || stale) && (
          <div style={{ fontSize: 12.5, color: C.inkFaint, marginTop: 1 }}>
            {label}
            {stale && <span> · kirjattu annoksella {dayLabel || `${dayGoal} ${dayGoal === 1 ? "sarja" : "sarjaa"}`}</span>}
          </div>
        )}
      </button>

      {minute ? (
        <MinuteTracker target={target} minutes={minutes} onMin={onMin} />
      ) : (
        <SetTracker target={target} completed={completed} onSet={onSet} />
      )}

      {showHelp && hasDesc && (
        <>
          <div onClick={() => setShowHelp(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
          <div role="dialog" aria-label={`Ohje: ${ex.name}`}
            style={{ position: "absolute", zIndex: 21, top: "calc(100% - 4px)", left: 12, right: 12, background: C.ink, color: "#fff", borderRadius: 12, padding: "12px 14px", boxShadow: "0 10px 30px rgba(0,0,0,0.28)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.03em", opacity: 0.7 }}>{ex.name}{label ? ` · ${label}` : ""}</span>
              <button className="tap" aria-label="Sulje ohje" onClick={() => setShowHelp(false)} style={{ color: "#fff", opacity: 0.7, display: "flex" }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{ex.desc}</div>
          </div>
        </>
      )}
    </div>
  );
}

export function MinuteTracker({ target, minutes, onMin }) {
  const over = minutes > target;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto" }}>
      <button className="tap" aria-label="Vähennä 5 min" onClick={() => onMin(Math.max(0, minutes - 5))}
        style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.inkSoft }}>
        <Minus size={16} />
      </button>
      <span style={{ minWidth: 52, textAlign: "center", fontSize: 13.5, fontWeight: 600, color: minutes > 0 ? C.pineDeep : C.inkFaint, fontVariantNumeric: "tabular-nums" }}>
        {minutes}/{target}
        <span style={{ fontSize: 10.5, color: C.inkFaint }}> min</span>
        {over && <Zap size={11} style={{ verticalAlign: "-1px" }} fill={C.pineDeep} color={C.pineDeep} />}
      </span>
      <button className="tap" aria-label="Lisää 5 min" onClick={() => onMin(minutes + 5)}
        style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.pineDeep }}>
        <Plus size={16} />
      </button>
    </div>
  );
}

export function SetTracker({ target, completed, onSet }) {
  const over = Math.max(0, completed - target);
  if (target === 1 && completed <= 1) {
    /* single-set exercise not yet in overdrive: keep the row minimal, just a +-button for extras */
    return (
      <button className="tap" aria-label="Lisää ylimääräinen sarja" onClick={() => onSet(completed + 1)}
        style={{ width: 26, height: 26, flex: "0 0 auto", borderRadius: 8, border: `1px dashed ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.inkFaint }}>
        <Plus size={14} />
      </button>
    );
  }
  if (target <= 6 && completed <= target) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 5, flex: "0 0 auto" }}>
        {Array.from({ length: target }, (_, k) => {
          const filled = k < completed;
          return (
            <button
              key={k}
              className="tap"
              aria-label={`Sarja ${k + 1}`}
              onClick={() => onSet(completed === k + 1 ? k : k + 1)}
              style={{ width: 22, height: 22, borderRadius: "50%", border: filled ? "none" : `2px solid ${C.line}`, background: filled ? C.pine : "transparent", transition: "background .14s" }}
            />
          );
        })}
        {completed >= target && (
          <button className="tap" aria-label="Lisää ylimääräinen sarja" onClick={() => onSet(completed + 1)}
            style={{ width: 22, height: 22, borderRadius: "50%", border: `1.5px dashed ${C.pine}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.pineDeep }}>
            <Plus size={12} strokeWidth={3} />
          </button>
        )}
      </div>
    );
  }
  /* stepper: large goals, or any overdrive state */
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
      <button className="tap" aria-label="Vähennä" onClick={() => onSet(Math.max(0, completed - 1))}
        style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.inkSoft }}>
        <Minus size={16} />
      </button>
      <span style={{ minWidth: 40, textAlign: "center", fontSize: 14, fontWeight: 600, color: over > 0 ? C.pineDeep : completed > 0 ? C.pineDeep : C.inkFaint, fontVariantNumeric: "tabular-nums" }}>
        {completed}/{target}
        {over > 0 && <Zap size={12} style={{ verticalAlign: "-1px", marginLeft: 1 }} fill={C.pineDeep} color={C.pineDeep} />}
      </span>
      <button className="tap" aria-label="Lisää" onClick={() => onSet(completed + 1)}
        style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.pineDeep }}>
        <Plus size={16} />
      </button>
    </div>
  );
}

/* ================================================================== */
/*  RANGE-OF-MOTION RING (signature)                                   */
/* ================================================================== */
export function RangeArc({ done, total, size = 176 }) {
  const stroke = 13;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const gap = 0.3;
  const trackLen = (1 - gap) * circ;
  const frac = total > 0 ? Math.min(done / total, 1) : 0;
  const fillLen = frac * trackLen;
  const rotation = 90 + (gap * 360) / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${done} / ${total} liikettä valmiina`}>
      <g transform={`rotate(${rotation} ${cx} ${cy})`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.pineSoft} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${trackLen} ${circ}`} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.pine} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${fillLen} ${circ}`} style={{ transition: "stroke-dasharray .55s cubic-bezier(.22,.61,.36,1)" }} />
      </g>
      <text x={cx} y={cy - 4} textAnchor="middle" style={{ fontSize: 46, fontWeight: 300, fill: done > 0 ? C.pineDeep : C.inkFaint, fontVariantNumeric: "tabular-nums" }}>
        {done}
      </text>
      <text x={cx} y={cy + 22} textAnchor="middle" style={{ fontSize: 14, fontWeight: 600, fill: C.inkSoft }}>
        / {total} liikettä
      </text>
    </svg>
  );
}
