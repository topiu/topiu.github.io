/* Treenitila mounted for real: the button on Tänään opens it, a set is
   logged with reps, load and equipment, the 60 s rest starts, pain is
   recorded, and Tänään's count follows. Own file, own store. */
// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cleanup, render, waitFor, fireEvent, within } from "@testing-library/react";
import App from "../src/ui/App";
import { loadJSON, saveJSONNow } from "../src/storage/store";
import { keyOf, startOfToday } from "../src/domain";

const TODAY = keyOf(startOfToday());
/* the clock is frozen per test and moved by hand, never waited on */
let frozen = 0;
const exercises = [
  { id: "kb1", name: "Kahvakuulaheilautus", type: "strength", unit: "sets", freq: 7, desc: "", dose: { sets: 3, reps: 15, hold: null, min: null }, muscles: {} },
  { id: "h1", name: "Lankku", type: "stability", unit: "sets", freq: 7, desc: "", dose: { sets: 2, reps: null, hold: 30, min: null }, muscles: {} },
];

beforeEach(async () => {
  await saveJSONNow("physio-config", { exercises, symptoms: [] });
  await saveJSONNow("physio-logs", {});
  await saveJSONNow("physio-ui", { helpDismissed: true });
  frozen = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => frozen);
});
afterEach(() => {
  /* no auto-cleanup here (see CLAUDE.md): an earlier test's open view would
     otherwise be the first one found */
  cleanup();
  vi.restoreAllMocks();
});

const open = async () => {
  const { container } = render(<App />);
  const q = within(container);
  fireEvent.click(await waitFor(() => q.getByText("Treenitila")));
  const view = await waitFor(() => document.body.querySelector("[data-focus-view]") as HTMLElement);
  return { q, f: within(view), view };
};

describe("treenitila", () => {
  it("logs a kettlebell set with reps and load, starts the rest and updates Tänään", async () => {
    const { q, f } = await open();
    expect(f.getByText("Kahvakuulaheilautus")).toBeTruthy();
    /* guessed from the name; the kettlebell ladder starts at 8, two steps up is 12 */
    expect(f.getByRole("button", { name: "Kahvakuula" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(f.getByLabelText("Paino: enemmän"));
    fireEvent.click(f.getByLabelText("Paino: enemmän"));
    fireEvent.click(f.getByLabelText("Paino: enemmän"));
    fireEvent.click(f.getByText("Sarja 1/3 tehty"));

    await waitFor(() => expect(f.getByText(/Lepo 1:00/)).toBeTruthy());
    await waitFor(async () => {
      const logs: any = await loadJSON("physio-logs", {});
      expect(logs[TODAY].sets.kb1).toBe(1);
      expect(logs[TODAY].detail.kb1).toEqual([{ reps: 15, hold: null, kg: 12, lvl: null, eq: "kb" }]);
      expect(logs[TODAY].goal.kb1).toBeTruthy(); /* the day's dose is frozen as on Tänään */
    });
    /* the next set starts from the one just done */
    expect(f.getByText("Sarja 2/3 tehty")).toBeTruthy();
    expect(f.getAllByText(/15 × 12 kg/).length).toBeGreaterThan(0);

    fireEvent.click(f.getByLabelText("Sulje treenitila"));
    await waitFor(() => expect(document.body.querySelector("[data-focus-view]")).toBeNull());
    /* Tänään shows the set: the first ball of the swing is filled, the second is not */
    const balls = q.getAllByLabelText(/^Sarja \d$/);
    expect(balls[0].style.background).toBe("rgb(31, 122, 92)");
    expect(balls[1].style.background).toBe("transparent");
  });

  it("records pain during an exercise, and the same tap clears it", async () => {
    const { f } = await open();
    fireEvent.click(f.getByLabelText("Kipu 4"));
    await waitFor(async () => {
      const logs: any = await loadJSON("physio-logs", {});
      expect(logs[TODAY] && logs[TODAY].pain).toEqual({ kb1: 4 });
    });
    fireEvent.click(f.getByLabelText("Kipu 4"));
    await waitFor(async () => {
      const logs: any = await loadJSON("physio-logs", {});
      expect(logs[TODAY]).toBeUndefined(); /* nothing else was logged, so the day is empty again */
    });
  });

  it("offers a hold timer for hold exercises and removes a set on request", async () => {
    const { f } = await open();
    fireEvent.click(f.getByLabelText("Seuraava liike"));
    await waitFor(() => expect(f.getByText("Lankku")).toBeTruthy());
    expect(f.getByText(/Aloita pito 30 s/)).toBeTruthy();
    fireEvent.click(f.getByLabelText("Kirjaa sarja ilman ajastinta"));
    await waitFor(() => expect(f.getByLabelText("Poista sarja 1")).toBeTruthy());
    fireEvent.click(f.getByLabelText("Poista sarja 1"));
    await waitFor(async () => {
      const logs: any = await loadJSON("physio-logs", {});
      expect(logs[TODAY]).toBeUndefined();
    });
  });

  it("keeps the rest length as a device preference", async () => {
    const { f } = await open();
    fireEvent.click(f.getByText("Sarja 1/3 tehty"));
    await waitFor(() => expect(f.getByText(/Lepo 1:00/)).toBeTruthy());
    fireEvent.click(f.getByLabelText("Lepo 15 s pidemmäksi"));
    await waitFor(() => expect(f.getByText(/Lepo 1:15/)).toBeTruthy());
    await waitFor(async () => {
      const ui: any = await loadJSON("physio-ui", null);
      expect(ui).toEqual({ helpDismissed: true, restSec: 75 });
    });
  });

  it("logs a hold set by itself when the hold countdown ends, then rests", async () => {
    const { f } = await open();
    fireEvent.click(f.getByLabelText("Seuraava liike"));
    fireEvent.click(await waitFor(() => f.getByText(/Aloita pito 30 s/)));
    await waitFor(() => expect(f.getByText(/Pito 0:30/)).toBeTruthy());
    frozen += 31_000; /* the hold is over */
    await waitFor(async () => {
      const logs: any = await loadJSON("physio-logs", {});
      expect(logs[TODAY] && logs[TODAY].detail.h1).toEqual([{ reps: null, hold: 30, kg: null, lvl: null, eq: "bw" }]);
    });
    await waitFor(() => expect(f.getByText(/Lepo 1:00/)).toBeTruthy());
  });
});
