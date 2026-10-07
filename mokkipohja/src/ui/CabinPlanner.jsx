import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { C, D2R, MONO, SANS, TAP_SLOP, clamp, fmt, uid } from "../core";
import { ceilingCrossings, defaultCeiling, headroomFor, roomAt } from "../domain/ceilings";
import { bbox, defOutline, distToSeg, itemPoly, itemPolyTest, pointInPoly, polyArea, polysIntersect, raySpan, rotP, wallPoly, wallPolyTest } from "../domain/geometry";
import { seedLibrary } from "../domain/library";
import { DEF_WALL_H, openHead, openSill } from "../domain/openings";
import {
  deleteRoomCorner,
  insertRoomCorner,
  interiorAngle,
  nearMultiple,
  rebuildRoomWalls,
  snapRoomVertex,
  withAutoWalls,
} from "../domain/rooms";
import { snapItemPos, snapPoint } from "../domain/snapping";
import { b64ToBytes, buildPdf, download } from "../export/pdf";
import { PAPERS, renderSheet } from "../export/sheet";
import { groupOf, nameOf, tr } from "../i18n";
import {
  KEY_INDEX,
  KEY_LIB,
  KEY_SET,
  NS,
  deletePlanData,
  emptyDoc,
  imageKeyOf,
  kPlan,
  newImageKey,
  pruneImages,
  restoreAll,
  sGet,
  sSet,
  sSetNow,
} from "../storage";
import { downloadBackup } from "../export/backup";
import { SectionView } from "./SectionView";
import { ShapeEditor } from "./ShapeEditor";
import { Btn, Label, NumField, Sheet } from "./atoms";
import { ErrorBoundary } from "./ErrorBoundary";
import { Glyph } from "./glyphs";
import { View3D } from "../view3d/View3D";

/* ============================================================
   Main app
   ============================================================ */

export function CabinPlanner() {
  const [doc, setDoc] = useState(() => emptyDoc());
  const [library, setLibrary] = useState(() => seedLibrary());
  const [imgSrc, setImgSrc] = useState(null);
  const [index, setIndex] = useState([]);
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState("");
  const [vp, setVp] = useState({
    ox: 0,
    oy: 0,
    s: 0.04,
  });
  const [mode, setMode] = useState("select");
  const [sel, setSel] = useState(null); // {kind:'item'|'wall'|'room'|'opening', id}
  const [draft, setDraft] = useState(null); // chain of points while drawing
  const [ghost, setGhost] = useState(null); // live cursor point while drawing
  const [placingDef, setPlacingDef] = useState(null);
  const [tape, setTape] = useState(null);
  const [calib, setCalib] = useState(null);
  const [calibMm, setCalibMm] = useState("1000");
  const [grid, setGrid] = useState(50);
  const [showGrid, setShowGrid] = useState(true);
  const [showDims, setShowDims] = useState(true);
  const [sheet, setSheet] = useState(null);
  const [editShape, setEditShape] = useState(null);
  const [size, setSize] = useState({
    w: 360,
    h: 600,
  });
  const [hint, setHint] = useState("");
  const [histLen, setHistLen] = useState(0);
  const [fitReq, setFitReq] = useState(0);
  const [lang, setLang] = useState("en");
  const [showHead, setShowHead] = useState(true);
  const [showSection, setShowSection] = useState(false);
  const [selVert, setSelVert] = useState(null);
  const [show3d, setShow3d] = useState(false);
  const [invert3d, setInvert3d] = useState(false);
  const [roomTab, setRoomTab] = useState("shape");
  const [xp, setXp] = useState({
    paper: "A4",
    scaleDenom: 50,
    grid: false,
    contours: true,
  });
  const [xpOut, setXpOut] = useState(null);
  const [xpBusy, setXpBusy] = useState(false);
  const t = useCallback((k) => tr(lang, k), [lang]);
  const wrapRef = useRef(null);
  const history = useRef([]);
  const ptrs = useRef(new Map());
  const gest = useRef(null);
  const docRef = useRef(doc);
  docRef.current = doc;
  const indexRef = useRef(index);
  indexRef.current = index;
  const pending = useRef(null); // the plan waiting for its debounced write
  const freshImg = useRef(null); // a picture just imported, in case storage could not keep it
  const [confirmDel, setConfirmDel] = useState(null);
  const defs = useMemo(() => Object.fromEntries(library.map((d) => [d.id, d])), [library]);

  /* ---- load ---- */
  useEffect(() => {
    (async () => {
      const lib = await sGet(KEY_LIB);
      if (lib && Array.isArray(lib) && lib.length) setLibrary(lib);
      const st = await sGet(KEY_SET);
      if (st) {
        if (st.lang) setLang(st.lang);
        if (typeof st.grid === "number") setGrid(st.grid);
        if (typeof st.showHead === "boolean") setShowHead(st.showHead);
        if (typeof st.showGrid === "boolean") setShowGrid(st.showGrid);
        if (typeof st.showDims === "boolean") setShowDims(st.showDims);
        if (typeof st.invert3d === "boolean") setInvert3d(st.invert3d);
      }
      const idx = (await sGet(KEY_INDEX)) || [];
      setIndex(idx);
      pruneImages(); // nothing can undo back to them after a reload
      if (idx.length) {
        const d = await sGet(kPlan(idx[0].id));
        if (d) setDoc(d);
      }
      setReady(true);
    })();
  }, []);

  /* ---- autosave ----
     Writes are debounced but never dropped. Switching plans, deleting the open
     plan and hiding the page all flush the pending write first; the debounce
     used to be cancelled instead, losing the last edits. The plan list is read
     from storage at write time, not from memory: a stale copy put deleted
     plans back, and another tab's new plans would drop out of the list. */
  const flushSave = useCallback(() => {
    const d = pending.current;
    if (!d) return null;
    pending.current = null;
    const ok = sSetNow(kPlan(d.id), d);
    let current = indexRef.current;
    try {
      const raw = JSON.parse(localStorage.getItem(NS + KEY_INDEX));
      if (Array.isArray(raw)) current = raw;
    } catch (e) {}
    const nidx = [
      {
        id: d.id,
        name: d.name,
        updated: Date.now(),
      },
      ...current.filter((p) => p.id !== d.id),
    ];
    indexRef.current = nidx;
    setIndex(nidx);
    sSetNow(KEY_INDEX, nidx);
    return ok;
  }, []);
  useEffect(() => {
    if (!ready) return;
    pending.current = doc;
    setSaveState("saving");
    const t = setTimeout(() => {
      const ok = flushSave();
      setSaveState(ok === false ? "error" : "saved");
      setTimeout(() => setSaveState(""), 1400);
    }, 700);
    return () => clearTimeout(t);
  }, [doc, ready, flushSave]);
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") flushSave();
    };
    window.addEventListener("pagehide", flushSave);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flushSave);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [flushSave]);

  /* The picture follows the plan, Undo included: it is looked up by the key
     the plan records, so removing or replacing it and then undoing brings the
     right pixels back. */
  const imgKey = imageKeyOf(doc);
  useEffect(() => {
    let live = true;
    if (!imgKey) setImgSrc(null);
    else if (freshImg.current && freshImg.current.key === imgKey) setImgSrc(freshImg.current.src);
    else sGet(imgKey).then((src) => live && setImgSrc(src));
    return () => {
      live = false;
    };
  }, [imgKey]);

  useEffect(() => {
    if (!confirmDel) return;
    const tm = setTimeout(() => setConfirmDel(null), 3000);
    return () => clearTimeout(tm);
  }, [confirmDel]);

  /* Every switch to another plan goes through here. The leaving plan's pending
     edits are written first, and its undo history goes with it: kept, Undo
     would write the old plan over the new one. Pictures it no longer shows can
     be cleaned up once no history can bring them back. */
  const openDoc = useCallback(
    (d) => {
      const leaving = docRef.current;
      flushSave();
      if (leaving && leaving.id !== d.id) pruneImages(leaving.id);
      history.current = [];
      setHistLen(0);
      gest.current = null;
      setSel(null);
      setSelVert(null);
      setDraft(null);
      setGhost(null);
      setDoc(d);
    },
    [flushSave],
  );
  useEffect(() => {
    if (ready) sSet(KEY_LIB, library);
  }, [library, ready]);
  useEffect(() => {
    if (ready)
      sSet(KEY_SET, {
        lang,
        grid,
        showHead,
        showGrid,
        showDims,
        invert3d,
      });
  }, [lang, grid, showHead, showGrid, showDims, invert3d, ready]);

  /* ---- resize ---- */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({
        w: r.width,
        h: r.height,
      });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setSize({
      w: r.width,
      h: r.height,
    });
    return () => ro.disconnect();
  }, []);

  /* ---- transforms ---- */
  const toWorld = useCallback(
    (sx, sy) => ({
      x: (sx - vp.ox) / vp.s,
      y: (sy - vp.oy) / vp.s,
    }),
    [vp],
  );
  const local = useCallback((e) => {
    const r = wrapRef.current.getBoundingClientRect();
    return {
      x: e.clientX - r.left,
      y: e.clientY - r.top,
    };
  }, []);
  const push = useCallback((d) => {
    // commit pushes from inside a state updater, which React may run twice
    if (history.current[history.current.length - 1] === d) return;
    history.current.push(d);
    if (history.current.length > 60) history.current.shift();
    setHistLen(history.current.length);
  }, []);
  const commit = useCallback(
    (fn) => {
      setDoc((prev) => {
        push(prev);
        return fn(prev);
      });
    },
    [push],
  );
  const undo = () => {
    const p = history.current.pop();
    setHistLen(history.current.length);
    if (p) {
      setDoc(p);
      setSel(null);
      setDraft(null);
      setGhost(null);
    }
  };
  const zoomAt = (cx, cy, factor) => {
    setVp((v) => {
      const s2 = clamp(v.s * factor, 0.004, 2);
      return {
        s: s2,
        ox: cx - (cx - v.ox) * (s2 / v.s),
        oy: cy - (cy - v.oy) * (s2 / v.s),
      };
    });
  };
  const fitAll = useCallback(() => {
    const pts = [];
    for (const w of doc.walls) pts.push(...wallPoly(w));
    for (const r of doc.rooms) pts.push(...r.points);
    for (const it of doc.items) {
      const d = defs[it.defId];
      if (d) pts.push(...itemPoly(it, d));
    }
    if (doc.image && imgSrc) {
      const i = doc.image;
      pts.push(
        {
          x: i.x,
          y: i.y,
        },
        {
          x: i.x + i.natW * i.mmPerPx,
          y: i.y + i.natH * i.mmPerPx,
        },
      );
    }
    if (!pts.length) {
      setVp({
        s: 0.04,
        ox: size.w / 2,
        oy: size.h / 2,
      });
      return;
    }
    const b = bbox(pts);
    const pad = 40;
    const s = clamp(
      Math.min((size.w - pad * 2) / Math.max(b.w, 1), (size.h - pad * 2 - 90) / Math.max(b.h, 1)),
      0.004,
      2,
    );
    setVp({
      s,
      ox: size.w / 2 - b.cx * s,
      oy: (size.h - 60) / 2 - b.cy * s,
    });
  }, [doc, defs, imgSrc, size]);
  useEffect(() => {
    if (ready && size.w > 10)
      setVp((v) =>
        v.ox === 0 && v.oy === 0
          ? {
              ...v,
              ox: size.w / 2,
              oy: size.h / 2,
            }
          : v,
      );
  }, [ready, size]);
  useEffect(() => {
    if (fitReq) fitAll();
  }, [fitReq]);
  const selRoomId = sel && sel.kind === "room" ? sel.id : null;
  useEffect(() => {
    setSelVert(null);
  }, [selRoomId]);

  /* ---- hit testing ---- */
  const hitTest = useCallback(
    (wp, tolPx) => {
      const tol = tolPx / vp.s;
      for (let i = doc.items.length - 1; i >= 0; i--) {
        const it = doc.items[i],
          d = defs[it.defId];
        if (!d) continue;
        if (pointInPoly(wp, itemPoly(it, d)))
          return {
            kind: "item",
            id: it.id,
          };
      }
      for (const o of doc.openings) {
        const w = doc.walls.find((x) => x.id === o.wallId);
        if (!w) continue;
        const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
        const ux = (w.x2 - w.x1) / L,
          uy = (w.y2 - w.y1) / L;
        const a = {
          x: w.x1 + ux * o.off,
          y: w.y1 + uy * o.off,
        };
        const b = {
          x: w.x1 + ux * (o.off + o.w),
          y: w.y1 + uy * (o.off + o.w),
        };
        if (distToSeg(wp, a, b) < Math.max(w.t / 2, tol))
          return {
            kind: "opening",
            id: o.id,
          };
      }
      for (let i = doc.walls.length - 1; i >= 0; i--) {
        const w = doc.walls[i];
        if (
          distToSeg(
            wp,
            {
              x: w.x1,
              y: w.y1,
            },
            {
              x: w.x2,
              y: w.y2,
            },
          ) < Math.max(w.t / 2, tol)
        )
          return {
            kind: "wall",
            id: w.id,
          };
      }
      for (let i = doc.rooms.length - 1; i >= 0; i--)
        if (pointInPoly(wp, doc.rooms[i].points))
          return {
            kind: "room",
            id: doc.rooms[i].id,
          };
      return null;
    },
    [doc, defs, vp.s],
  );

  /* rotate handle sits a fixed 30 px beyond the top edge, whatever the zoom */
  const handleWorld = useCallback(
    (it, def) => {
      const lb = bbox(defOutline(def));
      const r = rotP(
        {
          x: 0,
          y: -(lb.h / 2 + 30 / vp.s),
        },
        (it.rot || 0) * D2R,
      );
      return {
        x: it.x + r.x,
        y: it.y + r.y,
      };
    },
    [vp.s],
  );

  /* ---- pointer handling ---- */
  const onDown = (e) => {
    /* Buttons and fields float inside the canvas element, so their pointer events
       bubble here too. Without this, tapping "Set" also counted as a tap on the
       drawing and restarted whatever you were doing. */
    if (e.target && e.target.closest && e.target.closest("[data-ui]")) return;
    const p = local(e);
    const now = Date.now();
    /* Drop pointers we never saw released — a lost pointerup (OS gesture, long-press
       menu, page switch) would otherwise leave a phantom finger down and make the
       next single-finger drag look like a pinch. */
    if (ptrs.current.size) {
      for (const [id, q] of [...ptrs.current]) if (now - q.t > 4000) ptrs.current.delete(id);
    }
    ptrs.current.set(e.pointerId, {
      x: p.x,
      y: p.y,
      t: now,
    });
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      if (gest.current?.type === "drag" && gest.current.snapshot) setDoc(gest.current.snapshot);
      gest.current = {
        type: "pinch",
        d0: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1),
        m0: {
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
        },
        vp0: vp,
      };
      return;
    }
    if (ptrs.current.size > 2) return;
    const wp = toWorld(p.x, p.y);

    /* Placing drops the piece straight away and keeps hold of it, so the same
       press can slide it into position. */
    if (mode === "place" && placingDef && defs[placingDef]) {
      const def = defs[placingDef];
      const raw = {
        id: uid(),
        defId: placingDef,
        x: wp.x,
        y: wp.y,
        rot: 0,
      };
      const sn = snapItemPos(raw, def, doc, defs, grid, 14 / vp.s);
      const item = {
        ...raw,
        x: sn.x,
        y: sn.y,
      };
      commit((prev) => ({
        ...prev,
        items: [...prev.items, item],
      }));
      setSel({
        kind: "item",
        id: item.id,
      });
      setMode("select");
      setPlacingDef(null);
      setGhost(null);
      gest.current = {
        type: "drag",
        target: {
          kind: "item",
          id: item.id,
        },
        grab: {
          x: 0,
          y: 0,
        },
        snapshot: null,
        start: p,
        t: now,
        maxD: 0,
      };
      return;
    }
    if (mode === "select") {
      /* room reshaping: solid handles move a corner, hollow ones add one */
      if (selRoom) {
        const pts = selRoom.points;
        for (let i = 0; i < pts.length; i++) {
          if (Math.hypot(wp.x - pts[i].x, wp.y - pts[i].y) * vp.s < 20) {
            setSelVert(i);
            setRoomTab("shape");
            gest.current = {
              type: "vertex",
              roomId: selRoom.id,
              index: i,
              snapshot: doc,
              start: p,
              t: now,
              maxD: 0,
            };
            return;
          }
        }
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i],
            b = pts[(i + 1) % pts.length];
          const m = {
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
          };
          if (Math.hypot(wp.x - m.x, wp.y - m.y) * vp.s < 17) {
            const idx = i + 1;
            const next = insertRoomCorner(doc, selRoom.id, i, m);
            commit(() => next); // one undo step for adding the corner and dragging it
            setSelVert(idx);
            setRoomTab("shape");
            gest.current = {
              type: "vertex",
              roomId: selRoom.id,
              index: idx,
              snapshot: next,
              recorded: true,
              start: p,
              t: now,
              maxD: 0,
            };
            return;
          }
        }
      }
      if (selItem && defs[selItem.defId]) {
        const hp = handleWorld(selItem, defs[selItem.defId]);
        if (Math.hypot(wp.x - hp.x, wp.y - hp.y) * vp.s < 22) {
          gest.current = {
            type: "rotate",
            id: selItem.id,
            snapshot: doc,
            start: p,
            t: Date.now(),
            maxD: 0,
          };
          return;
        }
      }
      const h = hitTest(wp, 12);
      if (h && h.kind === "item") {
        const it = doc.items.find((x) => x.id === h.id);
        setSel(h);
        gest.current = {
          type: "drag",
          target: h,
          grab: {
            x: wp.x - it.x,
            y: wp.y - it.y,
          },
          snapshot: doc,
          start: p,
          t: Date.now(),
          maxD: 0,
        };
        return;
      }
      if (h && h.kind === "wall") {
        const w = doc.walls.find((x) => x.id === h.id);
        const dEnd1 = Math.hypot(wp.x - w.x1, wp.y - w.y1) * vp.s;
        const dEnd2 = Math.hypot(wp.x - w.x2, wp.y - w.y2) * vp.s;
        setSel(h);
        if (Math.min(dEnd1, dEnd2) < 22) {
          gest.current = {
            type: "drag",
            target: {
              ...h,
              vert: dEnd1 < dEnd2 ? 1 : 2,
            },
            snapshot: doc,
            start: p,
            t: Date.now(),
            maxD: 0,
          };
        } else {
          gest.current = {
            type: "drag",
            target: h,
            grab: wp,
            snapshot: doc,
            start: p,
            t: Date.now(),
            maxD: 0,
          };
        }
        return;
      }
      if (h && h.kind === "opening") {
        setSel(h);
        gest.current = {
          type: "drag",
          target: h,
          snapshot: doc,
          start: p,
          t: Date.now(),
          maxD: 0,
        };
        return;
      }
      if (h && h.kind === "room") setSel(h);
      else if (doc.image && !doc.image.locked && imgSrc) {
        const i = doc.image;
        if (
          wp.x > i.x &&
          wp.x < i.x + i.natW * i.mmPerPx &&
          wp.y > i.y &&
          wp.y < i.y + i.natH * i.mmPerPx
        ) {
          setSel(null);
          gest.current = {
            type: "drag",
            target: {
              kind: "image",
            },
            grab: {
              x: wp.x - i.x,
              y: wp.y - i.y,
            },
            snapshot: doc,
            start: p,
            t: Date.now(),
            maxD: 0,
          };
          return;
        }
        setSel(null);
      } else setSel(null);
      gest.current = {
        type: "pan",
        start: p,
        vp0: vp,
        t: Date.now(),
        maxD: 0,
      };
      return;
    }
    gest.current = {
      type: "tool",
      start: p,
      vp0: vp,
      t: Date.now(),
      maxD: 0,
    };
    setGhost(wp);
  };
  const onMove = (e) => {
    if (!ptrs.current.has(e.pointerId)) {
      // hover preview (mouse only) — ignore movement outside the drawing surface
      if (mode !== "select" && draft && wrapRef.current && wrapRef.current.contains(e.target)) {
        const p = local(e);
        setGhost(snapPoint(toWorld(p.x, p.y), doc, grid, 16 / vp.s, draft[draft.length - 1]));
      }
      return;
    }
    const p = local(e);
    ptrs.current.set(e.pointerId, {
      x: p.x,
      y: p.y,
      t: Date.now(),
    });
    const g = gest.current;
    if (!g) return;
    if (g.type === "pinch" && ptrs.current.size >= 2) {
      const [a, b] = [...ptrs.current.values()];
      const d1 = Math.hypot(a.x - b.x, a.y - b.y);
      const m1 = {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
      };
      const s2 = clamp(g.vp0.s * (d1 / g.d0), 0.004, 2);
      setVp({
        s: s2,
        ox: m1.x - (g.m0.x - g.vp0.ox) * (s2 / g.vp0.s),
        oy: m1.y - (g.m0.y - g.vp0.oy) * (s2 / g.vp0.s),
      });
      return;
    }
    /* furthest distance travelled, not a one-way flag: a tap that wobbles and
       settles back still reads as a tap */
    if (g.start) {
      const d = Math.hypot(p.x - g.start.x, p.y - g.start.y);
      if (d > (g.maxD || 0)) g.maxD = d;
    }
    const moved = (g.maxD || 0) > TAP_SLOP;
    if (g.type === "pan") {
      setVp({
        s: g.vp0.s,
        ox: g.vp0.ox + (p.x - g.start.x),
        oy: g.vp0.oy + (p.y - g.start.y),
      });
      return;
    }
    if (g.type === "tool") {
      // a drag pans even while a drawing tool is active; a tap places a point
      if (moved)
        setVp({
          s: g.vp0.s,
          ox: g.vp0.ox + (p.x - g.start.x),
          oy: g.vp0.oy + (p.y - g.start.y),
        });
      else setGhost(snapPoint(toWorld(p.x, p.y), doc, grid, 16 / vp.s, draft?.[draft.length - 1]));
      return;
    }
    if (g.type === "vertex") {
      /* Rebuilt from the state at the start of the drag on every move: walls
         clamp their openings to their length, and building on the live state
         let a wall that was short for a moment shrink its doors for good. */
      const base = g.snapshot || doc;
      const room = base.rooms.find((r) => r.id === g.roomId);
      if (!room) return;
      const sn = snapRoomVertex(toWorld(p.x, p.y), room.points, g.index, base, grid, 18 / vp.s);
      const rooms = base.rooms.map((r) =>
        r.id === g.roomId
          ? {
              ...r,
              points: r.points.map((q, k) =>
                k === g.index
                  ? {
                      x: sn.x,
                      y: sn.y,
                    }
                  : q,
              ),
            }
          : r,
      );
      setDoc(
        withAutoWalls(
          {
            ...base,
            rooms,
          },
          g.roomId,
        ),
      );
      return;
    }
    if (g.type === "rotate") {
      const it = doc.items.find((x) => x.id === g.id);
      if (!it) return;
      let ang = Math.atan2(p.y - (it.y * vp.s + vp.oy), p.x - (it.x * vp.s + vp.ox)) / D2R + 90;
      const sn = Math.round(ang / 15) * 15;
      if (Math.abs(sn - ang) < 5) ang = sn;
      setDoc((prev) => ({
        ...prev,
        items: prev.items.map((x) =>
          x.id === g.id
            ? {
                ...x,
                rot: Math.round(ang * 10) / 10,
              }
            : x,
        ),
      }));
      return;
    }
    if (g.type === "drag") {
      const wp = toWorld(p.x, p.y);
      const t = g.target;
      if (t.kind === "item") {
        setDoc((prev) => {
          const items = prev.items.map((it) => {
            if (it.id !== t.id) return it;
            const raw = {
              ...it,
              x: wp.x - g.grab.x,
              y: wp.y - g.grab.y,
            };
            const sn = snapItemPos(raw, defs[it.defId], prev, defs, grid, 14 / vp.s);
            return {
              ...raw,
              x: sn.x,
              y: sn.y,
            };
          });
          return {
            ...prev,
            items,
          };
        });
      } else if (t.kind === "wall" && t.vert) {
        const sp = snapPoint(
          wp,
          {
            walls: doc.walls.filter((w) => w.id !== t.id),
            rooms: doc.rooms,
          },
          grid,
          16 / vp.s,
          null,
        );
        setDoc((prev) => ({
          ...prev,
          walls: prev.walls.map((w) =>
            w.id === t.id
              ? t.vert === 1
                ? {
                    ...w,
                    x1: sp.x,
                    y1: sp.y,
                  }
                : {
                    ...w,
                    x2: sp.x,
                    y2: sp.y,
                  }
              : w,
          ),
        }));
      } else if (t.kind === "wall") {
        const dx = wp.x - g.grab.x,
          dy = wp.y - g.grab.y;
        setDoc((prev) => ({
          ...prev,
          walls: prev.walls.map((w) => {
            if (w.id !== t.id) return w;
            const base = g.snapshot.walls.find((q) => q.id === t.id);
            return {
              ...w,
              x1: base.x1 + dx,
              y1: base.y1 + dy,
              x2: base.x2 + dx,
              y2: base.y2 + dy,
            };
          }),
        }));
      } else if (t.kind === "opening") {
        const w = doc.walls.find((x) => x.id === doc.openings.find((o) => o.id === t.id).wallId);
        if (w) {
          const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
          const proj = ((wp.x - w.x1) * (w.x2 - w.x1) + (wp.y - w.y1) * (w.y2 - w.y1)) / L;
          setDoc((prev) => ({
            ...prev,
            openings: prev.openings.map((o) =>
              o.id === t.id
                ? {
                    ...o,
                    off: clamp(Math.round((proj - o.w / 2) / 10) * 10, 0, L - o.w),
                  }
                : o,
            ),
          }));
        }
      } else if (t.kind === "image") {
        setDoc((prev) => ({
          ...prev,
          image: {
            ...prev.image,
            x: wp.x - g.grab.x,
            y: wp.y - g.grab.y,
          },
        }));
      }
    }
  };
  const onUp = (e) => {
    const tracked = ptrs.current.delete(e.pointerId);
    const g = gest.current;
    if (!tracked) {
      // released something that didn't start on the canvas (a button, a sheet)
      if (!ptrs.current.size && g) gest.current = null;
      return;
    }
    if (ptrs.current.size >= 1) {
      if (g?.type === "pinch") {
        const [a] = [...ptrs.current.values()];
        gest.current = {
          type: "pan",
          start: a,
          vp0: vp,
          t: Date.now(),
          maxD: 999,
        };
      }
      return;
    }
    gest.current = null;
    if (!g) return;
    if (
      (g.type === "drag" || g.type === "rotate" || g.type === "vertex") &&
      (g.maxD || 0) > 2 &&
      g.snapshot &&
      !g.recorded
    )
      push(g.snapshot);
    const isTap = (g.maxD || 0) <= TAP_SLOP && Date.now() - g.t < 900;
    if ((g.type === "tool" || g.type === "pan") && isTap) {
      const p = local(e);
      const wp = toWorld(p.x, p.y);
      handleToolTap(wp, p);
    }
    if (mode !== "wall" && mode !== "room") setGhost(null);
  };

  /* ---- tool taps ---- */
  const handleToolTap = (wpRaw, screenP) => {
    if (mode === "wall" || mode === "room") {
      const prev = draft?.[draft.length - 1];
      const wp = snapPoint(wpRaw, doc, grid, 16 / vp.s, prev);
      if (!draft) {
        setDraft([wp]);
        setGhost(wp);
        return;
      }
      if (
        mode === "room" &&
        draft.length > 2 &&
        Math.hypot(wp.x - draft[0].x, wp.y - draft[0].y) * vp.s < 24
      ) {
        finishDraft(draft);
        return;
      }
      if (prev && Math.hypot(wp.x - prev.x, wp.y - prev.y) * vp.s < 6) {
        finishDraft(draft);
        return;
      }
      setDraft([...draft, wp]);
      setGhost(wp);
      return;
    }
    if (mode === "door") {
      let best = null,
        bd = Infinity;
      for (const w of doc.walls) {
        const d = distToSeg(
          wpRaw,
          {
            x: w.x1,
            y: w.y1,
          },
          {
            x: w.x2,
            y: w.y2,
          },
        );
        if (d < bd) {
          bd = d;
          best = w;
        }
      }
      if (!best || bd > Math.max(best.t, 300 / vp.s)) {
        setHint(tr(lang, "tipDoor"));
        return;
      }
      const L = Math.hypot(best.x2 - best.x1, best.y2 - best.y1) || 1;
      const proj = clamp(
        ((wpRaw.x - best.x1) * (best.x2 - best.x1) + (wpRaw.y - best.y1) * (best.y2 - best.y1)) / L,
        0,
        L,
      );
      const wid = Math.min(800, L);
      const o = {
        id: uid(),
        wallId: best.id,
        off: clamp(proj - wid / 2, 0, L - wid),
        w: wid,
        kind: "door",
        flip: false,
        side: 1,
      };
      commit((prev) => ({
        ...prev,
        openings: [...prev.openings, o],
      }));
      setSel({
        kind: "opening",
        id: o.id,
      });
      setMode("select");
      return;
    }
    if (mode === "place" && placingDef) {
      const def = defs[placingDef];
      if (!def) return;
      const raw = {
        id: uid(),
        defId: placingDef,
        x: wpRaw.x,
        y: wpRaw.y,
        rot: 0,
      };
      const sn = snapItemPos(raw, def, doc, defs, grid, 14 / vp.s);
      const item = {
        ...raw,
        x: sn.x,
        y: sn.y,
      };
      commit((prev) => ({
        ...prev,
        items: [...prev.items, item],
      }));
      setSel({
        kind: "item",
        id: item.id,
      });
      setMode("select");
      setPlacingDef(null);
      return;
    }
    if (mode === "tape") {
      const wp = snapPoint(wpRaw, doc, grid, 16 / vp.s, null);
      if (!tape || tape.b)
        setTape({
          a: wp,
          b: null,
        });
      else
        setTape({
          ...tape,
          b: wp,
        });
      return;
    }
    if (mode === "calibrate") {
      const wp = wpRaw;
      if (!calib || calib.b)
        setCalib({
          a: wp,
          b: null,
        });
      else
        setCalib({
          ...calib,
          b: wp,
        });
      return;
    }
  };
  const finishDraft = (pts) => {
    if (mode === "wall") {
      if (pts.length < 2) {
        setDraft(null);
        setGhost(null);
        return;
      }
      const walls = [];
      for (let i = 0; i < pts.length - 1; i++)
        walls.push({
          id: uid(),
          x1: pts[i].x,
          y1: pts[i].y,
          x2: pts[i + 1].x,
          y2: pts[i + 1].y,
          t: doc.wallT,
        });
      commit((prev) => ({
        ...prev,
        walls: [...prev.walls, ...walls],
      }));
    } else if (mode === "room") {
      if (pts.length < 3) {
        setDraft(null);
        setGhost(null);
        return;
      }
      {
        const room = {
          id: uid(),
          name: tr(lang, "room"),
          points: pts,
          ceiling: defaultCeiling(),
          autoWalls: {
            mode: "centre",
            t: doc.wallT,
          },
        };
        commit((prev) =>
          rebuildRoomWalls(
            {
              ...prev,
              rooms: [...prev.rooms, room],
            },
            room,
          ),
        );
        setSel({
          kind: "room",
          id: room.id,
        });
      }
    }
    setDraft(null);
    setGhost(null);
  };

  /* Move and release are handled on `window`, not on the canvas element. If the
     browser steals a gesture (long-press menu, OS edge swipe, app switch) the
     element may never see pointerup; window still does, and the blur /
     visibilitychange handlers sweep up anything that slips through. */
  const moveRef = useRef(null),
    upRef = useRef(null);
  moveRef.current = onMove;
  upRef.current = onUp;
  useEffect(() => {
    const m = (e) => moveRef.current && moveRef.current(e);
    const u = (e) => upRef.current && upRef.current(e);
    const clear = () => {
      ptrs.current.clear();
      gest.current = null;
    };
    window.addEventListener("pointermove", m, {
      passive: false,
    });
    window.addEventListener("pointerup", u);
    window.addEventListener("pointercancel", u);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => {
      window.removeEventListener("pointermove", m);
      window.removeEventListener("pointerup", u);
      window.removeEventListener("pointercancel", u);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
    };
  }, []);
  const vpRef = useRef(vp);
  vpRef.current = vp;

  /* touchstart carries an authoritative list of fingers actually on the glass.
     pointerdown fires just before it, so if our map has more pointers than the
     hardware reports, the extras are phantoms from a lost pointerup — drop them
     and demote a pinch that shouldn't have started. */
  useEffect(() => {
    const reconcile = (e) => {
      const live = e.touches ? e.touches.length : 0;
      if (!live || ptrs.current.size <= live) return;
      const keep = new Set(
        [...ptrs.current.entries()]
          .sort((a, b) => b[1].t - a[1].t)
          .slice(0, live)
          .map(([id]) => id),
      );
      for (const [id] of [...ptrs.current]) if (!keep.has(id)) ptrs.current.delete(id);
      if (ptrs.current.size < 2 && gest.current?.type === "pinch") {
        const [a] = [...ptrs.current.values()];
        gest.current = a
          ? {
              type: "pan",
              start: {
                x: a.x,
                y: a.y,
              },
              vp0: vpRef.current,
              t: Date.now(),
              maxD: 999,
            }
          : null;
      }
    };
    window.addEventListener("touchstart", reconcile, {
      passive: true,
    });
    return () => window.removeEventListener("touchstart", reconcile);
  }, []);
  const onWheel = (e) => {
    if (e.cancelable) e.preventDefault();
    const p = local(e);
    zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)));
  };

  /* ---- image import ---- */
  const importImage = (file) => {
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        const max = 1700;
        const k = Math.min(1, max / Math.max(im.width, im.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(im.width * k);
        cv.height = Math.round(im.height * k);
        cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
        const url = cv.toDataURL("image/jpeg", 0.82);
        /* a new key each time, so the picture it replaces stays for Undo */
        const key = newImageKey(doc.id);
        freshImg.current = { key, src: url };
        if (!sSetNow(key, url)) setHint(tr(lang, "quotaFull"));
        const mmPerPx = 8000 / cv.width;
        commit((prev) => ({
          ...prev,
          image: {
            key,
            natW: cv.width,
            natH: cv.height,
            mmPerPx,
            x: -(cv.width * mmPerPx) / 2,
            y: -(cv.height * mmPerPx) / 2,
            opacity: 0.6,
            locked: false,
          },
        }));
        setSheet(null);
        setHint(tr(lang, "tipScale"));
        setFitReq((n) => n + 1);
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  };
  const doCalibrate = () => {
    const n = parseFloat(String(calibMm).replace(",", "."));
    if (isNaN(n) || n <= 0) {
      setHint(tr(lang, "badLen"));
      return;
    }
    applyCalibration(n);
  };
  const applyCalibration = (realMm) => {
    if (!calib?.a || !calib?.b || !doc.image) return;
    const cur = Math.hypot(calib.b.x - calib.a.x, calib.b.y - calib.a.y);
    if (cur < 1) return;
    const k = realMm / cur;
    commit((prev) => ({
      ...prev,
      image: {
        ...prev.image,
        mmPerPx: prev.image.mmPerPx * k,
        x: calib.a.x + (prev.image.x - calib.a.x) * k,
        y: calib.a.y + (prev.image.y - calib.a.y) * k,
      },
    }));
    setCalib(null);
    setMode("select");
    setHint(tr(lang, "tipScaled"));
    setFitReq((n) => n + 1);
  };

  /* ---- selection helpers ---- */
  const selItem = sel?.kind === "item" ? doc.items.find((i) => i.id === sel.id) : null;
  const selWall = sel?.kind === "wall" ? doc.walls.find((w) => w.id === sel.id) : null;
  const selRoom = sel?.kind === "room" ? doc.rooms.find((r) => r.id === sel.id) : null;
  const selOpen = sel?.kind === "opening" ? doc.openings.find((o) => o.id === sel.id) : null;
  const updItem = (patch, snap) => {
    commit((prev) => ({
      ...prev,
      items: prev.items.map((it) => {
        if (it.id !== sel.id) return it;
        let next = {
          ...it,
          ...patch,
        };
        if (snap) {
          const s = snapItemPos(next, defs[next.defId], prev, defs, grid, 14 / vp.s);
          next = {
            ...next,
            x: s.x,
            y: s.y,
          };
        }
        return next;
      }),
    }));
  };
  const delSel = () => {
    if (!sel) return;
    commit((prev) => {
      if (sel.kind === "item")
        return {
          ...prev,
          items: prev.items.filter((i) => i.id !== sel.id),
        };
      if (sel.kind === "wall")
        return {
          ...prev,
          walls: prev.walls.filter((w) => w.id !== sel.id),
          openings: prev.openings.filter((o) => o.wallId !== sel.id),
        };
      if (sel.kind === "room") {
        const gone = new Set(prev.walls.filter((w) => w.room === sel.id).map((w) => w.id));
        return {
          ...prev,
          rooms: prev.rooms.filter((r) => r.id !== sel.id),
          walls: prev.walls.filter((w) => w.room !== sel.id),
          openings: prev.openings.filter((o) => !gone.has(o.wallId)),
        };
      }
      if (sel.kind === "opening")
        return {
          ...prev,
          openings: prev.openings.filter((o) => o.id !== sel.id),
        };
      return prev;
    });
    setSel(null);
  };

  /* ---- headroom under a sloping ceiling ---- */
  const headroom = useMemo(() => {
    if (!selItem || !defs[selItem.defId]) return null;
    const r = headroomFor(selItem, defs[selItem.defId], doc);
    if (!r) return null;
    const hz = defs[selItem.defId].hz || 0;
    return {
      ...r,
      hz,
      tooTall: hz > 0 && hz > r.mm,
    };
  }, [selItem, defs, doc]);

  /* section is cut through whatever is selected, else the room centre */
  const sectionRoom = useMemo(() => {
    if (selItem) {
      const r = roomAt(doc, {
        x: selItem.x,
        y: selItem.y,
      });
      if (r) return r;
    }
    if (selRoom) return selRoom;
    return doc.rooms[0] || null;
  }, [selItem, selRoom, doc.rooms]);
  const sectionAt = useMemo(() => {
    if (!sectionRoom) return 0;
    const c = sectionRoom.ceiling || defaultCeiling();
    const perp = (c.mode === "flat" ? "x" : c.axis) === "x" ? "y" : "x";
    if (selItem) return perp === "x" ? selItem.x : selItem.y;
    const b = bbox(sectionRoom.points);
    return perp === "x" ? b.cx : b.cy;
  }, [sectionRoom, selItem]);

  /* ---- overlaps ---- */
  const overlaps = useMemo(() => {
    const bad = new Set();
    const polys = doc.items
      .map((it) => ({
        id: it.id,
        p: defs[it.defId] ? itemPolyTest(it, defs[it.defId]) : null,
      }))
      .filter((x) => x.p);
    const wt = doc.walls.map(wallPolyTest);
    for (let i = 0; i < polys.length; i++) {
      for (let j = i + 1; j < polys.length; j++)
        if (polysIntersect(polys[i].p, polys[j].p)) {
          bad.add(polys[i].id);
          bad.add(polys[j].id);
        }
      for (const w of wt) if (polysIntersect(polys[i].p, w)) bad.add(polys[i].id);
    }
    return bad;
  }, [doc.items, doc.walls, defs]);

  /* ---- grid lines ---- */
  const gridLines = useMemo(() => {
    if (!showGrid || size.w < 10) return [];
    const tl = toWorld(0, 0),
      br = toWorld(size.w, size.h);
    const out = [];
    const tiers = [
      {
        step: 10,
        col: C.grid10,
        w: 0.5,
      },
      {
        step: 100,
        col: C.grid100,
        w: 0.7,
      },
      {
        step: 1000,
        col: C.grid1000,
        w: 1,
      },
    ];
    for (const t of tiers) {
      const px = t.step * vp.s;
      if (px < 7) continue;
      const nx = Math.ceil((br.x - tl.x) / t.step);
      const ny = Math.ceil((br.y - tl.y) / t.step);
      if (nx > 420 || ny > 420) continue;
      const x0 = Math.floor(tl.x / t.step) * t.step;
      const y0 = Math.floor(tl.y / t.step) * t.step;
      for (let i = 0; i <= nx; i++)
        out.push({
          x1: x0 + i * t.step,
          y1: tl.y,
          x2: x0 + i * t.step,
          y2: br.y,
          c: t.col,
          w: t.w,
        });
      for (let i = 0; i <= ny; i++)
        out.push({
          x1: tl.x,
          y1: y0 + i * t.step,
          x2: br.x,
          y2: y0 + i * t.step,
          c: t.col,
          w: t.w,
        });
    }
    return out;
  }, [showGrid, vp, size, toWorld]);

  /* ---- wall joints ---- */
  const joints = useMemo(() => {
    const map = new Map();
    for (const w of doc.walls) {
      for (const [x, y] of [
        [w.x1, w.y1],
        [w.x2, w.y2],
      ]) {
        const k = `${Math.round(x)}_${Math.round(y)}`;
        const e = map.get(k) || {
          x,
          y,
          n: 0,
          t: 0,
        };
        e.n++;
        e.t = Math.max(e.t, w.t);
        map.set(k, e);
      }
    }
    return [...map.values()].filter((j) => j.n > 1);
  }, [doc.walls]);

  /* ---- dimension readouts for selection ---- */
  const dimLines = useMemo(() => {
    if (!showDims || !selItem || !defs[selItem.defId]) return [];
    const b = bbox(itemPoly(selItem, defs[selItem.defId]));
    const out = [];
    const cases = [
      {
        axis: "x",
        sign: -1,
        from: {
          x: b.x0,
          y: b.cy,
        },
      },
      {
        axis: "x",
        sign: 1,
        from: {
          x: b.x1,
          y: b.cy,
        },
      },
      {
        axis: "y",
        sign: -1,
        from: {
          x: b.cx,
          y: b.y0,
        },
      },
      {
        axis: "y",
        sign: 1,
        from: {
          x: b.cx,
          y: b.y1,
        },
      },
    ];
    for (const c of cases) {
      const d = raySpan(c.from, c.axis, c.sign, doc.walls);
      if (d == null || d > 12000) continue;
      const to =
        c.axis === "x"
          ? {
              x: c.from.x + d * c.sign,
              y: c.from.y,
            }
          : {
              x: c.from.x,
              y: c.from.y + d * c.sign,
            };
      out.push({
        a: c.from,
        b: to,
        mm: d,
      });
    }
    return out;
  }, [showDims, selItem, defs, doc.walls]);

  /* ---- scale bar ---- */
  const bar = useMemo(() => {
    const cands = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    let pick = cands[0];
    for (const c of cands) {
      if (c * vp.s <= 130) pick = c;
    }
    return {
      mm: pick,
      px: pick * vp.s,
    };
  }, [vp.s]);
  const ratio = Math.round(3.7795 / vp.s);

  /* ---- render ---- */
  const S = (p) => ({
    x: p.x * vp.s + vp.ox,
    y: p.y * vp.s + vp.oy,
  });
  const labels = [];
  const tools = [
    ["select", "select", t("select")],
    ["wall", "wall", t("wall")],
    ["room", "room", t("room")],
    ["door", "door", t("opening")],
    ["furniture", "furn", t("furniture")],
    ["tape", "tape", t("measure")],
    ["image", "image", t("image")],
    ["section", "section", t("section")],
    ["view3d", "cube", t("view3d")],
    ["export", "export", t("xport")],
  ];
  const totalArea = doc.rooms.reduce((a, r) => a + polyArea(r.points), 0) / 1e6;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: C.chrome,
        color: C.text,
        fontFamily: SANS,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "9px 12px",
          borderBottom: `1px solid ${C.line}`,
          background: C.chrome,
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => setSheet("project")}
          style={{
            background: "none",
            border: "none",
            color: C.text,
            padding: 0,
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 1,
            minWidth: 0,
            flex: 1,
          }}
        >
          <Label
            style={{
              fontSize: 8.5,
              color: C.accent2,
            }}
          >
            Mökkipohja
          </Label>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
          >
            {doc.name}
            {" ▾"}
          </span>
        </button>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 11,
            color: C.dim,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          ≈1:
          {ratio}
        </span>
        <button
          onClick={undo}
          disabled={!histLen}
          style={{
            background: C.chrome3,
            border: `1px solid ${C.line}`,
            borderRadius: 7,
            color: C.text,
            padding: "6px 10px",
            fontSize: 12,
            cursor: "pointer",
            opacity: histLen ? 1 : 0.4,
          }}
        >
          {t("undo")}
        </button>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            flexShrink: 0,
            background:
              saveState === "saved"
                ? C.accent2
                : saveState === "saving"
                  ? "#6b7f84"
                  : saveState === "error"
                    ? C.bad
                    : "transparent",
          }}
        />
      </div>
      <div
        ref={wrapRef}
        onPointerDown={onDown}
        onWheel={onWheel}
        style={{
          position: "relative",
          flex: 1,
          touchAction: "none",
          overflow: "hidden",
          background: C.paper,
          cursor: mode === "select" ? "grab" : "crosshair",
        }}
      >
        <svg
          width={size.w}
          height={size.h}
          style={{
            display: "block",
            position: "absolute",
            inset: 0,
          }}
        >
          <defs>
            <pattern
              id="hatch"
              width="8"
              height="8"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="8" stroke={C.bad} strokeWidth="2" opacity="0.5" />
            </pattern>
          </defs>
          {doc.image &&
            imgSrc &&
            (() => {
              const a = S({
                x: doc.image.x,
                y: doc.image.y,
              });
              return (
                <g>
                  <image
                    href={imgSrc}
                    x={a.x}
                    y={a.y}
                    width={doc.image.natW * doc.image.mmPerPx * vp.s}
                    height={doc.image.natH * doc.image.mmPerPx * vp.s}
                    opacity={doc.image.opacity}
                    preserveAspectRatio="none"
                  />
                  {!doc.image.locked && (
                    <rect
                      x={a.x}
                      y={a.y}
                      width={doc.image.natW * doc.image.mmPerPx * vp.s}
                      height={doc.image.natH * doc.image.mmPerPx * vp.s}
                      fill="none"
                      stroke={C.accent}
                      strokeWidth={1}
                      strokeDasharray="5 4"
                    />
                  )}
                </g>
              );
            })()}
          <g>
            {gridLines.map((l, i) => {
              const a = S({
                  x: l.x1,
                  y: l.y1,
                }),
                b = S({
                  x: l.x2,
                  y: l.y2,
                });
              return (
                <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={l.c} strokeWidth={l.w} />
              );
            })}
          </g>
          {doc.rooms.map((r) => {
            const pts = r.points
              .map(S)
              .map((p) => `${p.x},${p.y}`)
              .join(" ");
            const b = bbox(r.points.map(S));
            const isSel = sel?.kind === "room" && sel.id === r.id;
            labels.push({
              x: b.cx,
              y: b.cy,
              t: `${(polyArea(r.points) / 1e6).toFixed(1)} m²`,
              s: 12,
              c: "#7A8172",
              w: 600,
            });
            return (
              <polygon
                key={r.id}
                points={pts}
                fill={C.room}
                stroke={isSel ? C.accent : "#B9BBA6"}
                strokeWidth={isSel ? 2 : 1}
                strokeDasharray={isSel ? "" : "6 4"}
              />
            );
          })}
          {showHead &&
            doc.rooms.map((r) => {
              const c = r.ceiling;
              if (!c || c.mode === "flat") return null;
              const rb = bbox(r.points);
              const cid = "clip_" + r.id;
              const lines = [];
              for (const T of [1200, 1500, 1800, 2100]) {
                for (const v of ceilingCrossings(r, T))
                  lines.push({
                    v,
                    T,
                  });
              }
              if (!lines.length) return null;
              return (
                <g key={"hc" + r.id}>
                  <clipPath id={cid}>
                    <polygon
                      points={r.points
                        .map(S)
                        .map((p) => `${p.x},${p.y}`)
                        .join(" ")}
                    />
                  </clipPath>
                  <g clipPath={`url(#${cid})`}>
                    {lines.map((l, i) => {
                      const a =
                        c.axis === "x"
                          ? S({
                              x: l.v,
                              y: rb.y0,
                            })
                          : S({
                              x: rb.x0,
                              y: l.v,
                            });
                      const b2 =
                        c.axis === "x"
                          ? S({
                              x: l.v,
                              y: rb.y1,
                            })
                          : S({
                              x: rb.x1,
                              y: l.v,
                            });
                      labels.push({
                        x: c.axis === "x" ? a.x : a.x + 26,
                        y: c.axis === "x" ? a.y + 12 : a.y - 7,
                        t: String(l.T),
                        s: 9.5,
                        c: "#9A7B3E",
                        w: 600,
                      });
                      return (
                        <line
                          key={i}
                          x1={a.x}
                          y1={a.y}
                          x2={b2.x}
                          y2={b2.y}
                          stroke="#9A7B3E"
                          strokeWidth={1}
                          strokeDasharray="5 4"
                          opacity={0.85}
                        />
                      );
                    })}
                  </g>
                </g>
              );
            })}
          {doc.walls.map((w) => {
            const pts = wallPoly(w)
              .map(S)
              .map((p) => `${p.x},${p.y}`)
              .join(" ");
            return <polygon key={w.id} points={pts} fill={C.ink} />;
          })}
          {joints.map((j, i) => {
            const p = S(j);
            return <circle key={i} cx={p.x} cy={p.y} r={(j.t / 2) * vp.s} fill={C.ink} />;
          })}
          {doc.openings.map((o) => {
            const w = doc.walls.find((x) => x.id === o.wallId);
            if (!w) return null;
            const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
            const ux = (w.x2 - w.x1) / L,
              uy = (w.y2 - w.y1) / L;
            const nx = -uy,
              ny = ux;
            const P = (d, n) =>
              S({
                x: w.x1 + ux * d + nx * n,
                y: w.y1 + uy * d + ny * n,
              });
            const o1 = o.off,
              o2 = o.off + o.w;
            const quad = [
              P(o1, -w.t / 2 - 1),
              P(o2, -w.t / 2 - 1),
              P(o2, w.t / 2 + 1),
              P(o1, w.t / 2 + 1),
            ];
            const isSel = sel?.kind === "opening" && sel.id === o.id;
            const hinge = o.flip ? o2 : o1;
            const dir = o.flip ? -1 : 1;
            const sw = o.side;
            const leafEnd = P(hinge, sw * o.w);
            // sample the 90° swing from the open leaf round to the wall line
            const H = {
              x: w.x1 + ux * hinge,
              y: w.y1 + uy * hinge,
            };
            const a1 = Math.atan2(ny * sw, nx * sw);
            let da = Math.atan2(uy * dir, ux * dir) - a1;
            while (da > Math.PI) da -= 2 * Math.PI;
            while (da < -Math.PI) da += 2 * Math.PI;
            const swing = Array.from(
              {
                length: 13,
              },
              (_, i) => {
                const a = a1 + (da * i) / 12;
                return S({
                  x: H.x + Math.cos(a) * o.w,
                  y: H.y + Math.sin(a) * o.w,
                });
              },
            );
            return (
              <g key={o.id}>
                <polygon points={quad.map((p) => `${p.x},${p.y}`).join(" ")} fill={C.paper} />
                {o.kind === "window" ? (
                  <React.Fragment>
                    <line
                      x1={P(o1, -w.t / 6).x}
                      y1={P(o1, -w.t / 6).y}
                      x2={P(o2, -w.t / 6).x}
                      y2={P(o2, -w.t / 6).y}
                      stroke={C.ink}
                      strokeWidth={1.4}
                    />
                    <line
                      x1={P(o1, w.t / 6).x}
                      y1={P(o1, w.t / 6).y}
                      x2={P(o2, w.t / 6).x}
                      y2={P(o2, w.t / 6).y}
                      stroke={C.ink}
                      strokeWidth={1.4}
                    />
                  </React.Fragment>
                ) : (
                  <React.Fragment>
                    <line
                      x1={P(hinge, 0).x}
                      y1={P(hinge, 0).y}
                      x2={leafEnd.x}
                      y2={leafEnd.y}
                      stroke={C.ink}
                      strokeWidth={1.8}
                    />
                    <polyline
                      points={swing.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke="#6E7A72"
                      strokeWidth={1.1}
                      strokeDasharray="4 3"
                    />
                  </React.Fragment>
                )}
                <polygon
                  points={quad.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke={isSel ? C.accent : "transparent"}
                  strokeWidth={2}
                />
              </g>
            );
          })}
          {doc.items.map((it) => {
            const def = defs[it.defId];
            if (!def) return null;
            const poly = itemPoly(it, def);
            const spts = poly.map(S);
            const isSel = sel?.kind === "item" && sel.id === it.id;
            const bad = overlaps.has(it.id);
            const b = bbox(spts);
            if (vp.s * Math.max(bbox(poly).w, bbox(poly).h) > 46)
              labels.push({
                x: b.cx,
                y: b.cy,
                t: nameOf(def, lang),
                s: 10,
                c: "#6B5227",
                w: 600,
              });
            return (
              <g key={it.id}>
                <polygon
                  points={spts.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill={bad ? "url(#hatch)" : C.timberFill}
                  stroke={isSel ? C.accent : bad ? C.bad : C.timber}
                  strokeWidth={isSel ? 2.4 : 1.5}
                />
                {isSel &&
                  (() => {
                    const hp = S(handleWorld(it, def));
                    const c = S(it);
                    return (
                      <React.Fragment>
                        <line
                          x1={c.x}
                          y1={c.y}
                          x2={hp.x}
                          y2={hp.y}
                          stroke={C.accent}
                          strokeWidth={1}
                          strokeDasharray="3 3"
                        />
                        <circle
                          cx={hp.x}
                          cy={hp.y}
                          r={8}
                          fill={C.accent}
                          stroke="#fff"
                          strokeWidth={1.5}
                        />
                      </React.Fragment>
                    );
                  })()}
              </g>
            );
          })}
          {selRoom &&
            (() => {
              const pts = selRoom.points;
              const n = pts.length;
              const sp = pts.map(S);
              const unit = (a, b) => {
                const dx = b.x - a.x,
                  dy = b.y - a.y,
                  L = Math.hypot(dx, dy) || 1;
                return {
                  x: dx / L,
                  y: dy / L,
                };
              };
              const marks = [],
                edges = [];
              pts.forEach((b, i) => {
                const a = pts[(i - 1 + n) % n],
                  c = pts[(i + 1) % n];
                const deg = interiorAngle(pts, i);
                const nice = nearMultiple(deg, 45, 0.4);
                const col = nice ? C.accent : "#98A08C";
                const u1 = unit(b, a),
                  u2 = unit(b, c);
                const sb = sp[i];
                if (nearMultiple(deg, 90, 0.4) && Math.round(deg) % 180 !== 0) {
                  const R = 13; // the draughtsman's square tick
                  marks.push(
                    <polyline
                      key={"sq" + i}
                      fill="none"
                      stroke={col}
                      strokeWidth={1.6}
                      points={
                        `${sb.x + u1.x * R},${sb.y + u1.y * R} ` +
                        `${sb.x + (u1.x + u2.x) * R},${sb.y + (u1.y + u2.y) * R} ` +
                        `${sb.x + u2.x * R},${sb.y + u2.y * R}`
                      }
                    />,
                  );
                } else {
                  const R = 15;
                  const a1 = Math.atan2(u1.y, u1.x);
                  let sweep = deg * D2R;
                  const probe = {
                    x: b.x + Math.cos(a1 + sweep / 2) * 200,
                    y: b.y + Math.sin(a1 + sweep / 2) * 200,
                  };
                  if (!pointInPoly(probe, pts)) sweep = -sweep;
                  const arc = Array.from(
                    {
                      length: 15,
                    },
                    (_, k) => {
                      const ang = a1 + (sweep * k) / 14;
                      return `${sb.x + Math.cos(ang) * R},${sb.y + Math.sin(ang) * R}`;
                    },
                  );
                  marks.push(
                    <polyline
                      key={"ar" + i}
                      points={arc.join(" ")}
                      fill="none"
                      stroke={col}
                      strokeWidth={nice ? 1.6 : 1.1}
                    />,
                  );
                }
                let bis = {
                  x: u1.x + u2.x,
                  y: u1.y + u2.y,
                };
                const bl = Math.hypot(bis.x, bis.y);
                bis =
                  bl < 0.05
                    ? {
                        x: -u1.y,
                        y: u1.x,
                      }
                    : {
                        x: bis.x / bl,
                        y: bis.y / bl,
                      };
                const inward = pointInPoly(
                  {
                    x: b.x + bis.x * 150,
                    y: b.y + bis.y * 150,
                  },
                  pts,
                )
                  ? 1
                  : -1;
                labels.push({
                  x: sb.x + bis.x * inward * 33,
                  y: sb.y + bis.y * inward * 33,
                  t: (Math.round(deg * 10) / 10).toFixed(deg % 1 ? 1 : 0) + "°",
                  s: 10.5,
                  c: col,
                  w: nice ? 700 : 500,
                  box: true,
                });
              });
              pts.forEach((a, i) => {
                const b = pts[(i + 1) % n],
                  sa = sp[i],
                  sb2 = sp[(i + 1) % n];
                const mm = Math.hypot(b.x - a.x, b.y - a.y);
                if (mm * vp.s < 34) return;
                const u = unit(a, b),
                  nx = -u.y,
                  ny = u.x;
                const mid = {
                  x: (a.x + b.x) / 2,
                  y: (a.y + b.y) / 2,
                };
                const outward = pointInPoly(
                  {
                    x: mid.x + nx * 120,
                    y: mid.y + ny * 120,
                  },
                  pts,
                )
                  ? -1
                  : 1;
                labels.push({
                  x: (sa.x + sb2.x) / 2 + nx * outward * 19,
                  y: (sa.y + sb2.y) / 2 + ny * outward * 19,
                  t: String(Math.round(mm)),
                  s: 10.5,
                  c: "#5F6659",
                  w: 600,
                  box: true,
                });
                edges.push(
                  <circle
                    key={"m" + i}
                    cx={(sa.x + sb2.x) / 2}
                    cy={(sa.y + sb2.y) / 2}
                    r={5.5}
                    fill={C.paper}
                    stroke={C.accent}
                    strokeWidth={1.6}
                    opacity={0.9}
                  />,
                );
              });
              return (
                <g>
                  <polyline
                    points={[...sp, sp[0]].map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={C.accent}
                    strokeWidth={1.6}
                    opacity={0.55}
                  />
                  {marks}
                  {edges}
                  {sp.map((p, i) => (
                    <circle
                      key={"v" + i}
                      cx={p.x}
                      cy={p.y}
                      r={selVert === i ? 9 : 7.5}
                      fill={selVert === i ? C.accent : "#fff"}
                      stroke={selVert === i ? "#fff" : C.accent}
                      strokeWidth={2.2}
                    />
                  ))}
                </g>
              );
            })()}
          {dimLines.map((d, i) => {
            const a = S(d.a),
              b = S(d.b);
            labels.push({
              x: (a.x + b.x) / 2,
              y: (a.y + b.y) / 2 - 6,
              t: Math.round(d.mm) + "",
              s: 11,
              c: C.accent,
              w: 700,
              box: true,
            });
            return (
              <g key={i}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={C.accent} strokeWidth={1.1} />
                <circle cx={a.x} cy={a.y} r={2.2} fill={C.accent} />
                <circle cx={b.x} cy={b.y} r={2.2} fill={C.accent} />
              </g>
            );
          })}
          {draft &&
            (() => {
              const last = draft[draft.length - 1];
              const live = ghost && Math.hypot(ghost.x - last.x, ghost.y - last.y) > 1;
              const chain = live ? [...draft, ghost] : draft;
              const sp = chain.map(S);
              const segs = [];
              for (let i = 0; i < sp.length - 1; i++) {
                const mm = Math.hypot(chain[i + 1].x - chain[i].x, chain[i + 1].y - chain[i].y);
                labels.push({
                  x: (sp[i].x + sp[i + 1].x) / 2,
                  y: (sp[i].y + sp[i + 1].y) / 2 - 8,
                  t: Math.round(mm) + "",
                  s: 12,
                  c: C.accent,
                  w: 700,
                  box: true,
                });
                segs.push(i);
              }
              return (
                <g>
                  <polyline
                    points={sp.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={C.accent}
                    strokeWidth={mode === "wall" ? Math.max(2, doc.wallT * vp.s) : 2}
                    opacity={mode === "wall" ? 0.45 : 1}
                  />
                  {sp.map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={i === 0 ? 5 : 3.5}
                      fill={i === 0 ? C.accent : "#fff"}
                      stroke={C.accent}
                      strokeWidth={2}
                    />
                  ))}
                </g>
              );
            })()}
          {tape &&
            (() => {
              const a = S(tape.a);
              const bp = tape.b ? S(tape.b) : ghost ? S(ghost) : null;
              if (!bp) return <circle cx={a.x} cy={a.y} r={5} fill={C.accent} />;
              const mm = Math.hypot((tape.b || ghost).x - tape.a.x, (tape.b || ghost).y - tape.a.y);
              labels.push({
                x: (a.x + bp.x) / 2,
                y: (a.y + bp.y) / 2 - 10,
                t: fmt(mm),
                s: 13,
                c: C.accent,
                w: 700,
                box: true,
              });
              return (
                <g>
                  <line x1={a.x} y1={a.y} x2={bp.x} y2={bp.y} stroke={C.accent} strokeWidth={2} />
                  <circle cx={a.x} cy={a.y} r={4} fill={C.accent} />
                  <circle cx={bp.x} cy={bp.y} r={4} fill={C.accent} />
                </g>
              );
            })()}
          {calib &&
            (() => {
              const a = S(calib.a);
              const bp = calib.b ? S(calib.b) : null;
              return (
                <g>
                  <circle cx={a.x} cy={a.y} r={6} fill="none" stroke={C.bad} strokeWidth={2.5} />
                  {bp && (
                    <React.Fragment>
                      <line x1={a.x} y1={a.y} x2={bp.x} y2={bp.y} stroke={C.bad} strokeWidth={2} />
                      <circle
                        cx={bp.x}
                        cy={bp.y}
                        r={6}
                        fill="none"
                        stroke={C.bad}
                        strokeWidth={2.5}
                      />
                    </React.Fragment>
                  )}
                </g>
              );
            })()}
          <g
            style={{
              pointerEvents: "none",
            }}
          >
            {labels.map((l, i) => (
              <g key={i}>
                {l.box && (
                  <rect
                    x={l.x - (l.t.length * l.s * 0.31 + 4)}
                    y={l.y - l.s * 0.92}
                    width={l.t.length * l.s * 0.62 + 8}
                    height={l.s * 1.22}
                    rx={3}
                    fill="rgba(233,231,220,0.9)"
                  />
                )}
                <text
                  x={l.x}
                  y={l.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily={MONO}
                  fontSize={l.s}
                  fontWeight={l.w}
                  fill={l.c}
                  style={{
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {l.t}
                </text>
              </g>
            ))}
          </g>
        </svg>
        {!doc.walls.length && !doc.rooms.length && !doc.items.length && !doc.image && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "26%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              padding: 24,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                fontFamily: MONO,
                fontSize: 13,
                color: "#8A8F7E",
                textAlign: "center",
                lineHeight: 1.6,
                maxWidth: 300,
              }}
            >
              {t("emptyHelp")}
            </div>
            <div
              data-ui={true}
              style={{
                display: "flex",
                gap: 8,
                pointerEvents: "auto",
              }}
            >
              <Btn
                small={true}
                onClick={() => {
                  const w = 5000,
                    h = 7000;
                  const P = [
                    {
                      x: -w / 2,
                      y: -h / 2,
                    },
                    {
                      x: w / 2,
                      y: -h / 2,
                    },
                    {
                      x: w / 2,
                      y: h / 2,
                    },
                    {
                      x: -w / 2,
                      y: h / 2,
                    },
                  ];
                  const room = {
                    id: uid(),
                    name: doc.name,
                    points: P,
                    ceiling: defaultCeiling(),
                    autoWalls: {
                      mode: "centre",
                      t: doc.wallT,
                    },
                  };
                  commit((prev) =>
                    rebuildRoomWalls(
                      {
                        ...prev,
                        rooms: [...prev.rooms, room],
                      },
                      room,
                    ),
                  );
                  setSel({
                    kind: "room",
                    id: room.id,
                  });
                  setFitReq((n) => n + 1);
                }}
              >
                {t("starter")}
              </Btn>
            </div>
          </div>
        )}
        <div
          style={{
            position: "absolute",
            left: 12,
            bottom: 12,
            display: "flex",
            alignItems: "flex-end",
            gap: 10,
            pointerEvents: "none",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                height: 11,
              }}
            >
              <span
                style={{
                  width: 1.5,
                  height: 11,
                  background: C.ink,
                }}
              />
              <span
                style={{
                  width: bar.px - 3,
                  height: 1.5,
                  background: C.ink,
                }}
              />
              <span
                style={{
                  width: 1.5,
                  height: 11,
                  background: C.ink,
                }}
              />
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10.5,
                color: "#5F6659",
                marginTop: 2,
                width: bar.px,
                textAlign: "center",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {bar.mm >= 1000 ? bar.mm / 1000 + " m" : bar.mm + " mm"}
            </div>
          </div>
        </div>
        <div
          data-ui={true}
          style={{
            position: "absolute",
            right: 10,
            bottom: 12,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {[
            ["+", 1.5],
            ["−", 1 / 1.5],
          ].map(([t, f]) => (
            <button
              key={t}
              onClick={() => zoomAt(size.w / 2, size.h / 2, f)}
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: "rgba(27,37,40,0.86)",
                border: `1px solid ${C.line}`,
                color: C.text,
                fontSize: 19,
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              {t}
            </button>
          ))}
          <button
            onClick={fitAll}
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: "rgba(27,37,40,0.86)",
              border: `1px solid ${C.line}`,
              color: C.text,
              fontSize: 10,
              cursor: "pointer",
              fontFamily: SANS,
              letterSpacing: "0.06em",
            }}
          >
            FIT
          </button>
        </div>
        {(draft ||
          mode === "wall" ||
          mode === "room" ||
          mode === "door" ||
          mode === "calibrate" ||
          mode === "place") && (
          <div
            data-ui={true}
            style={{
              position: "absolute",
              left: 12,
              right: 12,
              top: 10,
              display: "flex",
              gap: 8,
              alignItems: "center",
              background: "rgba(27,37,40,0.92)",
              border: `1px solid ${C.line}`,
              borderRadius: 10,
              padding: "8px 10px",
            }}
          >
            <span
              style={{
                fontFamily: MONO,
                fontSize: 11.5,
                color: C.accent2,
                flex: 1,
                lineHeight: 1.4,
              }}
            >
              {mode === "wall" && (draft ? t("hWall2") : t("hWall"))}
              {mode === "room" && (draft ? t("hRoom2") : t("hRoom"))}
              {mode === "door" && t("hDoor")}
              {mode === "place" && t("hPlace")}
              {mode === "calibrate" && (!calib ? t("hCal1") : !calib.b ? t("hCal2") : t("hCal3"))}
            </span>
            {draft && (
              <Btn small={true} onClick={() => finishDraft(draft)}>
                {t("finish")}
              </Btn>
            )}
            {calib?.b && (
              <React.Fragment>
                <input
                  value={calibMm}
                  inputMode="decimal"
                  autoFocus={true}
                  onChange={(e) => setCalibMm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") doCalibrate();
                  }}
                  style={{
                    width: 74,
                    background: C.chrome,
                    border: `1px solid ${C.line}`,
                    borderRadius: 7,
                    color: C.text,
                    fontFamily: MONO,
                    fontSize: 16,
                    padding: "5px 8px",
                    outline: "none",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                />
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    color: C.dim,
                  }}
                >
                  mm
                </span>
                <Btn small={true} active={true} onClick={doCalibrate}>
                  {t("setScaleGo")}
                </Btn>
              </React.Fragment>
            )}
            <Btn
              small={true}
              onClick={() => {
                setDraft(null);
                setGhost(null);
                setCalib(null);
                setMode("select");
              }}
            >
              ✕
            </Btn>
          </div>
        )}
        {hint && (
          <div
            data-ui={true}
            onPointerDown={() => setHint("")}
            style={{
              position: "absolute",
              left: 12,
              right: 12,
              bottom: 70,
              background: "rgba(20,128,143,0.94)",
              borderRadius: 10,
              padding: "9px 12px",
              fontFamily: MONO,
              fontSize: 11.5,
              lineHeight: 1.45,
            }}
          >
            {hint}
          </div>
        )}
      </div>
      {showSection && (
        <ErrorBoundary lang={lang} onClose={() => setShowSection(false)}>
          <SectionView
            doc={doc}
            defs={defs}
            lang={lang}
            room={sectionRoom}
            atPos={sectionAt}
            height={152}
            t={t}
          />
        </ErrorBoundary>
      )}
      {sel && (
        <div
          style={{
            background: C.chrome2,
            borderTop: `1px solid ${C.line}`,
            padding: "11px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            flexShrink: 0,
            maxHeight: showSection ? "30vh" : "42vh",
            overflowY: "auto",
          }}
        >
          {selItem &&
            defs[selItem.defId] &&
            (() => {
              const def = defs[selItem.defId];
              const lb = bbox(defOutline(def));
              return (
                <React.Fragment>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      {nameOf(def, lang)}
                    </span>
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 11.5,
                        color: C.dim,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {Math.round(lb.w)}
                      {" × "}
                      {Math.round(lb.h)}
                      {" mm · ∠"}
                      {Math.round(selItem.rot || 0)}°
                    </span>
                    <button
                      onClick={() => setSel(null)}
                      style={{
                        marginLeft: "auto",
                        background: "none",
                        border: "none",
                        color: C.dim,
                        fontSize: 20,
                        cursor: "pointer",
                      }}
                    >
                      ×
                    </button>
                  </div>
                  {overlaps.has(selItem.id) && (
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 11,
                        color: "#F0A79A",
                      }}
                    >
                      {t("overlap")}
                    </div>
                  )}
                  {headroom && (
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "baseline",
                        fontFamily: MONO,
                        fontSize: 11.5,
                        color: headroom.tooTall ? "#F0A79A" : C.dim,
                      }}
                    >
                      <span>
                        {t("headroom")} {Math.round(headroom.mm)}
                        {" mm"}
                      </span>
                      {def.hz ? (
                        <span>
                          {"· "}
                          {t("height")} {def.hz}
                          {" mm"}
                        </span>
                      ) : null}
                      {headroom.tooTall && (
                        <span
                          style={{
                            fontWeight: 700,
                          }}
                        >
                          {"· "}
                          {t("tooTall")}
                        </span>
                      )}
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    <Btn
                      small={true}
                      onClick={() =>
                        updItem({
                          rot: (selItem.rot || 0) - 90,
                        })
                      }
                    >
                      ↺ 90°
                    </Btn>
                    <Btn
                      small={true}
                      onClick={() =>
                        updItem({
                          rot: (selItem.rot || 0) - 15,
                        })
                      }
                    >
                      ↺ 15°
                    </Btn>
                    <Btn
                      small={true}
                      onClick={() =>
                        updItem({
                          rot: (selItem.rot || 0) + 15,
                        })
                      }
                    >
                      15° ↻
                    </Btn>
                    <Btn
                      small={true}
                      onClick={() =>
                        updItem({
                          rot: (selItem.rot || 0) + 90,
                        })
                      }
                    >
                      90° ↻
                    </Btn>
                    <Btn
                      small={true}
                      onClick={() => {
                        const it = {
                          ...selItem,
                          id: uid(),
                          x: selItem.x + 300,
                          y: selItem.y + 300,
                        };
                        commit((prev) => ({
                          ...prev,
                          items: [...prev.items, it],
                        }));
                        setSel({
                          kind: "item",
                          id: it.id,
                        });
                      }}
                    >
                      {t("dup")}
                    </Btn>
                    <Btn small={true} tone="bad" onClick={delSel}>
                      {t("del")}
                    </Btn>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                    }}
                  >
                    <NumField
                      label="X"
                      value={Math.round(selItem.x)}
                      onChange={(v) =>
                        updItem({
                          x: v,
                        })
                      }
                      suffix="mm"
                      w="33%"
                    />
                    <NumField
                      label="Y"
                      value={Math.round(selItem.y)}
                      onChange={(v) =>
                        updItem({
                          y: v,
                        })
                      }
                      suffix="mm"
                      w="33%"
                    />
                    <NumField
                      label={t("angle")}
                      value={Math.round(selItem.rot || 0)}
                      onChange={(v) =>
                        updItem({
                          rot: v,
                        })
                      }
                      suffix="°"
                      w="33%"
                    />
                  </div>
                </React.Fragment>
              );
            })()}
          {selWall && (
            <React.Fragment>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {t("wall")}
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 11.5,
                    color: C.dim,
                  }}
                >
                  {Math.round(Math.hypot(selWall.x2 - selWall.x1, selWall.y2 - selWall.y1))}
                  {" mm "}
                  {t("longMm")}
                </span>
                <button
                  onClick={() => setSel(null)}
                  style={{
                    marginLeft: "auto",
                    background: "none",
                    border: "none",
                    color: C.dim,
                    fontSize: 20,
                    cursor: "pointer",
                  }}
                >
                  ×
                </button>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-end",
                }}
              >
                <NumField
                  label={t("thickness")}
                  value={selWall.t}
                  suffix="mm"
                  w="45%"
                  onChange={(v) =>
                    commit((prev) => ({
                      ...prev,
                      walls: prev.walls.map((w) =>
                        w.id === selWall.id
                          ? {
                              ...w,
                              t: clamp(v, 20, 800),
                            }
                          : w,
                      ),
                    }))
                  }
                />
                <NumField
                  label={t("wallHeight")}
                  value={selWall.room ? "—" : selWall.h || doc.wallH || DEF_WALL_H}
                  suffix="mm"
                  w="45%"
                  onChange={(v) =>
                    commit((prev) => ({
                      ...prev,
                      walls: prev.walls.map((w) =>
                        w.id === selWall.id
                          ? {
                              ...w,
                              h: clamp(v, 300, 12000),
                            }
                          : w,
                      ),
                    }))
                  }
                />
                <NumField
                  label={t("length")}
                  value={Math.round(Math.hypot(selWall.x2 - selWall.x1, selWall.y2 - selWall.y1))}
                  suffix="mm"
                  w="45%"
                  onChange={(v) =>
                    commit((prev) => ({
                      ...prev,
                      walls: prev.walls.map((w) => {
                        if (w.id !== selWall.id) return w;
                        const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
                        return {
                          ...w,
                          x2: w.x1 + ((w.x2 - w.x1) / L) * v,
                          y2: w.y1 + ((w.y2 - w.y1) / L) * v,
                        };
                      }),
                    }))
                  }
                />
                <Btn small={true} tone="bad" onClick={delSel}>
                  {t("del")}
                </Btn>
              </div>
            </React.Fragment>
          )}
          {selOpen &&
            (() => {
              const w = doc.walls.find((x) => x.id === selOpen.wallId);
              const L = w ? Math.hypot(w.x2 - w.x1, w.y2 - w.y1) : 1000;
              const up = (patch) =>
                commit((prev) => ({
                  ...prev,
                  openings: prev.openings.map((o) =>
                    o.id === selOpen.id
                      ? {
                          ...o,
                          ...patch,
                        }
                      : o,
                  ),
                }));
              return (
                <React.Fragment>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      {selOpen.kind === "door" ? t("door") : t("window")}
                    </span>
                    <button
                      onClick={() => setSel(null)}
                      style={{
                        marginLeft: "auto",
                        background: "none",
                        border: "none",
                        color: C.dim,
                        fontSize: 20,
                        cursor: "pointer",
                      }}
                    >
                      ×
                    </button>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    <Btn
                      small={true}
                      active={selOpen.kind === "door"}
                      onClick={() =>
                        up({
                          kind: "door",
                        })
                      }
                    >
                      {t("door")}
                    </Btn>
                    <Btn
                      small={true}
                      active={selOpen.kind === "window"}
                      onClick={() =>
                        up({
                          kind: "window",
                        })
                      }
                    >
                      {t("window")}
                    </Btn>
                    {selOpen.kind === "door" && (
                      <React.Fragment>
                        <Btn
                          small={true}
                          onClick={() =>
                            up({
                              flip: !selOpen.flip,
                            })
                          }
                        >
                          {t("flipHinge")}
                        </Btn>
                        <Btn
                          small={true}
                          onClick={() =>
                            up({
                              side: -selOpen.side,
                            })
                          }
                        >
                          {t("flipSwing")}
                        </Btn>
                      </React.Fragment>
                    )}
                    <Btn small={true} tone="bad" onClick={delSel}>
                      {t("del")}
                    </Btn>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                    }}
                  >
                    <NumField
                      label={t("width")}
                      value={Math.round(selOpen.w)}
                      suffix="mm"
                      w="50%"
                      onChange={(v) =>
                        up({
                          w: clamp(v, 100, L),
                          off: clamp(selOpen.off, 0, L - clamp(v, 100, L)),
                        })
                      }
                    />
                    <NumField
                      label={t("fromStart")}
                      value={Math.round(selOpen.off)}
                      suffix="mm"
                      w="50%"
                      onChange={(v) =>
                        up({
                          off: clamp(v, 0, L - selOpen.w),
                        })
                      }
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                    }}
                  >
                    <NumField
                      label={t("sill")}
                      value={Math.round(openSill(selOpen))}
                      suffix="mm"
                      w="50%"
                      onChange={(v) =>
                        up({
                          sill: clamp(v, 0, openHead(selOpen) - 100),
                        })
                      }
                    />
                    <NumField
                      label={t("head")}
                      value={Math.round(openHead(selOpen))}
                      suffix="mm"
                      w="50%"
                      onChange={(v) =>
                        up({
                          head: clamp(v, openSill(selOpen) + 100, 6000),
                        })
                      }
                    />
                  </div>
                </React.Fragment>
              );
            })()}
          {selRoom &&
            (() => {
              const c = selRoom.ceiling || defaultCeiling();
              const pts = selRoom.points;
              const nP = pts.length;
              /* selVert can still point past the end of a room just switched to: an
                 effect resets it, but only after this render reads it */
              const vi = selVert != null && selVert < nP ? selVert : null;
              const aw = selRoom.autoWalls;
              /* every room edit reruns the wall wrap, so walls follow the shape live */
              const upRoom = (fn) =>
                commit((prev) => {
                  const rooms = prev.rooms.map((r) => (r.id === selRoom.id ? fn(r) : r));
                  return rebuildRoomWalls(
                    {
                      ...prev,
                      rooms,
                    },
                    rooms.find((r) => r.id === selRoom.id),
                  );
                });
              const up = (patch) =>
                upRoom((r) => ({
                  ...r,
                  ceiling: {
                    ...c,
                    ...patch,
                  },
                }));
              const moveVert = (x, y) =>
                upRoom((r) => ({
                  ...r,
                  points: r.points.map((q, k) =>
                    k === vi
                      ? {
                          x,
                          y,
                        }
                      : q,
                  ),
                }));
              const setEdge = (which, L) => {
                if (vi == null || !(L > 0)) return;
                const anchor = pts[(vi + (which === "in" ? -1 : 1) + nP) % nP];
                const cur = pts[vi];
                const dx = cur.x - anchor.x,
                  dy = cur.y - anchor.y;
                const d = Math.hypot(dx, dy) || 1;
                moveVert(anchor.x + (dx / d) * L, anchor.y + (dy / d) * L);
              };
              const lenIn =
                vi == null
                  ? 0
                  : Math.hypot(
                      pts[vi].x - pts[(vi - 1 + nP) % nP].x,
                      pts[vi].y - pts[(vi - 1 + nP) % nP].y,
                    );
              const lenOut =
                vi == null
                  ? 0
                  : Math.hypot(
                      pts[vi].x - pts[(vi + 1) % nP].x,
                      pts[vi].y - pts[(vi + 1) % nP].y,
                    );
              return (
                <React.Fragment>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <input
                      value={selRoom.name}
                      onChange={(e) =>
                        setDoc((prev) => ({
                          ...prev,
                          rooms: prev.rooms.map((r) =>
                            r.id === selRoom.id
                              ? {
                                  ...r,
                                  name: e.target.value,
                                }
                              : r,
                          ),
                        }))
                      }
                      style={{
                        background: C.chrome,
                        border: `1px solid ${C.line}`,
                        borderRadius: 7,
                        color: C.text,
                        fontFamily: SANS,
                        fontSize: 14,
                        padding: "7px 9px",
                        outline: "none",
                        flex: 1,
                        minWidth: 0,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 12,
                        color: C.accent2,
                      }}
                    >
                      {(polyArea(pts) / 1e6).toFixed(2)}
                      {" m²"}
                    </span>
                    <Btn small={true} tone="bad" onClick={delSel}>
                      {t("del")}
                    </Btn>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                    }}
                  >
                    {[
                      ["shape", t("shape")],
                      ["ceiling", t("ceiling")],
                      ["walls", t("wallsTab")],
                    ].map(([k, l]) => (
                      <Btn
                        key={k}
                        small={true}
                        wide={true}
                        active={roomTab === k}
                        onClick={() => setRoomTab(k)}
                      >
                        {l}
                      </Btn>
                    ))}
                  </div>
                  {roomTab === "shape" && (
                    <React.Fragment>
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 10.5,
                          color: C.dim,
                          lineHeight: 1.5,
                        }}
                      >
                        {t("shapeHint")}
                      </div>
                      {vi != null && pts[vi] && (
                        <React.Fragment>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "baseline",
                              gap: 10,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                              }}
                            >
                              {t("corner")} {vi + 1} {t("of")} {nP}
                            </span>
                            <span
                              style={{
                                fontFamily: MONO,
                                fontSize: 11.5,
                                color: nearMultiple(interiorAngle(pts, vi), 45, 0.4)
                                  ? C.accent2
                                  : C.dim,
                              }}
                            >
                              {t("cornerAngle")} {Math.round(interiorAngle(pts, vi) * 10) / 10}
                              °
                            </span>
                            <Btn
                              small={true}
                              tone="bad"
                              style={{
                                marginLeft: "auto",
                                opacity: nP > 3 ? 1 : 0.4,
                              }}
                              onClick={() => {
                                if (nP <= 3) return;
                                commit((prev) => deleteRoomCorner(prev, selRoom.id, vi));
                                setSelVert(null);
                              }}
                            >
                              {t("delCorner")}
                            </Btn>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: 10,
                            }}
                          >
                            <NumField
                              label="X"
                              value={Math.round(pts[vi].x)}
                              suffix="mm"
                              w="50%"
                              onChange={(v) => moveVert(v, pts[vi].y)}
                            />
                            <NumField
                              label="Y"
                              value={Math.round(pts[vi].y)}
                              suffix="mm"
                              w="50%"
                              onChange={(v) => moveVert(pts[vi].x, v)}
                            />
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: 10,
                            }}
                          >
                            <NumField
                              label={t("edgePrev")}
                              value={Math.round(lenIn)}
                              suffix="mm"
                              w="50%"
                              onChange={(v) => setEdge("in", v)}
                            />
                            <NumField
                              label={t("edgeNext")}
                              value={Math.round(lenOut)}
                              suffix="mm"
                              w="50%"
                              onChange={(v) => setEdge("out", v)}
                            />
                          </div>
                        </React.Fragment>
                      )}
                    </React.Fragment>
                  )}
                  {roomTab === "walls" && (
                    <React.Fragment>
                      <Label>{t("autoWall")}</Label>
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                        }}
                      >
                        {[
                          ["none", t("none")],
                          ["inside", t("inside")],
                          ["centre", t("centre")],
                          ["outside", t("outside")],
                        ].map(([k, l]) => (
                          <Btn
                            key={k}
                            small={true}
                            wide={true}
                            active={(aw ? aw.mode : "none") === k}
                            onClick={() =>
                              upRoom((r) => ({
                                ...r,
                                autoWalls:
                                  k === "none"
                                    ? null
                                    : {
                                        mode: k,
                                        t: (r.autoWalls && r.autoWalls.t) || doc.wallT,
                                      },
                              }))
                            }
                          >
                            {l}
                          </Btn>
                        ))}
                      </div>
                      {aw && (
                        <React.Fragment>
                          <NumField
                            label={t("thickness")}
                            value={aw.t}
                            suffix="mm"
                            onChange={(v) =>
                              upRoom((r) => ({
                                ...r,
                                autoWalls: {
                                  ...r.autoWalls,
                                  t: clamp(v, 20, 800),
                                },
                              }))
                            }
                          />
                          <div
                            style={{
                              fontFamily: MONO,
                              fontSize: 10.5,
                              color: C.dim,
                              lineHeight: 1.5,
                            }}
                          >
                            {t("keepsDoors")}
                          </div>
                        </React.Fragment>
                      )}
                    </React.Fragment>
                  )}
                  {roomTab === "ceiling" && (
                    <React.Fragment>
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                        }}
                      >
                        {[
                          ["flat", t("flat")],
                          ["gable", t("gable")],
                          ["shed", t("shed")],
                        ].map(([k, l]) => (
                          <Btn
                            key={k}
                            small={true}
                            wide={true}
                            active={c.mode === k}
                            onClick={() =>
                              up({
                                mode: k,
                              })
                            }
                          >
                            {l}
                          </Btn>
                        ))}
                      </div>
                      {c.mode === "flat" ? (
                        <NumField
                          label={t("ceilH")}
                          value={c.h}
                          suffix="mm"
                          onChange={(v) =>
                            up({
                              h: clamp(v, 800, 8000),
                            })
                          }
                        />
                      ) : (
                        <React.Fragment>
                          <div
                            style={{
                              display: "flex",
                              gap: 10,
                            }}
                          >
                            <NumField
                              label={t("eaveH")}
                              value={c.eaveH}
                              suffix="mm"
                              w="50%"
                              onChange={(v) =>
                                up({
                                  eaveH: clamp(v, 0, 8000),
                                })
                              }
                            />
                            <NumField
                              label={t("ridgeH")}
                              value={c.ridgeH}
                              suffix="mm"
                              w="50%"
                              onChange={(v) =>
                                up({
                                  ridgeH: clamp(v, 400, 12000),
                                })
                              }
                            />
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "center",
                            }}
                          >
                            <Label
                              style={{
                                flexShrink: 0,
                              }}
                            >
                              {t("ridgeAxis")}
                            </Label>
                            <Btn
                              small={true}
                              active={c.axis === "y"}
                              onClick={() =>
                                up({
                                  axis: "y",
                                })
                              }
                            >
                              X
                            </Btn>
                            <Btn
                              small={true}
                              active={c.axis === "x"}
                              onClick={() =>
                                up({
                                  axis: "x",
                                })
                              }
                            >
                              Y
                            </Btn>
                          </div>
                          {c.mode === "gable" && (
                            <div>
                              <Label
                                style={{
                                  marginBottom: 5,
                                }}
                              >
                                {t("ridgePos")}
                              </Label>
                              <input
                                type="range"
                                min={10}
                                max={90}
                                value={Math.round((c.ridge ?? 0.5) * 100)}
                                onChange={(e) =>
                                  up({
                                    ridge: +e.target.value / 100,
                                  })
                                }
                                style={{
                                  width: "100%",
                                  accentColor: C.accent,
                                }}
                              />
                            </div>
                          )}
                        </React.Fragment>
                      )}
                    </React.Fragment>
                  )}
                </React.Fragment>
              );
            })()}
        </div>
      )}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "8px 8px 10px",
          borderTop: `1px solid ${C.line}`,
          background: C.chrome,
          overflowX: "auto",
          flexShrink: 0,
        }}
      >
        {tools.map(([k, g, l]) => {
          const active =
            mode === k ||
            (k === "furniture" && mode === "place") ||
            (k === "image" && mode === "calibrate") ||
            (k === "section" && showSection) ||
            (k === "view3d" && show3d);
          return (
            <button
              key={k}
              onClick={() => {
                setDraft(null);
                setGhost(null);
                if (k === "furniture") {
                  setSheet("library");
                  return;
                }
                if (k === "image") {
                  setSheet("image");
                  return;
                }
                if (k === "section") {
                  setShowSection((v) => !v);
                  return;
                }
                if (k === "view3d") {
                  setShow3d(true);
                  return;
                }
                if (k === "export") {
                  setXpOut(null);
                  setSheet("export");
                  return;
                }
                if (k === "tape") {
                  setTape(null);
                  setMode("tape");
                  return;
                }
                setMode(k);
                setSel(null);
              }}
              style={{
                flex: "1 0 62px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                background: active ? C.accent : "transparent",
                border: `1px solid ${active ? C.accent : "transparent"}`,
                borderRadius: 9,
                padding: "7px 4px",
                color: active ? "#fff" : C.dim,
                cursor: "pointer",
              }}
            >
              <Glyph name={g} />
              <span
                style={{
                  fontSize: 9.5,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                {l}
              </span>
            </button>
          );
        })}
      </div>
      {show3d && (
        <ErrorBoundary lang={lang} onClose={() => setShow3d(false)}>
          <View3D
            doc={doc}
            defs={defs}
            lang={lang}
            t={t}
            onClose={() => setShow3d(false)}
            invert={invert3d}
            setInvert={setInvert3d}
          />
        </ErrorBoundary>
      )}
      <Sheet open={sheet === "library"} onClose={() => setSheet(null)} title={t("library")}>
        {editShape !== null ? (
          <ShapeEditor
            initial={editShape || undefined}
            t={t}
            lang={lang}
            onCancel={() => setEditShape(null)}
            onSave={(def) => {
              setLibrary((prev) =>
                prev.some((d) => d.id === def.id)
                  ? prev.map((d) => (d.id === def.id ? def : d))
                  : [...prev, def],
              );
              setEditShape(null);
            }}
          />
        ) : (
          <React.Fragment>
            <Btn
              wide={true}
              active={true}
              onClick={() => setEditShape(false)}
              style={{
                marginBottom: 14,
              }}
            >
              {t("newShape")}
            </Btn>
            {[...new Set(library.map((d) => groupOf(d, lang)))].map((grp) => (
              <div
                key={grp}
                style={{
                  marginBottom: 16,
                }}
              >
                <Label
                  style={{
                    marginBottom: 7,
                  }}
                >
                  {grp}
                </Label>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 5,
                  }}
                >
                  {library
                    .filter((d) => groupOf(d, lang) === grp)
                    .map((d) => {
                      const b = bbox(defOutline(d));
                      return (
                        <div
                          key={d.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <button
                            onClick={() => {
                              setPlacingDef(d.id);
                              setMode("place");
                              setSheet(null);
                              setSel(null);
                            }}
                            style={{
                              flex: 1,
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              background: C.chrome,
                              border: `1px solid ${C.line}`,
                              borderRadius: 9,
                              padding: "9px 11px",
                              color: C.text,
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <svg
                              width={30}
                              height={22}
                              viewBox="-0.05 -0.05 1.1 1.1"
                              style={{
                                flexShrink: 0,
                              }}
                            >
                              <polygon
                                points={defOutline(d)
                                  .map(
                                    (p) =>
                                      `${(p.x - b.x0) / Math.max(b.w, b.h)},${(p.y - b.y0) / Math.max(b.w, b.h)}`,
                                  )
                                  .join(" ")}
                                fill={C.timberFill}
                                stroke={C.timber}
                                strokeWidth={0.05}
                                vectorEffect="non-scaling-stroke"
                              />
                            </svg>
                            <span
                              style={{
                                fontSize: 13.5,
                                flex: 1,
                              }}
                            >
                              {nameOf(d, lang)}
                            </span>
                            <span
                              style={{
                                fontFamily: MONO,
                                fontSize: 10.5,
                                color: C.dim,
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {Math.round(b.w)}×{Math.round(b.h)}
                            </span>
                          </button>
                          <button
                            onClick={() => setEditShape(d)}
                            style={{
                              background: C.chrome3,
                              border: `1px solid ${C.line}`,
                              borderRadius: 8,
                              color: C.dim,
                              padding: "8px 9px",
                              fontSize: 11,
                              cursor: "pointer",
                            }}
                          >
                            {t("edit")}
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </React.Fragment>
        )}
      </Sheet>
      <Sheet open={sheet === "image"} onClose={() => setSheet(null)} title={t("planImage")}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <label
            style={{
              display: "block",
              background: C.accent,
              borderRadius: 9,
              padding: "11px 12px",
              textAlign: "center",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {doc.image ? t("replaceImg") : t("chooseImg")}
            <input
              type="file"
              accept="image/*"
              style={{
                display: "none",
              }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importImage(f);
              }}
            />
          </label>
          {doc.image && (
            <React.Fragment>
              <Btn
                wide={true}
                onClick={() => {
                  setSheet(null);
                  setCalib(null);
                  setMode("calibrate");
                }}
              >
                {t("setScale")}
              </Btn>
              <div>
                <Label
                  style={{
                    marginBottom: 6,
                  }}
                >
                  {t("opacity")}
                </Label>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={Math.round(doc.image.opacity * 100)}
                  onChange={(e) =>
                    setDoc((prev) => ({
                      ...prev,
                      image: {
                        ...prev.image,
                        opacity: +e.target.value / 100,
                      },
                    }))
                  }
                  style={{
                    width: "100%",
                    accentColor: C.accent,
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                }}
              >
                <Btn
                  wide={true}
                  active={doc.image.locked}
                  onClick={() =>
                    setDoc((prev) => ({
                      ...prev,
                      image: {
                        ...prev.image,
                        locked: !prev.image.locked,
                      },
                    }))
                  }
                >
                  {doc.image.locked ? t("locked") : t("unlocked")}
                </Btn>
                <Btn
                  tone="bad"
                  onClick={() => {
                    commit((prev) => ({
                      ...prev,
                      image: null,
                    }));
                    setSheet(null);
                  }}
                >
                  {t("remove")}
                </Btn>
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  color: C.dim,
                  lineHeight: 1.5,
                }}
              >
                {"1 image px = "}
                {doc.image.mmPerPx.toFixed(2)}
                {" mm · sheet is"} {((doc.image.natW * doc.image.mmPerPx) / 1000).toFixed(2)}
                {" × "}
                {((doc.image.natH * doc.image.mmPerPx) / 1000).toFixed(2)}
                {" m"}
              </div>
            </React.Fragment>
          )}
        </div>
      </Sheet>
      <Sheet open={sheet === "export"} onClose={() => setSheet(null)} title={t("xport")}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 15,
          }}
        >
          <div>
            <Label
              style={{
                marginBottom: 7,
              }}
            >
              {t("paper")}
            </Label>
            <div
              style={{
                display: "flex",
                gap: 6,
              }}
            >
              {Object.keys(PAPERS).map((k) => (
                <Btn
                  key={k}
                  small={true}
                  wide={true}
                  active={xp.paper === k}
                  onClick={() => {
                    setXp({
                      ...xp,
                      paper: k,
                    });
                    setXpOut(null);
                  }}
                >
                  {k}
                </Btn>
              ))}
            </div>
          </div>
          <div>
            <Label
              style={{
                marginBottom: 7,
              }}
            >
              {t("scale")}
            </Label>
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
              }}
            >
              {[
                [0, t("fitPage")],
                [20, "1:20"],
                [50, "1:50"],
                [100, "1:100"],
                [200, "1:200"],
              ].map(([v, l]) => (
                <Btn
                  key={l}
                  small={true}
                  active={xp.scaleDenom === v}
                  onClick={() => {
                    setXp({
                      ...xp,
                      scaleDenom: v,
                    });
                    setXpOut(null);
                  }}
                >
                  {l}
                </Btn>
              ))}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: 6,
            }}
          >
            <Btn
              small={true}
              wide={true}
              active={xp.grid}
              onClick={() => {
                setXp({
                  ...xp,
                  grid: !xp.grid,
                });
                setXpOut(null);
              }}
            >
              {t("gridPaper")}
            </Btn>
            <Btn
              small={true}
              wide={true}
              active={xp.contours}
              onClick={() => {
                setXp({
                  ...xp,
                  contours: !xp.contours,
                });
                setXpOut(null);
              }}
            >
              {t("headBands")}
            </Btn>
          </div>
          <Btn
            wide={true}
            active={true}
            onClick={async () => {
              setXpBusy(true);
              try {
                const r = await renderSheet(doc, defs, lang, imgSrc, {
                  paper: xp.paper,
                  scaleDenom: xp.scaleDenom || null,
                  grid: xp.grid,
                  contours: xp.contours,
                });
                setXpOut(r);
              } catch (e) {
                setXpOut({
                  error: true,
                });
              }
              setXpBusy(false);
            }}
          >
            {xpBusy ? "…" : t("render")}
          </Btn>
          {xpOut && !xpOut.error && (
            <React.Fragment>
              {xpOut.cropped && (
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    color: "#F0C89A",
                    lineHeight: 1.45,
                  }}
                >
                  {t("tooBig")}
                </div>
              )}
              <img
                src={xpOut.previewUrl}
                alt=""
                style={{
                  width: "100%",
                  borderRadius: 8,
                  border: `1px solid ${C.line}`,
                  background: "#fff",
                }}
              />
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  color: C.dim,
                }}
              >
                {xpOut.scaleLabel}
                {" · "}
                {xpOut.pmmW}
                {" × "}
                {xpOut.pmmH}
                {" mm"}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                }}
              >
                <Btn
                  wide={true}
                  onClick={() => {
                    xpOut.canvas.toBlob((b) => b && download(b, `${doc.name}.png`), "image/png");
                  }}
                >
                  {t("dlPng")}
                </Btn>
                <Btn
                  wide={true}
                  onClick={() => {
                    const b64 = xpOut.canvas.toDataURL("image/jpeg", 0.92).split(",")[1];
                    const bytes = buildPdf(
                      b64ToBytes(b64),
                      xpOut.canvas.width,
                      xpOut.canvas.height,
                      xpOut.pmmW,
                      xpOut.pmmH,
                    );
                    download(
                      new Blob([bytes], {
                        type: "application/pdf",
                      }),
                      `${doc.name}.pdf`,
                    );
                  }}
                >
                  {t("dlPdf")}
                </Btn>
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 10.5,
                  color: C.dim,
                  lineHeight: 1.5,
                }}
              >
                {t("saveTip")}
              </div>
            </React.Fragment>
          )}
        </div>
      </Sheet>
      <Sheet open={sheet === "project"} onClose={() => setSheet(null)} title={t("plan")}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            <Label>{t("name")}</Label>
            <input
              value={doc.name}
              onChange={(e) =>
                setDoc((p) => ({
                  ...p,
                  name: e.target.value,
                }))
              }
              style={{
                background: C.chrome,
                border: `1px solid ${C.line}`,
                borderRadius: 7,
                color: C.text,
                fontFamily: SANS,
                fontSize: 15,
                padding: "9px 10px",
                outline: "none",
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              gap: 14,
              fontFamily: MONO,
              fontSize: 12,
              color: C.dim,
              background: C.chrome,
              border: `1px solid ${C.line}`,
              borderRadius: 9,
              padding: "10px 12px",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <span>{totalArea ? totalArea.toFixed(1) + " m²" : "— m²"}</span>
            <span>
              {doc.walls.length} {t("wallsN")}
            </span>
            <span>
              {doc.items.length} {t("piecesN")}
            </span>
          </div>
          <div>
            <Label
              style={{
                marginBottom: 7,
              }}
            >
              {t("language")}
            </Label>
            <div
              style={{
                display: "flex",
                gap: 6,
              }}
            >
              <Btn small={true} wide={true} active={lang === "en"} onClick={() => setLang("en")}>
                English
              </Btn>
              <Btn small={true} wide={true} active={lang === "fi"} onClick={() => setLang("fi")}>
                Suomi
              </Btn>
            </div>
          </div>
          <div>
            <Label
              style={{
                marginBottom: 7,
              }}
            >
              {t("snapGrid")}
            </Label>
            <div
              style={{
                display: "flex",
                gap: 6,
              }}
            >
              {[0, 10, 50, 100].map((g) => (
                <Btn
                  key={g}
                  small={true}
                  wide={true}
                  active={grid === g}
                  onClick={() => setGrid(g)}
                >
                  {g === 0 ? t("off") : g + " mm"}
                </Btn>
              ))}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: 6,
            }}
          >
            <Btn small={true} wide={true} active={showGrid} onClick={() => setShowGrid(!showGrid)}>
              {t("gridPaper")}
            </Btn>
            <Btn small={true} wide={true} active={showDims} onClick={() => setShowDims(!showDims)}>
              {t("clearDims")}
            </Btn>
            <Btn small={true} wide={true} active={showHead} onClick={() => setShowHead(!showHead)}>
              {t("headBands")}
            </Btn>
          </div>
          <NumField
            label={t("defWallT")}
            value={doc.wallT}
            suffix="mm"
            onChange={(v) =>
              setDoc((p) => ({
                ...p,
                wallT: clamp(v, 20, 800),
              }))
            }
          />
          <div>
            <Label
              style={{
                marginBottom: 7,
              }}
            >
              {t("savedPlans")}
            </Label>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 5,
              }}
            >
              {index.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    gap: 6,
                  }}
                >
                  <button
                    onClick={async () => {
                      if (p.id === doc.id) return setSheet(null);
                      const d = await sGet(kPlan(p.id));
                      if (!d) return;
                      openDoc(d);
                      setSheet(null);
                      setFitReq((n) => n + 1);
                    }}
                    style={{
                      flex: 1,
                      background: p.id === doc.id ? C.accent : C.chrome,
                      border: `1px solid ${C.line}`,
                      borderRadius: 8,
                      color: C.text,
                      padding: "9px 11px",
                      textAlign: "left",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {p.name}
                  </button>
                  {index.length > 1 && (
                    <button
                      onClick={async () => {
                        /* the first tap arms, the second deletes: one stray tap
                           on a phone must not cost a whole plan */
                        if (confirmDel !== p.id) {
                          setConfirmDel(p.id);
                          return;
                        }
                        setConfirmDel(null);
                        const isOpen = p.id === doc.id;
                        if (isOpen) pending.current = null; // never write back the plan being deleted
                        deletePlanData(p.id);
                        const n = indexRef.current.filter((q) => q.id !== p.id);
                        indexRef.current = n;
                        setIndex(n);
                        sSetNow(KEY_INDEX, n);
                        if (isOpen && n.length) {
                          const d = await sGet(kPlan(n[0].id));
                          if (d) {
                            openDoc(d);
                            setFitReq((k) => k + 1);
                          }
                        }
                      }}
                      style={{
                        background: confirmDel === p.id ? C.bad : "rgba(180,64,47,0.18)",
                        border: `1px solid ${confirmDel === p.id ? C.bad : C.line}`,
                        borderRadius: 8,
                        color: confirmDel === p.id ? "#fff" : "#F0A79A",
                        padding: "8px 10px",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      {confirmDel === p.id ? t("delPlanSure") : t("delPlan")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <Btn
            wide={true}
            onClick={() => {
              openDoc(emptyDoc(tr(lang, "newPlan").replace("+ ", "")));
              setSheet(null);
              setVp({
                ox: size.w / 2,
                oy: size.h / 2,
                s: 0.04,
              });
            }}
          >
            {t("newPlan")}
          </Btn>
          <div
            style={{
              borderTop: `1px solid ${C.line}`,
              paddingTop: 15,
              display: "flex",
              flexDirection: "column",
              gap: 9,
            }}
          >
            <Label>{t("storageHdr")}</Label>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10.5,
                color: C.dim,
                lineHeight: 1.55,
              }}
            >
              {t("localNote")}
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
              }}
            >
              <Btn
                wide={true}
                small={true}
                onClick={() => {
                  flushSave(); // the backup should include the last edits
                  downloadBackup();
                }}
              >
                {t("backup")}
              </Btn>
              <label
                style={{
                  flex: 1,
                  background: C.chrome3,
                  border: `1px solid ${C.line}`,
                  borderRadius: 8,
                  padding: "6px 9px",
                  fontSize: 12,
                  textAlign: "center",
                  cursor: "pointer",
                  color: C.text,
                }}
              >
                {t("restore")}
                <input
                  type="file"
                  accept="application/json,.json"
                  style={{
                    display: "none",
                  }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const fr = new FileReader();
                    fr.onload = () => {
                      flushSave(); // local edits must be in storage to be kept
                      try {
                        restoreAll(JSON.parse(fr.result));
                        location.reload();
                      } catch (err) {
                        setHint(tr(lang, err && err.code === "quota" ? "restoreFull" : "badBackup"));
                        setSheet(null);
                      }
                    };
                    fr.readAsText(f);
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
