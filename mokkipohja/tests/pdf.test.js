import { describe, expect, it } from "vitest";
import { b64ToBytes, buildPdf } from "../src/export/pdf";

const text = (bytes) => new TextDecoder("latin1").decode(bytes);

describe("pdf", () => {
  it("decodes base64 to bytes", () => {
    expect([...b64ToBytes(btoa("PDF"))]).toEqual([80, 68, 70]);
  });

  it("writes a one-page A4 PDF around a JPEG", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const out = buildPdf(jpeg, 1654, 2339, 210, 297);
    const bytes = out instanceof Blob ? new Uint8Array(await out.arrayBuffer()) : out;
    const s = text(bytes);
    expect(s.startsWith("%PDF-1.4")).toBe(true);
    expect(s).toContain("/MediaBox [0 0 595.28 841.89]");
    expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
  });
});
