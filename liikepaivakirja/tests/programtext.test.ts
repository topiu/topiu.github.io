/* Programme from text and programme links. */
import { describe, it, expect } from "vitest";
import { decodeProgram, doseLabel, encodeProgram, matchLibrary, mergeExercises, parseProgramText, programFromHash, rowsToExercises, TEMPLATES, templateExercises } from "../src/domain";

const SHEET = `Kotiohjelma, viikot 1–4

1. Lantionnosto 3x15
2. Kylkimakuulla loitonnus 3 x 12, 3 krt/vko
   Pidä lantio suorassa ja liike hallittuna koko ajan.
3. Lankku 3 x 30 s
4) Lähentäjien puristus 3 x 10 x 5 s
- Takareiden venytys selinmakuulla 3 × 30 sek päivittäin
• Kävely 30 min
Kyykky 3 sarjaa 10 toistoa 2 kertaa viikossa`;

describe("programme from text", () => {
  const rows = parseProgramText(SHEET);
  const by = (n: string) => rows.find((r) => r.name.startsWith(n))!;

  it("reads the common target shapes", () => {
    expect(doseLabel(by("Lantionnosto").dose)).toBe("3 × 15");
    expect(doseLabel(by("Lankku").dose)).toBe("3 × 30 s pito");
    expect(doseLabel(by("Lähentäjien puristus").dose)).toBe("3 × 10 × 5 s");
    expect(by("Kävely").unit).toBe("min");
    expect(by("Kävely").dose.min).toBe(30);
    expect(doseLabel(by("Kyykky").dose)).toBe("3 × 10");
  });

  it("reads frequencies and keeps them out of the target", () => {
    expect(by("Kylkimakuulla loitonnus").freq).toBe(3);
    expect(doseLabel(by("Kylkimakuulla loitonnus").dose)).toBe("3 × 12");
    expect(by("Takareiden venytys").freq).toBe(7);
    expect(by("Kyykky").freq).toBe(2);
  });

  it("attaches prose to the exercise above instead of making it an exercise", () => {
    expect(by("Kylkimakuulla loitonnus").desc).toMatch(/Pidä lantio suorassa/);
    expect(rows.some((r) => r.name.startsWith("Pidä"))).toBe(false);
  });

  it("matches names to the library for muscles, and keeps the typed name", () => {
    expect(by("Lantionnosto").lib).toBe("glute_bridge");
    expect(by("Takareiden venytys").lib).toBe("st_hamstring");
    const ex: any = rowsToExercises([by("Lantionnosto")])[0];
    expect(ex.name).toBe("Lantionnosto");
    expect(Object.keys(ex.muscles)).toContain("glute_max");
    expect(matchLibrary("Ihan keksitty liike")).toBe(null);
  });

  it("treats an indented or sentence-like line as instructions, even when short", () => {
    const r = parseProgramText("1. Lantionnosto 3x15\n   Pidä lantio suorassa koko liikkeen ajan.\n2. Lankku 3 x 30 s\nHengitä rauhallisesti koko ajan.");
    expect(r.map((x) => x.name)).toEqual(["Lantionnosto", "Lankku"]);
    expect(r[0].desc).toMatch(/Pidä lantio/);
    expect(r[1].desc).toMatch(/Hengitä/);
  });

  it("keeps the header line as a candidate the preview can untick", () => {
    expect(rows[0].name).toMatch(/^Kotiohjelma/);
    expect(rows[0].dose).toBe(null);
  });

  it("merges by name without touching existing exercises", () => {
    const mine = [{ id: "m", name: "lantionnosto", dose: { sets: 5 } }];
    const r = mergeExercises(mine, rowsToExercises(rows));
    expect(r.exercises[0]).toBe(mine[0]);
    expect(r.skipped).toBe(1);
  });
});

describe("programme link", () => {
  it("round-trips a programme, with Finnish characters, and nothing else", () => {
    const tpl = TEMPLATES.find((t) => t.id === "hip")!;
    const exs = templateExercises(tpl);
    const payload = encodeProgram([...exs, { ...exs[0], name: "Arkistoitu", archived: true }]);
    expect(payload.startsWith("1.")).toBe(true);
    const back: any = decodeProgram(payload);
    expect(back.map((e: any) => e.name)).toEqual(exs.map((e: any) => e.name));
    expect(back[0].dose).toEqual(exs[0].dose);
    expect(back[0].muscles).toEqual(exs[0].muscles);
    expect(back.find((e: any) => e.name === "Lonkan sisäkierron venytys").freq).toBe(7);
    expect(JSON.stringify(back)).not.toContain("Arkistoitu");
  });

  it("finds the payload in a hash and refuses junk", () => {
    expect(programFromHash("#ohjelma=1.abc")).toBe("1.abc");
    expect(programFromHash("#jotain")).toBe(null);
    expect(decodeProgram("1.!!!")).toBe(null);
    expect(decodeProgram("bad")).toBe(null);
  });
});

import { archiveActive, latestPhase, phaseDays, phaseMarkText } from "../src/domain";

describe("phases", () => {
  it("finds the latest phase and its length for the report", () => {
    const marks = [
      { date: "2026-09-01", text: phaseMarkText("Vaihe 1") },
      { date: "2026-10-01", text: phaseMarkText("Vaihe 2") },
      { date: "2026-10-03", text: "Fyssarikäynti" },
    ];
    expect(latestPhase(marks)).toEqual({ date: "2026-10-01", name: "Vaihe 2" });
    expect(phaseDays(marks, "2026-10-06")).toBe(6);
    expect(phaseDays([], "2026-10-06")).toBe(null);
  });
  it("archives the active exercises and leaves archived ones as they are", () => {
    const a = { id: "a", archived: false };
    const b = { id: "b", archived: true };
    const out: any = archiveActive([a, b]);
    expect(out.every((e: any) => e.archived)).toBe(true);
    expect(out[1]).toBe(b);
  });
});

import { normalizeExercises } from "../src/domain";

describe("video links", () => {
  it("keep only http(s) links and travel with a shared programme", () => {
    const [ok, bad]: any = normalizeExercises([
      { name: "A", video: " https://example.org/v/1 " },
      { name: "B", video: "javascript:alert(1)" },
    ]);
    expect(ok.video).toBe("https://example.org/v/1");
    expect(bad.video).toBe("");
    const back: any = decodeProgram(encodeProgram([ok]));
    expect(back[0].video).toBe("https://example.org/v/1");
  });
});
