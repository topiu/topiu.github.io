/* Group labels: a view only, derived from the exercises, merged by name. */
import { describe, it, expect } from "vitest";
import {
  TEMPLATES,
  applyTemplate,
  buildReport,
  decodeProgram,
  deleteGroup,
  encodeProgram,
  filterByGroup,
  groupsOf,
  mergeExercises,
  normalizeExercises,
  normalizeGroups,
  renameGroup,
  toggleGroup,
  validGroup,
} from "../src/domain";

const ex = (id: string, groups: string[] = [], extra: any = {}) => ({ id, name: id, groups, archived: false, dose: { sets: 3, reps: 10 }, ...extra });

describe("group labels", () => {
  it("normalise: trimmed, unique regardless of case, bounded", () => {
    expect(normalizeGroups([" Sali A ", "sali a", "", null, "Venyttely"])).toEqual(["Sali A", "Venyttely"]);
    expect(normalizeGroups("nope")).toEqual([]);
  });

  it("survive a reload and a programme link", () => {
    const [a]: any = normalizeExercises([{ name: "Kyykky", groups: ["Sali A", "Sali B"] }]);
    expect(a.groups).toEqual(["Sali A", "Sali B"]);
    expect((decodeProgram(encodeProgram([a])) as any)[0].groups).toEqual(["Sali A", "Sali B"]);
  });

  it("are derived from active exercises, in programme order", () => {
    const list = [ex("a", ["Sali B"]), ex("b", ["Sali A", "Sali B"]), ex("c", ["Vanha"], { archived: true })];
    expect(groupsOf(list)).toEqual(["Sali B", "Sali A"]);
    expect(filterByGroup(list, "sali a").map((e) => e.id)).toEqual(["b"]);
    expect(filterByGroup(list, null).length).toBe(3);
    expect(validGroup(list, "Vanha")).toBe(null); /* only archived exercises carry it */
  });

  it("rename merges into an existing group, delete removes the label only", () => {
    const list = [ex("a", ["A"]), ex("b", ["B"]), ex("c", ["A", "B"])];
    expect(renameGroup(list, "A", "B").map((e: any) => e.groups)).toEqual([["B"], ["B"], ["B"]]);
    expect(deleteGroup(list, "a").map((e: any) => e.groups)).toEqual([[], ["B"], ["B"]]);
    expect(toggleGroup(["A"], "a")).toEqual([]);
    expect(toggleGroup([], "A")).toEqual(["A"]);
  });

  it("never change what counts as done", () => {
    const logs = { "2026-10-05": { sets: { a: 3 }, goal: {}, mins: {}, flared: [], severity: {}, quality: {}, note: "", steps: 0 } };
    const plain = buildReport({ exercises: [ex("a")], logs, today: new Date(2026, 9, 5), days: 7 });
    const grouped = buildReport({ exercises: [ex("a", ["Sali A"])], logs, today: new Date(2026, 9, 5), days: 7 });
    expect(grouped.adherence).toEqual(plain.adherence);
  });
});

describe("templates bring their group", () => {
  const kb = TEMPLATES.find((t) => t.id === "kb")!;
  it("labels every exercise of the template", () => {
    const r = applyTemplate({ exercises: [], symptoms: [] }, kb, "replace");
    expect(r.exercises.every((e: any) => e.groups.includes("Kahvakuula"))).toBe(true);
  });
  it("merges into an existing group of the same name and labels exercises already there", () => {
    const mine = { id: "m", name: "Kahvakuulaheilautus", groups: ["kahvakuula", "Sali A"], archived: false, dose: { sets: 5, reps: 20 } };
    const r: any = applyTemplate({ exercises: [mine], symptoms: [] }, kb, "merge");
    expect(groupsOf(r.exercises)).toEqual(["kahvakuula", "Sali A"]); /* one group, the existing spelling */
    expect(r.exercises[0].dose).toEqual({ sets: 5, reps: 20 }); /* the prescription untouched */
  });
  it("adds the label to an existing exercise that had none", () => {
    const mine = { id: "m", name: "Kahvakuulaheilautus", groups: [], archived: false, dose: { sets: 5, reps: 20 } };
    const r: any = mergeExercises([mine], [{ ...mine, id: "x", groups: ["Kahvakuula"] }]);
    expect(r.exercises[0]).toMatchObject({ id: "m", groups: ["Kahvakuula"], dose: { sets: 5, reps: 20 } });
  });
});
