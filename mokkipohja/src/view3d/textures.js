import * as THREE from "three";

/* Surfaces drawn by code, so the app needs no image files. Each canvas is
   one square metre and repeats, and geometry UVs are in metres, so a plank
   is a plank's width whatever the room's size. A seeded random keeps every
   texture the same from run to run.

   Without a DOM (unit tests) every texture is null and materials fall back
   to their plain colour. */

const PX = 512; // pixels per metre

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map();
function make(name, draw, { w = PX, h = PX } = {}) {
  if (cache.has(name)) return cache.get(name);
  if (typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(name, tex);
  return tex;
}

const rgb = (r, g, b) => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;

/* fine grain: thin wavy streaks along x */
function grain(ctx, x0, y0, w, h, r, dark) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w, h);
  ctx.clip();
  for (let k = 0; k < h / 3; k++) {
    const y = y0 + r() * h;
    ctx.strokeStyle = `rgba(${dark},${0.05 + r() * 0.08})`;
    ctx.lineWidth = 0.6 + r() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    for (let x = x0; x <= x0 + w; x += 24)
      ctx.lineTo(x, y + Math.sin(x * 0.02 + k) * 1.5 + (r() - 0.5));
    ctx.stroke();
  }
  ctx.restore();
}

/* pine floorboards, 14 cm wide, staggered lengths */
export const floorTexture = () =>
  make("floor", (ctx, w, h) => {
    const r = rng(7);
    const bw = PX * 0.14;
    const rows = Math.ceil(h / bw);
    for (let row = 0; row < rows; row++) {
      const y = row * bw;
      let x = -r() * PX * 0.8;
      while (x < w) {
        const len = PX * (0.8 + r() * 1.2);
        const k = 0.88 + r() * 0.22;
        ctx.fillStyle = rgb(196 * k, 160 * k, 112 * k);
        ctx.fillRect(x, y, len, bw);
        grain(ctx, x, y, len, bw, r, "90,60,25");
        ctx.fillStyle = "rgba(60,40,20,0.55)";
        ctx.fillRect(x + len - 1.5, y, 1.5, bw); // butt joint
        x += len;
      }
      ctx.fillStyle = "rgba(60,40,20,0.6)";
      ctx.fillRect(0, y + bw - 2, w, 2); // seam
    }
  });

/* round logs, 20 cm each, with chinking between them */
export const logTexture = () =>
  make("logs", (ctx, w, h) => {
    const r = rng(11);
    const lh = PX * 0.2;
    for (let y = 0; y < h; y += lh) {
      const k = 0.9 + r() * 0.16;
      const g = ctx.createLinearGradient(0, y, 0, y + lh);
      g.addColorStop(0, rgb(110 * k, 74 * k, 40 * k));
      g.addColorStop(0.25, rgb(168 * k, 118 * k, 68 * k));
      g.addColorStop(0.55, rgb(182 * k, 130 * k, 76 * k));
      g.addColorStop(0.9, rgb(122 * k, 82 * k, 44 * k));
      g.addColorStop(1, rgb(70 * k, 46 * k, 24 * k));
      ctx.fillStyle = g;
      ctx.fillRect(0, y, w, lh);
      grain(ctx, 0, y + lh * 0.15, w, lh * 0.7, r, "70,40,15");
      ctx.fillStyle = "rgba(40,28,16,0.75)";
      ctx.fillRect(0, y + lh - 3, w, 3);
      // a few knots
      for (let n = 0; n < 2; n++) {
        const kx = r() * w,
          ky = y + lh * (0.3 + r() * 0.4);
        ctx.fillStyle = "rgba(80,50,20,0.45)";
        ctx.beginPath();
        ctx.ellipse(kx, ky, 6 + r() * 6, 3 + r() * 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });

/* light ceiling boards, 10 cm, along the texture's x */
export const ceilingTexture = () =>
  make("ceiling", (ctx, w, h) => {
    const r = rng(23);
    const bw = PX * 0.1;
    for (let y = 0; y < h; y += bw) {
      const k = 0.94 + r() * 0.1;
      ctx.fillStyle = rgb(226 * k, 200 * k, 156 * k);
      ctx.fillRect(0, y, w, bw);
      grain(ctx, 0, y, w, bw, r, "120,85,40");
      ctx.fillStyle = "rgba(90,65,35,0.45)";
      ctx.fillRect(0, y + bw - 1.5, w, 1.5);
    }
  });

/* dark standing-seam tin roof: seams every 50 cm run down the slope (v) */
export const roofTexture = () =>
  make("roof", (ctx, w, h) => {
    ctx.fillStyle = "#3b4144";
    ctx.fillRect(0, 0, w, h);
    const sw = PX * 0.5;
    for (let x = 0; x < w; x += sw) {
      const g = ctx.createLinearGradient(x, 0, x + sw, 0);
      g.addColorStop(0, "#353b3e");
      g.addColorStop(0.5, "#454c4f");
      g.addColorStop(1, "#33393c");
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, sw, h);
      ctx.fillStyle = "#5b6366";
      ctx.fillRect(x, 0, 3, h);
      ctx.fillStyle = "#24292b";
      ctx.fillRect(x + 3, 0, 2, h);
    }
  });

/* grass blades, one texture to four metres */
export const grassTexture = () =>
  make("grass", (ctx, w, h) => {
    const r = rng(5);
    ctx.fillStyle = "#728349";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 12000; i++) {
      const k = 0.7 + r() * 0.55;
      ctx.fillStyle = rgb(104 * k, 126 * k, 66 * k);
      ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 2 + r() * 4);
    }
  });

/* Broad patches of lusher and drier grass, laid over the blades at a much
   larger scale (one texture to about 45 m), so the 4 m blade texture does
   not show as a grid towards the horizon. Pale: it multiplies. Each patch
   is drawn again a tile away on every side, so it repeats without a seam. */
export const meadowTexture = () =>
  make(
    "meadow",
    (ctx, w, h) => {
      const r = rng(9);
      ctx.fillStyle = "#F2F2F2";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        const x = r() * w,
          y = r() * h,
          rad = w * (0.03 + r() * 0.1);
        const tone = r() < 0.45 ? "255,250,215" : "150,170,135";
        for (const ox of [-w, 0, w])
          for (const oy of [-h, 0, h]) {
            const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
            g.addColorStop(0, `rgba(${tone},0.45)`);
            g.addColorStop(1, `rgba(${tone},0)`);
            ctx.fillStyle = g;
            ctx.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
          }
      }
    },
    { w: 256, h: 256 },
  );

/* plain wood grain along x, pale so a material's colour sets the wood's
   tone: furniture, worktops, sauna benches */
export const grainTexture = () =>
  make("grain", (ctx, w, h) => {
    const r = rng(41);
    ctx.fillStyle = "rgb(238,229,214)";
    ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < 46; k++) {
      const y = r() * h,
        bw = 3 + r() * 12,
        n = 1 + Math.floor(r() * 3),
        ph = r() * 6.28,
        amp = 2 + r() * 6;
      ctx.strokeStyle = `rgba(150,105,60,${0.05 + r() * 0.09})`;
      ctx.lineWidth = bw;
      for (const oy of [-h, 0, h]) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 8) {
          const yy = y + oy + Math.sin((x / w) * 6.2832 * n + ph) * amp;
          if (x === 0) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
    }
    grain(ctx, 0, 0, w, h, r, "110,75,40");
  });

/* fieldstone for the fireplace */
export const stoneTexture = () =>
  make("stone", (ctx, w, h) => {
    const r = rng(31);
    ctx.fillStyle = "#6f6a63";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const k = 0.75 + r() * 0.5;
      ctx.fillStyle = rgb(150 * k, 145 * k, 136 * k);
      ctx.beginPath();
      ctx.ellipse(r() * w, r() * h, 20 + r() * 40, 14 + r() * 26, r() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  });

/* a soft dark rectangle fading out at its edges: a contact shadow under
   furniture and along walls, the cheap stand-in for ambient occlusion */
export const softShadowTexture = () =>
  make(
    "softshadow",
    (ctx, w, h) => {
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const dx = Math.max(0, Math.abs(x / w - 0.5) * 2 - 0.55) / 0.45;
          const dy = Math.max(0, Math.abs(y / h - 0.5) * 2 - 0.55) / 0.45;
          const a = Math.max(0, 1 - Math.hypot(dx, dy));
          const i = (y * w + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(a * a * 255);
          img.data[i + 3] = 255;
        }
      ctx.putImageData(img, 0, 0);
    },
    { w: 64, h: 64 },
  );

/* a gradient from dark (bottom, v = 0) to clear (top): contact shadow
   strips along the foot of a wall */
export const edgeShadowTexture = () =>
  make(
    "edgeshadow",
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, h, 0, 0);
      g.addColorStop(0, "#fff");
      g.addColorStop(1, "#000");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    { w: 4, h: 64 },
  );
