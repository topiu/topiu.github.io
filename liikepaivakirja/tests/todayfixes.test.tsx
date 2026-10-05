/* Tänään regressions from the October 2026 review: typed text that was lost,
   an undo that erased later entries, a stuck swipe pane and a one-tap list
   reset. Own file, so the store is clean. */
// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor, fireEvent, within } from "@testing-library/react";
import App from "../src/ui/App";
import { flushAll, loadJSON, saveJSONNow } from "../src/storage/store";
import { keyOf, resetToDefaults, startOfToday, usedIdsInLogs } from "../src/domain";

const TODAY = keyOf(startOfToday());

beforeEach(async () => {
  await saveJSONNow("physio-logs", {});
  await saveJSONNow("physio-config", null);
  const frozen = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => frozen);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const mount = async () => {
  const { container } = render(<App />);
  const q = within(container);
  await waitFor(() => expect(q.getByLabelText("Päivän askeleet")).toBeTruthy());
  return { container, q };
};

describe("typed text survives leaving the day", () => {
  it("keeps steps typed just before moving to the previous day", async () => {
    const { q } = await mount();
    fireEvent.change(q.getByLabelText("Päivän askeleet"), { target: { value: "8432" } });
    /* inside the debounce window: the field unmounts with the day */
    fireEvent.click(q.getByLabelText("Edellinen päivä"));
    flushAll();
    await waitFor(async () => {
      const logs: any = await loadJSON("physio-logs", {});
      expect(logs[TODAY] && logs[TODAY].steps).toBe(8432);
    });
  });
});

describe("undo of the one-tap programme", () => {
  it("reverts the fill without erasing a symptom logged after it", async () => {
    const { q } = await mount();
    fireEvent.click(await waitFor(() => q.getByText("Merkitse ohjelma tehdyksi")));
    await waitFor(() => expect(q.getByText("Kumoa")).toBeTruthy());
    fireEvent.click(q.getByLabelText("Nivunen: kohtalainen"));
    fireEvent.click(q.getByText("Kumoa"));
    await waitFor(async () => {
      const logs: any = await loadJSON("physio-logs", {});
      const l = logs[TODAY];
      expect(l).toBeTruthy();
      expect(l.flared.length).toBe(1);
      expect(Object.keys(l.sets)).toEqual([]);
    });
  });
});

describe("swipe pane", () => {
  it("snaps back when a second finger lands mid-drag", async () => {
    const { container, q } = await mount();
    const pane = container.querySelector("[data-day-pane]") as HTMLElement;
    const grip = within(pane).getByText("Liikkeet");
    fireEvent.touchStart(grip, { touches: [{ clientX: 500, clientY: 300 }] });
    fireEvent.touchMove(grip, { touches: [{ clientX: 540, clientY: 300 }] });
    expect(pane.style.transform).toContain("translate3d");
    fireEvent.touchMove(grip, { touches: [{ clientX: 545, clientY: 300 }, { clientX: 200, clientY: 300 }] });
    expect(pane.style.transform).toBe("none");
    expect(q.getAllByText("tänään").length).toBeGreaterThan(0);
  });
});

describe("Palauta oletukset", () => {
  it("asks first, and keeps the ids that history is keyed by", async () => {
    const { q } = await mount();
    const before: any = await waitFor(async () => {
      const c: any = await loadJSON("physio-config", null);
      expect(c && c.exercises.length).toBeGreaterThan(0);
      return c;
    });
    fireEvent.click(q.getAllByText("Muokkaa")[0]);
    fireEvent.click(await waitFor(() => q.getAllByText("Palauta oletukset")[0]));
    expect(q.getByText(/Korvataanko lista oletuksilla/)).toBeTruthy();
    fireEvent.click(q.getByText("Korvaa"));
    await waitFor(async () => {
      const after: any = await loadJSON("physio-config", null);
      expect(after.exercises.map((e: any) => e.id)).toEqual(before.exercises.map((e: any) => e.id));
    });
  });

  it("archives a custom item that has history instead of dropping it", () => {
    const current = [
      { id: "a", name: "Lonkan loitonnus" },
      { id: "c", name: "Oma liike" },
      { id: "d", name: "Kokeilu" },
    ];
    const seeds = [{ id: "new1", name: "Lonkan loitonnus" }, { id: "new2", name: "Dead bug -jalka" }];
    const used = usedIdsInLogs({ "2026-07-01": { sets: { c: 2 } } }, "ex");
    const next = resetToDefaults(current, seeds, used, "2026-07-28");
    expect(next.map((i: any) => i.id)).toEqual(["a", "new2", "c"]);
    expect(next.find((i: any) => i.id === "c").archived).toBe(true);
    expect(next.find((i: any) => i.id === "new2").added).toBe("2026-07-28");
  });
});
