import { pointInPoly } from "./geometry";

/* Plan labels are monospace, so text width is predictable: about 0.62 em a
   character. Labels used to be drawn whole whenever a piece was big enough,
   so long names ran out of their outlines ("Kitchen base 1200" into the
   wall) and the room's area label sat on top of whatever stood in the
   middle of the room. */
export const CHAR_W = 0.62;
const LINE = 1.25; // line height in em

/* Shorter forms of a name, best first: the name, without a trailing size
   ("Kitchen base 1200", "Suihku 900×900"), then its first word. */
export function labelForms(name) {
  const out = [name];
  const noSize = name.replace(/\s+[\d.,]+(\s*[×x]\s*[\d.,]+)?\s*(mm|cm)?$/i, "").trim();
  if (noSize && !out.includes(noSize)) out.push(noSize);
  const first = (noSize || name).split(/\s+/)[0];
  if (first && !out.includes(first)) out.push(first);
  return out;
}

const textW = (t, s) => t.length * CHAR_W * s;

/* The best readable label for a w × h box (screen px): the longest form that
   fits at a size between max and min, horizontal, or along the length of a
   tall narrow box. As a last resort a long first word (7+ letters) is cut
   short with an ellipsis, keeping at least four; a cut-down short word
   ("Cha…") says nothing the outline does not. Null if nothing readable fits. */
export function fitLabel(name, w, h, { max = 10, min = 7.5, pad = 6 } = {}) {
  const forms = labelForms(name);
  const along = (len, cross) => {
    for (const t of forms)
      for (let s = max; s >= min; s -= 0.5)
        if (textW(t, s) <= len - pad && s * LINE <= cross) return { t, s };
    const word = forms[forms.length - 1];
    if (word.length < 7) return null;
    for (let n = word.length - 1; n >= 4; n--) {
      const t = word.slice(0, n) + "…";
      if (textW(t, min) <= len - pad && min * LINE <= cross) return { t, s: min };
    }
    return null;
  };
  const flat = along(w, h);
  if (flat && flat.t === name) return { ...flat, rot: 0 };
  if (h > w * 1.4) {
    const up = along(h, w);
    if (up && (!flat || up.t.length > flat.t.length)) return { ...up, rot: -90 };
  }
  return flat && { ...flat, rot: 0 };
}

/* The screen rectangle a label takes. */
export function labelRect(x, y, t, s, rot = 0) {
  const hw = textW(t, s) / 2 + 3,
    hh = (s * LINE) / 2;
  return rot ? { x0: x - hh, y0: y - hw, x1: x + hh, y1: y + hw } : { x0: x - hw, y0: y - hh, x1: x + hw, y1: y + hh };
}
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/* Where to put a room's label block (lw × lh, screen px) so it stays clear of
   furniture: the room's centre if that is free, else the free spot nearest to
   it on a grid over the room. Falls back to the centre, marked crowded, so the
   label still shows (on a backing) when nothing in the room is free. */
export function placeRoomLabel(poly, lw, lh, obstacles, centre) {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const p of poly) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  const c = centre || { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  const fits = (x, y) => {
    const r = { x0: x - lw / 2, y0: y - lh / 2, x1: x + lw / 2, y1: y + lh / 2 };
    const corners = [
      { x: r.x0, y: r.y0 },
      { x: r.x1, y: r.y0 },
      { x: r.x1, y: r.y1 },
      { x: r.x0, y: r.y1 },
    ];
    return corners.every((q) => pointInPoly(q, poly)) && !obstacles.some((o) => overlaps(r, o));
  };
  if (fits(c.x, c.y)) return { x: c.x, y: c.y, crowded: false };
  const step = Math.max(8, lh / 2);
  const spots = [];
  for (let y = y0 + lh / 2; y <= y1 - lh / 2; y += step)
    for (let x = x0 + lw / 2; x <= x1 - lw / 2; x += step) spots.push({ x, y, d: Math.hypot(x - c.x, y - c.y) });
  spots.sort((a, b) => a.d - b.d);
  for (const p of spots) if (fits(p.x, p.y)) return { x: p.x, y: p.y, crowded: false };
  return { x: c.x, y: c.y, crowded: true };
}
