/* A programme phase, mounted: the old exercises step aside with their history,
   a continuing one comes back with its id, the day is marked, and the report
   offers "Tämä vaihe". Own store. */
// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, waitFor, fireEvent, within } from "@testing-library/react";
import App from "../src/ui/App";
import { loadJSON, saveJSONNow } from "../src/storage/store";

afterEach(() => cleanup());
const body = () => within(document.body);

describe("new phase", () => {
  it("archives, revives what continues, marks the day and narrows the report", async () => {
    const exercises = [
      { id: "swing", name: "Kahvakuulaheilautus", type: "strength", unit: "sets", freq: 3, desc: "", dose: { sets: 2, reps: 10, hold: null, min: null }, muscles: {} },
      { id: "old", name: "Vanha liike", type: "strength", unit: "sets", freq: 7, desc: "", dose: { sets: 3, reps: 10, hold: null, min: null }, muscles: {} },
    ];
    await saveJSONNow("physio-config", { exercises, symptoms: [] });
    await saveJSONNow("physio-logs", {});
    await saveJSONNow("physio-marks", []);
    const { container } = render(<App />);
    const q = within(container);
    fireEvent.click(await waitFor(() => q.getAllByText("Muokkaa")[0]));
    fireEvent.click(await waitFor(() => q.getByText("Aloita uusi vaihe")));
    expect((body().getByLabelText("Vaiheen nimi") as HTMLInputElement).value).toBe("Vaihe 1");
    fireEvent.change(body().getByLabelText("Vaiheen nimi"), { target: { value: "Kahvakuulajakso" } });
    fireEvent.click(within(body().getByRole("dialog", { name: "Uusi vaihe" })).getByText("Pohjasta"));
    fireEvent.click(await waitFor(() => body().getByText("Kahvakuula perus")));
    fireEvent.click(body().getByText(/^Lisää \d+ liikettä$/));

    await waitFor(async () => {
      const cfg: any = await loadJSON("physio-config", null);
      const byName = (n: string) => cfg.exercises.find((e: any) => e.name === n);
      expect(byName("Vanha liike").archived).toBe(true);
      expect(byName("Kahvakuulaheilautus")).toMatchObject({ id: "swing", archived: false, dose: { sets: 3, reps: 15 } });
      expect(cfg.exercises.filter((e: any) => e.name === "Kahvakuulaheilautus").length).toBe(1);
      const marks: any = await loadJSON("physio-marks", []);
      expect(marks.map((m: any) => m.text)).toContain("Uusi vaihe: Kahvakuulajakso");
      expect(marks.some((m: any) => /Tavoite: Kahvakuulaheilautus: 2 × 10 → 3 × 15/.test(m.text))).toBe(true);
    });

    fireEvent.click(q.getAllByText("Historia")[0]);
    fireEvent.click(await waitFor(() => q.getByText(/Raportti fysioterapeutille/)));
    await waitFor(() => expect(body().getByText("Tämä vaihe")).toBeTruthy());
  });
});
