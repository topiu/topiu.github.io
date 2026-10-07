import { C3, hex2rgb } from "./common";

/* ---- camera & raster ---- */

export function makeCam(eye, yaw, pitch, fov) {
  const cp = Math.cos(pitch);
  const f = {
    x: cp * Math.cos(yaw),
    y: cp * Math.sin(yaw),
    z: Math.sin(pitch),
  };
  const rl = Math.hypot(f.y, -f.x) || 1;
  const r = {
    x: f.y / rl,
    y: -f.x / rl,
    z: 0,
  };
  const u = {
    x: r.y * f.z - r.z * f.y,
    y: r.z * f.x - r.x * f.z,
    z: r.x * f.y - r.y * f.x,
  };
  return {
    eye,
    f,
    r,
    u,
    fov: fov || 1.0,
  };
}
export function clipNear(v, near) {
  const out = [];
  for (let i = 0; i < v.length; i++) {
    const a = v[i],
      b = v[(i + 1) % v.length];
    const ai = a.z >= near,
      bi = b.z >= near;
    if (ai) out.push(a);
    if (ai !== bi) {
      const tt = (near - a.z) / (b.z - a.z);
      out.push({
        x: a.x + (b.x - a.x) * tt,
        y: a.y + (b.y - a.y) * tt,
        z: near,
      });
    }
  }
  return out;
}
/* ---- WebGL: a real depth buffer, so ordering is exact ----
   Painter's sorting can't order a long wall against furniture beside it —
   the wall's centroid sits mid-room while its near end is at your face.
   Per-pixel depth removes the whole class of problem. The canvas-2D
   painter's path below stays as a fallback if WebGL is unavailable. */

export function mat4Mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
    }
  return o;
}
export function mat4Persp(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2),
    nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}
export function mat4View(cam) {
  const { r, u, f, eye } = cam;
  const m = new Float32Array(16);
  m[0] = r.x;
  m[4] = r.y;
  m[8] = r.z;
  m[12] = -(r.x * eye.x + r.y * eye.y + r.z * eye.z);
  m[1] = u.x;
  m[5] = u.y;
  m[9] = u.z;
  m[13] = -(u.x * eye.x + u.y * eye.y + u.z * eye.z);
  m[2] = -f.x;
  m[6] = -f.y;
  m[10] = -f.z;
  m[14] = f.x * eye.x + f.y * eye.y + f.z * eye.z;
  m[15] = 1;
  return m;
}
/* fan every convex face into triangles, plus an outline pass for definition */
export function glBuffers(faces) {
  let tn = 0,
    ln = 0;
  for (const f of faces) {
    tn += (f.pts.length - 2) * 3;
    ln += f.pts.length * 2;
  }
  const pos = new Float32Array(tn * 3),
    col = new Float32Array(tn * 3);
  const lpos = new Float32Array(ln * 3);
  let i = 0,
    j = 0;
  for (const f of faces) {
    const p = f.pts,
      c = f.rgb;
    for (let k = 1; k < p.length - 1; k++) {
      for (const v of [p[0], p[k], p[k + 1]]) {
        pos[i] = v.x;
        pos[i + 1] = v.y;
        pos[i + 2] = v.z;
        col[i] = c[0];
        col[i + 1] = c[1];
        col[i + 2] = c[2];
        i += 3;
      }
    }
    for (let k = 0; k < p.length; k++) {
      const a = p[k],
        b = p[(k + 1) % p.length];
      lpos[j] = a.x;
      lpos[j + 1] = a.y;
      lpos[j + 2] = a.z;
      lpos[j + 3] = b.x;
      lpos[j + 4] = b.y;
      lpos[j + 5] = b.z;
      j += 6;
    }
  }
  return {
    pos,
    col,
    lpos,
    triVerts: tn,
    lineVerts: ln,
  };
}
export function makeGL(canvas) {
  let gl = null;
  try {
    const attrs = {
      antialias: true,
      alpha: false,
      depth: true,
    };
    gl = canvas.getContext("webgl", attrs) || canvas.getContext("experimental-webgl", attrs);
  } catch (e) {
    return null;
  }
  if (!gl) return null;
  // strict checks: a partial or stubbed WebGL should fall back, not draw nothing
  if (typeof gl.createShader !== "function" || typeof gl.drawArrays !== "function") return null;
  const sh = (type, src) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) === true ? s : null;
  };
  const vs = sh(
    gl.VERTEX_SHADER,
    "attribute vec3 aPos;attribute vec3 aCol;uniform mat4 uMVP;varying vec3 vCol;" +
      "void main(){vCol=aCol;gl_Position=uMVP*vec4(aPos,1.0);}",
  );
  const fs = sh(
    gl.FRAGMENT_SHADER,
    "precision mediump float;varying vec3 vCol;void main(){gl_FragColor=vec4(vCol,1.0);}",
  );
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (gl.getProgramParameter(prog, gl.LINK_STATUS) !== true) return null;
  gl.useProgram(prog);
  const aPos = gl.getAttribLocation(prog, "aPos");
  const aCol = gl.getAttribLocation(prog, "aCol");
  const uMVP = gl.getUniformLocation(prog, "uMVP");
  if (!(aPos >= 0) || !(aCol >= 0) || !uMVP) return null;
  const bPos = gl.createBuffer(),
    bCol = gl.createBuffer();
  const bLine = gl.createBuffer(),
    bLineCol = gl.createBuffer();
  const bSky = gl.createBuffer(),
    bSkyCol = gl.createBuffer();
  gl.enableVertexAttribArray(aPos);
  gl.enableVertexAttribArray(aCol);

  // full-screen gradient, drawn in clip space with depth off
  const s1 = hex2rgb(C3.sky1).map((v) => v / 255),
    s2 = hex2rgb(C3.sky2).map((v) => v / 255);
  gl.bindBuffer(gl.ARRAY_BUFFER, bSky);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, 1, 0, 1, 1, 0, -1, -1, 0, -1, -1, 0, 1, 1, 0, 1, -1, 0]),
    gl.STATIC_DRAW,
  );
  gl.bindBuffer(gl.ARRAY_BUFFER, bSkyCol);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([...s1, ...s1, ...s2, ...s2, ...s1, ...s2]),
    gl.STATIC_DRAW,
  );
  const IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  let triVerts = 0,
    lineVerts = 0;
  const bind = (buf, loc) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
  };
  return {
    gl,
    upload(faces) {
      const b = glBuffers(faces);
      triVerts = b.triVerts;
      lineVerts = b.lineVerts;
      gl.bindBuffer(gl.ARRAY_BUFFER, bPos);
      gl.bufferData(gl.ARRAY_BUFFER, b.pos, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, bCol);
      gl.bufferData(gl.ARRAY_BUFFER, b.col, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, bLine);
      gl.bufferData(gl.ARRAY_BUFFER, b.lpos, gl.DYNAMIC_DRAW);
      const lc = new Float32Array(b.lineVerts * 3);
      for (let k = 0; k < lc.length; k += 3) {
        lc[k] = 0.13;
        lc[k + 1] = 0.17;
        lc[k + 2] = 0.16;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, bLineCol);
      gl.bufferData(gl.ARRAY_BUFFER, lc, gl.DYNAMIC_DRAW);
    },
    draw(cam, w, h, far) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(s2[0], s2[1], s2[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.uniformMatrix4fv(uMVP, false, IDENT);
      bind(bSky, aPos);
      bind(bSkyCol, aCol);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (!triVerts) return;
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      const mvp = mat4Mul(mat4Persp(cam.fov, w / h, 80, far || 80000), mat4View(cam));
      gl.uniformMatrix4fv(uMVP, false, mvp);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1.2, 1.2);
      bind(bPos, aPos);
      bind(bCol, aCol);
      gl.drawArrays(gl.TRIANGLES, 0, triVerts);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      bind(bLine, aPos);
      bind(bLineCol, aCol);
      gl.drawArrays(gl.LINES, 0, lineVerts);
    },
  };
}
export function renderScene(ctx, faces, cam, W_, H_) {
  const g = ctx.createLinearGradient(0, 0, 0, H_);
  g.addColorStop(0, C3.sky1);
  g.addColorStop(1, C3.sky2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W_, H_);
  const fl = H_ / 2 / Math.tan(cam.fov / 2);
  const draw = [];
  for (const face of faces) {
    const v = [];
    for (const p of face.pts) {
      const dx = p.x - cam.eye.x,
        dy = p.y - cam.eye.y,
        dz = p.z - cam.eye.z;
      v.push({
        x: dx * cam.r.x + dy * cam.r.y + dz * cam.r.z,
        y: dx * cam.u.x + dy * cam.u.y + dz * cam.u.z,
        z: dx * cam.f.x + dy * cam.f.y + dz * cam.f.z,
      });
    }
    const c = clipNear(v, 40);
    if (c.length < 3) continue;
    let zs = 0;
    const s = new Array(c.length);
    for (let i = 0; i < c.length; i++) {
      zs += c[i].z;
      s[i] = {
        x: W_ / 2 + (c[i].x / c[i].z) * fl,
        y: H_ / 2 - (c[i].y / c[i].z) * fl,
      };
    }
    draw.push({
      s,
      d: zs / c.length,
      css: face.css,
      layer: face.layer,
    });
  }
  draw.sort((a, b) => a.layer - b.layer || b.d - a.d);
  ctx.lineJoin = "round";
  ctx.lineWidth = 1;
  for (const p of draw) {
    ctx.beginPath();
    ctx.moveTo(p.s[0].x, p.s[0].y);
    for (let i = 1; i < p.s.length; i++) ctx.lineTo(p.s[i].x, p.s[i].y);
    ctx.closePath();
    ctx.fillStyle = p.css;
    ctx.fill();
    ctx.strokeStyle = "rgba(20,28,26,0.20)";
    ctx.stroke();
  }
  return draw.length;
}
