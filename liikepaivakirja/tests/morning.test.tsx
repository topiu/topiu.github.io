/* Next-morning pain on Tänään: shown only the morning after training, one tap
   saves it, the same tap clears it. Own file, own store. */
// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, waitFor, fireEvent, within } from "@testing-library/react";
import App from "../src/ui/App";
import { loadJSON, saveJSONNow } from "../src/storage/store";
import { addDays, keyOf, startOfToday } from "../src/domain";

const TODAY = keyOf(startOfToday());
const YDAY = keyOf(addDays(startOfToday(), -1));
const exercises = [{ id: "a", name: "Kyykky", type: "strength", unit: "sets", freq: 7, desc: "", dose: { sets: 3, reps: 10, hold: null, min: null }, muscles: {} }];

afterEach(() => cleanup());

describe("next-morning pain", () => {
  it("is not asked when yesterday had no training", async () => {
    await saveJSONNow("physio-config", { exercises, symptoms: [] });
    await saveJSONNow("physio-logs", {});
    const q = within(render(<App />).container);
    await waitFor(() => expect(q.getByText("Liikkeet")).toBeTruthy());
    expect(q.queryByText("Eilisen treenin jälkeen")).toBeNull();
  });

  it("is asked the morning after training and saved with one tap", async () => {
    await saveJSONNow("physio-config", { exercises, symptoms: [] });
    await saveJSONNow("physio-logs", { [YDAY]: { sets: { a: 3 }, goal: {}, mins: {}, flared: [], severity: {}, quality: {}, note: "", steps: 0 } });
    const q = within(render(<App />).container);
    fireEvent.click(await waitFor(() => q.getByLabelText("Aamun kipu 2")));
    await waitFor(async () => {
      const logs: any = await loadJSON("physio-logs", {});
      expect(logs[TODAY] && logs[TODAY].morning).toBe(2);
    });
    fireEvent.click(q.getByLabelText("Aamun kipu 2"));
    await waitFor(async () => {
      const logs: any = await loadJSON("physio-logs", {});
      expect(logs[TODAY]).toBeUndefined();
    });
  });
});
