/* Ready-made programmes: every template is buildable, replace and merge keep
   their promises, and library additions arrive with a target. */
import { describe, it, expect } from "vitest";
import {
  LIBRARY,
  LIB_BY_ID,
  TEMPLATES,
  applyTemplate,
  defaultTargetFor,
  doseLabel,
  exerciseFromLibrary,
  inferEquipment,
  normalizeExercises,
  templateExercises,
} from "../src/domain";

describe("templates", () => {
  it("only reference exercises that exist in the library", () => {
    TEMPLATES.forEach((t) => t.items.forEach((it) => expect(LIB_BY_ID[it.lib], `${t.id}: ${it.lib}`).toBeTruthy()));
  });

  it("give every exercise a target, so nothing reads 'ei tavoitetta'", () => {
    TEMPLATES.forEach((t) =>
      templateExercises(t).forEach((e: any) => expect(doseLabel(e.dose, e.unit), `${t.id}: ${e.name}`).not.toBe(""))
    );
  });

  it("include the requested programmes", () => {
    const ids = TEMPLATES.map((t) => t.id);
    ["hip", "bb", "db", "bw", "kb", "run", "empty"].forEach((id) => expect(ids).toContain(id));
  });

  it("carry the equipment, so treenitila opens on dumbbells for a dumbbell deadlift", () => {
    const db = TEMPLATES.find((t) => t.id === "db")!;
    const rdl: any = templateExercises(db).find((e: any) => e.name === "Romanialainen maastaveto");
    expect(inferEquipment(rdl)).toBe("db"); /* the name alone would say barbell */
    /* and the field survives a reload */
    expect(normalizeExercises([rdl])![0].equip).toBe("db");
  });

  it("replace: the template becomes the programme", () => {
    const bb = TEMPLATES.find((t) => t.id === "bb")!;
    const r = applyTemplate({ exercises: [{ id: "x", name: "Vanha" }], symptoms: [{ id: "s", name: "Vanha oire" }] }, bb, "replace", "2026-10-06");
    expect(r.exercises.map((e: any) => e.name)).not.toContain("Vanha");
    expect(r.exercises.length).toBe(bb.items.length);
    expect(r.exercises.every((e: any) => e.added === "2026-10-06")).toBe(true);
  });

  it("merge: never changes an active exercise of the same name", () => {
    const kb = TEMPLATES.find((t) => t.id === "kb")!;
    const mine = { id: "keep", name: "kahvakuulaheilautus", dose: { sets: 5, reps: 20 }, archived: false };
    const r = applyTemplate({ exercises: [mine], symptoms: [] }, kb, "merge");
    /* the prescription untouched; only the template's group label is added */
    expect(r.exercises[0]).toMatchObject({ id: "keep", archived: false, dose: { sets: 5, reps: 20 }, groups: ["Kahvakuula"] });
    expect(r.skipped).toBe(1);
    expect(r.added).toBe(kb.items.length - 1);
  });

  it("merge: revives an archived exercise of the same name, keeping its id and history", () => {
    /* a phase change archives the old programme; an exercise that continues
       into the new one must not become a second, history-less copy */
    const kb = TEMPLATES.find((t) => t.id === "kb")!;
    const old = { id: "old-swing", name: "Kahvakuulaheilautus", dose: { sets: 2, reps: 10 }, archived: true, muscles: { glute_max: 1 } };
    const r: any = applyTemplate({ exercises: [old], symptoms: [] }, kb, "merge");
    const swing = r.exercises.filter((e: any) => e.name === "Kahvakuulaheilautus");
    expect(swing.length).toBe(1);
    expect(swing[0]).toMatchObject({ id: "old-swing", archived: false, dose: { sets: 3, reps: 15 } });
    expect(r.revived.map((x: any) => x.id)).toEqual(["old-swing"]);
  });

  it("the empty template empties the programme", () => {
    const empty = TEMPLATES.find((t) => t.id === "empty")!;
    expect(applyTemplate({ exercises: [{ id: "a", name: "A" }], symptoms: [] }, empty, "replace").exercises).toEqual([]);
  });
});

describe("library additions get a starting target", () => {
  it("3 × 10 for strength, 3 × 30 s for holds, the library's own where it has one", () => {
    expect(doseLabel(defaultTargetFor(LIB_BY_ID.back_squat))).toBe("3 × 10");
    expect(doseLabel(defaultTargetFor(LIB_BY_ID.copenhagen_plank))).toBe("3 × 30 s pito");
    expect(defaultTargetFor(LIB_BY_ID.run_jog).min).toBe(30);
    LIBRARY.forEach((l: any) => {
      const e: any = exerciseFromLibrary(l);
      expect(doseLabel(e.dose, e.unit), l.id).not.toBe("");
    });
  });
});
