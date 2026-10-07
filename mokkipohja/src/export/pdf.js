
/* ---------------- minimal single-image PDF writer ---------------- */

export function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function buildPdf(jpegBytes, imgW, imgH, pageWmm, pageHmm) {
  const enc = new TextEncoder();
  const parts = [];
  let len = 0;
  const put = (d) => {
    const b = typeof d === "string" ? enc.encode(d) : d;
    parts.push(b);
    len += b.length;
  };
  const off = [0];
  const startObj = (n) => {
    off[n] = len;
    put(`${n} 0 obj\n`);
  };
  const endObj = () => put("\nendobj\n");
  const pw = (pageWmm * 72) / 25.4,
    ph = (pageHmm * 72) / 25.4;
  const mg = (10 * 72) / 25.4;
  const fit = Math.min((pw - mg * 2) / imgW, (ph - mg * 2) / imgH);
  const dw = imgW * fit,
    dh = imgH * fit;
  const dx = (pw - dw) / 2,
    dy = (ph - dh) / 2;
  put("%PDF-1.4\n");
  startObj(1);
  put("<< /Type /Catalog /Pages 2 0 R >>");
  endObj();
  startObj(2);
  put("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  endObj();
  startObj(3);
  put(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw.toFixed(2)} ${ph.toFixed(2)}] ` +
      `/Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`,
  );
  endObj();
  const content = `q ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${dx.toFixed(2)} ${dy.toFixed(2)} cm /Im0 Do Q\n`;
  startObj(4);
  put(`<< /Length ${enc.encode(content).length} >>\nstream\n`);
  put(content);
  put("endstream");
  endObj();
  startObj(5);
  put(
    `<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
  );
  put(jpegBytes);
  put("\nendstream");
  endObj();
  const xref = len;
  let x = `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) x += `${String(off[i]).padStart(10, "0")} 00000 n \n`;
  put(x);
  put(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len);
  let p = 0;
  for (const b of parts) {
    out.set(b, p);
    p += b.length;
  }
  return out;
}
export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 4000);
}
