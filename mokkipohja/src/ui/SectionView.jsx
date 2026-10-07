import { useEffect, useRef, useState } from "react";
import { C, MONO } from "../core";
import { ceilingAt, ceilingCrossings, defaultCeiling } from "../domain/ceilings";
import { bbox, itemPoly, pointInPoly } from "../domain/geometry";

/* ============================================================
   Cross-section — cuts across the ceiling slope
   ============================================================ */

export function SectionView({ doc, defs, lang, room, atPos, height, t }) {
  const H = height;
  const [w, setW] = useState(340);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.getBoundingClientRect().width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  if (!room) {
    return (
      <div
        ref={ref}
        style={{
          height: H,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: C.paper,
          borderTop: `1px solid ${C.line}`,
          fontFamily: MONO,
          fontSize: 11.5,
          color: "#8A8F7E",
          textAlign: "center",
          padding: "0 20px",
        }}
      >
        {t("noRooms")}
      </div>
    );
  }
  const c = room.ceiling || defaultCeiling();
  const axis = c.mode === "flat" ? "x" : c.axis;
  const perp = axis === "x" ? "y" : "x";
  const b = bbox(room.points);
  const a0 = axis === "x" ? b.x0 : b.y0;
  const a1 = axis === "x" ? b.x1 : b.y1;
  const topMm = Math.max(c.mode === "flat" ? c.h : c.ridgeH, 2000) + 400;
  const padL = 40,
    padR = 14,
    padT = 12,
    padB = 20;
  const iw = Math.max(w - padL - padR, 40),
    ih = H - padT - padB;
  const kx = iw / Math.max(a1 - a0, 1);
  const kz = ih / topMm;
  const X = (mm) => padL + (mm - a0) * kx;
  const Z = (mm) => padT + ih - mm * kz;
  const profile = Array.from(
    {
      length: 49,
    },
    (_, i) => {
      const v = a0 + ((a1 - a0) * i) / 48;
      const p =
        axis === "x"
          ? {
              x: v,
              y: b.cy,
            }
          : {
              x: b.cx,
              y: v,
            };
      return {
        v,
        h: ceilingAt(room, p),
      };
    },
  );

  // pieces whose footprint straddles the cut
  const band = 700;
  const cuts = doc.items
    .map((it) => {
      const def = defs[it.defId];
      if (!def) return null;
      const poly = itemPoly(it, def);
      const ib = bbox(poly);
      const lo = perp === "x" ? ib.x0 : ib.y0;
      const hi = perp === "x" ? ib.x1 : ib.y1;
      if (atPos < lo - band || atPos > hi + band) return null;
      if (
        !pointInPoly(
          {
            x: it.x,
            y: it.y,
          },
          room.points,
        )
      )
        return null;
      return {
        id: it.id,
        def,
        a: axis === "x" ? ib.x0 : ib.y0,
        b: axis === "x" ? ib.x1 : ib.y1,
        hz: def.hz || 800,
      };
    })
    .filter(Boolean);
  return (
    <div
      ref={ref}
      style={{
        height: H,
        background: C.paper,
        borderTop: `1px solid ${C.line}`,
        position: "relative",
      }}
    >
      <svg
        width={w}
        height={H}
        style={{
          display: "block",
        }}
      >
        {Array.from(
          {
            length: Math.floor(topMm / 500) + 1,
          },
          (_, i) => i * 500,
        ).map((z) => (
          <g key={z}>
            <line
              x1={padL}
              y1={Z(z)}
              x2={w - padR}
              y2={Z(z)}
              stroke={z % 1000 ? C.grid10 : C.grid100}
              strokeWidth={1}
            />
            {z % 1000 === 0 && z > 0 && (
              <text
                x={padL - 5}
                y={Z(z)}
                textAnchor="end"
                dominantBaseline="middle"
                fontFamily={MONO}
                fontSize={8.5}
                fill="#8A8F7E"
              >
                {z / 1000}m
              </text>
            )}
          </g>
        ))}
        <polyline
          points={profile.map((p) => `${X(p.v)},${Z(p.h)}`).join(" ")}
          fill="none"
          stroke={C.ink}
          strokeWidth={2.2}
        />
        <polygon
          points={
            `${X(a0)},${Z(0)} ` +
            profile.map((p) => `${X(p.v)},${Z(p.h)}`).join(" ") +
            ` ${X(a1)},${Z(0)}`
          }
          fill="rgba(28,38,40,0.05)"
        />
        <line x1={X(a0)} y1={Z(0)} x2={X(a1)} y2={Z(0)} stroke={C.ink} strokeWidth={2.6} />
        {c.mode !== "flat" &&
          ceilingCrossings(room, 1900).map((v, i) => (
            <g key={i}>
              <line
                x1={X(v)}
                y1={Z(0)}
                x2={X(v)}
                y2={Z(1900)}
                stroke="#9A7B3E"
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <text
                x={X(v)}
                y={Z(1900) - 5}
                textAnchor="middle"
                fontFamily={MONO}
                fontSize={8.5}
                fill="#9A7B3E"
              >
                1900
              </text>
            </g>
          ))}
        {cuts.map((s) => {
          const fits =
            s.hz <=
            ceilingAt(
              room,
              axis === "x"
                ? {
                    x: (s.a + s.b) / 2,
                    y: b.cy,
                  }
                : {
                    x: b.cx,
                    y: (s.a + s.b) / 2,
                  },
            );
          const worst = Math.min(
            ceilingAt(
              room,
              axis === "x"
                ? {
                    x: s.a,
                    y: b.cy,
                  }
                : {
                    x: b.cx,
                    y: s.a,
                  },
            ),
            ceilingAt(
              room,
              axis === "x"
                ? {
                    x: s.b,
                    y: b.cy,
                  }
                : {
                    x: b.cx,
                    y: s.b,
                  },
            ),
          );
          const bad = s.hz > worst;
          return (
            <g key={s.id}>
              <rect
                x={X(s.a)}
                y={Z(s.hz)}
                width={Math.max(X(s.b) - X(s.a), 2)}
                height={s.hz * kz}
                fill={bad ? "rgba(180,64,47,0.22)" : C.timberFill}
                stroke={bad ? C.bad : C.timber}
                strokeWidth={1.4}
              />
              {X(s.b) - X(s.a) > 34 && (
                <text
                  x={(X(s.a) + X(s.b)) / 2}
                  y={Z(s.hz) - 4}
                  textAnchor="middle"
                  fontFamily={MONO}
                  fontSize={8.5}
                  fill={bad ? C.bad : "#6B5227"}
                >
                  {s.hz}
                </text>
              )}
            </g>
          );
        })}
        <text x={padL} y={H - 6} fontFamily={MONO} fontSize={9} fill="#8A8F7E">
          {room.name}
          {" · "}
          {t("sectionAt")} {perp.toUpperCase()} {Math.round(atPos)}
        </text>
      </svg>
    </div>
  );
}
