
/* ============================================================
   MÖKKIPOHJA — cabin interior planner
   All internal units are millimetres. Screen scale s = px per mm.
   ============================================================ */

export const C = {
  chrome: "#1B2528",
  chrome2: "#243237",
  chrome3: "#2F4046",
  line: "#3C5158",
  text: "#E7EBE6",
  dim: "#93A5A6",
  paper: "#E9E7DC",
  grid10: "#DCDACB",
  grid100: "#C7C7B3",
  grid1000: "#A6A992",
  ink: "#1C2628",
  room: "#F4F2E7",
  timber: "#8A5F2B",
  timberFill: "rgba(195,146,79,0.34)",
  accent: "#14808F",
  accent2: "#66CDD3",
  bad: "#B4402F",
};
export const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';
export const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif';
export const D2R = Math.PI / 180;
export const TAP_SLOP = 12; // px a finger may drift and still count as a tap
export const uid = () => Math.random().toString(36).slice(2, 10);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const fmt = (mm) =>
  mm == null ? "–" : Math.abs(mm) >= 1000 ? (mm / 1000).toFixed(2) + " m" : Math.round(mm) + " mm";
