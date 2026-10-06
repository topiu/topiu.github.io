/* domain/programtext — a programme from text, and a programme as a link.
 *
 * Programmes arrive as text: an email from the physiotherapist, a PDF, a
 * message from a coach. Typing them in exercise by exercise was the heaviest
 * part of setup. `parseProgramText` reads the common shapes —
 *
 *   "1. Lantionnosto 3x15"           "Lankku 3 x 30 s"
 *   "Lähentäjien puristus 3 x 10 x 5 s"   "Kävely 30 min, päivittäin"
 *   "Kyykky 3 sarjaa 10 toistoa 2 krt/vko"
 *
 * — and matches names to the library so muscles and joints come pre-filled.
 * It is a heuristic; the UI always shows an editable preview before anything is
 * added. A photo of a paper sheet can be turned into text with any tool the
 * person chooses; this app never sends anything anywhere.
 *
 * A programme link carries only the programme (names, targets, frequency,
 * description, mapping) — never diary entries — in the URL fragment, which
 * browsers do not send to the server.
 */

import { EMPTY_DOSE } from "./dose";
import { FREQ_DAILY } from "./freq";
import { EQUIP_IDS } from "./gym";
import { LIBRARY, LIB_BY_ID } from "./library";
import { normalizeExercises } from "./normalize";
import { uid } from "./num";
import { EX_TYPE_IDS } from "./taxonomy";
import { exerciseFromLibrary } from "./templates";

/* ------------------------------------------------------------------ */
/*  Text                                                               */
/* ------------------------------------------------------------------ */
const X = "\\s*[x×*]\\s*";
const SEC = "\\s*(?:s|sek|sekuntia|sekunnin|s\\.)\\b";

function pickFreq(s) {
  let freq = null;
  const daily = /\b(päivittäin|joka päivä|päivässä|daily)\b/i;
  const weekly = new RegExp(`(\\d)\\s*(?:x|×|krt|kertaa|kerran)?\\s*(?:/|\\s)\\s*(?:vko|viikko|viikossa|vk)\\b`, "i");
  let m;
  if ((m = s.match(weekly))) {
    freq = Math.max(1, Math.min(FREQ_DAILY, parseInt(m[1], 10)));
    s = s.replace(m[0], " ");
  } else if ((m = s.match(daily))) {
    freq = FREQ_DAILY;
    s = s.replace(m[0], " ");
  }
  return { s, freq };
}

function pickDose(s) {
  let m;
  /* minutes */
  if ((m = s.match(/(\d{1,3})\s*(?:min|minuuttia|minuutin|minuuttia)\b/i))) {
    return { s: s.replace(m[0], " "), dose: { ...EMPTY_DOSE, min: +m[1] }, unit: "min" };
  }
  /* sets × reps × hold s */
  if ((m = s.match(new RegExp(`(\\d{1,2})${X}(\\d{1,3})${X}(\\d{1,3})${SEC}`, "i")))) {
    return { s: s.replace(m[0], " "), dose: { ...EMPTY_DOSE, sets: +m[1], reps: +m[2], hold: +m[3] } };
  }
  /* sets × hold s */
  if ((m = s.match(new RegExp(`(\\d{1,2})${X}(\\d{1,3})${SEC}`, "i")))) {
    return { s: s.replace(m[0], " "), dose: { ...EMPTY_DOSE, sets: +m[1], hold: +m[2] } };
  }
  /* sets × reps */
  if ((m = s.match(new RegExp(`(\\d{1,2})${X}(\\d{1,3})\\b`, "i")))) {
    return { s: s.replace(m[0], " "), dose: { ...EMPTY_DOSE, sets: +m[1], reps: +m[2] } };
  }
  /* "3 sarjaa 10 toistoa" / "3 sarjaa" / "10 toistoa" */
  const sets = s.match(/(\d{1,2})\s*(?:sarjaa|sarja|kierrosta)\b/i);
  const reps = s.match(/(\d{1,3})\s*(?:toistoa|toisto|krt|kertaa)\b/i);
  if (sets || reps) {
    let out = s;
    if (sets) out = out.replace(sets[0], " ");
    if (reps) out = out.replace(reps[0], " ");
    return { s: out, dose: { ...EMPTY_DOSE, sets: sets ? +sets[1] : 1, reps: reps ? +reps[1] : null } };
  }
  /* a hold alone: "30 s pito" */
  if ((m = s.match(new RegExp(`(\\d{1,3})${SEC}`, "i")))) {
    return { s: s.replace(m[0], " "), dose: { ...EMPTY_DOSE, sets: 1, hold: +m[1] } };
  }
  return { s, dose: null };
}

const clean = (s) =>
  s
    .replace(/\b(pito|pitoa|per puoli|\/\s*puoli|puolelle|molemmille puolille|jalalle|kädelle)\b/gi, " ")
    .replace(/[(),;:–—\-•*·]+$/g, " ")
    .replace(/^[\s\-–—•*·]+|[\s\-–—•*·,;:]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-zåäö0-9 ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

/* Best library match for a typed name, or null. Exact name first, then the
   share of words in common; a weak match is no match. */
export function matchLibrary(name) {
  const n = norm(name);
  if (!n) return null;
  let best = null;
  let bestScore = 0;
  const words = new Set(n.split(" ").filter((w) => w.length > 2));
  for (const l of LIBRARY) {
    const ln = norm(l.name);
    if (ln === n) return l;
    const lw = new Set(ln.split(" ").filter((w) => w.length > 2));
    if (!lw.size || !words.size) continue;
    let common = 0;
    words.forEach((w) => {
      for (const x of lw) {
        if (x === w || (w.length > 4 && x.length > 4 && (x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5))))) {
          common++;
          break;
        }
      }
    });
    const score = common / Math.max(words.size, lw.size);
    if (score > bestScore) {
      bestScore = score;
      best = l;
    }
  }
  return bestScore >= 0.6 ? best : null;
}

export type ProgramRow = {
  name: string;
  dose: any;
  unit: "sets" | "min";
  freq: number | null;
  desc: string;
  lib: string | null;
};

/* One row per exercise line. A line with no numbers that reads like prose
   (long, or starting in lower case) is the previous exercise's description. */
export function parseProgramText(text): ProgramRow[] {
  const rows: ProgramRow[] = [];
  String(text || "")
    .split(/\r?\n/)
    .forEach((raw) => {
      let s = raw.replace(/^\s*(\d{1,2}[.)]\s+|[-–—•*·]\s*)/, "").trim();
      if (!s) return;
      const f = pickFreq(s);
      s = f.s;
      const d = pickDose(s);
      const name = clean(d.s);
      /* instructions under an exercise: indented, a full sentence, long, or
         starting in lower case — and never carrying a target of its own */
      const indented = /^\s+\S/.test(raw);
      const sentence = /\.\s*$/.test(name) && name.split(/\s+/).length >= 4;
      const prose = !d.dose && !f.freq && (indented || sentence || name.length > 45 || /^[a-zåäö]/.test(name));
      if (prose && rows.length) {
        const prev = rows[rows.length - 1];
        prev.desc = (prev.desc ? prev.desc + " " : "") + raw.trim();
        return;
      }
      if (!name) {
        /* a line holding only a target or a frequency belongs to the exercise above */
        if (rows.length) {
          const prev = rows[rows.length - 1];
          if (d.dose && !prev.dose) Object.assign(prev, { dose: d.dose, unit: d.unit || prev.unit });
          if (f.freq && !prev.freq) prev.freq = f.freq;
        }
        return;
      }
      const lib = matchLibrary(name);
      rows.push({
        name: name.slice(0, 80),
        dose: d.dose,
        unit: d.unit === "min" || (!d.dose && lib && lib.unit === "min") ? "min" : "sets",
        freq: f.freq,
        desc: "",
        lib: lib ? lib.id : null,
      });
    });
  return rows;
}

/* Exercises from parsed rows; the typed name is kept (it is the one the
   physiotherapist used), the library supplies muscles, joints and type. */
export function rowsToExercises(rows: ProgramRow[], todayKey?: string) {
  return rows.map((r) => {
    const lib = r.lib ? LIB_BY_ID[r.lib] : null;
    if (lib) {
      const e: any = exerciseFromLibrary(lib, { name: r.name, dose: r.dose || undefined, freq: r.freq || undefined, todayKey });
      if (r.desc) e.desc = r.desc.slice(0, 1000);
      return e;
    }
    return {
      id: uid(),
      added: todayKey || null,
      name: r.name,
      desc: r.desc.slice(0, 1000),
      type: "strength",
      muscles: {},
      structures: [],
      unit: r.unit,
      met: null,
      source: null,
      archived: false,
      freq: r.freq || FREQ_DAILY,
      equip: null,
      dose: r.dose ? { ...r.dose } : r.unit === "min" ? { ...EMPTY_DOSE, min: 30 } : { ...EMPTY_DOSE, sets: 3, reps: 10 },
    };
  });
}

/* Merge by name. An active exercise with the same name is left alone. An
   archived one is revived — same id, so its history continues — with the
   incoming target and frequency; `revived` lists those so the caller can log
   the target change. Everything else is added. */
export function mergeExercises(existing, incoming) {
  const byName = new Map((existing || []).map((e) => [norm(e.name), e]));
  const revived = [];
  const reviveIds = new Map();
  const add = [];
  let skipped = 0;
  incoming.forEach((e) => {
    const old: any = byName.get(norm(e.name));
    if (!old) add.push(e);
    else if (old.archived && !reviveIds.has(old.id)) {
      reviveIds.set(old.id, e);
      revived.push({ id: old.id, name: old.name, before: old.dose, after: e.dose, unit: old.unit });
    } else skipped++;
  });
  const exercises = (existing || []).map((x) => {
    const e = reviveIds.get(x.id);
    return e ? { ...x, archived: false, dose: { ...e.dose }, freq: e.freq || x.freq, equip: e.equip || x.equip || null } : x;
  });
  return { exercises: [...exercises, ...add], added: add.length, revived, skipped };
}

/* ------------------------------------------------------------------ */
/*  Link                                                               */
/* ------------------------------------------------------------------ */
export const LINK_KEY = "ohjelma";

const b64url = {
  enc(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  dec(s) {
    const b = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b + "===".slice((b.length + 3) % 4));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  },
};

/* Only what defines the programme. No ids (the receiver makes its own), no
   history, no diary. */
export function encodeProgram(exercises) {
  const items = (exercises || [])
    .filter((e) => !e.archived)
    .map((e) => {
      const d = e.dose || {};
      const o: any = { n: e.name, d: [d.sets || 0, d.reps || 0, d.hold || 0, d.min || 0] };
      if (e.unit === "min") o.u = "m";
      if (e.freq && e.freq < FREQ_DAILY) o.f = e.freq;
      if (e.type && e.type !== "strength") o.t = e.type;
      if (e.desc) o.x = e.desc.slice(0, 400);
      if (e.equip) o.q = e.equip;
      if (e.muscles && Object.keys(e.muscles).length) o.m = e.muscles;
      if (e.structures && e.structures.length) o.s = e.structures;
      if (e.met) o.e = e.met;
      if (e.video) o.v = e.video;
      return o;
    });
  return "1." + b64url.enc(JSON.stringify(items));
}

/* Exercises from a link payload, normalised like any import; null if the
   payload is not a programme. */
export function decodeProgram(payload, todayKey?: string) {
  try {
    const m = /^1\.([A-Za-z0-9_-]+)$/.exec(String(payload || "").trim());
    if (!m) return null;
    const items = JSON.parse(b64url.dec(m[1]));
    if (!Array.isArray(items) || !items.length || items.length > 100) return null;
    const raw = items
      .filter((o) => o && typeof o.n === "string" && o.n.trim())
      .map((o) => {
        const [sets, reps, hold, min] = Array.isArray(o.d) ? o.d : [];
        return {
          name: o.n.slice(0, 80),
          unit: o.u === "m" ? "min" : "sets",
          freq: o.f,
          type: EX_TYPE_IDS.includes(o.t) ? o.t : "strength",
          desc: typeof o.x === "string" ? o.x : "",
          equip: EQUIP_IDS.includes(o.q) ? o.q : null,
          muscles: o.m,
          structures: o.s,
          met: o.e,
          video: typeof o.v === "string" ? o.v : "",
          dose: { sets: sets || null, reps: reps || null, hold: hold || null, min: min || null },
          added: todayKey || null,
        };
      });
    if (!raw.length) return null;
    return normalizeExercises(raw);
  } catch {
    return null;
  }
}

/* the payload from a location hash like "#ohjelma=1.xxxx" */
export function programFromHash(hash) {
  const m = new RegExp(`(?:^#|&)${LINK_KEY}=([^&]+)`).exec(String(hash || ""));
  return m ? m[1] : null;
}
