import { ceilingCrossings } from "../domain/ceilings";
import { bbox, defOutline, itemPoly, polyArea, wallPoly } from "../domain/geometry";
import { nameOf } from "../i18n";

/* ---------------- sheet rendering & export ---------------- */

export const PAPERS = {
  A4: [210, 297],
  A3: [297, 420],
  A2: [420, 594],
  Letter: [216, 279],
};
export function loadImgEl(src) {
  return new Promise((res) => {
    if (!src) return res(null);
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = src;
  });
}

/* Draws the plan onto a 2D context. k = px per mm, (ox,oy) = px offset. */
export function drawPlan(ctx, doc, defs, lang, o) {
  const { k, ox, oy } = o;
  const X = (mm) => mm * k + ox;
  const Y = (mm) => mm * k + oy;
  ctx.save();
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, o.w, o.h);
  if (o.imgEl && doc.image) {
    ctx.globalAlpha = doc.image.opacity;
    ctx.drawImage(
      o.imgEl,
      X(doc.image.x),
      Y(doc.image.y),
      doc.image.natW * doc.image.mmPerPx * k,
      doc.image.natH * doc.image.mmPerPx * k,
    );
    ctx.globalAlpha = 1;
  }
  if (o.grid) {
    for (const t of [
      {
        s: 100,
        c: "#E4E4D8",
        w: 0.6,
      },
      {
        s: 1000,
        c: "#C9CBB6",
        w: 1,
      },
    ]) {
      if (t.s * k < 4) continue;
      ctx.strokeStyle = t.c;
      ctx.lineWidth = t.w;
      const x0 = Math.floor(-ox / k / t.s) * t.s,
        x1 = (o.w - ox) / k;
      const y0 = Math.floor(-oy / k / t.s) * t.s,
        y1 = (o.h - oy) / k;
      ctx.beginPath();
      for (let x = x0; x <= x1; x += t.s) {
        ctx.moveTo(X(x), 0);
        ctx.lineTo(X(x), o.h);
      }
      for (let y = y0; y <= y1; y += t.s) {
        ctx.moveTo(0, Y(y));
        ctx.lineTo(o.w, Y(y));
      }
      ctx.stroke();
    }
  }
  const path = (pts) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
    ctx.closePath();
  };
  for (const r of doc.rooms) {
    path(r.points);
    ctx.fillStyle = "#FAF9F1";
    ctx.fill();
    ctx.strokeStyle = "#BBBDA8";
    ctx.lineWidth = 1;
    ctx.setLineDash([7, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    const b = bbox(r.points);
    ctx.fillStyle = "#7A8172";
    ctx.font = `600 ${Math.max(9, 11 * o.tk)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`${r.name}  ${(polyArea(r.points) / 1e6).toFixed(1)} m²`, X(b.cx), Y(b.cy));
    if (o.contours && r.ceiling && r.ceiling.mode !== "flat") {
      ctx.save();
      path(r.points);
      ctx.clip();
      const ax = r.ceiling.axis,
        rb = bbox(r.points);
      for (const T of [1200, 1500, 1800, 2100]) {
        for (const v of ceilingCrossings(r, T)) {
          ctx.strokeStyle = "#9A7B3E";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          if (ax === "x") {
            ctx.moveTo(X(v), Y(rb.y0));
            ctx.lineTo(X(v), Y(rb.y1));
          } else {
            ctx.moveTo(X(rb.x0), Y(v));
            ctx.lineTo(X(rb.x1), Y(v));
          }
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "#9A7B3E";
          ctx.font = `${Math.max(8, 9 * o.tk)}px sans-serif`;
          if (ax === "x") ctx.fillText(String(T), X(v), Y(rb.y0) + 12 * o.tk);
          else ctx.fillText(String(T), X(rb.x0) + 20 * o.tk, Y(v) - 3);
        }
      }
      ctx.restore();
    }
  }
  ctx.fillStyle = "#1C2628";
  for (const w of doc.walls) {
    path(wallPoly(w));
    ctx.fill();
  }
  const jm = new Map();
  for (const w of doc.walls)
    for (const [x, y] of [
      [w.x1, w.y1],
      [w.x2, w.y2],
    ]) {
      const key = `${Math.round(x)}_${Math.round(y)}`;
      const e = jm.get(key) || {
        x,
        y,
        n: 0,
        t: 0,
      };
      e.n++;
      e.t = Math.max(e.t, w.t);
      jm.set(key, e);
    }
  for (const j of jm.values()) {
    if (j.n < 2) continue;
    ctx.beginPath();
    ctx.arc(X(j.x), Y(j.y), (j.t / 2) * k, 0, 7);
    ctx.fill();
  }
  for (const op of doc.openings) {
    const w = doc.walls.find((x) => x.id === op.wallId);
    if (!w) continue;
    const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
    const ux = (w.x2 - w.x1) / L,
      uy = (w.y2 - w.y1) / L,
      nx = -uy,
      ny = ux;
    const P = (d, n) => ({
      x: w.x1 + ux * d + nx * n,
      y: w.y1 + uy * d + ny * n,
    });
    const o1 = op.off,
      o2 = op.off + op.w;
    path([P(o1, -w.t / 2 - 1), P(o2, -w.t / 2 - 1), P(o2, w.t / 2 + 1), P(o1, w.t / 2 + 1)]);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.strokeStyle = "#1C2628";
    ctx.lineWidth = 1.4;
    if (op.kind === "window") {
      for (const n of [-w.t / 6, w.t / 6]) {
        const a = P(o1, n),
          b = P(o2, n);
        ctx.beginPath();
        ctx.moveTo(X(a.x), Y(a.y));
        ctx.lineTo(X(b.x), Y(b.y));
        ctx.stroke();
      }
    } else {
      const hinge = op.flip ? o2 : o1,
        dir = op.flip ? -1 : 1,
        sw = op.side;
      const H = P(hinge, 0),
        Lf = P(hinge, sw * op.w);
      ctx.beginPath();
      ctx.moveTo(X(H.x), Y(H.y));
      ctx.lineTo(X(Lf.x), Y(Lf.y));
      ctx.stroke();
      const a1 = Math.atan2(ny * sw, nx * sw);
      let da = Math.atan2(uy * dir, ux * dir) - a1;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      ctx.strokeStyle = "#7E8A82";
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) {
        const a = a1 + (da * i) / 12;
        const px = X(H.x + Math.cos(a) * op.w),
          py = Y(H.y + Math.sin(a) * op.w);
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  for (const it of doc.items) {
    const def = defs[it.defId];
    if (!def) continue;
    const poly = itemPoly(it, def);
    path(poly);
    ctx.fillStyle = "rgba(195,146,79,0.30)";
    ctx.fill();
    ctx.strokeStyle = "#8A5F2B";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    const b = bbox(poly),
      lb = bbox(defOutline(def));
    if (Math.min(lb.w, lb.h) * k > 26 * o.tk) {
      ctx.fillStyle = "#6B5227";
      ctx.textAlign = "center";
      ctx.font = `600 ${Math.max(8, 10 * o.tk)}px sans-serif`;
      ctx.fillText(nameOf(def, lang), X(b.cx), Y(b.cy) - 2);
      ctx.font = `${Math.max(7, 8.5 * o.tk)}px monospace`;
      ctx.fillText(`${Math.round(lb.w)}×${Math.round(lb.h)}`, X(b.cx), Y(b.cy) + 11 * o.tk);
    }
  }
  ctx.restore();
}
export function drawTitleBlock(ctx, doc, lang, o) {
  const pad = 14 * o.tk,
    bw = 250 * o.tk,
    bh = 74 * o.tk;
  const x = o.w - bw - pad,
    y = o.h - bh - pad;
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.strokeStyle = "#1C2628";
  ctx.lineWidth = 1.2;
  ctx.fillRect(x, y, bw, bh);
  ctx.strokeRect(x, y, bw, bh);
  ctx.fillStyle = "#1C2628";
  ctx.textAlign = "left";
  ctx.font = `700 ${14 * o.tk}px sans-serif`;
  ctx.fillText(doc.name, x + 10 * o.tk, y + 21 * o.tk);
  ctx.font = `${10 * o.tk}px monospace`;
  ctx.fillStyle = "#55605F";
  const area = doc.rooms.reduce((a, r) => a + polyArea(r.points), 0) / 1e6;
  ctx.fillText(
    `${o.scaleLabel}   ${area ? area.toFixed(1) + " m²" : ""}`,
    x + 10 * o.tk,
    y + 39 * o.tk,
  );
  ctx.fillText(
    new Date().toLocaleDateString(lang === "fi" ? "fi-FI" : "en-GB"),
    x + 10 * o.tk,
    y + 55 * o.tk,
  );
  // scale bar
  const bpx = 1000 * o.k;
  if (bpx > 20 && bpx < bw - 20 * o.tk) {
    const bx = x + 10 * o.tk,
      by = y + bh - 10 * o.tk;
    ctx.strokeStyle = "#1C2628";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(bx, by - 5);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx + bpx, by);
    ctx.lineTo(bx + bpx, by - 5);
    ctx.stroke();
    ctx.font = `${9 * o.tk}px monospace`;
    ctx.fillText("1 m", bx + bpx + 6 * o.tk, by);
  }
  ctx.restore();
}
export async function renderSheet(doc, defs, lang, imgSrc, opts) {
  const [pw, ph0] = PAPERS[opts.paper] || PAPERS.A4;
  const pts = [];
  for (const w of doc.walls) pts.push(...wallPoly(w));
  for (const r of doc.rooms) pts.push(...r.points);
  for (const it of doc.items) {
    const d = defs[it.defId];
    if (d) pts.push(...itemPoly(it, d));
  }
  if (doc.image)
    pts.push(
      {
        x: doc.image.x,
        y: doc.image.y,
      },
      {
        x: doc.image.x + doc.image.natW * doc.image.mmPerPx,
        y: doc.image.y + doc.image.natH * doc.image.mmPerPx,
      },
    );
  const b = pts.length
    ? bbox(pts)
    : {
        cx: 0,
        cy: 0,
        w: 5000,
        h: 7000,
      };
  const landscape = b.w > b.h;
  const [pmmW, pmmH] = landscape
    ? [Math.max(pw, ph0), Math.min(pw, ph0)]
    : [Math.min(pw, ph0), Math.max(pw, ph0)];
  let dpi = 200;
  const longest = Math.max(pmmW, pmmH);
  dpi = Math.min(dpi, (4000 * 25.4) / longest);
  const pxPerMmPaper = dpi / 25.4;
  const W = Math.round(pmmW * pxPerMmPaper),
    H = Math.round(pmmH * pxPerMmPaper);
  const margin = 12 * pxPerMmPaper;
  let k, scaleLabel;
  if (opts.scaleDenom) {
    k = pxPerMmPaper / opts.scaleDenom;
    scaleLabel = `1:${opts.scaleDenom}`;
  } else {
    k = Math.min(
      (W - margin * 2) / Math.max(b.w, 1),
      (H - margin * 2 - 26 * pxPerMmPaper) / Math.max(b.h, 1),
    );
    scaleLabel = `≈1:${Math.round(pxPerMmPaper / k)}`;
  }
  const cropped = b.w * k > W - margin * 2 || b.h * k > H - margin * 2;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  const imgEl = await loadImgEl(doc.image ? imgSrc : null);
  const tk = Math.max(1, pxPerMmPaper / 3.8);
  const o = {
    k,
    ox: W / 2 - b.cx * k,
    oy: H / 2 - b.cy * k,
    w: W,
    h: H,
    grid: opts.grid,
    imgEl,
    tk,
    contours: opts.contours,
    scaleLabel,
    scaleDenom: opts.scaleDenom,
  };
  drawPlan(ctx, doc, defs, lang, o);
  ctx.strokeStyle = "#B9BDB2";
  ctx.lineWidth = 1;
  ctx.strokeRect(margin / 2, margin / 2, W - margin, H - margin);
  drawTitleBlock(ctx, doc, lang, o);
  const pk = Math.min(1, 760 / W);
  const pv = document.createElement("canvas");
  pv.width = Math.round(W * pk);
  pv.height = Math.round(H * pk);
  pv.getContext("2d").drawImage(cv, 0, 0, pv.width, pv.height);
  return {
    canvas: cv,
    previewUrl: pv.toDataURL("image/jpeg", 0.86),
    cropped,
    scaleLabel,
    pmmW,
    pmmH,
  };
}
