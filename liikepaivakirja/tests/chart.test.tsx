/* Historia's per-exercise chart: appears once something is recorded, draws
   finite coordinates (one point or many), and a tap shows the values. */
// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, waitFor, fireEvent, within } from "@testing-library/react";
import App from "../src/ui/App";
import { ExerciseChartSection } from "../src/ui/ExerciseChart";
import { saveJSONNow } from "../src/storage/store";
import { addDays, keyOf, startOfToday } from "../src/domain";

afterEach(() => cleanup());
const ex = [{ id: "a", name: "Kulmasoutu", type: "strength", unit: "sets", freq: 7, desc: "", dose: { sets: 3, reps: 10, hold: null, min: null }, muscles: {} }];
const day = (n: number, kg: number, pain?: number) => ({
  [keyOf(addDays(startOfToday(), -n))]: { sets: { a: 1 }, goal: {}, mins: {}, flared: [], severity: {}, quality: {}, note: "", steps: 0, detail: { a: [{ reps: 10, kg, eq: "bb" }] }, ...(pain != null ? { pain: { a: pain } } : {}) },
});

describe("exercise chart", () => {
  it("draws finite coordinates for one point and for many", () => {
    for (const logs of [day(1, 40), { ...day(9, 30, 2), ...day(5, 35), ...day(1, 40, 4) }]) {
      const { container } = render(<ExerciseChartSection logs={logs} exercises={ex} />);
      const attrs = Array.from(container.querySelectorAll("polyline, circle, text"))
        .flatMap((el) => ["points", "cx", "cy", "x", "y"].map((a) => el.getAttribute(a)))
        .filter(Boolean)
        .join(" ");
      expect(attrs).not.toMatch(/NaN|Infinity/);
      cleanup();
    }
  });

  it("shows in Historia once treenitila has recorded sets, and a tap shows the values", async () => {
    await saveJSONNow("physio-config", { exercises: ex, symptoms: [] });
    await saveJSONNow("physio-logs", { ...day(9, 30, 2), ...day(5, 35), ...day(1, 40, 4) });
    const { container } = render(<App />);
    const q = within(container);
    fireEvent.click(await waitFor(() => q.getAllByText("Historia")[0]));
    await waitFor(() => expect(q.getByText("Liikkeen kehitys")).toBeTruthy());
    expect(q.getByText("Raskain sarja, kg")).toBeTruthy();
    expect(q.getByText("Kipu liikkeen aikana, 0–10")).toBeTruthy();
    expect(q.getByText(/Viimeisin kuorma 40 kg/)).toBeTruthy();
    const svg = container.querySelector("svg[aria-label^='Raskain sarja']")!;
    fireEvent.click(svg.querySelectorAll("g[style]")[2]);
    await waitFor(() => expect(q.getByRole("status").textContent).toMatch(/10 × 40 kg/));
  });
});
