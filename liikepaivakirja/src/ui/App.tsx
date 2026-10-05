/* ui/App — moved verbatim from liikepaivakirja.jsx (Phase 1 split). */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { EMPTY_DOSE, FREQ_DAILY, LIB_BY_ID, addDays, datasetToValues, doseSnapshotOf, emptyLog, emptyPsfs, expectedSessions, freqLabel, freqOf, goalMinOf, goalOf, isCompleteOn, isEmptyLog, isMin, keyOf, normalizeExercises, normalizeLogs, normalizeMarks, normalizePsfs, normalizeSymptoms, psfsAddActivity, psfsForgetActivity, psfsRenameActivity, psfsRetireActivity, psfsSetScore, resetToDefaults, seedExercises, seedSymptoms, startOfToday, targetSets, toNum, uid, usedIdsInLogs, weekProgress } from "../domain";
import { flushSync } from "react-dom";
import { hasStore, loadJSON, loadJSONStrict, onFlush, saveJSON, saveJSONDebounced, saveManyNow, subscribeWriteStatus } from "../storage/store";
import { preRestoreSnapshot, prune as pruneSnapshots } from "../storage/backup";
import { C, FONT } from "../styles/tokens";
import { BackupBanner, BackupSettings } from "./Backup";
import { EditView } from "./Edit";
import { ErrorBoundary } from "./ErrorBoundary";
import { HistoryView } from "./History";
import { ExportModal, ImportModal, StepsModal } from "./Modals";
import { ReportModal } from "./Report";
import { FirstRunCard, HelpButton, HelpModal } from "./Help";
import { useDaySwipe } from "./swipe";
import { OfflineNote, OfflineSettings, UpdateBanner } from "./Update";
import { TodayView } from "./Today";
import { Style } from "./common";

/* ================================================================== */
export default function App() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saveFailing, setSaveFailing] = useState(false);
  const [tab, setTab] = useState("today");
  const [exercises, setExercises] = useState([]);
  const [symptoms, setSymptoms] = useState([]);
  const [logs, setLogs] = useState({});
  const [marks, setMarks] = useState([]);
  const [psfs, setPsfs] = useState(emptyPsfs());
  const [questions, setQuestions] = useState("");
  const [selected, setSelected] = useState(startOfToday());
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [canUndoImport, setCanUndoImport] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpDismissed, setHelpDismissed] = useState(false);
  const [programUndo, setProgramUndo] = useState<any>(null);
  const undoTimer = useRef<any>(null);

  /* The calendar moves on while the app stays open (a Home Screen app resumed
     in the morning is the same page as last night). Re-render when the date
     changes, and if "today" was selected, follow it — otherwise every tap after
     midnight was logged into yesterday. Checked on resume and once a minute. */
  const [, setDayTick] = useState(0);
  const todayKeyRef = useRef(keyOf(startOfToday()));
  useEffect(() => {
    const check = () => {
      const now = keyOf(startOfToday());
      const was = todayKeyRef.current;
      if (now === was) return;
      todayKeyRef.current = now;
      setSelected((d) => (keyOf(d) === was ? startOfToday() : d));
      setDayTick((n) => n + 1);
    };
    const onVis = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", check);
    window.addEventListener("focus", check);
    const iv = setInterval(check, 60000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", check);
      window.removeEventListener("focus", check);
      clearInterval(iv);
    };
  }, []);

  const today = startOfToday();
  const selKey = keyOf(selected);
  const isToday = selKey === keyOf(today);
  const isYesterday = selKey === keyOf(addDays(today, -1));
  const log = logs[selKey] || emptyLog();

  /* mirror latest state so import can snapshot it without stale closures */
  const stateRef = useRef({});
  stateRef.current = { exercises, symptoms, logs, marks, psfs, questions };
  const undoRef = useRef(null);

  /* ---- initial load + migration ----
     Reads are strict: a read that *fails* (as opposed to a key that is absent)
     stops here with an error screen, before anything is seeded or written. It
     used to fall back to "empty", seed the default programme and save it over
     the real one — and an empty `logs` meant the first tap wrote one day over
     the whole history. */
  useEffect(() => {
    (async () => {
      let cfg, raw, rawMarks, rawPsfs, q;
      try {
        cfg = await loadJSONStrict("physio-config", null);
        raw = await loadJSONStrict("physio-logs", {});
        rawMarks = await loadJSONStrict("physio-marks", []);
        rawPsfs = await loadJSONStrict("physio-psfs", null);
        q = await loadJSONStrict("physio-questions", "");
      } catch {
        setLoadError(true);
        setLoading(false);
        return;
      }
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
      const normLogs = normalizeLogs(raw, exById);
      setLogs(normLogs);
      /* persist backfilled goal snapshots only if normalization changed anything */
      try {
        if (JSON.stringify(normLogs) !== JSON.stringify(raw)) saveJSON("physio-logs", normLogs);
      } catch {
        /* ignore */
      }
      setMarks(normalizeMarks(rawMarks));
      setPsfs(normalizePsfs(rawPsfs));
      setQuestions(typeof q === "string" ? q : "");
      const ui = await loadJSON("physio-ui", null);
      setHelpDismissed(!!(ui && ui.helpDismissed));
      const undo = await loadJSON("physio-undo", null);
      if (undo && Array.isArray(undo.exercises)) {
        undoRef.current = undo;
        setCanUndoImport(true);
      }
      setLoading(false);
    })();
  }, []);

  /* a failing write must be visible: the diary would otherwise look saved */
  useEffect(() => subscribeWriteStatus(setSaveFailing), []);

  const persistConfig = useCallback((ex, sy) => {
    saveJSON("physio-config", { exercises: ex, symptoms: sy });
  }, []);

  /* Import and restore replace the whole dataset. Everything is written in ONE
     transaction — the undo copy, a pre-restore snapshot and the new data — and
     only then is the screen updated. If the write fails nothing has changed,
     on disk or on screen, and the caller is told by the rejection. */
  const applyImport = useCallback(async (res) => {
    const prev = {
      exercises: stateRef.current.exercises || [],
      symptoms: stateRef.current.symptoms || [],
      logs: stateRef.current.logs || {},
      marks: stateRef.current.marks || [],
      psfs: stateRef.current.psfs || emptyPsfs(),
      questions: stateRef.current.questions || "",
    };
    const next = {
      exercises: res.ex,
      symptoms: res.sy,
      logs: res.logs,
      marks: res.marks || [],
      psfs: res.psfs || emptyPsfs(),
      questions: typeof res.questions === "string" ? res.questions : prev.questions,
    };
    const snap = preRestoreSnapshot(datasetToValues(prev));
    const ok = await saveManyNow({
      ...datasetToValues(next),
      "physio-undo": prev,
      [snap.key]: snap.value,
    });
    if (!ok) throw new Error("import was not saved");
    void pruneSnapshots().catch(() => {});

    undoRef.current = prev;
    setCanUndoImport(true);
    setExercises(next.exercises);
    setSymptoms(next.symptoms);
    setLogs(next.logs);
    setMarks(next.marks);
    setPsfs(next.psfs);
    setQuestions(next.questions);
    setSelected(startOfToday());
  }, []);

  /* Resolves false, changing nothing, if the write fails. The undo copy is
     deleted in the same transaction that restores from it, never before. */
  const undoImport = useCallback(async () => {
    const prev = undoRef.current;
    if (!prev) return false;
    const ok = await saveManyNow(datasetToValues(prev), ["physio-undo"]);
    if (!ok) return false;
    setExercises(prev.exercises || []);
    setSymptoms(prev.symptoms || []);
    setLogs(prev.logs || {});
    setMarks(prev.marks || []);
    setPsfs(prev.psfs || emptyPsfs());
    setQuestions(prev.questions || "");
    setSelected(startOfToday());
    undoRef.current = null;
    setCanUndoImport(false);
    return true;
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

  /* ---- PSFS ----
     Each of these is a discrete action, so it writes immediately rather than
     waiting on a flush; renaming an activity is text input, so it debounces. */
  const mutatePsfs = useCallback((fn, debounced?) => {
    setPsfs((prev) => {
      const next = fn(prev);
      (debounced ? saveJSONDebounced : saveJSON)("physio-psfs", next);
      return next;
    });
  }, []);
  const psfsScore = useCallback(
    (id, value) => mutatePsfs((p) => psfsSetScore(p, selKey, id, value)),
    [mutatePsfs, selKey]
  );
  const psfsAdd = useCallback(
    (name) => mutatePsfs((p) => psfsAddActivity(p, name, keyOf(startOfToday()))),
    [mutatePsfs]
  );
  const psfsRename = useCallback((id, name) => mutatePsfs((p) => psfsRenameActivity(p, id, name), true), [mutatePsfs]);
  const psfsRetire = useCallback((id, v) => mutatePsfs((p) => psfsRetireActivity(p, id, v)), [mutatePsfs]);
  const psfsForget = useCallback((id) => mutatePsfs((p) => psfsForgetActivity(p, id)), [mutatePsfs]);

  /* An empty diary means a first run — or a lost one; the card offers a restore
     for exactly that reason. Gated on `loading` so it cannot flash on every
     startup before IndexedDB has answered. */
  const isFresh = useMemo(
    () =>
      !loading &&
      Object.keys(logs).length === 0 &&
      marks.length === 0 &&
      Object.keys((psfs && psfs.entries) || {}).length === 0,
    [loading, logs, marks, psfs]
  );

  /* Dismissal is remembered, so someone who cleared their data and does not want
     the welcome again is not told twice. A UI preference, not diary data, so it is
     absent from DATA_KEYS and from the export. */
  /* Swiping the day. Alternating-day programmes mean the previous day is
     consulted constantly, and two taps on a 20px arrow is the wrong cost for
     that. Forward is bounded at today, matching the arrow that is disabled
     there rather than inventing a second rule. */
  const goPrevDay = useCallback(() => setSelected((d) => addDays(d, -1)), []);
  const goNextDay = useCallback(() => setSelected((d) => addDays(d, 1)), []);
  const swipe = useDaySwipe({
    selected,
    todayKey: keyOf(today),
    onPrev: goPrevDay,
    onNext: goNextDay,
    canNext: !isToday,
  });

  const dismissHelp = useCallback(() => {
    setHelpDismissed(true);
    saveJSON("physio-ui", { helpDismissed: true });
  }, []);

  /* ---- questions for the appointment: free text, debounced like the note ---- */
  const onQuestions = useCallback((v) => {
    setQuestions(v);
    saveJSONDebounced("physio-questions", v);
  }, []);

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
          g[id] = ex ? doseSnapshotOf(ex) : { sets: 1, reps: null, hold: null, min: null, freq: FREQ_DAILY };
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
          g[id] = ex ? doseSnapshotOf(ex) : { sets: 1, reps: null, hold: null, min: null, freq: FREQ_DAILY };
        }
      }
      l.mins = map;
      l.goal = g;
      return l;
    });

  /* One tap fills every exercise still owed today to the dose in force today.
     Today's prescription is the reference, not yesterday's log: copying a
     partial day forward would quietly launder a missed session into a habit.
     It never reduces a value, so a deliberate overdrive entry survives, and it
     skips anything whose weekly target is already met — the button is for
     removing friction, not for talking you into extra sessions. */
  const completeProgram = useCallback(() => {
    const cur = logs[selKey] || emptyLog();

    /* Decide everything here, synchronously, against the committed log. The
       first version of this counted the fills inside the setLogs updater, which
       React runs during render rather than during the event — so the count was
       always zero by the time it was read and the undo bar never appeared. */
    const addSets = {};
    const addMins = {};
    const addGoal = {};
    let filled = 0;
    exercises.forEach((ex) => {
      if (ex.archived) return;
      if (isCompleteOn(cur, ex)) return;
      if (weekProgress(logs, ex, selKey).met) return;
      const snap = (cur.goal && cur.goal[ex.id]) || doseSnapshotOf(ex);
      const probe = { goal: { [ex.id]: snap } };
      if (isMin(ex)) {
        const want = goalMinOf(probe, ex);
        if (((cur.mins && cur.mins[ex.id]) || 0) < want) {
          addMins[ex.id] = want;
          addGoal[ex.id] = snap;
          filled++;
        }
      } else {
        const want = goalOf(probe, ex);
        if (((cur.sets && cur.sets[ex.id]) || 0) < want) {
          addSets[ex.id] = want;
          addGoal[ex.id] = snap;
          filled++;
        }
      }
    });
    if (!filled) return;

    updateLog(selKey, (l) => {
      l.sets = { ...l.sets, ...addSets };
      l.mins = { ...l.mins, ...addMins };
      /* an existing snapshot always wins: this must not re-freeze a day */
      l.goal = { ...addGoal, ...l.goal };
      return l;
    });

    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    setProgramUndo({
      key: selKey,
      filled,
      sets: Object.keys(addSets),
      mins: Object.keys(addMins),
      before: {
        sets: { ...(cur.sets || {}) },
        mins: { ...(cur.mins || {}) },
        goal: { ...(cur.goal || {}) },
      },
    });
    undoTimer.current = window.setTimeout(() => setProgramUndo(null), 9000);
  }, [exercises, logs, selKey, updateLog]);

  /* A bulk write deserves a way back. Reverts only what the fill wrote —
     restoring the whole day's log as it was before the fill also erased a
     symptom or a note recorded in the seconds between the fill and the undo. */
  const undoProgram = useCallback(() => {
    const u = programUndo;
    if (!u) return;
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    setProgramUndo(null);
    updateLog(u.key, (l) => {
      const revert = (field, id) => {
        if (u.before[field][id] != null) l[field][id] = u.before[field][id];
        else delete l[field][id];
      };
      u.sets.forEach((id) => {
        revert("sets", id);
        revert("goal", id);
      });
      u.mins.forEach((id) => {
        revert("mins", id);
        revert("goal", id);
      });
      return l;
    });
  }, [programUndo, updateLog]);

  /* One tap both flares a symptom and grades it, because those were never two
     decisions: nobody knows a symptom came back without also knowing roughly how
     bad it was. Tapping the level that is already set clears the whole entry, so
     a mis-tap costs one tap to undo rather than a hunt for a separate toggle.

     A consequence worth stating: it is no longer possible to record "it flared
     but I have no idea how badly". That state was cheap to produce and useless to
     read — the report's mean severity had to ignore it — so requiring a level
     makes the data more complete, not less honest. Days recorded that way before
     this change still load and display as flared with no level selected. */
  const setSymptomLevel = (id, v) =>
    updateLog(selKey, (l) => {
      const on = l.flared.includes(id);
      if (on && l.severity[id] === v) {
        l.flared = l.flared.filter((x) => x !== id);
        delete l.severity[id];
        delete l.quality[id];
      } else {
        if (!on) l.flared = [...l.flared, id];
        l.severity[id] = v;
      }
      return l;
    });

  /* Explicit removal. Needed for its own sake, and it is the only way to clear a
     day recorded before levels were mandatory, where no level button is active. */
  const clearSymptom = (id) =>
    updateLog(selKey, (l) => {
      l.flared = l.flared.filter((x) => x !== id);
      delete l.severity[id];
      delete l.quality[id];
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

  /* ---- typed text: steps and the note ----
     Debounced, but a pending commit is never dropped. It used to live in a
     timer that was cancelled when the field unmounted (a swipe to another day
     or a tab switch inside the debounce window lost what was typed), that one
     day's typing cancelled another's, and that flushAll could not see, so
     backgrounding the app or applying an update lost the last keystrokes.
     Each commit is now keyed by what it writes, bound to the day it was typed
     on, and flushed by flushAll through onFlush. */
  const pendingText = useRef(new Map());
  const scheduleText = useCallback((id, commit, ms) => {
    const m = pendingText.current;
    const prev = m.get(id);
    if (prev) clearTimeout(prev.t);
    const t = setTimeout(() => {
      m.delete(id);
      commit();
    }, ms);
    m.set(id, { t, commit });
  }, []);
  const cancelText = useCallback((id) => {
    const prev = pendingText.current.get(id);
    if (prev) clearTimeout(prev.t);
    pendingText.current.delete(id);
  }, []);
  useEffect(
    () =>
      onFlush(() => {
        const all = [...pendingText.current.values()];
        pendingText.current.clear();
        all.forEach((p) => clearTimeout(p.t));
        /* synchronously, so the write has started before the page is frozen */
        if (all.length) flushSync(() => all.forEach((p) => p.commit()));
      }),
    []
  );

  const setStepsOn = useCallback(
    (key, n) =>
      updateLog(key, (l) => {
        l.steps = Math.max(0, Math.min(parseInt(n, 10) || 0, 200000));
        return l;
      }),
    [updateLog]
  );
  const onStepsChange = (v) => {
    const key = selKey;
    scheduleText(`steps:${key}`, () => setStepsOn(key, v), 700);
  };
  const commitSteps = (v) => {
    cancelText(`steps:${selKey}`);
    setStepsOn(selKey, v);
  };

  const commitNoteOn = useCallback((key, v) => updateLog(key, (l) => ((l.note = v), l)), [updateLog]);
  const onNoteChange = (e) => {
    const v = e.target.value;
    const key = selKey;
    scheduleText(`note:${key}`, () => commitNoteOn(key, v), 500);
  };
  const commitNote = (v) => {
    cancelText(`note:${selKey}`);
    commitNoteOn(selKey, v);
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
  /* A frequency change is a prescription change, so it is annotated in the
     timeline the same way a dose change is. */
  const setFreq = (id, f) => {
    const ex = exercises.find((e) => e.id === id);
    const next = Math.max(1, Math.min(FREQ_DAILY, Math.round(Number(f) || FREQ_DAILY)));
    if (ex && freqOf(ex) !== next) logDoseChange(ex.name, freqLabel(freqOf(ex)), freqLabel(next));
    mutateList("ex", (arr) => arr.map((i) => (i.id === id ? { ...i, freq: next } : i)));
  };
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
            added: keyOf(startOfToday()),
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
    /* Decided synchronously against committed state, then applied — counting
       inside a setLogs updater is the trap CLAUDE.md describes, and saving
       whatever the ref held a tick later relied on React's timing. */
    const map = { ...(stateRef.current.logs || {}) };
    let touched = 0;
    rows.forEach(({ date, steps }) => {
      const src = map[date] || emptyLog();
      if ((src.steps || 0) === steps) return;
      touched++;
      map[date] = { ...src, steps };
    });
    if (!touched) return 0;
    if (!(await saveManyNow({ "physio-logs": map }))) throw new Error("steps were not saved");
    setLogs(map);
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
    const item = which === "ex" ? { id: uid(), name: n, desc: "", dose: { ...EMPTY_DOSE }, added: keyOf(startOfToday()) } : { id: uid(), name: n };
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
    const seeds = which === "ex" ? seedExercises() : seedSymptoms();
    const next = resetToDefaults(val(which), seeds, usedIdsInLogs(logs, which), which === "ex" ? keyOf(startOfToday()) : undefined);
    setter(which)(next);
    which === "ex" ? persistConfig(next, symptoms) : persistConfig(exercises, next);
  };

  /* ---- derived stats ---- */
  const activeExercises = useMemo(() => exercises.filter((e) => !e.archived), [exercises]);
  const activeSymptoms = useMemo(() => symptoms.filter((s) => !s.archived), [symptoms]);
  /* Completed exercises on a day, archived ones included: archiving an
     exercise must not turn the days it was done into rest days. */
  const completeCountOf = useCallback((l) => (l ? exercises.filter((e) => isCompleteOn(l, e)).length : 0), [exercises]);
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

  if (loadError) {
    return (
      <div className="ptf" style={{ background: C.bg, minHeight: "100vh", fontFamily: FONT, color: C.ink }}>
        <Style />
        <div style={{ maxWidth: 420, margin: "0 auto", padding: "15vh 24px 0" }}>
          <h1 style={{ fontSize: 19, fontWeight: 600, margin: "0 0 8px" }}>Tietoja ei voitu lukea</h1>
          <p style={{ fontSize: 14.5, lineHeight: 1.55, color: C.inkSoft, margin: "0 0 18px" }}>
            Selaimen tallennustila ei vastannut. Sovellus ei kirjoittanut mitään, joten merkinnät ovat
            tallessa. Lataa sivu uudelleen.
          </p>
          <button
            className="tap"
            onClick={() => window.location.reload()}
            style={{ padding: "12px 18px", borderRadius: 12, background: C.pine, color: "#fff", fontSize: 14.5, fontWeight: 600 }}
          >
            Lataa uudelleen
          </button>
        </div>
      </div>
    );
  }

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
        <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: C.pineDeep, fontWeight: 600 }}>
              Fysioterapian seuranta
            </div>
            <h1 style={{ margin: "3px 0 0", fontSize: 27, fontWeight: 600, letterSpacing: "-0.02em" }}>Liikepäiväkirja</h1>
          </div>
          {/* Always reachable: "what is PSFS" and "where is my data" are questions
              that come up months in, not only on the first run. */}
          <HelpButton onClick={() => setHelpOpen(true)} />
        </header>

        {saveFailing && (
          <div role="alert" style={{ marginBottom: 14, fontSize: 13, lineHeight: 1.5, color: C.ink, background: C.amberTint, border: `1px solid ${C.amberLine}`, borderRadius: 12, padding: "10px 12px" }}>
            <b>Tallennus ei juuri nyt onnistu.</b> Sovellus yrittää uudelleen itse. Jos ilmoitus ei katoa,
            vie tiedot tiedostoksi ennen kuin suljet sovelluksen.
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 4, marginBottom: 20 }}>
          {[["today", "Tänään"], ["history", "Historia"], ["edit", "Muokkaa"]].map(([id, label]) => (
            <button key={id} className="tap" onClick={() => setTab(id)}
              style={{ padding: "9px 0", borderRadius: 10, fontSize: 14, fontWeight: 600, color: tab === id ? "#fff" : C.inkSoft, background: tab === id ? C.pine : "transparent", transition: "background .18s, color .18s" }}>
              {label}
            </button>
          ))}
        </div>

        {/* One boundary per tab. A throw during render unmounts the whole tree,
            so without these a bug in any single view is a white screen with no
            way back — see ui/ErrorBoundary.tsx. The boundary sits inside the
            shell so the header and the tab bar always survive, and it unmounts
            with its tab, which is what lets a tab switch clear the error. */}
        {tab === "today" && (
          <ErrorBoundary label="Tänään">
          <UpdateBanner />
          {isFresh && !helpDismissed && (
            <FirstRunCard
              onOpenHelp={() => setHelpOpen(true)}
              onGoEdit={() => setTab("edit")}
              onDismiss={dismissHelp}
            />
          )}
          <BackupBanner exercises={exercises} symptoms={symptoms} logs={logs} marks={marks} psfs={psfs} questions={questions} />

          <div ref={swipe.outerRef} {...swipe.handlers} style={swipe.outerStyle}>
          {/* Names the day a release would land on, while there is still time to
              slide back. Positioned over the pane rather than inside it so the
              drag transform does not carry it along. Updated through a ref, never
              through state — see ui/swipe.ts. */}
          {/* One element, not a styled child inside a positioned wrapper: the
              label is written with textContent, which would replace any child. */}
          <div
            ref={swipe.peekRef}
            data-day-peek=""
            aria-hidden="true"
            style={{ position: "absolute", top: 2, left: "50%", transform: "translateX(-50%)", pointerEvents: "none", zIndex: 3, opacity: 0, transition: "opacity .12s ease-out", padding: "4px 11px", borderRadius: 999, background: C.pine, color: "#fff", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", boxShadow: "0 1px 4px rgba(22,36,31,0.18)" }}
          />
          {/* Persistent: the transform lives here, so it must not be keyed.
              The data attribute is a deliberate test hook — the drag is asserted
              on the DOM, because that is where it is written. */}
          <div ref={swipe.paneRef} data-day-pane="">
          {/* Keyed on the day, so one day whose data throws does not trap the
              whole tab: swiping, or the button, moves to a fresh boundary. */}
          <ErrorBoundary key={selKey} label="Päivä" action={isToday ? null : { label: "Tänään", run: () => setSelected(startOfToday()) }}>
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
            setSymptomLevel={setSymptomLevel}
            clearSymptom={clearSymptom}
            setQuality={setQuality}
            onStepsChange={onStepsChange}
            commitSteps={commitSteps}
            onNoteChange={onNoteChange}
            commitNote={commitNote}
            marks={marks.filter((m) => m.date === selKey)}
            addMark={(text) => addMark(selKey, text, false)}
            removeMark={removeMark}
            psfs={psfs}
            dateKey={selKey}
            todayKey={keyOf(today)}
            psfsScore={psfsScore}
            psfsAdd={psfsAdd}
            psfsRename={psfsRename}
            psfsRetire={psfsRetire}
            psfsForget={psfsForget}
            logs={logs}
            completeProgram={completeProgram}
            programUndo={programUndo}
            undoProgram={undoProgram}
          />
          </ErrorBoundary>
          </div>
          </div>
          </ErrorBoundary>
        )}

        {tab === "history" && (
          <ErrorBoundary label="Historia">
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
            onReport={() => setReportOpen(true)}
          />
          </ErrorBoundary>
        )}

        {tab === "edit" && (
          <ErrorBoundary label="Muokkaa">
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
            setFreq={setFreq}
          />
          </ErrorBoundary>
        )}

        {/* Deliberately its own boundary rather than sharing the one above:
            these two *are* the escape hatches — a backup and the offline
            switch — and they have to stay reachable when the thing that broke
            is the list editor. */}
        {tab === "edit" && (
          <ErrorBoundary label="Varmuuskopiot">
          <BackupSettings
            exercises={exercises}
            symptoms={symptoms}
            logs={logs}
            marks={marks}
            psfs={psfs}
            questions={questions}
            onRestore={applyImport}
            onUndo={undoImport}
            canUndo={canUndoImport}
          />
          <OfflineSettings />
          </ErrorBoundary>
        )}

        {hasStore && (
          <p style={{ marginTop: 26, textAlign: "center", fontSize: 12, color: C.inkFaint }}>
            Merkinnät tallentuvat automaattisesti. Vie tiedot Historia-välilehdeltä varmuuskopioksi.
          </p>
        )}
        <OfflineNote />
      </div>

      {/* Modals render outside the tab boundaries, so each gets its own: a
          throw in one used to blank the whole app. */}
      {exportOpen && (
        <ErrorBoundary label="Vienti" action={{ label: "Sulje", run: () => setExportOpen(false) }}>
          <ExportModal exercises={exercises} symptoms={symptoms} logs={logs} marks={marks} psfs={psfs} questions={questions} onClose={() => setExportOpen(false)} />
        </ErrorBoundary>
      )}
      {helpOpen && (
        <ErrorBoundary label="Ohje" action={{ label: "Sulje", run: () => setHelpOpen(false) }}>
          <HelpModal onClose={() => setHelpOpen(false)} />
        </ErrorBoundary>
      )}
      {reportOpen && (
        <ErrorBoundary label="Raportti" action={{ label: "Sulje", run: () => setReportOpen(false) }}>
          <ReportModal
            exercises={exercises}
            symptoms={symptoms}
            logs={logs}
            marks={marks}
            psfs={psfs}
            questions={questions}
            setQuestions={onQuestions}
            onClose={() => setReportOpen(false)}
          />
        </ErrorBoundary>
      )}
      {importOpen && (
        <ErrorBoundary label="Tuonti" action={{ label: "Sulje", run: () => setImportOpen(false) }}>
          <ImportModal onApply={applyImport} onUndo={undoImport} canUndo={canUndoImport} onClose={() => setImportOpen(false)} />
        </ErrorBoundary>
      )}
      {stepsOpen && (
        <ErrorBoundary label="Askeltuonti" action={{ label: "Sulje", run: () => setStepsOpen(false) }}>
          <StepsModal onApply={applySteps} onClose={() => setStepsOpen(false)} />
        </ErrorBoundary>
      )}
    </div>
  );
}
