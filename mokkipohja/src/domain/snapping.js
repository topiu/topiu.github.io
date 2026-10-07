import { D2R } from "../core";
import { bbox, itemPoly, wallPoly } from "./geometry";

/* ---------------- snapping ---------------- */

export function snapLines(doc, defs, ignoreId) {
  const vx = [],
    hy = [];
  for (const w of doc.walls) {
    const dx = Math.abs(w.x2 - w.x1),
      dy = Math.abs(w.y2 - w.y1);
    const b = bbox(wallPoly(w));
    if (dy > dx * 8) {
      vx.push(b.x0, b.x1);
    } else if (dx > dy * 8) {
      hy.push(b.y0, b.y1);
    }
  }
  for (const it of doc.items) {
    if (it.id === ignoreId) continue;
    const def = defs[it.defId];
    if (!def) continue;
    const b = bbox(itemPoly(it, def));
    vx.push(b.x0, b.x1);
    hy.push(b.y0, b.y1);
  }
  return {
    vx,
    hy,
  };
}
export function snapItemPos(item, def, doc, defs, grid, tol) {
  const b = bbox(itemPoly(item, def));
  const { vx, hy } = snapLines(doc, defs, item.id);
  let dx = null,
    dy = null;
  for (const L of vx) {
    for (const e of [b.x0, b.x1, b.cx]) {
      const d = L - e;
      if (Math.abs(d) < tol && (dx === null || Math.abs(d) < Math.abs(dx))) dx = d;
    }
  }
  for (const L of hy) {
    for (const e of [b.y0, b.y1, b.cy]) {
      const d = L - e;
      if (Math.abs(d) < tol && (dy === null || Math.abs(d) < Math.abs(dy))) dy = d;
    }
  }
  let nx = item.x + (dx ?? 0),
    ny = item.y + (dy ?? 0);
  if (dx === null && grid) nx = item.x + (Math.round(b.x0 / grid) * grid - b.x0);
  if (dy === null && grid) ny = item.y + (Math.round(b.y0 / grid) * grid - b.y0);
  return {
    x: nx,
    y: ny,
    snappedX: dx !== null,
    snappedY: dy !== null,
  };
}
export function snapPoint(p, doc, grid, tol, prev) {
  let out = {
    ...p,
  };
  let hit = null,
    bd = tol;
  const verts = [];
  for (const w of doc.walls) {
    verts.push(
      {
        x: w.x1,
        y: w.y1,
      },
      {
        x: w.x2,
        y: w.y2,
      },
    );
  }
  for (const r of doc.rooms) for (const v of r.points) verts.push(v);
  for (const v of verts) {
    const d = Math.hypot(v.x - p.x, v.y - p.y);
    if (d < bd) {
      bd = d;
      hit = v;
    }
  }
  if (hit)
    return {
      x: hit.x,
      y: hit.y,
      locked: true,
    };
  if (prev) {
    const dx = p.x - prev.x,
      dy = p.y - prev.y;
    const L = Math.hypot(dx, dy);
    if (L > 1) {
      const ang = Math.atan2(dy, dx) / D2R;
      const step = 15;
      const sn = Math.round(ang / step) * step;
      if (Math.abs(sn - ang) < 7) {
        let len = L;
        if (grid) len = Math.max(grid, Math.round(L / grid) * grid);
        out = {
          x: prev.x + Math.cos(sn * D2R) * len,
          y: prev.y + Math.sin(sn * D2R) * len,
        };
        return out;
      }
    }
  }
  if (grid)
    out = {
      x: Math.round(p.x / grid) * grid,
      y: Math.round(p.y / grid) * grid,
    };
  return out;
}
