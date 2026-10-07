import React, { useRef, useState } from "react";
import { C, MONO, SANS, clamp, uid } from "../core";
import { bbox } from "../domain/geometry";
import { nameOf } from "../i18n";
import { Btn, Label, NumField } from "./atoms";

/* ============================================================
   Shape editor (rect / circle / polygon)
   ============================================================ */

export function ShapeEditor({ initial, onSave, onCancel, t, lang }) {
  const [tab, setTab] = useState(initial?.type || "rect");
  const [name, setName] = useState(initial ? nameOf(initial, lang) : "");
  const [hz, setHz] = useState(initial?.hz || 800);
  const [w, setW] = useState(initial?.w || 1000);
  const [h, setH] = useState(initial?.h || 600);
  const [d, setD] = useState(initial ? (initial.r || 300) * 2 : 600);
  const [pts, setPts] = useState(() => {
    if (initial?.type === "poly" && initial.points) {
      const b = bbox(initial.points);
      return initial.points.map((p) => ({
        x: p.x - b.x0,
        y: p.y - b.y0,
      }));
    }
    return [];
  });
  const [closed, setClosed] = useState(initial?.type === "poly");
  const VIEW = 4600,
    SIZE = 300,
    GS = 100;
  const sc = SIZE / VIEW;
  const svgRef = useRef(null);
  const addPoint = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    const x = Math.round((e.clientX - r.left) / sc / GS) * GS;
    const y = Math.round((e.clientY - r.top) / sc / GS) * GS;
    if (closed) return;
    if (pts.length > 2 && Math.hypot(x - pts[0].x, y - pts[0].y) < 200) {
      setClosed(true);
      return;
    }
    setPts([
      ...pts,
      {
        x: clamp(x, 0, VIEW),
        y: clamp(y, 0, VIEW),
      },
    ]);
  };
  const pb = pts.length ? bbox(pts) : null;
  const save = () => {
    const nm =
      name.trim() || (tab === "circle" ? `Ø${Math.round(d)}` : `${Math.round(w)}×${Math.round(h)}`);
    const keep =
      initial?.key && nm === nameOf(initial, lang)
        ? {
            key: initial.key,
          }
        : {};
    const base = {
      id: initial?.id || uid(),
      name: nm,
      hz,
      groupKey: initial?.groupKey || "custom",
      ...keep,
    };
    if (tab === "rect")
      onSave({
        ...base,
        type: "rect",
        w,
        h,
      });
    else if (tab === "circle")
      onSave({
        ...base,
        type: "circle",
        r: d / 2,
      });
    else {
      if (pts.length < 3) return;
      const b = bbox(pts);
      onSave({
        ...base,
        type: "poly",
        points: pts.map((p) => ({
          x: p.x - b.cx,
          y: p.y - b.cy,
        })),
      });
    }
  };
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 6,
        }}
      >
        {[
          ["rect", t("rect")],
          ["circle", t("circle")],
          ["poly", t("poly")],
        ].map(([k, l]) => (
          <Btn key={k} wide={true} small={true} active={tab === k} onClick={() => setTab(k)}>
            {l}
          </Btn>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        <Label>{t("name")}</Label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            background: C.chrome,
            border: `1px solid ${C.line}`,
            borderRadius: 7,
            color: C.text,
            fontFamily: SANS,
            fontSize: 14,
            padding: "8px 9px",
            outline: "none",
          }}
        />
      </div>
      {tab === "rect" && (
        <div
          style={{
            display: "flex",
            gap: 10,
          }}
        >
          <NumField label={t("width")} value={w} onChange={setW} suffix="mm" w="34%" />
          <NumField label={t("depth")} value={h} onChange={setH} suffix="mm" w="33%" />
          <NumField label={t("height")} value={hz} onChange={setHz} suffix="mm" w="33%" />
        </div>
      )}
      {tab === "circle" && (
        <div
          style={{
            display: "flex",
            gap: 10,
          }}
        >
          <NumField label={t("diameter")} value={d} onChange={setD} suffix="mm" w="50%" />
          <NumField label={t("height")} value={hz} onChange={setHz} suffix="mm" w="50%" />
        </div>
      )}
      {tab === "poly" && <NumField label={t("height")} value={hz} onChange={setHz} suffix="mm" />}
      {tab === "poly" && (
        <React.Fragment>
          <Label>{t("polyHelp")}</Label>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
            }}
          >
            <svg
              ref={svgRef}
              onPointerDown={addPoint}
              width={SIZE}
              height={SIZE}
              style={{
                background: C.paper,
                borderRadius: 8,
                touchAction: "none",
                border: `1px solid ${C.line}`,
              }}
            >
              {Array.from(
                {
                  length: Math.floor(VIEW / 500) + 1,
                },
                (_, i) => (
                  <g key={i}>
                    <line
                      x1={i * 500 * sc}
                      y1={0}
                      x2={i * 500 * sc}
                      y2={SIZE}
                      stroke={C.grid100}
                      strokeWidth={1}
                    />
                    <line
                      x1={0}
                      y1={i * 500 * sc}
                      x2={SIZE}
                      y2={i * 500 * sc}
                      stroke={C.grid100}
                      strokeWidth={1}
                    />
                  </g>
                ),
              )}
              {Array.from(
                {
                  length: Math.floor(VIEW / 1000) + 1,
                },
                (_, i) => (
                  <g key={"m" + i}>
                    <line
                      x1={i * 1000 * sc}
                      y1={0}
                      x2={i * 1000 * sc}
                      y2={SIZE}
                      stroke={C.grid1000}
                      strokeWidth={1}
                    />
                    <line
                      x1={0}
                      y1={i * 1000 * sc}
                      x2={SIZE}
                      y2={i * 1000 * sc}
                      stroke={C.grid1000}
                      strokeWidth={1}
                    />
                  </g>
                ),
              )}
              {pts.length > 1 && (
                <polyline
                  points={
                    pts.map((p) => `${p.x * sc},${p.y * sc}`).join(" ") +
                    (closed ? ` ${pts[0].x * sc},${pts[0].y * sc}` : "")
                  }
                  fill={closed ? C.timberFill : "none"}
                  stroke={C.timber}
                  strokeWidth={2}
                />
              )}
              {pts.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x * sc}
                  cy={p.y * sc}
                  r={4}
                  fill={i === 0 ? C.accent : C.paper}
                  stroke={C.timber}
                  strokeWidth={2}
                />
              ))}
            </svg>
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <Btn
              small={true}
              onClick={() => {
                setPts(pts.slice(0, -1));
                setClosed(false);
              }}
            >
              {t("undoCorner")}
            </Btn>
            <Btn
              small={true}
              onClick={() => {
                setPts([]);
                setClosed(false);
              }}
            >
              {t("clear")}
            </Btn>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 12,
                color: C.dim,
                marginLeft: "auto",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {pb ? `${Math.round(pb.w)} × ${Math.round(pb.h)}` : "—"}
            </span>
          </div>
          {pts.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <Label>{t("corners")}</Label>
              {pts.map((p, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      color: C.dim,
                      width: 18,
                    }}
                  >
                    {i + 1}
                  </span>
                  {["x", "y"].map((ax) => (
                    <input
                      key={ax}
                      value={p[ax]}
                      inputMode="numeric"
                      onChange={(e) => {
                        const v = parseFloat(e.target.value.replace(",", "."));
                        const next = pts.slice();
                        next[i] = {
                          ...next[i],
                          [ax]: isNaN(v) ? 0 : v,
                        };
                        setPts(next);
                      }}
                      style={{
                        flex: 1,
                        background: C.chrome,
                        border: `1px solid ${C.line}`,
                        borderRadius: 6,
                        color: C.text,
                        fontFamily: MONO,
                        fontSize: 13,
                        padding: "5px 7px",
                        outline: "none",
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </React.Fragment>
      )}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 4,
        }}
      >
        <Btn wide={true} onClick={onCancel}>
          {t("cancel")}
        </Btn>
        <Btn wide={true} active={true} onClick={save}>
          {t("saveShape")}
        </Btn>
      </div>
    </div>
  );
}
