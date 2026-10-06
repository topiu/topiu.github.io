/* ui/ExerciseChart — one exercise over time: the heaviest set per session,
 * and pain during the exercise, in Historia.
 *
 * Two small charts sharing one time axis, never one chart with two y-scales:
 * kilos and a 0–10 pain score are different measures, and a second axis makes
 * any line look like it tracks any other. Each is a single series in the app's
 * own colours (load in pine, pain in amber, as everywhere else), so neither
 * needs a legend; the heading names it. Tapping a point shows its values, and
 * the list under the charts is the same data as text.
 *
 * Facts only: no fitted trend, no arrow, no "personal best".
 *
 * Body order is geometry → scales → point lists (CLAUDE.md, the TDZ trap).
 */
import { useMemo, useState } from "react";
import { chartableExercises, equipLabel, exerciseSeries, fmtKg, parseKey, PAIN_MAX, setLabel, shortDate } from "../domain";
import { C } from "../styles/tokens";
import { Card, SectionLabel } from "./common";

const W = 320;
const H = 96;
const PAD = { l: 30, r: 10, t: 10, b: 18 };

export function ExerciseChartSection({ logs, exercises }) {
  const options = useMemo(() => chartableExercises(logs, exercises), [logs, exercises]);
  const [pickId, setPickId] = useState(null);
  const ex = options.find((e) => e.id === pickId) || options[0];
  const series = useMemo(() => (ex ? exerciseSeries(logs, ex.id) : []), [logs, ex]);
  const [sel, setSel] = useState(null);
  if (!ex) return null;

  /* ---- geometry ---- */
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const t0 = series.length ? parseKey(series[0].date).getTime() : 0;
  const t1 = series.length ? parseKey(series[series.length - 1].date).getTime() : 1;
  const span = Math.max(1, t1 - t0);
  const loads = series.filter((p) => p.top != null);
  const pains = series.filter((p) => p.pain != null);
  const kgMax = loads.length ? Math.max(...loads.map((p) => p.top)) : 1;
  const kgMin = loads.length ? Math.min(...loads.map((p) => p.top)) : 0;
  const kgLo = Math.max(0, Math.floor((kgMin - (kgMax - kgMin) * 0.15 - 1) / 5) * 5);
  const kgHi = Math.ceil((kgMax + (kgMax - kgMin) * 0.15 + 1) / 5) * 5;

  /* ---- scales ---- */
  const xOf = (date) => (series.length < 2 ? PAD.l + innerW / 2 : PAD.l + ((parseKey(date).getTime() - t0) / span) * innerW);
  const yKg = (v) => PAD.t + innerH - ((v - kgLo) / Math.max(1, kgHi - kgLo)) * innerH;
  const yPain = (v) => PAD.t + innerH - (v / PAIN_MAX) * innerH;

  /* ---- point lists ---- */
  const loadPts = loads.map((p) => `${xOf(p.date).toFixed(1)},${yKg(p.top).toFixed(1)}`).join(" ");
  const painPts = pains.map((p) => `${xOf(p.date).toFixed(1)},${yPain(p.pain).toFixed(1)}`).join(" ");
  const picked = sel != null ? series.find((p) => p.date === sel) : null;
  const lastLoad = loads[loads.length - 1];
  const recent = [...series].reverse().slice(0, 6);

  const xLabels = series.length ? [series[0], series[series.length - 1]] : [];
  const axisText = { fontSize: 9.5, fill: C.inkFaint, fontFamily: "inherit" };

  const chart = (title, kind, pts, pointsList, yOf, ticks, valueOf) => (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.inkSoft, margin: "0 2px 2px" }}>{title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${title}: ${ex.name}`} style={{ display: "block", overflow: "visible" }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={yOf(t)} y2={yOf(t)} stroke={C.line} strokeWidth={1} />
            <text x={PAD.l - 5} y={yOf(t) + 3} textAnchor="end" style={axisText}>{kind === "kg" ? fmtKg(t) : t}</text>
          </g>
        ))}
        {xLabels.map((p, i) => (
          <text key={i} x={xOf(p.date)} y={H - 4} textAnchor={series.length < 2 ? "middle" : i === 0 ? "start" : "end"} style={axisText}>
            {shortDate(parseKey(p.date))}
          </text>
        ))}
        {pointsList.length > 1 && <polyline points={pts} fill="none" stroke={kind === "kg" ? C.pine : C.amber} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {pointsList.map((p) => (
          <g key={p.date} onClick={() => setSel(sel === p.date ? null : p.date)} style={{ cursor: "pointer" }}>
            {/* hit target larger than the mark */}
            <circle cx={xOf(p.date)} cy={yOf(valueOf(p))} r={12} fill="transparent" />
            <circle cx={xOf(p.date)} cy={yOf(valueOf(p))} r={sel === p.date ? 5.5 : 4} fill={kind === "kg" ? C.pine : C.amber} stroke={C.surface} strokeWidth={2} />
          </g>
        ))}
      </svg>
    </div>
  );

  const kgTicks = loads.length ? [kgLo, (kgLo + kgHi) / 2, kgHi] : [];
  const painTicks = [0, 5, 10];

  return (
    <>
      <SectionLabel>Liikkeen kehitys</SectionLabel>
      <Card style={{ padding: 12 }}>
        {options.length > 1 && (
          <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 4, marginBottom: 4 }}>
            {options.map((e) => (
              <button key={e.id} className="tap" onClick={() => { setPickId(e.id); setSel(null); }} aria-pressed={e.id === ex.id}
                style={{ flex: "0 0 auto", fontSize: 12.5, fontWeight: 600, padding: "6px 11px", borderRadius: 999, border: `1px solid ${e.id === ex.id ? C.pine : C.line}`, background: e.id === ex.id ? C.pine : C.surface, color: e.id === ex.id ? "#fff" : C.inkSoft, whiteSpace: "nowrap" }}>
                {e.name}
              </button>
            ))}
          </div>
        )}
        <div style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>{ex.name}</div>
        {lastLoad && (
          <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 1 }}>
            Viimeisin kuorma {fmtKg(lastLoad.top)} kg · {series.length} {series.length === 1 ? "kerta" : "kertaa"} kirjattu
          </div>
        )}
        {loads.length > 0 && chart("Raskain sarja, kg", "kg", loadPts, loads, yKg, kgTicks, (p) => p.top)}
        {pains.length > 0 && chart("Kipu liikkeen aikana, 0–10", "pain", painPts, pains, yPain, painTicks, (p) => p.pain)}
        {picked && (
          <div role="status" style={{ marginTop: 8, fontSize: 13, color: C.ink, background: C.surfaceSoft, border: `1px solid ${C.line}`, borderRadius: 10, padding: "8px 10px" }}>
            <b>{shortDate(parseKey(picked.date))}</b>
            {picked.sets.length > 0 && <> · {picked.sets.map(setLabel).join(", ")}{picked.sets[0].eq ? ` · ${equipLabel(picked.sets[0].eq)}` : ""}</>}
            {picked.pain != null && <> · kipu {picked.pain}/10</>}
          </div>
        )}
        {/* the same data as text */}
        <div style={{ marginTop: 10, borderTop: `1px solid ${C.line}` }}>
          {recent.map((p) => (
            <div key={p.date} style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.line}`, fontSize: 12.5 }}>
              <span style={{ width: 62, flex: "0 0 auto", color: C.inkSoft, fontVariantNumeric: "tabular-nums" }}>{shortDate(parseKey(p.date))}</span>
              <span style={{ flex: 1, minWidth: 0, color: C.ink }}>{p.sets.length ? p.sets.map(setLabel).join(", ") : "–"}</span>
              {p.pain != null && <span style={{ flex: "0 0 auto", color: C.inkSoft }}>kipu {p.pain}</span>}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
