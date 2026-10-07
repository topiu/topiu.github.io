import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { C, MONO, clamp } from "../core";
import { bbox, itemPoly, wallPoly } from "../domain/geometry";
import { Btn } from "../ui/atoms";
import { makeCam, makeGL, renderScene } from "./raster";
import { buildScene } from "./scene";

/* ============================================================
   3D viewport: orbit or walk, with touch controls
   ============================================================ */

export function View3D({ doc, defs, lang, t, onClose, invert, setInvert }) {
  const [mode, setMode] = useState("orbit");
  const [vis, setVis] = useState({
    roof: true,
    walls: true,
    furniture: true,
  });
  const eyeRef = useRef(1650);
  const [eyeShown, setEyeShown] = useState(1650);
  const [, tick] = useState(0);
  const keys = useRef(new Set());
  const lastT = useRef(0);
  const coarse = useMemo(
    () =>
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(pointer: coarse)").matches
        : true,
    [],
  );
  const setEye = (v) => {
    eyeRef.current = clamp(v, 100, 40000);
    setEyeShown(Math.round(eyeRef.current));
    dirty.current = true;
  };
  const wrap = useRef(null);
  const cvRef = useRef(null);
  const dirty = useRef(true);
  const glr = useRef(null);
  const [gpu, setGpu] = useState(null); // null = not decided yet
  const orb = useRef({
    tx: 0,
    ty: 0,
    tz: 1200,
    dist: 14000,
    az: -2.3,
    el: 0.45,
  });
  const walk = useRef({
    x: 0,
    y: 0,
    yaw: 0,
    pitch: -0.03,
  });
  const stick = useRef({
    active: false,
    dx: 0,
    dy: 0,
    id: null,
    ox: 0,
    oy: 0,
  });
  const ptrs = useRef(new Map());
  const gest = useRef(null);
  const size = useRef({
    w: 320,
    h: 320,
  });

  /* the painter's fallback needs small faces to sort well; WebGL does not */
  const faces = useMemo(
    () =>
      buildScene(doc, defs, {
        ...vis,
        subdiv: gpu ? 0 : 900,
      }),
    [doc, defs, vis, gpu],
  );
  const sceneFar = useMemo(() => {
    const pts = [];
    for (const w of doc.walls) pts.push(...wallPoly(w));
    for (const r of doc.rooms) pts.push(...r.points);
    const b = pts.length
      ? bbox(pts)
      : {
          w: 8000,
          h: 8000,
        };
    return Math.max(b.w, b.h) * 8 + 40000;
  }, [doc.walls, doc.rooms]);

  /* frame the model when the view opens */
  useEffect(() => {
    const pts = [];
    for (const w of doc.walls) pts.push(...wallPoly(w));
    for (const r of doc.rooms) pts.push(...r.points);
    for (const it of doc.items) {
      const d = defs[it.defId];
      if (d) pts.push(...itemPoly(it, d));
    }
    const b = pts.length
      ? bbox(pts)
      : {
          cx: 0,
          cy: 0,
          w: 6000,
          h: 6000,
        };
    orb.current = {
      tx: b.cx,
      ty: -b.cy,
      tz: 1100,
      dist: Math.max(b.w, b.h) * 1.7 + 4000,
      az: -2.25,
      el: 0.44,
    };
    walk.current = {
      x: b.cx,
      y: -b.cy,
      yaw: 0.6,
      pitch: -0.03,
    };
    dirty.current = true;
  }, []);
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const r = makeGL(cv);
    glr.current = r;
    setGpu(!!r);
    dirty.current = true;
  }, []);
  useEffect(() => {
    if (glr.current) glr.current.upload(faces);
    dirty.current = true;
  }, [faces]);
  useEffect(() => {
    dirty.current = true;
  }, [mode]);
  const camNow = useCallback(() => {
    if (mode === "orbit") {
      const o = orb.current;
      const ce = Math.cos(o.el);
      const eye = {
        x: o.tx - Math.cos(o.az) * ce * o.dist,
        y: o.ty - Math.sin(o.az) * ce * o.dist,
        z: o.tz + Math.sin(o.el) * o.dist,
      };
      return makeCam(eye, o.az, -o.el, 0.85);
    }
    const w = walk.current;
    return makeCam(
      {
        x: w.x,
        y: w.y,
        z: eyeRef.current,
      },
      w.yaw,
      w.pitch,
      1.12,
    );
  }, [mode]);

  /* draw loop: only repaints when something moved */
  useEffect(() => {
    let raf;
    const frame = (ts) => {
      const cv = cvRef.current;
      const dt = lastT.current ? Math.min((ts - lastT.current) / 1000, 0.1) : 0;
      lastT.current = ts;
      if (cv) {
        const s = stick.current;
        const K = keys.current;
        const key = (a, b) => (K.has(a) ? 1 : 0) - (K.has(b) ? 1 : 0);
        if (mode === "walk") {
          const fwd = (s.active ? -s.dy : 0) + key("w", "s") + key("arrowup", "arrowdown");
          const side = (s.active ? s.dx : 0) + key("d", "a");
          const rise = key("e", "q");
          if (fwd || side || rise) {
            const w = walk.current;
            const sp = 1900 * (K.has("shift") ? 3 : 1) * dt;
            // right vector of a camera at this yaw is (sin yaw, -cos yaw)
            w.x += (Math.cos(w.yaw) * fwd + Math.sin(w.yaw) * side) * sp;
            w.y += (Math.sin(w.yaw) * fwd - Math.cos(w.yaw) * side) * sp;
            if (rise) {
              eyeRef.current = clamp(eyeRef.current + rise * sp, 100, 40000);
              if (Math.abs(eyeRef.current - eyeShown) > 40) setEyeShown(Math.round(eyeRef.current));
            }
            dirty.current = true;
          }
        } else {
          const turn = key("d", "a") + key("arrowright", "arrowleft");
          const tilt = key("w", "s") + key("arrowup", "arrowdown");
          const dolly = key("=", "-") + key("+", "_");
          if (turn || tilt || dolly) {
            orb.current.az += turn * 1.4 * dt;
            orb.current.el = clamp(orb.current.el + tilt * 1.1 * dt, -0.25, 1.45);
            if (dolly)
              orb.current.dist = clamp(orb.current.dist * (1 - dolly * 1.4 * dt), 800, 200000);
            dirty.current = true;
          }
        }
        if (dirty.current) {
          dirty.current = false;
          const r = wrap.current.getBoundingClientRect();
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const W = Math.max(1, Math.round(r.width)),
            H = Math.max(1, Math.round(r.height));
          if (size.current.w !== W || size.current.h !== H) {
            size.current = {
              w: W,
              h: H,
            };
            cv.width = W * dpr;
            cv.height = H * dpr;
            cv.style.width = W + "px";
            cv.style.height = H + "px";
          }
          if (glr.current) {
            glr.current.draw(camNow(), W, H, sceneFar);
          } else {
            const ctx = cv.getContext("2d");
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            renderScene(ctx, faces, camNow(), W, H);
          }
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const ro = new ResizeObserver(() => {
      dirty.current = true;
    });
    if (wrap.current) ro.observe(wrap.current);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [faces, camNow, mode, sceneFar, eyeShown]);

  /* ---- touch ---- */
  const localPt = (e) => {
    const r = wrap.current.getBoundingClientRect();
    return {
      x: e.clientX - r.left,
      y: e.clientY - r.top,
    };
  };
  const onDown = (e) => {
    const p = localPt(e);
    const now = Date.now();
    for (const [id, q] of [...ptrs.current]) if (now - q.t > 4000) ptrs.current.delete(id);
    // bottom-left corner in walk mode is the movement stick
    if (
      mode === "walk" &&
      coarse &&
      e.pointerType !== "mouse" &&
      !stick.current.active &&
      p.x < 132 &&
      p.y > size.current.h - 132
    ) {
      stick.current = {
        active: true,
        id: e.pointerId,
        ox: p.x,
        oy: p.y,
        dx: 0,
        dy: 0,
      };
      return;
    }
    ptrs.current.set(e.pointerId, {
      x: p.x,
      y: p.y,
      t: now,
    });
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      gest.current = {
        type: "two",
        d0: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1),
        m0: {
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
        },
        dist0: orb.current.dist,
        t0: {
          x: orb.current.tx,
          y: orb.current.ty,
        },
      };
      return;
    }
    gest.current = {
      type: "one",
      last: p,
    };
  };
  const onMove = (e) => {
    const s = stick.current;
    if (s.active && s.id === e.pointerId) {
      const p = localPt(e);
      const dx = clamp((p.x - s.ox) / 52, -1, 1),
        dy = clamp((p.y - s.oy) / 52, -1, 1);
      stick.current = {
        ...s,
        dx,
        dy,
      };
      tick((n) => n + 1);
      return;
    }
    if (!ptrs.current.has(e.pointerId)) return;
    const p = localPt(e);
    ptrs.current.set(e.pointerId, {
      x: p.x,
      y: p.y,
      t: Date.now(),
    });
    const g = gest.current;
    if (!g) return;
    const inv = invert ? -1 : 1;
    if (g.type === "two" && ptrs.current.size >= 2) {
      const [a, b] = [...ptrs.current.values()];
      const d1 = Math.hypot(a.x - b.x, a.y - b.y);
      const m1 = {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
      };
      if (mode === "orbit") {
        orb.current.dist = clamp(g.dist0 * (g.d0 / Math.max(d1, 1)), 800, 200000);
        const az = orb.current.az;
        // mm of world per screen pixel at the pivot distance
        const k = (2 * orb.current.dist * Math.tan(0.85 / 2)) / Math.max(size.current.h, 1);
        const dx = (m1.x - g.m0.x) * inv,
          dy = (m1.y - g.m0.y) * inv;
        const rx = Math.sin(az),
          ry = -Math.cos(az); // camera right
        const fx = Math.cos(az),
          fy = Math.sin(az); // camera forward, flattened
        orb.current.tx = g.t0.x + (-rx * dx + fx * dy) * k;
        orb.current.ty = g.t0.y + (-ry * dx + fy * dy) * k;
      }
      dirty.current = true;
      return;
    }
    if (g.type === "one") {
      const dx = (p.x - g.last.x) * inv,
        dy = (p.y - g.last.y) * inv;
      g.last = p;
      if (mode === "orbit") {
        orb.current.az -= dx * 0.008;
        orb.current.el = clamp(orb.current.el + dy * 0.008, -0.25, 1.45);
      } else {
        // same convention as orbit: drag the scene, don't steer the head
        walk.current.yaw += dx * 0.005;
        walk.current.pitch = clamp(walk.current.pitch + dy * 0.005, -1.3, 1.3);
      }
      dirty.current = true;
    }
  };
  const onUp = (e) => {
    if (stick.current.id === e.pointerId) {
      stick.current = {
        active: false,
        dx: 0,
        dy: 0,
        id: null,
        ox: 0,
        oy: 0,
      };
      tick((n) => n + 1);
      return;
    }
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size === 0) gest.current = null;
    else if (ptrs.current.size === 1)
      gest.current = {
        type: "one",
        last: [...ptrs.current.values()][0],
      };
  };
  useEffect(() => {
    const m = (e) => onMove(e),
      u = (e) => onUp(e);
    const clear = () => {
      ptrs.current.clear();
      gest.current = null;
      stick.current = {
        active: false,
        dx: 0,
        dy: 0,
        id: null,
        ox: 0,
        oy: 0,
      };
    };
    window.addEventListener("pointermove", m, {
      passive: false,
    });
    window.addEventListener("pointerup", u);
    window.addEventListener("pointercancel", u);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("pointermove", m);
      window.removeEventListener("pointerup", u);
      window.removeEventListener("pointercancel", u);
      window.removeEventListener("blur", clear);
    };
  });

  /* keyboard: WASD to move, QE for height, Shift to sprint, arrows to look */
  useEffect(() => {
    const norm = (e) => (e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase());
    const handled = new Set([
      "w",
      "a",
      "s",
      "d",
      "q",
      "e",
      "shift",
      "+",
      "=",
      "-",
      "_",
      "arrowup",
      "arrowdown",
      "arrowleft",
      "arrowright",
    ]);
    const down = (e) => {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || "")) return;
      if (e.key === "Escape") {
        onClose();
        return;
      }
      const k = norm(e);
      if (!handled.has(k)) return;
      e.preventDefault();
      keys.current.add(k);
      lastT.current = 0;
    };
    const up = (e) => keys.current.delete(norm(e));
    const clear = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      keys.current.clear();
    };
  }, [onClose]);
  const Toggle = ({ k, label }) => (
    <Btn
      small={true}
      active={vis[k]}
      onClick={() =>
        setVis((v) => ({
          ...v,
          [k]: !v[k],
        }))
      }
    >
      {label}
    </Btn>
  );
  const st = stick.current;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: C.chrome,
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "9px 10px",
          borderBottom: `1px solid ${C.line}`,
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: C.chrome3,
            border: `1px solid ${C.line}`,
            color: C.text,
            borderRadius: 8,
            padding: "6px 11px",
            fontSize: 15,
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          ✕
        </button>
        <Btn small={true} active={mode === "orbit"} onClick={() => setMode("orbit")}>
          {t("orbit")}
        </Btn>
        <Btn small={true} active={mode === "walk"} onClick={() => setMode("walk")}>
          {t("walk")}
        </Btn>
        <Btn small={true} active={invert} onClick={() => setInvert(!invert)}>
          {t("invertDrag")}
        </Btn>
        <div
          style={{
            display: "flex",
            gap: 5,
            marginLeft: "auto",
          }}
        >
          <Toggle k="roof" label={t("roofOn")} />
          <Toggle k="walls" label={t("wallsTab")} />
          <Toggle k="furniture" label={t("furniture")} />
        </div>
      </div>
      <div
        ref={wrap}
        onPointerDown={onDown}
        style={{
          position: "relative",
          flex: 1,
          touchAction: "none",
          overflow: "hidden",
          cursor: "grab",
        }}
      >
        <canvas
          ref={cvRef}
          style={{
            display: "block",
            position: "absolute",
            inset: 0,
          }}
        />
        {mode === "walk" && (
          <React.Fragment>
            {coarse && (
              <div
                style={{
                  position: "absolute",
                  left: 22,
                  bottom: 22,
                  width: 92,
                  height: 92,
                  borderRadius: 46,
                  border: `1.5px solid ${st.active ? C.accent : "rgba(255,255,255,0.5)"}`,
                  background: "rgba(27,37,40,0.28)",
                  pointerEvents: "none",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 46 + st.dx * 30 - 17,
                    top: 46 + st.dy * 30 - 17,
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    background: st.active ? C.accent : "rgba(255,255,255,0.72)",
                  }}
                />
              </div>
            )}
            <div
              style={{
                position: "absolute",
                right: 14,
                bottom: 22,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {[
                ["+", 250],
                ["−", -250],
              ].map(([l, d]) => (
                <button
                  key={l}
                  onClick={() => setEye(eyeRef.current + d)}
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    background: "rgba(27,37,40,0.8)",
                    border: `1px solid ${C.line}`,
                    color: C.text,
                    fontSize: 19,
                    cursor: "pointer",
                  }}
                >
                  {l}
                </button>
              ))}
              <button
                onClick={() => setEye(1650)}
                style={{
                  width: 42,
                  borderRadius: 10,
                  background: "rgba(27,37,40,0.8)",
                  border: `1px solid ${C.line}`,
                  color: C.dim,
                  fontSize: 9,
                  padding: "5px 0",
                  cursor: "pointer",
                  fontFamily: MONO,
                }}
              >
                {eyeShown}
              </button>
            </div>
          </React.Fragment>
        )}
        <div
          style={{
            position: "absolute",
            left: 12,
            top: 10,
            fontFamily: MONO,
            fontSize: 10.5,
            color: "rgba(30,40,42,0.65)",
            pointerEvents: "none",
            lineHeight: 1.5,
          }}
        >
          {mode === "orbit" ? t("orbitHint") : t("walkHint")}
          {!coarse && <div>{t("keysHint")}</div>}
          {gpu === false && (
            <div
              style={{
                color: "rgba(150,60,40,0.85)",
              }}
            >
              {t("noGpu")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
