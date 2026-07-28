/* ui/App — moved verbatim from liikepaivakirja.jsx (Phase 1 split). */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { EMPTY_DOSE, LIB_BY_ID, addDays, emptyLog, goalMinOf, goalOf, isEmptyLog, isMin, keyOf, normalizeExercises, normalizeLogs, normalizeMarks, normalizeSymptoms, seedExercises, seedSymptoms, startOfToday, targetSets, toNum, uid } from "../domain";
import { deleteKey, hasStore, loadJSON, saveJSON, saveJSONDebounced, saveJSONNow } from "../storage/store";
import { C, FONT } from "../styles/tokens";
import { EditView } from "./Edit";
import { HistoryView } from "./History";
import { ExportModal, ImportModal, StepsModal } from "./Modals";
import { TodayView } from "./Today";
import { Style } from "./common";

/* ================================================================== */
export default function App() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("today");
  const [exercises, setExercises] = useState([]);
  const [symptoms, setSymptoms] = useState([]);
  const [logs, setLogs] = useState({});
  const [marks, setMarks] = useState([]);
  const [selected, setSelected] = useState(startOfToday());
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [canUndoImport, setCanUndoImport] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);

  const today = startOfToday();
  const selKey = keyOf(selected);
  const isToday = selKey === keyOf(today);
  const isYesterday = selKey === keyOf(addDays(today, -1));
  const log = logs[selKey] || emptyLog();

  /* mirror latest state so import can snapshot it without stale closures */
  const stateRef = useRef({});
  stateRef.current = { exercises, symptoms, logs, marks };
  const undoRef = useRef(null);

  /* ---- initial load + migration ---- */
  useEffect(() => {
    (async () => {
      const cfg = await loadJSON("physio-config", null);
      let ex = cfg ? normalizeExercises(cfg.exercises) : null;
      let sy = cfg ? normalizeSymptoms(cfg.symptoms) : null;
      if (!ex || !ex.length || !sy) {
        ex = seedExercises();
        sy = seedSymptoms();
        saveJSON("physio-config", { exercises: ex, symptoms: sy });
      }
      setExercises(ex);
      setSymptoms(sy);

      const exById = {};
      ex.forEach((e) => (exById[e.id] = e));
      const raw = await loadJSON("physio-logs", {});
      const normLogs = normalizeLogs(raw, exById);
      setLogs(normLogs);
      /* persist backfilled goal snapshots only if normalization changed anything */
      try {
        if (JSON.stringify(normLogs) !== JSON.stringify(raw)) saveJSON("physio-logs", normLogs);
      } catch {
        /* ignore */
      }
      const rawMarks = await loadJSON("physio-marks", []);
      setMarks(normalizeMarks(rawMarks));
      const undo = await loadJSON("physio-undo", null);
      if (undo && Array.isArray(undo.exercises)) {
        undoRef.current = undo;
        setCanUndoImport(true);
      }
      setLoading(false);
    })();
  }, []);

  const persistConfig = useCallback((ex, sy) => {
    saveJSON("physio-config", { exercises: ex, symptoms: sy });
  }, []);

  const applyImport = useCallback(async (res) => {
    /* snapshot current data so an accidental/wrong import can be undone */
    const prev = {
      exercises: stateRef.current.exercises || [],
      symptoms: stateRef.current.symptoms || [],
      logs: stateRef.current.logs || {},
      marks: stateRef.current.marks || [],
    };
    undoRef.current = prev;
    setCanUndoImport(true);

    setExercises(res.ex);
    setSymptoms(res.sy);
    setLogs(res.logs);
    setMarks(res.marks || []);
    setSelected(startOfToday());

    /* write sequentially so the four keys don't race the rate limiter,
       and await so persistence is confirmed before we report success */
    await saveJSONNow("physio-undo", prev);
    await saveJSONNow("physio-config", { exercises: res.ex, symptoms: res.sy });
    await saveJSONNow("physio-logs", res.logs);
    await saveJSONNow("physio-marks", res.marks || []);
  }, []);

  const undoImport = useCallback(async () => {
    const prev = undoRef.current;
    if (!prev) return;
    setExercises(prev.exercises || []);
    setSymptoms(prev.symptoms || []);
    setLogs(prev.logs || {});
    setMarks(prev.marks || []);
    setSelected(startOfToday());
    await saveJSONNow("physio-config", { exercises: prev.exercises || [], symptoms: prev.symptoms || [] });
    await saveJSONNow("physio-logs", prev.logs || {});
    await saveJSONNow("physio-marks", prev.marks || []);
    undoRef.current = null;
    setCanUndoImport(false);
    try {
      if (hasStore) await deleteKey("physio-undo");
    } catch {
      /* ignore */
    }
  }, []);

  /* ---- marks (milestones/annotations) ---- */
  const mutateMarks = useCallback((fn) => {
    setMarks((prev) => {
      const next = fn([...prev]);
      next.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      saveJSON("physio-marks", next);
      return next;
    });
  }, []);
  const addMark = useCallback(
    (date, text, auto) => {
      const t = (text || "").trim().slice(0, 300);
      if (!t) return;
      mutateMarks((arr) => [...arr, { id: uid(), date, text: t, auto: !!auto }]);
    },
    [mutateMarks]
  );
  const removeMark = useCallback((id) => mutateMarks((arr) => arr.filter((m) => m.id !== id)), [mutateMarks]);
  /* auto-log a dose change as a mark on today's date */
  const logDoseChange = useCallback(
    (name, oldLabel, newLabel) => {
      const o = oldLabel || "ei annosta";
      const n = newLabel || "ei annosta";
      if (o === n) return;
      addMark(keyOf(startOfToday()), `Annos: ${name}: ${o} → ${n}`, true);
    },
    [addMark]
  );

  /* ---- log mutation ---- */
  const updateLog = useCallback((key, mutate) => {
    setLogs((prev) => {
      const src = prev[key] || emptyLog();
      const cur = {
        sets: { ...(src.sets || {}) },
        goal: { ...(src.goal || {}) },
        mins: { ...(src.mins || {}) },
        flared: [...(src.flared || [])],
        severity: { ...(src.severity || {}) },
        quality: { ...(src.quality || {}) },
        note: src.note || "",
        steps: src.steps || 0,
      };
      const next = mutate(cur) || cur;
      const map = { ...prev };
      if (isEmptyLog(next)) delete map[key];
      else map[key] = next;
      saveJSON("physio-logs", map);
      return map;
    });
  }, []);

  const setExerciseSets = (id, n) =>
    updateLog(selKey, (l) => {
      const map = { ...l.sets };
      const g = { ...l.goal };
      if (n <= 0) {
        delete map[id];
        delete g[id];
      } else {
        map[id] = n;
        /* freeze the day's full dose to what's in force when first logged */
        if (!g[id]) {
          const ex = exercises.find((e) => e.id === id);
          g[id] = ex
            ? { sets: targetSets(ex), reps: toNum(ex.dose && ex.dose.reps), hold: toNum(ex.dose && ex.dose.hold) }
            : { sets: 1, reps: null, hold: null };
        }
      }
      l.sets = map;
      l.goal = g;
      return l;
    });

  const setExerciseMins = (id, m) =>
    updateLog(selKey, (l) => {
      const map = { ...l.mins };
      const g = { ...l.goal };
      if (m <= 0) {
        delete map[id];
        delete g[id];
      } else {
        map[id] = Math.min(m, 1440);
        if (!g[id]) {
          const ex = exercises.find((e) => e.id === id);
          g[id] = ex
            ? { sets: targetSets(ex), reps: toNum(ex.dose && ex.dose.reps), hold: toNum(ex.dose && ex.dose.hold), min: toNum(ex.dose && ex.dose.min) }
            : { sets: 1, reps: null, hold: null, min: null };
        }
      }
      l.mins = map;
      l.goal = g;
      return l;
    });

  const toggleSymptom = (id) =>
    updateLog(selKey, (l) => {
      if (l.flared.includes(id)) {
        l.flared = l.flared.filter((x) => x !== id);
        delete l.severity[id];
        delete l.quality[id];
      } else {
        l.flared = [...l.flared, id];
      }
      return l;
    });
  const setSteps = (n) =>
    updateLog(selKey, (l) => {
      l.steps = Math.max(0, Math.min(parseInt(n, 10) || 0, 200000));
      return l;
    });
  const setQuality = (id, q) =>
    updateLog(selKey, (l) => {
      if (l.quality[id] === q) delete l.quality[id];
      else l.quality[id] = q;
      return l;
    });
  const setSeverity = (id, v) =>
    updateLog(selKey, (l) => {
      if (l.severity[id] === v) delete l.severity[id];
      else l.severity[id] = v;
      return l;
    });

  /* ---- note ---- */
  const noteTimer = useRef();
  const commitNote = (v) => updateLog(selKey, (l) => ((l.note = v), l));
  const onNoteChange = (e) => {
    const v = e.target.value;
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => commitNote(v), 500);
  };

  /* ---- edit ops ---- */
  const setter = (which) => (which === "ex" ? setExercises : setSymptoms);
  const val = (which) => (which === "ex" ? exercises : symptoms);
  const mutateList = (which, fn, debounced) => {
    const next = fn([...val(which)]);
    setter(which)(next);
    const cfg = which === "ex" ? { exercises: next, symptoms } : { exercises, symptoms: next };
    (debounced ? saveJSONDebounced : saveJSON)("physio-config", cfg);
  };
  const renameItem = (which, id, name) =>
    mutateList(which, (arr) => arr.map((i) => (i.id === id ? { ...i, name } : i)), true);
  const setDose = (id, field, raw) =>
    mutateList("ex", (arr) => arr.map((i) => (i.id === id ? { ...i, dose: { ...i.dose, [field]: toNum(raw) } } : i)), true);
  const setDesc = (id, desc) =>
    mutateList("ex", (arr) => arr.map((i) => (i.id === id ? { ...i, desc: desc.slice(0, 1000) } : i)), true);
  const setExType = (id, type) =>
    mutateList("ex", (arr) => arr.map((i) => (i.id === id ? { ...i, type } : i)));
  /* tap cycles: none → primary → secondary → light → none */
  const cycleExMuscle = (id, regionId) =>
    mutateList("ex", (arr) =>
      arr.map((i) => {
        if (i.id !== id) return i;
        const m = { ...(i.muscles || {}) };
        const cur = m[regionId];
        if (!cur) m[regionId] = 1;
        else if (cur === 3) delete m[regionId];
        else m[regionId] = cur + 1;
        return { ...i, muscles: m };
      })
    );
  /* add presets from the library as fully editable copies */
  const addFromLibrary = useCallback(
    (ids) => {
      if (!ids || !ids.length) return;
      setExercises((prev) => {
        const taken = new Set(prev.map((e) => e.name.toLowerCase()));
        const added = [];
        ids.forEach((lid) => {
          const t = LIB_BY_ID[lid];
          if (!t) return;
          let name = t.name;
          let n = 2;
          while (taken.has(name.toLowerCase())) name = `${t.name} (${n++})`;
          taken.add(name.toLowerCase());
          added.push({
            id: uid(),
            name,
            desc: t.note || "",
            type: t.type,
            muscles: { ...t.muscles },
            structures: [...(t.structures || [])],
            unit: t.unit === "min" ? "min" : "sets",
            met: t.met || null,
            source: { src: t.src, note: t.note || "", edited: false },
            archived: false,
            dose: t.dose ? { ...t.dose } : { ...EMPTY_DOSE },
          });
        });
        const next = [...prev, ...added];
        saveJSON("physio-config", { exercises: next, symptoms: stateRef.current.symptoms || [] });
        return next;
      });
    },
    []
  );

  /* merge imported step counts; never overwrites exercises, symptoms or notes,
     so the import can be re-run as often as you like */
  const applySteps = useCallback(async (rows) => {
    let touched = 0;
    setLogs((prev) => {
      const map = { ...prev };
      rows.forEach(({ date, steps }) => {
        const src = map[date] || emptyLog();
        if ((src.steps || 0) === steps) return;
        touched++;
        map[date] = { ...src, steps };
      });
      return map;
    });
    /* read back from the ref on the next tick so we persist the merged result */
    await new Promise((r) => setTimeout(r, 0));
    await saveJSONNow("physio-logs", stateRef.current.logs || {});
    return touched;
  }, []);

  /* structures are mobilised, not loaded: on/off only, no intensity weighting */
  const toggleExStructure = (id, structId) =>
    mutateList("ex", (arr) =>
      arr.map((i) => {
        if (i.id !== id) return i;
        const cur = i.structures || [];
        return { ...i, structures: cur.includes(structId) ? cur.filter((x) => x !== structId) : [...cur, structId] };
      })
    );
  const toggleSymStructure = (id, structId, side) =>
    mutateList("sy", (arr) =>
      arr.map((i) => {
        if (i.id !== id) return i;
        const r = { ...(i.structures || {}) };
        const cur = r[structId];
        const other = side === "L" ? "R" : "L";
        if (!side) {
          if (cur) delete r[structId];
          else r[structId] = "B";
        } else if (!cur) r[structId] = side;
        else if (cur === side) delete r[structId];
        else if (cur === other) r[structId] = "B";
        else r[structId] = other;
        return { ...i, structures: r };
      })
    );
  /* tapping one half toggles that anatomical side for the symptom */
  const toggleSymRegion = (id, regionId, side) =>
    mutateList("sy", (arr) =>
      arr.map((i) => {
        if (i.id !== id) return i;
        const r = { ...(i.regions || {}) };
        const cur = r[regionId];
        const other = side === "L" ? "R" : "L";
        if (!side) {
          if (cur) delete r[regionId];
          else r[regionId] = "B";
        } else if (!cur) r[regionId] = side;
        else if (cur === side) delete r[regionId];
        else if (cur === other) r[regionId] = "B";
        else r[regionId] = other; // was both → drop this side
        return { ...i, regions: r };
      })
    );
  const addItem = (which, name) => {
    const n = name.trim();
    if (!n) return;
    const item = which === "ex" ? { id: uid(), name: n, desc: "", dose: { ...EMPTY_DOSE } } : { id: uid(), name: n };
    mutateList(which, (arr) => [...arr, item]);
  };
  const removeItem = (which, id) => mutateList(which, (arr) => arr.filter((i) => i.id !== id));
  const moveItem = (which, id, dir) =>
    mutateList(which, (arr) => {
      const i = arr.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return arr;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  const resetList = (which) => {
    const next = which === "ex" ? seedExercises() : seedSymptoms();
    setter(which)(next);
    which === "ex" ? persistConfig(next, symptoms) : persistConfig(exercises, next);
  };

  /* ---- derived stats ---- */
  const activeExercises = useMemo(() => exercises.filter((e) => !e.archived), [exercises]);
  const activeSymptoms = useMemo(() => symptoms.filter((s) => !s.archived), [symptoms]);
  const completeCountOf = useCallback(
    (l) =>
      l
        ? exercises.filter((e) =>
            isMin(e) ? ((l.mins && l.mins[e.id]) || 0) >= goalMinOf(l, e) : ((l.sets && l.sets[e.id]) || 0) >= goalOf(l, e)
          ).length
        : 0,
    [exercises]
  );
  const archiveItem = (which, id, archived) =>
    mutateList(which, (arr) => arr.map((i) => (i.id === id ? { ...i, archived } : i)));
  const days14 = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, -i)), [today]);
  const streak = useMemo(() => {
    let start = completeCountOf(logs[keyOf(today)]) === 0 ? 1 : 0;
    let n = 0;
    for (let i = start; i < 400; i++) {
      if (completeCountOf(logs[keyOf(addDays(today, -i))]) > 0) n++;
      else break;
    }
    return n;
  }, [logs, today, completeCountOf]);
  const trained14 = useMemo(
    () => days14.filter((d) => completeCountOf(logs[keyOf(d)]) > 0).length,
    [days14, logs, completeCountOf]
  );
  const symptomFree14 = useMemo(
    () =>
      days14.filter((d) => {
        const l = logs[keyOf(d)];
        return !l || l.flared.length === 0;
      }).length,
    [days14, logs]
  );

  if (loading) {
    return (
      <div className="ptf" style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.inkFaint, fontFamily: FONT }}>
        <Style />
        Ladataan…
      </div>
    );
  }

  return (
    <div className="ptf" style={{ background: C.bg, minHeight: "100vh", fontFamily: FONT, color: C.ink }}>
      <Style />
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "22px 16px 48px" }}>
        <header style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: C.pineDeep, fontWeight: 600 }}>
            Fysioterapian seuranta
          </div>
          <h1 style={{ margin: "3px 0 0", fontSize: 27, fontWeight: 600, letterSpacing: "-0.02em" }}>Liikepäiväkirja</h1>
        </header>

        {/* Tabs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 4, marginBottom: 20 }}>
          {[["today", "Tänään"], ["history", "Historia"], ["edit", "Muokkaa"]].map(([id, label]) => (
            <button key={id} className="tap" onClick={() => setTab(id)}
              style={{ padding: "9px 0", borderRadius: 10, fontSize: 14, fontWeight: 600, color: tab === id ? "#fff" : C.inkSoft, background: tab === id ? C.pine : "transparent", transition: "background .18s, color .18s" }}>
              {label}
            </button>
          ))}
        </div>

        {tab === "today" && (
          <TodayView
            key={selKey}
            selected={selected}
            setSelected={setSelected}
            isToday={isToday}
            isYesterday={isYesterday}
            exercises={activeExercises}
            symptoms={activeSymptoms}
            log={log}
            setExerciseSets={setExerciseSets}
            setExerciseMins={setExerciseMins}
            toggleSymptom={toggleSymptom}
            setSeverity={setSeverity}
            setQuality={setQuality}
            setSteps={setSteps}
            onNoteChange={onNoteChange}
            commitNote={commitNote}
            marks={marks.filter((m) => m.date === selKey)}
            addMark={(text) => addMark(selKey, text, false)}
            removeMark={removeMark}
          />
        )}

        {tab === "history" && (
          <HistoryView
            days14={days14}
            logs={logs}
            symptoms={activeSymptoms}
            allSymptoms={symptoms}
            exercises={exercises}
            completeCountOf={completeCountOf}
            totalEx={activeExercises.length}
            streak={streak}
            trained14={trained14}
            symptomFree14={symptomFree14}
            today={today}
            marks={marks}
            onExport={() => setExportOpen(true)}
            onImport={() => setImportOpen(true)}
            onImportSteps={() => setStepsOpen(true)}
          />
        )}

        {tab === "edit" && (
          <EditView
            exercises={exercises}
            symptoms={symptoms}
            renameItem={renameItem}
            setDose={setDose}
            setDesc={setDesc}
            setExType={setExType}
            cycleExMuscle={cycleExMuscle}
            toggleSymRegion={toggleSymRegion}
            toggleExStructure={toggleExStructure}
            toggleSymStructure={toggleSymStructure}
            addItem={addItem}
            removeItem={removeItem}
            moveItem={moveItem}
            resetList={resetList}
            archiveItem={archiveItem}
            addFromLibrary={addFromLibrary}
            logDoseChange={logDoseChange}
          />
        )}

        {hasStore && (
          <p style={{ marginTop: 26, textAlign: "center", fontSize: 12, color: C.inkFaint }}>
            Merkinnät tallentuvat automaattisesti. Vie tiedot Historia-välilehdeltä varmuuskopioksi.
          </p>
        )}
      </div>

      {exportOpen && (
        <ExportModal exercises={exercises} symptoms={symptoms} logs={logs} marks={marks} onClose={() => setExportOpen(false)} />
      )}
      {importOpen && <ImportModal onApply={applyImport} onUndo={undoImport} canUndo={canUndoImport} onClose={() => setImportOpen(false)} />}
      {stepsOpen && <StepsModal onApply={applySteps} onClose={() => setStepsOpen(false)} />}
    </div>
  );
}
