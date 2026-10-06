/* ui/Today — moved verbatim from liikepaivakirja.jsx (Phase 1 split). */
import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Check, CheckCheck, Dumbbell, Plus, Minus, X, Zap, HelpCircle, RotateCcw } from "lucide-react";
import { FREQ_DAILY, PAIN_MAX, QUALITIES, SEVERITY, WD_LONG, addDays, askMorning, dayDoseOf, doseLabel, freqOf, goalMinOf, goalOf, isCompleteOn, isMin, weekProgress } from "../domain";
import { PsfsCard } from "./Psfs";
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
  setSymptomLevel,
  clearSymptom,
  setQuality,
  onStepsChange,
  commitSteps,
  onNoteChange,
  commitNote,
  marks,
  addMark,
  removeMark,
  psfs,
  dateKey,
  todayKey,
  psfsScore,
  psfsAdd,
  psfsRename,
  psfsRetire,
  psfsForget,
  logs,
  completeProgram,
  openFocus,
  setMorning,
  programUndo,
  undoProgram,
}) {
  const doneCount = exercises.filter((e) => isCompleteOn(log, e)).length;
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

      {/* Exercises. The treenitila entry shares the section label's line, so it
          costs Tänään no vertical space. It opens on the first exercise not yet
          done. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <SectionLabel>Liikkeet</SectionLabel>
        {exercises.length > 0 && openFocus && (
          <button
            className="tap"
            onClick={() => {
              const next = exercises.find((e) => !isCompleteOn(log, e)) || exercises[0];
              openFocus(next.id);
            }}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, margin: "0 2px 9px", padding: "6px 12px", borderRadius: 999, border: `1px solid ${C.pine}`, background: C.surface, color: C.pineDeep, fontSize: 13, fontWeight: 600 }}>
            <Dumbbell size={15} /> Treenitila
          </button>
        )}
      </div>
      <ProgramButton
        exercises={exercises}
        logs={logs}
        log={log}
        dateKey={dateKey}
        onComplete={completeProgram}
        undo={programUndo && programUndo.key === dateKey ? programUndo : null}
        onUndo={undoProgram}
      />
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
            week={freqOf(e) < FREQ_DAILY ? weekProgress(logs, e, dateKey) : null}
          />
        ))}
      </Card>

      {/* Next-morning pain: only on a morning after training (or once answered) */}
      {setMorning && askMorning(logs, dateKey) && (
        <MorningPain value={log.morning} onSet={setMorning} />
      )}

      {/* Symptoms */}
      <SectionLabel>Oireet</SectionLabel>
      <div style={{ fontSize: 12.5, color: C.inkSoft, margin: "-4px 2px 8px" }}>
        Napauta voimakkuutta, jos jokin vaiva on uusinut tänään. Sama napautus uudelleen poistaa
        merkinnän.
      </div>
      <Card style={{ padding: 6 }}>
        {symptoms.length === 0 && <Empty>Ei oireita seurannassa.</Empty>}
        {symptoms.map((s, i) => {
          const on = log.flared.includes(s.id);
          const lvl = log.severity[s.id];
          return (
            <div key={s.id} style={{ borderTop: i === 0 ? "none" : `1px solid ${C.line}`, background: on ? C.amberTint : "transparent", borderRadius: 11, transition: "background .16s" }}>
              {/* Name and levels on one row. The row wraps rather than truncating
                  on a narrow screen: "kohtalainen" is a long word and a clipped
                  symptom name is worse than a second line. */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, rowGap: 6, flexWrap: "wrap", padding: "9px 10px" }}>
                <span
                  title={s.name}
                  style={{ flex: "1 1 110px", minWidth: 0, fontSize: 15, fontWeight: 500, color: on ? C.amber : C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.name}
                </span>
                <div style={{ flex: "0 0 auto", display: "flex", gap: 3, marginLeft: "auto" }}>
                  {SEVERITY.map((sv) => {
                    const sel = on && lvl === sv.v;
                    return (
                      <button
                        key={sv.v}
                        className="tap"
                        aria-label={`${s.name}: ${sv.label}`}
                        aria-pressed={sel}
                        onClick={() => setSymptomLevel(s.id, sv.v)}
                        style={{ fontSize: 11.5, fontWeight: 600, padding: "6px 8px", borderRadius: 8, border: `1px solid ${sel ? C.amber : C.line}`, background: sel ? C.amber : C.surface, color: sel ? "#fff" : C.inkSoft, transition: "background .14s, color .14s, border-color .14s" }}>
                        {sv.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {on && (
                <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", padding: "0 10px 10px" }}>
                  <span style={{ fontSize: 12, color: C.inkSoft, marginRight: 2 }}>Laatu:</span>
                  {QUALITIES.map((q) => {
                    const sel = log.quality[s.id] === q.id;
                    return (
                      <button
                        key={q.id}
                        className="tap"
                        aria-pressed={sel}
                        onClick={() => setQuality(s.id, q.id)}
                        style={{ fontSize: 12, fontWeight: 600, padding: "5px 10px", borderRadius: 999, border: `1px solid ${sel ? C.slate : C.line}`, background: sel ? C.slate : "transparent", color: sel ? "#fff" : C.slate }}>
                        {q.label}
                      </button>
                    );
                  })}
                  <button
                    className="tap"
                    onClick={() => clearSymptom(s.id)}
                    aria-label={`Poista merkintä: ${s.name}`}
                    style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, padding: "5px 8px", borderRadius: 8, color: C.inkFaint }}>
                    <X size={13} /> Poista
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </Card>

      {/* Function — fortnightly, so it sits below the daily work and stays
          collapsed unless an assessment is actually due */}
      <PsfsCard
        psfs={psfs}
        dateKey={dateKey}
        todayKey={todayKey}
        isToday={isToday}
        setScore={psfsScore}
        addActivity={psfsAdd}
        renameActivity={psfsRename}
        retireActivity={psfsRetire}
        forgetActivity={psfsForget}
      />

      {/* Steps */}
      <SectionLabel>Askeleet</SectionLabel>
      <StepsField value={log.steps || 0} onChange={onStepsChange} onCommit={commitSteps} />

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
        Esim. fyssarikäynti, tavoitemuutos, flunssaviikko — näkyvät trendikäyrällä.
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

/* "Eilisen treenin jälkeen": pain this morning, 0–10, one tap; the same tap
   clears it. Shown only on a morning after a training day. */
function MorningPain({ value, onSet }) {
  return (
    <Card style={{ padding: 12 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>Eilisen treenin jälkeen</div>
      <div style={{ fontSize: 12.5, color: C.inkSoft, margin: "2px 0 9px" }}>Kipu tänä aamuna, 0–{PAIN_MAX}</div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${PAIN_MAX + 1}, 1fr)`, gap: 4 }}>
        {Array.from({ length: PAIN_MAX + 1 }, (_, v) => (
          <button key={v} className="tap" onClick={() => onSet(v)} aria-label={`Aamun kipu ${v}`} aria-pressed={value === v}
            style={{ height: 34, borderRadius: 9, fontSize: 13.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", border: `1px solid ${value === v ? C.amber : C.line}`, background: value === v ? C.amber : C.surface, color: value === v ? "#fff" : C.inkSoft }}>
            {v}
          </button>
        ))}
      </div>
    </Card>
  );
}

/* Steps are typed, so App debounces the write — and owns the pending commit,
   so leaving the day or the tab inside the debounce window cannot drop it. The
   input is controlled from local text and only resyncs from the stored value
   while it is not focused: it used to be keyed on the stored value, which
   remounted it after every save and dismissed the keyboard mid-entry. */
export function StepsField({ value, onChange, onCommit }) {
  const [text, setText] = useState(value ? String(value) : "");
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value ? String(value) : "");
  }, [value]);
  return (
    <Card style={{ padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <input
          value={text}
          onFocus={() => (focused.current = true)}
          onChange={(e) => {
            setText(e.target.value);
            onChange(e.target.value);
          }}
          onBlur={(e) => {
            focused.current = false;
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
export function ExerciseRow({ ex, completed, dayGoal, dayDose, minutes, goalMin, onSet, onMin, isFirst, week }) {
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

  /* Layout: [check] [name + dose] [tracker]. The tracker is as wide as the
     prescription — six set balls are ~160px — so on a phone the name used to be
     squeezed until its longest word and the weekly badge spilled out underneath
     the balls. The row now wraps instead: the name block asks for its natural
     width (capped so it always stays beside the check), and when name and
     tracker do not both fit, the tracker drops to its own line, right-aligned
     like every other tracker. A row that fits stays one line. */
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        columnGap: 13,
        rowGap: 6,
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
        style={{ flex: "1 1 auto", minWidth: 0, maxWidth: "calc(100% - 39px)", textAlign: "left", background: "transparent" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ minWidth: 0, overflowWrap: "anywhere", fontSize: 15.5, fontWeight: 500, color: complete ? C.pineDeep : C.ink }}>{ex.name}</span>
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
        {(label || stale || week) && (
          <div style={{ fontSize: 12.5, color: C.inkFaint, marginTop: 1 }}>
            {label}
            {/* the weekly counter describes the prescription, so it sits with
                the dose rather than competing with the name for width */}
            {week && (
              <span
                title={`Tavoite ${week.target}× viikossa`}
                style={{ display: "inline-block", marginLeft: label ? 7 : 0, fontSize: 11.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", padding: "0 6px", borderRadius: 6, whiteSpace: "nowrap", color: week.met ? C.pineDeep : C.inkSoft, background: week.met ? C.pineTint : C.surfaceSoft, border: `1px solid ${week.met ? C.pineSoft : C.line}` }}>
                {week.done}/{week.target} vk
              </span>
            )}
            {stale && <span> · kirjattu tavoitteella {dayLabel || `${dayGoal} ${dayGoal === 1 ? "sarja" : "sarjaa"}`}</span>}
          </div>
        )}
      </button>

      <div style={{ flex: "0 0 auto", marginLeft: "auto" }}>
        {minute ? (
          <MinuteTracker target={target} minutes={minutes} onMin={onMin} />
        ) : (
          <SetTracker target={target} completed={completed} onSet={onSet} />
        )}
      </div>

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

/* One tap to mark the day's programme done.
 *
 * Deliberately not "same as yesterday". Yesterday may have been a partial day,
 * and copying it forward would turn a missed session into the new normal. The
 * reference is today's prescription.
 *
 * The button disappears when there is nothing left to owe, rather than sitting
 * there greyed out — on the one screen that has to stay fast, a control that
 * does nothing is noise. Exercises whose weekly target is already met are not
 * counted as owed: this exists to remove friction, not to nudge anyone into
 * extra sessions.
 */
function ProgramButton({ exercises, logs, log, dateKey, onComplete, undo, onUndo }) {
  if (undo) {
    return (
      <div
        style={{ display: "flex", alignItems: "center", gap: 10, background: C.pineTint, border: `1px solid ${C.pineSoft}`, borderRadius: 13, padding: "10px 12px", marginBottom: 10 }}>
        <CheckCheck size={17} style={{ flex: "0 0 auto", color: C.pineDeep }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: C.ink }}>
          {undo.filled} {undo.filled === 1 ? "liike" : "liikettä"} merkittiin tehdyksi.
        </span>
        <button
          className="tap"
          onClick={onUndo}
          style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 5, padding: "7px 11px", borderRadius: 9, border: `1px solid ${C.line}`, background: C.surface, color: C.inkSoft, fontSize: 13, fontWeight: 600 }}>
          <RotateCcw size={13} /> Kumoa
        </button>
      </div>
    );
  }

  const owed = exercises.filter((ex) => {
    if (ex.archived) return false;
    if (isCompleteOn(log, ex)) return false;
    if (freqOf(ex) < FREQ_DAILY && weekProgress(logs, ex, dateKey).met) return false;
    return true;
  });
  if (!owed.length) return null;

  return (
    <button
      className="tap"
      onClick={onComplete}
      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", marginBottom: 10, padding: "13px", borderRadius: 13, border: `1px solid ${C.pine}`, background: C.surface, color: C.pineDeep, fontSize: 15, fontWeight: 600 }}>
      <CheckCheck size={18} />
      Merkitse ohjelma tehdyksi
      <span style={{ fontWeight: 500, color: C.inkFaint, fontSize: 13.5 }}>({owed.length})</span>
    </button>
  );
}
