/* ui/Focus — treenitila: one exercise at a time, the whole screen for it.
 *
 * Built for the gym floor: big targets near the thumb, the screen kept awake,
 * a rest countdown that starts by itself after each set, and a hold countdown
 * for hold exercises. Loads are adjusted freely per set with whatever
 * equipment is free today; the starting point is what was done last time with
 * that equipment (domain/gym nextSetDraft), never a suggestion to do more.
 *
 * Presentational like every other view: App owns the log and every write.
 * Swiping left/right moves between exercises; Tänään's day swipe is not
 * involved because this renders outside the day pane.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, X, Timer } from "lucide-react";
import {
  BAND_LEVELS,
  EQUIPMENT,
  EQUIP_BY_ID,
  FREQ_DAILY,
  PAIN_MAX,
  REST_MAX_S,
  REST_MIN_S,
  dayDoseOf,
  doseLabel,
  emptyLog,
  equipLabel,
  fmtClock,
  fmtKg,
  freqLabel,
  freqOf,
  goalMinOf,
  goalOf,
  inferEquipment,
  isCompleteOn,
  isMin,
  lastEquipment,
  lastSession,
  nextSetDraft,
  parseKey,
  setLabel,
  shortDate,
  stepLevel,
  stepLoad,
  swipeResultOf,
  timerLeft,
} from "../domain";
import { holdWakeLock } from "../platform/wakelock";
import { beep, unlockSound } from "../platform/sound";
import { C } from "../styles/tokens";

export function FocusView({ exercises, logs, dateKey, todayKey, startId, restSec, onRestSec, onLogSet, onRemoveSet, onSetMins, onPain, onClose }) {
  const [idx, setIdx] = useState(() => Math.max(0, exercises.findIndex((e) => e.id === startId)));
  const ex = exercises[Math.min(idx, exercises.length - 1)];
  const log = logs[dateKey] || emptyLog();

  /* equipment chosen per exercise for this session: last used, else a guess */
  const [eqById, setEqById] = useState({});
  const eq = ex ? eqById[ex.id] || lastEquipment(logs, ex.id, dateKey) || inferEquipment(ex) : "bw";
  const E = EQUIP_BY_ID[eq] || EQUIP_BY_ID.bw;

  const count = ex ? (log.sets && log.sets[ex.id]) || 0 : 0;
  const detail = ex && log.detail && log.detail[ex.id] ? log.detail[ex.id] : [];
  const dayDose = ex ? dayDoseOf(log, ex) || {} : {};
  const minute = ex && isMin(ex);
  const target = !ex ? 0 : minute ? goalMinOf(log, ex) : goalOf(log, ex);
  const isHold = !minute && !!dayDose.hold && !dayDose.reps;

  /* the next set's values; reset whenever the exercise, equipment or set changes */
  const draftKey = ex ? `${ex.id}|${eq}|${count}` : "";
  const [draft, setDraft] = useState(null);
  const [draftFor, setDraftFor] = useState("");
  if (ex && draftFor !== draftKey) {
    setDraftFor(draftKey);
    setDraft(nextSetDraft({ logs, exId: ex.id, dateKey, eq, dose: dayDose }));
  }
  const d = draft || { reps: null, hold: null, kg: null, lvl: null };

  /* ---- timers: one at a time, rest or hold ---- */
  const [timer, setTimer] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(null);
  const left = timerLeft(timer, now);

  const logSet = (values) => {
    const entry = {
      reps: values.hold ? null : values.reps,
      hold: values.hold || null,
      kg: E.load === "kg" ? values.kg : null,
      lvl: E.load === "level" ? values.lvl : null,
      eq,
    };
    onLogSet(ex.id, entry);
    setTimer({ kind: "rest", endAt: Date.now() + restSec * 1000, total: restSec, exId: ex.id });
    setNow(Date.now());
  };

  useEffect(() => {
    if (!timer) return;
    const iv = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(iv);
  }, [timer]);

  useEffect(() => {
    if (!timer || left > 0 || fired.current === timer) return;
    fired.current = timer;
    beep();
    if (timer.kind === "hold" && ex && timer.exId === ex.id) {
      logSet({ ...d, hold: timer.total });
    } else {
      setTimer(null);
    }
  });

  /* ---- environment: awake screen, no page scroll behind, Escape closes ---- */
  useEffect(() => holdWakeLock(), []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const go = (n) => {
    if (n < 0 || n >= exercises.length) return;
    setIdx(n);
    if (timer && timer.kind === "hold") setTimer(null);
  };

  /* swipe between exercises */
  const touch = useRef(null);
  const onTouchStart = (e) => {
    const t = e.touches && e.touches[0];
    touch.current = t && e.touches.length === 1 ? { x: t.clientX, y: t.clientY, t: Date.now() } : null;
  };
  const onTouchEnd = (e) => {
    const s = touch.current;
    touch.current = null;
    const t = e.changedTouches && e.changedTouches[0];
    if (!s || !t) return;
    const r = swipeResultOf({ dx: t.clientX - s.x, dy: t.clientY - s.y, ms: Date.now() - s.t });
    if (r === "prev") go(idx - 1);
    else if (r === "next") go(idx + 1);
  };

  const last = useMemo(() => (ex ? lastSession(logs, ex.id, dateKey) : null), [logs, ex, dateKey]);

  if (!ex) return null;

  const done = isCompleteOn(log, ex);
  const presc = [minute ? doseLabel(dayDose, "min") : doseLabel(dayDose) || `${target} ${target === 1 ? "sarja" : "sarjaa"}`, freqOf(ex) < FREQ_DAILY ? freqLabel(freqOf(ex)) : ""].filter(Boolean).join(" · ");
  const pain = log.pain ? log.pain[ex.id] : undefined;
  const hasNext = idx < exercises.length - 1;

  return (
    <div
      role="dialog"
      aria-label={`Treenitila: ${ex.name}`}
      data-focus-view=""
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: C.bg, display: "flex", flexDirection: "column", color: C.ink }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "max(12px, env(safe-area-inset-top)) 14px 8px" }}>
        <button className="tap" onClick={onClose} aria-label="Sulje treenitila"
          style={{ width: 42, height: 42, borderRadius: 12, border: `1px solid ${C.line}`, background: C.surface, display: "flex", alignItems: "center", justifyContent: "center", color: C.ink }}>
          <X size={19} />
        </button>
        <div style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 12.5, fontWeight: 700, color: C.inkSoft, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Treenitila{dateKey !== todayKey ? ` · ${shortDate(parseKey(dateKey))}` : ""}
        </div>
        <button className="tap" onClick={() => go(idx - 1)} disabled={idx === 0} aria-label="Edellinen liike"
          style={{ width: 42, height: 42, borderRadius: 12, border: `1px solid ${C.line}`, background: C.surface, display: "flex", alignItems: "center", justifyContent: "center", color: idx === 0 ? C.inkFaint : C.ink, opacity: idx === 0 ? 0.5 : 1 }}>
          <ChevronLeft size={19} />
        </button>
        <span style={{ minWidth: 38, textAlign: "center", fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {idx + 1}/{exercises.length}
        </span>
        <button className="tap" onClick={() => go(idx + 1)} disabled={!hasNext} aria-label="Seuraava liike"
          style={{ width: 42, height: 42, borderRadius: 12, border: `1px solid ${C.line}`, background: C.surface, display: "flex", alignItems: "center", justifyContent: "center", color: !hasNext ? C.inkFaint : C.ink, opacity: !hasNext ? 0.5 : 1 }}>
          <ChevronRight size={19} />
        </button>
      </div>

      {/* progress: one dot per exercise, tap to jump */}
      <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap", padding: "0 16px 6px" }}>
        {exercises.map((e, i) => (
          <button key={e.id} className="tap" onClick={() => go(i)} aria-label={`Liike ${i + 1}: ${e.name}`}
            style={{ width: i === idx ? 18 : 9, height: 9, borderRadius: 999, background: isCompleteOn(log, e) ? C.pine : i === idx ? C.inkSoft : C.line, transition: "width .15s" }} />
        ))}
      </div>

      {/* body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 16px 16px" }}>
        <h2 style={{ margin: "4px 0 2px", fontSize: 25, lineHeight: 1.2, fontWeight: 600, letterSpacing: "-0.01em", overflowWrap: "anywhere", color: done ? C.pineDeep : C.ink }}>
          {ex.name}
        </h2>
        <div style={{ fontSize: 14, color: C.inkSoft }}>Ohje: {presc}</div>
        {last && (
          <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 4, lineHeight: 1.45 }}>
            Viimeksi {shortDate(parseKey(last.date))}: {last.sets.map(setLabel).join(", ")}
            {last.sets[0] && last.sets[0].eq ? ` · ${equipLabel(last.sets[0].eq)}` : ""}
          </div>
        )}
        {ex.desc && ex.desc.trim() && (
          <details style={{ marginTop: 8 }}>
            <summary style={{ fontSize: 13, fontWeight: 600, color: C.pineDeep, cursor: "pointer" }}>Näytä ohje</summary>
            <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", marginTop: 6, color: C.ink }}>{ex.desc}</div>
          </details>
        )}

        {minute ? (
          <MinutePanel minutes={(log.mins && log.mins[ex.id]) || 0} target={target} onSet={(m) => onSetMins(ex.id, m)} />
        ) : (
          <>
            {/* equipment */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
              {EQUIPMENT.map((q) => (
                <button key={q.id} className="tap" onClick={() => setEqById((m) => ({ ...m, [ex.id]: q.id }))} aria-pressed={q.id === eq}
                  style={{ fontSize: 13, fontWeight: 600, padding: "7px 11px", borderRadius: 999, border: `1px solid ${q.id === eq ? C.pine : C.line}`, background: q.id === eq ? C.pine : C.surface, color: q.id === eq ? "#fff" : C.inkSoft }}>
                  {q.label}
                </button>
              ))}
            </div>

            {/* the next set */}
            <div style={{ display: "grid", gridTemplateColumns: E.load === "none" ? "1fr" : "1fr 1fr", gap: 10, marginTop: 14 }}>
              {isHold ? (
                <Stepper label="Pito" unit="s" value={d.hold} onDown={() => setDraft({ ...d, hold: Math.max(5, (d.hold || 30) - 5) })} onUp={() => setDraft({ ...d, hold: (d.hold || 25) + 5 })} />
              ) : (
                <Stepper label="Toistot" value={d.reps} onDown={() => setDraft({ ...d, reps: Math.max(0, (d.reps || 1) - 1) })} onUp={() => setDraft({ ...d, reps: (d.reps || 0) + 1 })} />
              )}
              {E.load === "kg" && (
                <Stepper label={E.id === "db" ? "Paino / käsipaino" : "Paino"} unit="kg" value={d.kg == null ? null : fmtKg(d.kg)}
                  onDown={() => setDraft({ ...d, kg: stepLoad(eq, d.kg, -1) })} onUp={() => setDraft({ ...d, kg: stepLoad(eq, d.kg, 1) })} />
              )}
              {E.load === "level" && (
                <Stepper label="Vastus" value={d.lvl ? BAND_LEVELS[d.lvl - 1] : null} small
                  onDown={() => setDraft({ ...d, lvl: stepLevel(d.lvl, -1) })} onUp={() => setDraft({ ...d, lvl: stepLevel(d.lvl, 1) })} />
              )}
            </div>

            {/* today's sets */}
            <div style={{ marginTop: 14, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: "6px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 0" }}>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.inkSoft }}>Sarjat</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: count >= target ? C.pineDeep : C.ink, fontVariantNumeric: "tabular-nums" }}>{count}/{target}</span>
              </div>
              {detail.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: `1px solid ${C.line}` }}>
                  <span style={{ width: 22, fontSize: 13, color: C.inkFaint, fontVariantNumeric: "tabular-nums" }}>{i + 1}.</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {setLabel(s)}
                    {s.eq && <span style={{ fontSize: 12.5, fontWeight: 500, color: C.inkFaint }}> · {equipLabel(s.eq)}</span>}
                  </span>
                  <button className="tap" onClick={() => onRemoveSet(ex.id, i)} aria-label={`Poista sarja ${i + 1}`}
                    style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: C.inkFaint }}>
                    <X size={15} />
                  </button>
                </div>
              ))}
              {count > detail.length && (
                <div style={{ fontSize: 12.5, color: C.inkFaint, padding: "8px 0", borderTop: `1px solid ${C.line}` }}>
                  {count - detail.length} {count - detail.length === 1 ? "sarja" : "sarjaa"} merkitty Tänään-näkymässä ilman tietoja
                </div>
              )}
              {count === 0 && <div style={{ fontSize: 13, color: C.inkFaint, padding: "4px 0 8px" }}>Ei vielä sarjoja tänään.</div>}
            </div>
          </>
        )}

        {/* pain during the exercise — optional, recorded as given, never judged */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.inkSoft, marginBottom: 7 }}>
            Kipu liikkeen aikana <span style={{ fontWeight: 500, letterSpacing: 0, textTransform: "none" }}>0–{PAIN_MAX}, valinnainen</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${PAIN_MAX + 1}, 1fr)`, gap: 4 }}>
            {Array.from({ length: PAIN_MAX + 1 }, (_, v) => (
              <button key={v} className="tap" onClick={() => onPain(ex.id, v)} aria-label={`Kipu ${v}`} aria-pressed={pain === v}
                style={{ height: 36, borderRadius: 9, fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", border: `1px solid ${pain === v ? C.amber : C.line}`, background: pain === v ? C.amber : C.surface, color: pain === v ? "#fff" : C.inkSoft }}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* footer: timer and the one big button, within thumb reach */}
      <div style={{ padding: "10px 16px max(14px, env(safe-area-inset-bottom))", background: C.surface, borderTop: `1px solid ${C.line}` }}>
        {timer && left > 0 && (
          <TimerBar
            timer={timer}
            left={left}
            onSkip={() => setTimer(null)}
            onAdjust={timer.kind === "rest" ? (delta) => {
              const next = Math.max(REST_MIN_S, Math.min(REST_MAX_S, restSec + delta));
              onRestSec(next);
              setTimer({ ...timer, endAt: timer.endAt + (next - restSec) * 1000, total: next });
            } : null}
          />
        )}
        {minute ? (
          <BigButton onClick={() => (hasNext ? go(idx + 1) : onClose())}>{hasNext ? "Seuraava liike" : "Valmis"}</BigButton>
        ) : isHold && !(timer && timer.kind === "hold") ? (
          <div style={{ display: "flex", gap: 8 }}>
            <BigButton onClick={() => {
              unlockSound();
              const s = d.hold || 30;
              setTimer({ kind: "hold", endAt: Date.now() + s * 1000, total: s, exId: ex.id });
              setNow(Date.now());
            }}>
              <Timer size={19} /> Aloita pito {d.hold || 30} s
            </BigButton>
            <SmallButton onClick={() => { unlockSound(); logSet(d); }} label="Kirjaa sarja ilman ajastinta">Kirjaa</SmallButton>
          </div>
        ) : isHold ? null : (
          <div style={{ display: "flex", gap: 8 }}>
            <BigButton onClick={() => { unlockSound(); logSet(d); }}>
              {count >= target ? `Lisäsarja (${count + 1})` : `Sarja ${count + 1}/${target} tehty`}
            </BigButton>
            {count >= target && hasNext && <SmallButton onClick={() => go(idx + 1)} label="Seuraava liike">Seuraava <ChevronRight size={16} /></SmallButton>}
          </div>
        )}
      </div>
    </div>
  );
}

/* Label, the value at the full card width, then wide −/+ underneath. The
   buttons used to flank the number, which left a two-column card too little
   room for "12,5 kg" on a 375 px phone. */
function Stepper({ label, unit, value, onDown, onUp, small }: any) {
  const btn = { flex: 1, height: 46, borderRadius: 12, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", background: C.surface };
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: "10px 10px 10px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.inkSoft, textAlign: "center" }}>{label}</div>
      <div style={{ textAlign: "center", fontSize: small ? 17 : 32, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: value == null ? C.inkFaint : C.ink, whiteSpace: small ? "normal" : "nowrap", lineHeight: 1.15, minHeight: 37, display: "flex", alignItems: "center", justifyContent: "center", margin: "4px 0 8px" }}>
        <span>
          {value == null ? "–" : value}
          {unit && value != null && <span style={{ fontSize: 14, fontWeight: 600, color: C.inkSoft }}> {unit}</span>}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="tap" onClick={onDown} aria-label={`${label}: vähemmän`} style={{ ...btn, color: C.inkSoft }}>
          <Minus size={20} />
        </button>
        <button className="tap" onClick={onUp} aria-label={`${label}: enemmän`} style={{ ...btn, color: C.pineDeep }}>
          <Plus size={20} />
        </button>
      </div>
    </div>
  );
}

function MinutePanel({ minutes, target, onSet }) {
  return (
    <div style={{ marginTop: 16, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <button className="tap" onClick={() => onSet(Math.max(0, minutes - 5))} aria-label="Vähennä 5 min"
          style={{ width: 52, height: 52, borderRadius: 12, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.inkSoft }}>
          <Minus size={22} />
        </button>
        <span style={{ fontSize: 32, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          {minutes}<span style={{ fontSize: 15, color: C.inkSoft }}>/{target} min</span>
        </span>
        <button className="tap" onClick={() => onSet(minutes + 5)} aria-label="Lisää 5 min"
          style={{ width: 52, height: 52, borderRadius: 12, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.pineDeep }}>
          <Plus size={22} />
        </button>
      </div>
      {minutes < target && (
        <button className="tap" onClick={() => onSet(target)}
          style={{ width: "100%", marginTop: 12, padding: "11px", borderRadius: 12, border: `1px solid ${C.pine}`, color: C.pineDeep, fontSize: 14.5, fontWeight: 600, background: C.surface }}>
          Merkitse {target} min tehdyksi
        </button>
      )}
    </div>
  );
}

function TimerBar({ timer, left, onSkip, onAdjust }) {
  const frac = timer.total > 0 ? left / timer.total : 0;
  const rest = timer.kind === "rest";
  return (
    <div data-timer={timer.kind} style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1, fontSize: rest ? 22 : 34, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: rest ? C.ink : C.pineDeep }}>
          {rest ? "Lepo" : "Pito"} {fmtClock(left)}
        </span>
        {onAdjust && <SmallButton onClick={() => onAdjust(-15)} label="Lepo 15 s lyhyemmäksi">−15</SmallButton>}
        {onAdjust && <SmallButton onClick={() => onAdjust(15)} label="Lepo 15 s pidemmäksi">+15</SmallButton>}
        <SmallButton onClick={onSkip} label={rest ? "Ohita lepo" : "Keskeytä pito"}>{rest ? "Ohita" : "Keskeytä"}</SmallButton>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: C.line, marginTop: 8, overflow: "hidden" }}>
        <div style={{ width: `${frac * 100}%`, height: "100%", background: rest ? C.slate : C.pine, transition: "width .25s linear" }} />
      </div>
    </div>
  );
}

function BigButton({ children, onClick }) {
  return (
    <button className="tap" onClick={onClick}
      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 56, padding: "14px", borderRadius: 14, background: C.pine, color: "#fff", fontSize: 17, fontWeight: 700 }}>
      {children}
    </button>
  );
}

function SmallButton({ children, onClick, label }) {
  return (
    <button className="tap" onClick={onClick} aria-label={label}
      style={{ flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 3, minHeight: 44, padding: "0 13px", borderRadius: 12, border: `1px solid ${C.line}`, background: C.surface, color: C.ink, fontSize: 14, fontWeight: 600 }}>
      {children}
    </button>
  );
}
