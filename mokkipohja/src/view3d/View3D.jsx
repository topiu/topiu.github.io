import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { C, D2R, MONO, TAP_SLOP, clamp } from "../core";
import { blockingSegments, fitPointsDistance, walkMove, walkStart } from "../domain/walk";
import { Btn } from "../ui/atoms";
import { buildCabin } from "./cabin";
import { makeMaterials } from "./materials";
import { Stage } from "./stage";

/* ============================================================
   3D view: orbit round the cabin, or walk through it.
   Orbit opens framed to the screen's shape, roof off, with the walls between
   the camera and the rooms cut away, so a phone held upright shows the whole
   plan furnished. Walk starts just inside the front door; drag to look, tap
   the floor to walk there, use the stick or the keys. Walls stop you; doors
   let you through.
   ============================================================ */

const MM = 0.001;
const EYE = 1650;
const WALK_SPEED = 1600; // mm per second
const FOV = { orbit: 45, walk: 70 };
const KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
  "ShiftLeft",
  "ShiftRight",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Equal",
  "Minus",
  "NumpadAdd",
  "NumpadSubtract",
]);

export function View3D({ doc, defs, t, onClose, invert, setInvert }) {
  const [mode, setMode] = useState("orbit");
  const [vis, setVis] = useState({
    roofOrbit: false,
    roofWalk: true,
    walls: true,
    furniture: true,
  });
  const [eyeShown, setEyeShown] = useState(EYE);
  const [failed, setFailed] = useState(false);
  const [lost, setLost] = useState(false);
  const [stickUI, setStickUI] = useState({ active: false, dx: 0, dy: 0 });
  const coarse = useMemo(
    () =>
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(pointer: coarse)").matches
        : true,
    [],
  );

  const wrap = useRef(null);
  const host = useRef(null); // holds the canvas, made fresh for each stage
  const S = useRef(null); // { stage, mats, cabin, segments }
  const live = useRef({});
  live.current = { mode, vis, invert, onClose, doc, defs };
  const walker = useRef({
    x: 0,
    y: 0,
    yaw: 0,
    pitch: -0.08,
    eye: EYE,
    target: null,
    started: false,
  });
  const orbitSaved = useRef(null);
  const keys = useRef(new Set());
  const stick = useRef({ active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 });
  const look = useRef(null);
  const userMoved = useRef(false);
  const cutKey = useRef("");
  const lostRef = useRef(false);

  /* ---- what is shown ---- */
  const applyVis = () => {
    const s = S.current;
    if (!s || !s.cabin) return;
    const { mode: m, vis: v } = live.current;
    s.cabin.roof.visible = m === "walk" ? v.roofWalk : v.roofOrbit;
    for (const l of s.cabin.lights) l.intensity = m === "walk" ? l.userData.on : 0;
    s.cabin.furniture.visible = v.furniture;
    for (const w of s.cabin.walls) w.obj.visible = v.walls;
    cutKey.current = "";
    s.stage.invalidate(true);
  };

  /* Cut away the outside walls whose outer face looks at the camera, so the
     rooms show: only in orbit with the roof off. The low slab of each wall
     stays, so the plan still reads. */
  const updateCutaway = () => {
    const s = S.current;
    const { vis: v } = live.current;
    if (v.roofOrbit || !v.walls) return;
    const cam = s.stage.camera.position;
    let key = "";
    for (const w of s.cabin.walls) {
      let show = true;
      if (w.out) {
        const dx = cam.x - w.mid.x,
          dz = cam.z - w.mid.z;
        if ((dx * w.out.x + dz * w.out.z) / (Math.hypot(dx, dz) || 1) > 0.12) show = false;
      }
      w.obj.visible = show;
      key += show ? "1" : "0";
    }
    if (key !== cutKey.current) {
      cutKey.current = key;
      s.stage.invalidate(true);
    }
  };

  /* Orbit camera: three quarters on to the front door (or from the south
     east), just far enough back that the whole model fits the screen,
     whatever its shape. Upright, the camera looks down more steeply, so the
     plan's depth fills the tall screen. The sun comes from the camera's
     left, so shadows fall where they show. */
  const frameOrbit = () => {
    const s = S.current;
    const { doc: d, defs: df } = live.current;
    const { min, max, centre } = s.cabin.bounds;
    const cam = s.stage.camera;
    let h = { x: 0.6, y: 0.8 };
    if (d.openings.some((o) => o.kind === "door")) {
      const st = walkStart(d, df);
      const a = Math.atan2(-st.dir.y, -st.dir.x) + 35 * D2R;
      h = { x: Math.cos(a), y: Math.sin(a) };
    }
    const el = (cam.aspect < 1 ? 56 : 42) * D2R;
    const dir = [h.x * Math.cos(el), Math.sin(el), h.y * Math.cos(el)];
    const corners = [];
    for (const x of [min.x, max.x])
      for (const y of [min.y, max.y])
        for (const z of [min.z, max.z]) corners.push([x - centre.x, y - centre.y, z - centre.z]);
    const dist = fitPointsDistance(corners, dir, cam.fov * D2R, cam.aspect);
    cam.position.set(centre.x + dir[0] * dist, centre.y + dir[1] * dist, centre.z + dir[2] * dist);
    s.stage.controls.target.copy(centre);
    s.stage.controls.update();
    const sa = Math.atan2(h.y, h.x) - 70 * D2R;
    s.stage.setSun(Math.cos(sa), Math.sin(sa));
    s.stage.invalidate();
  };

  const placeWalkCamera = () => {
    const s = S.current;
    const w = walker.current;
    const cam = s.stage.camera;
    cam.position.set(w.x * MM, w.eye * MM, w.y * MM);
    cam.rotation.set(w.pitch, w.yaw, 0, "YXZ");
    s.stage.invalidate();
  };

  const setLens = (m) => {
    const cam = S.current.stage.camera;
    cam.fov = FOV[m];
    cam.near = m === "walk" ? 0.05 : 0.1;
    cam.updateProjectionMatrix();
  };

  /* ---- set up, and tear down when the view closes ---- */
  useEffect(() => {
    // a canvas of its own, so a context lost or given up is never reused
    const cv = document.createElement("canvas");
    cv.style.cssText = "display:block;width:100%;height:100%";
    host.current.appendChild(cv);
    let stage;
    try {
      stage = new Stage(cv);
    } catch {
      cv.remove();
      setFailed(true);
      return undefined;
    }
    const mats = makeMaterials();
    stage.sharpen(mats);
    stage.setGround(mats);
    S.current = { stage, mats, cabin: null, segments: [] };
    const onLost = (e) => {
      e.preventDefault();
      lostRef.current = true;
      setLost(true);
    };
    const onRestored = () => {
      lostRef.current = false;
      setLost(false);
      stage.invalidate(true);
    };
    cv.addEventListener("webglcontextlost", onLost);
    cv.addEventListener("webglcontextrestored", onRestored);
    stage.controls.addEventListener("start", () => {
      userMoved.current = true;
    });
    const ro = new ResizeObserver(() => {
      const r = wrap.current.getBoundingClientRect();
      stage.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
      if (S.current.cabin && live.current.mode === "orbit" && !userMoved.current) frameOrbit();
    });
    ro.observe(wrap.current);
    return () => {
      ro.disconnect();
      cv.removeEventListener("webglcontextlost", onLost);
      cv.removeEventListener("webglcontextrestored", onRestored);
      S.current.cabin?.dispose();
      mats.dispose();
      stage.dispose();
      cv.remove();
      S.current = null;
    };
  }, []);

  /* ---- the model ---- */
  useEffect(() => {
    const s = S.current;
    if (!s) return;
    s.cabin?.dispose();
    s.cabin = buildCabin(doc, defs, s.mats);
    s.stage.setCabin(s.cabin);
    s.segments = blockingSegments(doc);
    const r = wrap.current.getBoundingClientRect();
    s.stage.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
    applyVis();
    if (live.current.mode === "orbit") {
      setLens("orbit");
      if (!userMoved.current) frameOrbit();
    }
  }, [doc, defs]);

  useEffect(applyVis, [vis, mode]);

  useEffect(() => {
    const s = S.current;
    if (!s) return;
    s.stage.controls.rotateSpeed = invert ? -0.9 : 0.9;
    s.stage.controls.panSpeed = invert ? -1 : 1;
  }, [invert]);

  /* ---- switching between orbit and walk ---- */
  const switchMode = (m) => {
    const s = S.current;
    if (!s || m === mode) return;
    const cam = s.stage.camera;
    if (m === "walk") {
      orbitSaved.current = { pos: cam.position.clone(), target: s.stage.controls.target.clone() };
      s.stage.controls.enabled = false;
      const w = walker.current;
      if (!w.started) {
        const st = walkStart(doc, defs);
        Object.assign(w, {
          x: st.x,
          y: st.y,
          yaw: Math.atan2(-st.dir.x, -st.dir.y),
          pitch: -0.08,
          started: true,
        });
      }
      w.target = null;
      setLens("walk");
      placeWalkCamera();
    } else {
      setLens("orbit");
      const o = orbitSaved.current;
      if (o) {
        cam.position.copy(o.pos);
        s.stage.controls.target.copy(o.target);
      }
      s.stage.controls.enabled = true;
      s.stage.controls.update();
      s.stage.invalidate();
    }
    setMode(m);
  };

  /* ---- the frame loop: move, then draw if anything changed ---- */
  useEffect(() => {
    let raf,
      last = 0;
    const k = (code) => (keys.current.has(code) ? 1 : 0);
    const stepWalk = (dt) => {
      const s = S.current;
      const w = walker.current;
      const st = stick.current;
      let fwd = k("KeyW") - k("KeyS"),
        side = k("KeyD") - k("KeyA");
      if (st.active) {
        fwd -= st.dy;
        side += st.dx;
      }
      const turn = k("ArrowLeft") - k("ArrowRight"),
        tilt = k("ArrowUp") - k("ArrowDown"),
        rise = k("KeyE") - k("KeyQ");
      const fast = k("ShiftLeft") || k("ShiftRight") ? 2.5 : 1;
      let moved = false;
      if (turn || tilt) {
        w.yaw += turn * 1.7 * dt;
        w.pitch = clamp(w.pitch + tilt * 1.2 * dt, -1.3, 1.3);
        moved = true;
      }
      if (rise) {
        w.eye = clamp(w.eye + rise * 1000 * fast * dt, 300, 40000);
        setEyeShown(Math.round(w.eye / 10) * 10);
        moved = true;
      }
      // high up, fly over the walls rather than bump into them
      const segs = w.eye > 3500 ? [] : s.segments;
      if (fwd || side) {
        w.target = null;
        const len = Math.hypot(fwd, side);
        if (len > 1) {
          fwd /= len;
          side /= len;
        }
        const sp = WALK_SPEED * fast * dt;
        // the camera looks along (-sin yaw, -cos yaw) in plan; its right is (cos yaw, -sin yaw)
        const fx = -Math.sin(w.yaw),
          fy = -Math.cos(w.yaw);
        const rx = Math.cos(w.yaw),
          ry = -Math.sin(w.yaw);
        const p = walkMove(w, (fx * fwd + rx * side) * sp, (fy * fwd + ry * side) * sp, segs);
        w.x = p.x;
        w.y = p.y;
        moved = true;
      } else if (w.target) {
        const dx = w.target.x - w.x,
          dy = w.target.y - w.y,
          d = Math.hypot(dx, dy);
        if (d < 80) w.target = null;
        else {
          const step = Math.min(d, WALK_SPEED * dt);
          const p = walkMove(w, (dx / d) * step, (dy / d) * step, segs);
          const got = Math.hypot(p.x - w.x, p.y - w.y);
          w.x = p.x;
          w.y = p.y;
          moved = true;
          if (got < step * 0.25) w.target = null; // something is in the way
        }
      }
      if (moved) placeWalkCamera();
    };
    const stepOrbitKeys = (dt) => {
      const turn = k("KeyD") + k("ArrowRight") - k("KeyA") - k("ArrowLeft"),
        tilt = k("KeyW") + k("ArrowUp") - k("KeyS") - k("ArrowDown"),
        dolly = k("Equal") + k("NumpadAdd") - k("Minus") - k("NumpadSubtract");
      if (!turn && !tilt && !dolly) return;
      const { stage } = S.current;
      const c = stage.controls,
        cam = stage.camera;
      const off = cam.position.clone().sub(c.target);
      const sph = new THREE.Spherical().setFromVector3(off);
      sph.theta += turn * 1.4 * dt;
      sph.phi = clamp(sph.phi - tilt * 1.1 * dt, 0.05, c.maxPolarAngle);
      sph.radius = clamp(sph.radius * (1 - dolly * 1.4 * dt), c.minDistance, c.maxDistance);
      cam.position.copy(c.target).add(off.setFromSpherical(sph));
      cam.lookAt(c.target);
      userMoved.current = true;
      stage.invalidate();
    };
    const loop = (ts) => {
      raf = requestAnimationFrame(loop);
      const s = S.current;
      if (!s || !s.cabin || lostRef.current) return;
      const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
      last = ts;
      const orbit = live.current.mode === "orbit";
      if (orbit) {
        stepOrbitKeys(dt);
        if (s.stage.controls.update()) s.stage.dirty = true;
      } else stepWalk(dt);
      if (s.stage.dirty) {
        if (orbit) updateCutaway();
        s.stage.render();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ---- keys: by physical key, so WASD works on any layout ---- */
  useEffect(() => {
    const typing = (e) => e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || "");
    const down = (e) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === "Escape" || e.key === "Escape") {
        e.preventDefault();
        live.current.onClose();
        return;
      }
      if (!KEYS.has(e.code)) return;
      e.preventDefault();
      keys.current.add(e.code);
    };
    const up = (e) => keys.current.delete(e.code);
    const clear = () => keys.current.clear();
    const hidden = () => document.hidden && clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", hidden);
      clear();
    };
  }, []);

  /* ---- walking by touch: the stick, dragging to look, tapping to go ---- */
  const localPt = (e) => {
    const r = wrap.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, h: r.height, w: r.width };
  };
  const resetStick = () => {
    stick.current = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
    setStickUI({ active: false, dx: 0, dy: 0 });
  };
  const onDown = (e) => {
    if (mode !== "walk") return;
    if (e.target.closest && e.target.closest("button")) return; // the height buttons are not the floor
    const p = localPt(e);
    if (
      coarse &&
      e.pointerType !== "mouse" &&
      !stick.current.active &&
      p.x < 132 &&
      p.y > p.h - 132
    ) {
      stick.current = { active: true, id: e.pointerId, ox: p.x, oy: p.y, dx: 0, dy: 0 };
      walker.current.target = null;
      setStickUI({ active: true, dx: 0, dy: 0 });
      return;
    }
    if (look.current) return;
    look.current = {
      id: e.pointerId,
      x: p.x,
      y: p.y,
      sx: p.x,
      sy: p.y,
      t: performance.now(),
      moved: false,
    };
  };
  const onMove = (e) => {
    const st = stick.current;
    if (st.active && st.id === e.pointerId) {
      const p = localPt(e);
      let dx = (p.x - st.ox) / 52,
        dy = (p.y - st.oy) / 52;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      stick.current = { ...st, dx, dy };
      setStickUI({ active: true, dx, dy });
      return;
    }
    const L = look.current;
    if (!L || L.id !== e.pointerId) return;
    const p = localPt(e);
    const dx = p.x - L.x,
      dy = p.y - L.y;
    L.x = p.x;
    L.y = p.y;
    if (Math.hypot(p.x - L.sx, p.y - L.sy) > TAP_SLOP) L.moved = true;
    if (!L.moved) return;
    // drag the scene: it follows the finger, as in orbit
    const inv = live.current.invert ? -1 : 1;
    const w = walker.current;
    w.yaw += dx * 0.005 * inv;
    w.pitch = clamp(w.pitch + dy * 0.005 * inv, -1.3, 1.3);
    placeWalkCamera();
  };
  const onUp = (e) => {
    if (stick.current.id === e.pointerId) {
      resetStick();
      return;
    }
    const L = look.current;
    if (!L || L.id !== e.pointerId) return;
    look.current = null;
    if (e.type === "pointerup" && !L.moved && performance.now() - L.t < 600) goTo(L.sx, L.sy);
  };
  /* walk to the spot tapped on the floor (or on a piece of furniture);
     a tap on a wall goes nowhere */
  const goTo = (px, py) => {
    const s = S.current;
    if (!s || !s.cabin) return;
    const r = wrap.current.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2((px / r.width) * 2 - 1, -(py / r.height) * 2 + 1),
      s.stage.camera,
    );
    const c = s.cabin;
    const targets = [c.floors, s.stage.ground, c.furniture, ...c.walls.map((w) => w.obj)];
    if (c.roof.visible) targets.push(c.roof);
    const hit = ray.intersectObjects(
      targets.filter((o) => o && o.visible),
      true,
    )[0];
    if (!hit) return;
    let o = hit.object;
    while (o && o !== c.floors && o !== c.furniture && o !== s.stage.ground && o.parent)
      o = o.parent;
    if (o !== c.floors && o !== c.furniture && hit.object !== s.stage.ground) return;
    walker.current.target = { x: hit.point.x / MM, y: hit.point.z / MM };
  };
  useEffect(() => {
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    const clear = () => {
      look.current = null;
      resetStick();
    };
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", clear);
    };
  });

  const setEye = (v) => {
    walker.current.eye = clamp(v, 300, 40000);
    setEyeShown(Math.round(walker.current.eye));
    if (mode === "walk") placeWalkCamera();
  };
  const roofKey = mode === "walk" ? "roofWalk" : "roofOrbit";
  const Toggle = ({ k, label }) => (
    <Btn small={true} active={vis[k]} onClick={() => setVis((v) => ({ ...v, [k]: !v[k] }))}>
      {label}
    </Btn>
  );
  const st = stickUI;
  const pill = {
    background: "rgba(27,37,40,0.8)",
    border: `1px solid ${C.line}`,
    color: C.text,
    cursor: "pointer",
  };
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
          aria-label={t("close")}
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
        <Btn small={true} active={mode === "orbit"} onClick={() => switchMode("orbit")}>
          {t("orbit")}
        </Btn>
        <Btn small={true} active={mode === "walk"} onClick={() => switchMode("walk")}>
          {t("walk")}
        </Btn>
        <Btn small={true} active={invert} onClick={() => setInvert(!invert)}>
          {t("invertDrag")}
        </Btn>
        <div style={{ display: "flex", gap: 5, marginLeft: "auto" }}>
          <Toggle k={roofKey} label={t("roofOn")} />
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
          cursor: mode === "walk" ? "crosshair" : "grab",
          background: "#DCE5E8",
        }}
      >
        <div ref={host} style={{ position: "absolute", inset: 0 }} />
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
                  border: `1.5px solid ${st.active ? C.accent : "rgba(255,255,255,0.6)"}`,
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
                    background: st.active ? C.accent : "rgba(255,255,255,0.78)",
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
                  onClick={() => setEye(walker.current.eye + d)}
                  style={{ ...pill, width: 42, height: 42, borderRadius: 12, fontSize: 19 }}
                >
                  {l}
                </button>
              ))}
              <button
                onClick={() => setEye(EYE)}
                style={{
                  ...pill,
                  width: 42,
                  borderRadius: 10,
                  color: C.dim,
                  fontSize: 9,
                  padding: "5px 0",
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
            right: 12,
            fontFamily: MONO,
            fontSize: 10.5,
            color: "rgba(30,40,42,0.7)",
            pointerEvents: "none",
            lineHeight: 1.5,
          }}
        >
          {mode === "orbit" ? t("orbitHint") : t("walkHint")}
          {!coarse && <div>{t("keysHint")}</div>}
        </div>
        {(failed || lost) && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
              background: failed ? C.chrome : "rgba(27,37,40,0.6)",
              color: C.text,
              fontSize: 14,
              lineHeight: 1.5,
              textAlign: "center",
            }}
          >
            {failed ? t("noWebgl") : t("glLost")}
          </div>
        )}
      </div>
    </div>
  );
}
