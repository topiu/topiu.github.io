/* Adding a programme from pasted text and from a link, mounted. Own store. */
// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, render, waitFor, fireEvent, within } from "@testing-library/react";
import App from "../src/ui/App";
import { loadJSON, saveJSONNow } from "../src/storage/store";
import { encodeProgram } from "../src/domain";

const mine = [{ id: "m1", name: "Lantionnosto", type: "strength", unit: "sets", freq: 7, desc: "", dose: { sets: 5, reps: 5, hold: null, min: null }, muscles: {} }];
beforeEach(async () => {
  await saveJSONNow("physio-config", { exercises: mine, symptoms: [] });
  await saveJSONNow("physio-logs", {});
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});
const body = () => within(document.body);

describe("programme from text", () => {
  it("previews, skips what exists and the heading, and adds the rest", async () => {
    const q = within(render(<App />).container);
    fireEvent.click(await waitFor(() => q.getAllByText("Muokkaa")[0]));
    fireEvent.click(await waitFor(() => q.getByText("Tekstinä")));
    fireEvent.change(body().getByLabelText("Ohjelman teksti"), {
      target: { value: "Kotiohjelma\n1. Lantionnosto 3x15\n2. Lankku 3 x 30 s\n3. Kävely 30 min, päivittäin" },
    });
    fireEvent.click(body().getByText("Tulkitse"));
    await waitFor(() => expect(body().getByText("on jo ohjelmassa")).toBeTruthy());
    fireEvent.click(body().getByText("Lisää 2 liikettä"));
    await waitFor(async () => {
      const cfg: any = await loadJSON("physio-config", null);
      const names = cfg.exercises.map((e: any) => e.name);
      expect(names).toEqual(["Lantionnosto", "Lankku", "Kävely"]);
      expect(cfg.exercises[0].dose.sets).toBe(5); /* the existing one untouched */
      expect(cfg.exercises[2].unit).toBe("min");
    });
  });
});

describe("programme link", () => {
  it("opens its preview on load, adds on confirm and clears the link", async () => {
    const shared = [{ name: "Kahvakuulaheilautus", dose: { sets: 3, reps: 15 }, freq: 3, equip: "kb", unit: "sets", muscles: { glute_max: 1 } }];
    window.history.replaceState(null, "", `/liikepaivakirja/#ohjelma=${encodeProgram(shared)}`);
    render(<App />);
    await waitFor(() => expect(body().getByText("Ohjelma linkistä")).toBeTruthy());
    expect(window.location.hash).toBe("");
    fireEvent.click(body().getByText("Lisää 1 liike"));
    await waitFor(async () => {
      const cfg: any = await loadJSON("physio-config", null);
      const kb = cfg.exercises.find((e: any) => e.name === "Kahvakuulaheilautus");
      expect(kb).toMatchObject({ freq: 3, equip: "kb", dose: { sets: 3, reps: 15 } });
    });
  });
});
