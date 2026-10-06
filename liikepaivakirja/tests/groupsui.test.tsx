/* Groups, mounted: Tänään's filter narrows the list and the one-tap button,
   treenitila stays inside the group and remembers it, Muokkaa labels and
   renames. Own store. */
// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, render, waitFor, fireEvent, within } from "@testing-library/react";
import App from "../src/ui/App";
import { loadJSON, saveJSONNow } from "../src/storage/store";
import { keyOf, startOfToday } from "../src/domain";

const TODAY = keyOf(startOfToday());
const mk = (id: string, name: string, groups: string[]) => ({ id, name, groups, type: "strength", unit: "sets", freq: 7, desc: "", dose: { sets: 1, reps: 10, hold: null, min: null }, muscles: {} });
beforeEach(async () => {
  await saveJSONNow("physio-config", { exercises: [mk("a", "Kyykky", ["Sali A"]), mk("b", "Penkki", ["Sali B"]), mk("c", "Lämmittely", ["Sali A", "Sali B"])], symptoms: [] });
  await saveJSONNow("physio-logs", {});
  await saveJSONNow("physio-ui", { helpDismissed: true });
});
afterEach(() => cleanup());
const body = () => within(document.body);

describe("groups", () => {
  it("filter Tänään, and the one-tap button fills only the group shown", async () => {
    const q = within(render(<App />).container);
    const groupRow = await waitFor(() => q.getByRole("group", { name: "Ryhmä" }));
    fireEvent.click(within(groupRow).getByText("Sali A"));
    await waitFor(() => expect(q.queryByText("Penkki")).toBeNull());
    expect(q.getByText("Kyykky")).toBeTruthy();
    expect(q.getByText("Lämmittely")).toBeTruthy();
    fireEvent.click(q.getByText("Merkitse ohjelma tehdyksi"));
    await waitFor(async () => {
      const logs: any = await loadJSON("physio-logs", {});
      expect(Object.keys(logs[TODAY].sets).sort()).toEqual(["a", "c"]);
    });
  });

  it("keep treenitila inside the group and remember it on this device", async () => {
    const q = within(render(<App />).container);
    fireEvent.click(within(await waitFor(() => q.getByRole("group", { name: "Ryhmä" }))).getByText("Sali B"));
    fireEvent.click(q.getByText("Treenitila"));
    const view = within(await waitFor(() => document.body.querySelector("[data-focus-view]") as HTMLElement));
    expect(view.getByText("1/2")).toBeTruthy(); /* Penkki and Lämmittely only */
    expect(view.getAllByLabelText(/^Liike \d+:/).length).toBe(2);
    await waitFor(async () => {
      const ui: any = await loadJSON("physio-ui", null);
      expect(ui.focusGroup).toBe("Sali B");
    });
    fireEvent.click(within(view.getByRole("group", { name: "Ryhmä" })).getByText("Kaikki"));
    await waitFor(() => expect(view.getAllByLabelText(/^Liike \d+:/).length).toBe(3));
  });

  it("label an exercise and rename a group in Muokkaa", async () => {
    const q = within(render(<App />).container);
    fireEvent.click(await waitFor(() => q.getAllByText("Muokkaa")[0]));
    fireEvent.click(await waitFor(() => q.getByLabelText("Muokkaa: Penkki")));
    const input = q.getByLabelText("Uusi ryhmä");
    fireEvent.change(input, { target: { value: "Työntävät" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(async () => {
      const cfg: any = await loadJSON("physio-config", null);
      expect(cfg.exercises.find((e: any) => e.id === "b").groups).toEqual(["Sali B", "Työntävät"]);
    });
    fireEvent.click(q.getByLabelText("Muokkaa ryhmää Sali A"));
    fireEvent.change(q.getByLabelText("Ryhmän nimi"), { target: { value: "Jalat" } });
    fireEvent.click(q.getByText("Tallenna"));
    await waitFor(async () => {
      const cfg: any = await loadJSON("physio-config", null);
      expect(cfg.exercises.find((e: any) => e.id === "c").groups).toEqual(["Jalat", "Sali B"]);
    });
  });
});
