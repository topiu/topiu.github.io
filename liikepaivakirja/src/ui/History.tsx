/* ui/History — moved verbatim from liikepaivakirja.jsx (Phase 1 split). */
import { useState, useEffect, useMemo } from "react";
import { ChevronRight, X, Zap, Download, Upload, FileText } from "lucide-react";
import { QUALITIES, addDays, dayLoad, goalOf, humanDate, keyOf, parseKey, qualityLabel, shortDate, startOfWeek } from "../domain";
import { C } from "../styles/tokens";
import { BodyLoadSection } from "./BodyMap";
import { Card, Empty, IconBtn, SectionLabel, Stat } from "./common";

/* ================================================================== */
/*  HISTORY                                                            */
/* ================================================================== */
export function HistoryView({ days14, logs, symptoms, allSymptoms, exercises, completeCountOf, totalEx, streak, trained14, symptomFree14, today, marks, onExport, onImport, onImportSteps, onReport }) {
  const [range, setRange] = useState(14); // 14 | 30 | 90 | 0 (kaikki)
  const [drill, setDrill] = useState(null); // symptom object for drill-down modal
  const [diaryLen, setDiaryLen] = useState(14);
  const sevAlpha = { 1: 0.4, 2: 0.68, 3: 1 };
  const oldToNew = [...days14].reverse();

  /* earliest data date (logs or marks) for diary expansion & heatmap */
  const earliestKey = useMemo(() => {
    const keys = [...Object.keys(logs), ...marks.map((m) => m.date)].sort();
    return keys.length ? keys[0] : null;
  }, [logs, marks]);
  const diaryDays = useMemo(
    () => Array.from({ length: diaryLen }, (_, i) => addDays(today, -i)),
    [diaryLen, today]
  );
  const canExpandDiary =
    earliestKey != null && parseKey(earliestKey) < addDays(today, -(diaryLen - 1));

  /* day list for the selected range, plus the preceding window for delta mode */
  const rangeDays = useMemo(() => {
    if (range !== 0) return Array.from({ length: range }, (_, i) => addDays(today, -i));
    const start = earliestKey ? parseKey(earliestKey) : addDays(today, -13);
    const n = Math.max(1, Math.round((today - start) / 86400000) + 1);
    return Array.from({ length: Math.min(n, 1000) }, (_, i) => addDays(today, -i));
  }, [range, today, earliestKey]);
  const prevDays = useMemo(() => {
    if (range === 0) return null;
    return Array.from({ length: range }, (_, i) => addDays(today, -(range + i)));
  }, [range, today]);

  /* ---- weekly aggregation for long ranges ---- */
  const weekly = useMemo(() => {
    if (range === 14) return null;
    // range start: fixed window, or earliest data for "kaikki"
    let start;
    if (range === 0) {
      const keys = [...Object.keys(logs), ...marks.map((m) => m.date)].sort();
      start = keys.length ? parseKey(keys[0]) : addDays(today, -27);
    } else {
      start = addDays(today, -(range - 1));
    }
    let ws = startOfWeek(start);
    const endWs = startOfWeek(today);
    // safety cap ~2 years of weeks
    const weeks = [];
    for (let g = 0; g < 106 && ws <= endWs; g++) {
      const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
      let train = 0;
      let load = 0;
      let flareDays = 0;
      let stepSum = 0;
      let stepDays = 0;
      days.forEach((d) => {
        if (d > today) return;
        const l = logs[keyOf(d)];
        if (completeCountOf(l) > 0) train++;
        const dl = dayLoad(l);
        if (dl > 0) flareDays++;
        load += dl;
        if (l && l.steps > 0) {
          stepSum += l.steps;
          stepDays++;
        }
      });
      const wkMarks = marks.filter((m) => {
        const md = parseKey(m.date);
        return md >= ws && md < addDays(ws, 7);
      });
      weeks.push({ ws, label: `${ws.getDate()}.${ws.getMonth() + 1}.`, train, load, flareDays, steps: stepDays ? Math.round(stepSum / stepDays) : 0, marks: wkMarks });
      ws = addDays(ws, 7);
    }
    return weeks;
  }, [range, logs, marks, today, completeCountOf]);

  const rangeBtn = (v, label) => (
    <button key={v} className="tap" onClick={() => setRange(v)}
      style={{ padding: "7px 0", borderRadius: 9, fontSize: 13, fontWeight: 600, color: range === v ? "#fff" : C.inkSoft, background: range === v ? C.pine : "transparent", transition: "background .15s" }}>
      {label}
    </button>
  );

  return (
    <div className="rise">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <Stat value={streak} unit="pv" label="Putki" accent={C.pine} />
        <Stat value={trained14} unit="/ 14" label="Treenipäiviä" accent={C.ink} />
        <Stat value={symptomFree14} unit="/ 14" label="Oireettomia" accent={symptomFree14 >= 10 ? C.pine : C.amber} />
      </div>

      {/* Range selector */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 4, margin: "14px 0 2px" }}>
        {rangeBtn(14, "14 pv")}
        {rangeBtn(30, "30 pv")}
        {rangeBtn(90, "90 pv")}
        {rangeBtn(0, "Kaikki")}
      </div>

      <BodyLoadSection
        rangeDays={rangeDays}
        prevDays={prevDays}
        logs={logs}
        exercises={exercises}
        symptoms={allSymptoms}
        rangeLabel={range === 0 ? "koko historia" : `${range} pv`}
        allowDelta={range !== 0}
      />

      {range === 14 ? (
        <>
          <SectionLabel>Oireiden uusiutuminen</SectionLabel>
          <div style={{ fontSize: 12.5, color: C.inkSoft, margin: "-4px 2px 8px" }}>
            Viimeiset 14 päivää — vasemmalta oikealle vanhin → tänään. Napauta oiretta porautuaksesi.
          </div>
          <Card>
            {symptoms.length === 0 && <Empty>Ei oireita seurannassa.</Empty>}
            {symptoms.map((s, i) => {
              const count = oldToNew.filter((d) => {
                const l = logs[keyOf(d)];
                return l && l.flared.includes(s.id);
              }).length;
              return (
                <button key={s.id} className="tap" onClick={() => setDrill(s)} aria-label={`Avaa oireen ${s.name} tarkastelu`}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderTop: i === 0 ? "none" : `1px solid ${C.line}`, width: "100%", textAlign: "left" }}>
                  <div style={{ width: 62, flex: "0 0 auto", fontSize: 13.5, fontWeight: 600, color: count > 0 ? C.amber : C.ink }}>{s.name}</div>
                  <div style={{ display: "flex", gap: 3, flex: 1 }}>
                    {oldToNew.map((d) => {
                      const l = logs[keyOf(d)];
                      const flared = l && l.flared.includes(s.id);
                      const sev = (l && l.severity[s.id]) || 3;
                      const isTd = keyOf(d) === keyOf(today);
                      return (
                        <div key={keyOf(d)} title={shortDate(d)}
                          style={{ flex: 1, height: 22, borderRadius: 4, background: flared ? C.amber : C.line, opacity: flared ? sevAlpha[sev] : 0.4, boxShadow: isTd ? `0 0 0 2px ${C.bg}, 0 0 0 3px ${C.inkFaint}` : "none" }} />
                      );
                    })}
                  </div>
                  <div style={{ width: 30, flex: "0 0 auto", textAlign: "right", fontSize: 13, fontWeight: 600, color: count > 0 ? C.amber : C.inkFaint, fontVariantNumeric: "tabular-nums" }}>{count}×</div>
                  <ChevronRight size={15} style={{ flex: "0 0 auto", color: C.inkFaint }} />
                </button>
              );
            })}
          </Card>

          <SectionLabel>Päiväkirja</SectionLabel>
          <Card style={{ padding: 6 }}>
            {diaryDays.map((d, i) => {
              const k = keyOf(d);
              const l = logs[k];
              const dc = completeCountOf(l);
              const frac = totalEx > 0 ? Math.min(1, dc / totalEx) : 0;
              const flaredNames = l ? symptoms.filter((s) => l.flared.includes(s.id)).map((s) => s.name) : [];
              const hasNote = l && l.note && l.note.trim();
              const dayMarks = marks.filter((m) => m.date === k);
              const over = l && exercises.some((e) => ((l.sets && l.sets[e.id]) || 0) > goalOf(l, e));
              const steps = (l && l.steps) || 0;
              return (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 8px", borderTop: i === 0 ? "none" : `1px solid ${C.line}` }}>
                  <div style={{ width: 66, flex: "0 0 auto", fontSize: 13, fontWeight: 600, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{shortDate(d)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ height: 7, borderRadius: 999, background: C.line, overflow: "hidden" }}>
                      <div style={{ width: `${frac * 100}%`, height: "100%", background: C.pine, borderRadius: 999 }} />
                    </div>
                    {(flaredNames.length > 0 || hasNote || dayMarks.length > 0 || over || steps > 0) && (
                      <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                        {over && (
                          <span title="Kirjattu annosta enemmän" style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 11, fontWeight: 700, color: C.pineDeep, background: C.pineTint, border: `1px solid ${C.pineSoft}`, borderRadius: 999, padding: "1px 7px" }}>
                            <Zap size={10} fill={C.pineDeep} color={C.pineDeep} /> ylitys
                          </span>
                        )}
                        {flaredNames.map((n) => (
                          <span key={n} style={{ fontSize: 11, fontWeight: 600, color: C.amber, background: C.amberTint, border: `1px solid ${C.amberLine}`, borderRadius: 999, padding: "1px 8px" }}>{n}</span>
                        ))}
                        {dayMarks.map((m) => (
                          <span key={m.id} title={m.text} style={{ fontSize: 11, fontWeight: 600, color: C.pineDeep, background: C.pineTint, border: `1px solid ${C.pineSoft}`, borderRadius: 999, padding: "1px 8px", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>◆ {m.text}</span>
                        ))}
                        {steps > 0 && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: C.slate, background: C.slateTint, borderRadius: 999, padding: "1px 7px", fontVariantNumeric: "tabular-nums" }}>
                            {steps.toLocaleString("fi-FI")} askelta
                          </span>
                        )}
                        {hasNote && <span style={{ fontSize: 11, color: C.inkFaint }}>✎ muistiinpano</span>}
                      </div>
                    )}
                  </div>
                  <div style={{ width: 34, flex: "0 0 auto", textAlign: "right", fontSize: 13, fontWeight: 600, color: dc > 0 ? C.pineDeep : C.inkFaint, fontVariantNumeric: "tabular-nums" }}>{dc}/{totalEx}</div>
                </div>
              );
            })}
          </Card>
          {canExpandDiary && (
            <button className="tap" onClick={() => setDiaryLen((n) => n + 30)}
              style={{ display: "block", width: "100%", marginTop: -8, marginBottom: 16, padding: "10px", borderRadius: 11, border: `1px dashed ${C.line}`, background: "transparent", color: C.inkSoft, fontSize: 13.5, fontWeight: 600 }}>
              Näytä vanhemmat (+30 pv)
            </button>
          )}
        </>
      ) : (
        <>
          <WeeklyTrends weekly={weekly} rangeLabel={range === 0 ? "koko historia" : `viimeiset ${range} pv`} />
          <SectionLabel>Kuukausikalenteri</SectionLabel>
          <div style={{ fontSize: 12.5, color: C.inkSoft, margin: "-4px 2px 8px" }}>
            Vihreä = treeniä (tummempi = enemmän), <span style={{ color: C.amber, fontWeight: 700 }}>piste</span> = oirepäivä, ◆ = merkkipaalu.
          </div>
          <MonthHeatmaps range={range} today={today} logs={logs} marks={marks} completeCountOf={completeCountOf} totalEx={totalEx} earliestKey={earliestKey} />
          <SectionLabel>Oireet — porautuminen</SectionLabel>
          <Card style={{ padding: 6 }}>
            {allSymptoms.length === 0 && <Empty>Ei oireita seurannassa.</Empty>}
            {allSymptoms
              .filter((s) => !s.archived || Object.keys(logs).some((k) => logs[k].flared.includes(s.id)))
              .map((s, i) => {
                const total = Object.keys(logs).filter((k) => logs[k].flared.includes(s.id)).length;
                return (
                  <button key={s.id} className="tap" onClick={() => setDrill(s)}
                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "12px 10px", borderTop: i === 0 ? "none" : `1px solid ${C.line}` }}>
                    <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: s.archived ? C.inkSoft : C.ink }}>
                      {s.name}
                      {s.archived && <span style={{ fontSize: 11.5, fontWeight: 600, color: C.inkFaint }}> · arkistoitu</span>}
                    </span>
                    <span style={{ fontSize: 13, color: total > 0 ? C.amber : C.inkFaint, fontWeight: 600 }}>{total}× yhteensä</span>
                    <ChevronRight size={16} style={{ color: C.inkFaint }} />
                  </button>
                );
              })}
          </Card>
        </>
      )}

      <button className="tap" onClick={onReport}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", marginBottom: 10, padding: "14px", borderRadius: 13, border: "none", background: C.pine, color: "#fff", fontSize: 15.5, fontWeight: 600 }}>
        <FileText size={18} /> Raportti fysioterapeutille
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <button className="tap" onClick={onExport}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px", borderRadius: 13, border: `1px solid ${C.pine}`, background: C.surface, color: C.pineDeep, fontSize: 15, fontWeight: 600 }}>
          <Download size={18} /> Vie tiedot
        </button>
        <button className="tap" onClick={onImport}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px", borderRadius: 13, border: `1px solid ${C.pine}`, background: C.surface, color: C.pineDeep, fontSize: 15, fontWeight: 600 }}>
          <Upload size={18} /> Tuo tiedot
        </button>
      </div>
      <button className="tap" onClick={onImportSteps}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", marginTop: 10, padding: "12px", borderRadius: 13, border: `1px solid ${C.line}`, background: C.surface, color: C.inkSoft, fontSize: 14.5, fontWeight: 600 }}>
        <Upload size={16} /> Tuo askeleet Terveys-datasta
      </button>

      {drill && (
        <SymptomModal symptom={drill} logs={logs} exercises={exercises} completeCountOf={completeCountOf} today={today} onClose={() => setDrill(null)} />
      )}
    </div>
  );
}

/* ---- long-range weekly view: trend chart + marks list ---- */
export function WeeklyTrends({ weekly, rangeLabel }) {
  if (!weekly || weekly.length === 0) {
    return (
      <Card>
        <Empty>Ei merkintöjä valitulla aikavälillä.</Empty>
      </Card>
    );
  }
  const marksInRange = weekly.flatMap((w) => w.marks);
  const hasData = weekly.some((w) => w.train > 0 || w.load > 0);

  return (
    <>
      <SectionLabel>Viikkotrendit</SectionLabel>
      <div style={{ fontSize: 12.5, color: C.inkSoft, margin: "-4px 2px 8px", lineHeight: 1.5 }}>
        Viikkotaso ({rangeLabel}): <span style={{ color: C.amber, fontWeight: 700 }}>oirekuorma</span> = oirepäivien voimakkuuksien summa/viikko, <span style={{ color: C.pineDeep, fontWeight: 700 }}>palkit</span> = treenipäiviä/viikko, <span style={{ color: C.slate, fontWeight: 700 }}>katkoviiva</span> = askelkeskiarvo (oma asteikko). ◆ = merkkipaalu.
      </div>
      <Card style={{ paddingBottom: 10 }}>
        {hasData ? <TrendChart weekly={weekly} /> : <Empty>Ei vielä merkintöjä tälle välille.</Empty>}
      </Card>

      <SectionLabel>Merkkipaalut aikavälillä</SectionLabel>
      <Card style={{ padding: 8 }}>
        {marksInRange.length === 0 && <Empty>Ei merkkipaaluja. Lisää niitä Tänään-välilehdeltä.</Empty>}
        {marksInRange.map((m, i) => (
          <div key={m.id} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "8px 4px", borderTop: i === 0 ? "none" : `1px solid ${C.line}` }}>
            <span style={{ flex: "0 0 auto", width: 66, fontSize: 12.5, fontWeight: 600, color: C.inkSoft, fontVariantNumeric: "tabular-nums" }}>{humanDate(m.date)}</span>
            <span style={{ flex: 1, fontSize: 14, color: C.ink, lineHeight: 1.4 }}>
              {m.text}
              {m.auto && <span style={{ fontSize: 11, color: C.inkFaint }}> · autom.</span>}
            </span>
          </div>
        ))}
      </Card>
    </>
  );
}

/* ---- month heatmap calendar (quick browse of long ranges) ---- */
export function MonthHeatmaps({ range, today, logs, marks, completeCountOf, totalEx, earliestKey }) {
  const months = useMemo(() => {
    let start;
    if (range === 0) {
      start = earliestKey ? parseKey(earliestKey) : addDays(today, -29);
    } else {
      start = addDays(today, -(range - 1));
    }
    // cap to last 12 months for rendering
    const cap = new Date(today.getFullYear(), today.getMonth() - 11, 1);
    let m = new Date(start.getFullYear(), start.getMonth(), 1);
    let capped = false;
    if (m < cap) {
      m = cap;
      capped = true;
    }
    const list = [];
    const end = new Date(today.getFullYear(), today.getMonth(), 1);
    while (m <= end) {
      list.push(new Date(m));
      m = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    }
    return { list, capped };
  }, [range, today, earliestKey]);

  const markDates = useMemo(() => new Set(marks.map((m) => m.date)), [marks]);
  const MONTHS_FI = ["Tammikuu", "Helmikuu", "Maaliskuu", "Huhtikuu", "Toukokuu", "Kesäkuu", "Heinäkuu", "Elokuu", "Syyskuu", "Lokakuu", "Marraskuu", "Joulukuu"];

  return (
    <Card>
      {months.capped && (
        <div style={{ fontSize: 12, color: C.inkFaint, marginBottom: 8 }}>Näytetään viimeiset 12 kuukautta — vanhemmat löytyvät viennistä.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {months.list.map((m0) => {
          const y = m0.getFullYear();
          const mo = m0.getMonth();
          const daysInMonth = new Date(y, mo + 1, 0).getDate();
          const lead = (new Date(y, mo, 1).getDay() + 6) % 7; // Mon=0
          const cells = [];
          for (let i = 0; i < lead; i++) cells.push(null);
          for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, mo, d));
          return (
            <div key={`${y}-${mo}`}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 6 }}>
                {MONTHS_FI[mo]} {y}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
                {["Ma", "Ti", "Ke", "To", "Pe", "La", "Su"].map((w) => (
                  <div key={w} style={{ fontSize: 9.5, fontWeight: 700, color: C.inkFaint, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.05em" }}>{w}</div>
                ))}
                {cells.map((d, i) => {
                  if (!d) return <div key={`e${i}`} />;
                  const k = keyOf(d);
                  const future = d > today;
                  const l = logs[k];
                  const dc = completeCountOf(l);
                  const frac = totalEx > 0 ? dc / totalEx : 0;
                  const flare = dayLoad(l) > 0;
                  const hasMark = markDates.has(k);
                  const bg = future
                    ? "transparent"
                    : frac >= 1
                    ? C.pine
                    : frac > 0
                    ? C.pineSoft
                    : C.surfaceSoft;
                  const isTd = k === keyOf(today);
                  return (
                    <div key={k} title={`${shortDate(d)}${dc > 0 ? ` — ${dc}/${totalEx} liikettä` : ""}${flare ? " — oiretta" : ""}`}
                      style={{ position: "relative", aspectRatio: "1", borderRadius: 5, background: bg, border: `1px solid ${future ? "transparent" : isTd ? C.inkSoft : C.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 9.5, fontWeight: 600, color: future ? C.inkFaint : frac >= 1 ? "#fff" : C.inkSoft, opacity: future ? 0.4 : 1 }}>{d.getDate()}</span>
                      {flare && <span style={{ position: "absolute", top: 2, right: 2, width: 5, height: 5, borderRadius: "50%", background: C.amber }} />}
                      {hasMark && <span style={{ position: "absolute", bottom: 2, left: 2, width: 5, height: 5, transform: "rotate(45deg)", background: C.pineDeep, borderRadius: 1 }} />}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ---- per-symptom drill-down + lag analysis over full history ---- */
export function SymptomModal({ symptom, logs, exercises, completeCountOf, today, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const S = useMemo(() => {
    const allKeys = Object.keys(logs).sort();
    const occ = allKeys.filter((k) => logs[k].flared.includes(symptom.id));
    const n = occ.length;
    /* gaps between consecutive occurrences (days) */
    const gaps = [];
    for (let i = 1; i < n; i++) {
      gaps.push(Math.round((parseKey(occ[i]) - parseKey(occ[i - 1])) / 86400000));
    }
    const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
    /* longest symptom-free stretch: between occurrences and since last */
    let longestFree = null;
    gaps.forEach((g) => {
      if (g - 1 > (longestFree || 0)) longestFree = g - 1;
    });
    let sinceLast = null;
    if (n > 0) {
      sinceLast = Math.round((today - parseKey(occ[n - 1])) / 86400000);
      if (sinceLast > (longestFree || 0)) longestFree = sinceLast;
    }
    /* lag analysis: was there training on the 1–2 days before each flare vs. baseline */
    const trainedOn = (k) => completeCountOf(logs[k]) > 0;
    let preTrained = 0;
    occ.forEach((k) => {
      const d = parseKey(k);
      const p1 = keyOf(addDays(d, -1));
      const p2 = keyOf(addDays(d, -2));
      if (trainedOn(p1) || trainedOn(p2)) preTrained++;
    });
    /* baseline: share of all logged-period days with training within any 2-day window.
       Approximate with overall training-day share to keep it honest and simple. */
    let baselineDays = 0;
    let baselineTrained = 0;
    if (allKeys.length) {
      const first = parseKey(allKeys[0]);
      for (let d = new Date(first); d <= today; d = addDays(d, 1)) {
        baselineDays++;
        if (trainedOn(keyOf(d))) baselineTrained++;
      }
    }
    const baselineShare = baselineDays ? baselineTrained / baselineDays : 0;
    /* which exercises appeared on the 1–2 days before flares */
    const exCounts = {};
    occ.forEach((k) => {
      const d = parseKey(k);
      [1, 2].forEach((off) => {
        const l = logs[keyOf(addDays(d, -off))];
        if (!l || !l.sets) return;
        Object.keys(l.sets).forEach((id) => {
          if (l.sets[id] > 0) exCounts[id] = (exCounts[id] || 0) + 1;
        });
      });
    });
    const exList = exercises
      .map((e) => ({ name: e.name, count: exCounts[e.id] || 0 }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count);
    const sevCount = { 1: 0, 2: 0, 3: 0 };
    occ.forEach((k) => {
      const v = logs[k].severity[symptom.id];
      if (v >= 1 && v <= 3) sevCount[v]++;
    });
    /* step context: are flares preceded by high-step days? */
    const stepAvg = (keys) => {
      const vals = keys.map((k) => (logs[k] && logs[k].steps) || 0).filter((v) => v > 0);
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    };
    const preKeys = [];
    occ.forEach((k) => {
      const d = parseKey(k);
      preKeys.push(keyOf(addDays(d, -1)), keyOf(addDays(d, -2)));
    });
    const stepsOnFlare = stepAvg(occ);
    const stepsBefore = stepAvg(preKeys);
    const stepsBaseline = stepAvg(allKeys);
    const qCount = {};
    occ.forEach((k) => {
      const q = logs[k].quality && logs[k].quality[symptom.id];
      if (q) qCount[q] = (qCount[q] || 0) + 1;
    });
    return { occ, n, avgGap, longestFree, sinceLast, preTrained, baselineShare, exList, sevCount, qCount, stepsOnFlare, stepsBefore, stepsBaseline };
  }, [logs, symptom, exercises, completeCountOf, today]);

  const recent = [...S.occ].reverse().slice(0, 20);
  const SEV_NAME = { 1: "lievä", 2: "kohtalainen", 3: "kova" };

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(22,36,31,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 12, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Oire: ${symptom.name}`}
        style={{ background: C.surface, borderRadius: 18, width: "100%", maxWidth: 520, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 10px" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            <span style={{ color: C.amber }}>●</span> {symptom.name}
          </h2>
          <IconBtn label="Sulje" onClick={onClose}><X size={18} /></IconBtn>
        </div>

        <div style={{ padding: "0 16px 16px", overflowY: "auto" }}>
          {S.n === 0 ? (
            <Empty>Ei kirjattuja esiintymiä koko historiassa. 🌿</Empty>
          ) : (
            <>
              {/* headline stats */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <Stat value={S.n} unit="×" label="Esiintymiä" accent={C.amber} />
                <Stat value={S.avgGap != null ? Math.round(S.avgGap) : "–"} unit="pv" label="Keskim. väli" accent={C.ink} />
                <Stat value={S.longestFree != null ? S.longestFree : "–"} unit="pv" label="Pisin oireeton" accent={C.pine} />
              </div>
              {S.sinceLast != null && (
                <div style={{ fontSize: 13, color: C.inkSoft, margin: "10px 2px 0" }}>
                  Edellisestä esiintymästä <b style={{ color: S.sinceLast > (S.avgGap || 0) ? C.pineDeep : C.ink }}>{S.sinceLast} pv</b>
                  {S.avgGap != null && S.sinceLast > S.avgGap && " — pidempään kuin keskimäärin 💪"}.
                  {" "}Voimakkuudet: {[3, 2, 1].filter((v) => S.sevCount[v] > 0).map((v) => `${S.sevCount[v]}× ${SEV_NAME[v]}`).join(", ") || "ei kirjattu"}.
                </div>
              )}

              {/* lag analysis */}
              {Object.keys(S.qCount).length > 0 && (
                <div style={{ fontSize: 13, color: C.inkSoft, margin: "8px 2px 0" }}>
                  Laatu: {QUALITIES.filter((q) => S.qCount[q.id]).map((q) => `${S.qCount[q.id]}× ${q.label}`).join(", ")}
                </div>
              )}
              <SectionLabel>Edeltävät päivät (viive 1–2 pv)</SectionLabel>
              <Card style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.55 }}>
                  Treeniä oli 1–2 päivää ennen oiretta <b>{S.preTrained}/{S.n}</b> kerralla ({Math.round((S.preTrained / S.n) * 100)} %).
                  Vertailuksi: treenipäiviä on ollut noin <b>{Math.round(S.baselineShare * 100)} %</b> kaikista päivistä.
                </div>
                {S.exList.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.inkSoft, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                      Liikkeet oiretta edeltävinä päivinä
                    </div>
                    {S.exList.map((x) => (
                      <div key={x.name} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13.5, padding: "4px 0", color: C.ink }}>
                        <span>{x.name}</span>
                        <span style={{ fontWeight: 600, color: C.inkSoft }}>{x.count}×</span>
                      </div>
                    ))}
                  </div>
                )}
                {S.stepsBaseline != null && (S.stepsBefore != null || S.stepsOnFlare != null) && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}`, fontSize: 13, color: C.ink, lineHeight: 1.55 }}>
                    <span style={{ fontWeight: 700, color: C.slate }}>Askeleet: </span>
                    {S.stepsBefore != null && (
                      <>
                        1–2 pv ennen oiretta keskimäärin <b>{S.stepsBefore.toLocaleString("fi-FI")}</b>
                        {" "}(kaikkien päivien keskiarvo {S.stepsBaseline.toLocaleString("fi-FI")}).
                        {S.stepsBefore > S.stepsBaseline * 1.15 && " Edeltävät päivät olivat selvästi vilkkaampia."}
                        {S.stepsBefore < S.stepsBaseline * 0.85 && " Edeltävät päivät olivat tavallista hiljaisempia."}
                      </>
                    )}
                    {S.stepsOnFlare != null && <> Oirepäivinä <b>{S.stepsOnFlare.toLocaleString("fi-FI")}</b>.</>}
                  </div>
                )}
                <div style={{ fontSize: 12, color: C.inkFaint, marginTop: 10, lineHeight: 1.5 }}>
                  Huom: tämä näyttää ajallisia yhteyksiä, ei syy-seuraussuhdetta. Tulkitse yhdessä fysioterapeutin kanssa.
                </div>
              </Card>

              {/* occurrence list */}
              <SectionLabel>Esiintymät{S.n > 20 ? " (20 viimeisintä)" : ""}</SectionLabel>
              <Card style={{ padding: 8 }}>
                {recent.map((k, i) => {
                  const v = logs[k].severity[symptom.id];
                  const q = logs[k].quality && logs[k].quality[symptom.id];
                  return (
                    <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", borderTop: i === 0 ? "none" : `1px solid ${C.line}` }}>
                      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{humanDate(k)}</span>
                      {q && <span style={{ fontSize: 12, fontWeight: 600, color: C.slate }}>{qualityLabel(q)}</span>}
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: C.amber }}>{v ? SEV_NAME[v] : "—"}</span>
                    </div>
                  );
                })}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* dual-scale SVG: bars = train days (0–7), line = symptom load */
export function TrendChart({ weekly }) {
  const W = 480;
  const H = 190;
  const padL = 26;
  const padR = 10;
  const padT = 14;
  const padB = 34;
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const n = weekly.length;
  const step = iw / n;
  const maxLoad = Math.max(4, ...weekly.map((w) => w.load));
  const maxSteps = Math.max(0, ...weekly.map((w) => w.steps));
  const hasSteps = maxSteps > 0;
  const ySteps = (v) => padT + ih - (v / maxSteps) * ih;
  const stepPts = weekly.map((w, i) => `${xC(i).toFixed(1)},${ySteps(w.steps).toFixed(1)}`).join(" ");
  const xC = (i) => padL + step * (i + 0.5);
  const yLoad = (v) => padT + ih - (v / maxLoad) * ih;
  const yTrain = (v) => (v / 7) * ih;
  const linePts = weekly.map((w, i) => `${xC(i).toFixed(1)},${yLoad(w.load).toFixed(1)}`).join(" ");
  const barW = Math.min(18, step * 0.55);
  // label at most ~6 x-ticks
  const labelEvery = Math.max(1, Math.ceil(n / 6));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Viikkotrendit: oirekuorma ja treenipäivät">
      {/* gridlines + load axis labels */}
      {[0, 0.5, 1].map((f) => {
        const v = Math.round(maxLoad * f);
        const y = yLoad(v);
        return (
          <g key={f}>
            <line x1={padL} x2={W - padR} y1={y} y2={y} stroke={C.line} strokeWidth="1" />
            <text x={padL - 5} y={y + 3.5} textAnchor="end" style={{ fontSize: 10, fill: C.inkFaint }}>{v}</text>
          </g>
        );
      })}
      {/* train-day bars */}
      {weekly.map((w, i) =>
        w.train > 0 ? (
          <rect key={i} x={xC(i) - barW / 2} y={padT + ih - yTrain(w.train)} width={barW} height={yTrain(w.train)} rx="2.5" fill={C.pineSoft} stroke={C.pine} strokeWidth="1" />
        ) : null
      )}
      {/* steps (own scale, context only) */}
      {hasSteps && n > 1 && (
        <polyline points={stepPts} fill="none" stroke={C.slateSoft} strokeWidth="2" strokeDasharray="4 3" strokeLinejoin="round" strokeLinecap="round" />
      )}
      {/* symptom load line */}
      {n > 1 && <polyline points={linePts} fill="none" stroke={C.amber} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
      {weekly.map((w, i) => (
        <circle key={i} cx={xC(i)} cy={yLoad(w.load)} r={w.load > 0 ? 3.4 : 2.4} fill={w.load > 0 ? C.amber : C.surface} stroke={C.amber} strokeWidth="1.5" />
      ))}
      {/* milestone diamonds */}
      {weekly.map((w, i) =>
        w.marks.length > 0 ? (
          <g key={`m${i}`} transform={`translate(${xC(i)}, ${H - padB + 9}) rotate(45)`}>
            <rect x="-4" y="-4" width="8" height="8" fill={C.pineDeep} rx="1" />
          </g>
        ) : null
      )}
      {/* x labels */}
      {weekly.map((w, i) =>
        i % labelEvery === 0 ? (
          <text key={`t${i}`} x={xC(i)} y={H - 6} textAnchor="middle" style={{ fontSize: 10, fill: C.inkSoft, fontWeight: 600 }}>{w.label}</text>
        ) : null
      )}
    </svg>
  );
}
