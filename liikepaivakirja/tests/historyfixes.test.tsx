/* Historia regressions from the October 2026 review. Own file and store. */
// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { render, waitFor, fireEvent, within } from "@testing-library/react";
import App from "../src/ui/App";
import { addDays, keyOf, seedExercises, seedSymptoms, startOfToday } from "../src/domain";
import { saveJSONNow } from "../src/storage/store";

const RANGES = ["14 pv", "30 pv", "90 pv", "Kaikki"];
function rangeButton(container: HTMLElement, label: string) {
  const hit = Array.from(container.querySelectorAll("button")).find((b) => {
    if (b.textContent !== label) return false;
    const sibs = Array.from(b.parentElement ? b.parentElement.children : []).map((c) => c.textContent);
    return RANGES.every((l) => sibs.includes(l));
  });
  if (!hit) throw new Error(`range button "${label}" not found`);
  return hit;
}

describe("Kaikki over a long history", () => {
  beforeEach(async () => {
    const exercises = seedExercises();
    const symptoms = seedSymptoms();
    const today = startOfToday();
    await saveJSONNow("physio-config", { exercises, symptoms });
    await saveJSONNow("physio-logs", {
      [keyOf(addDays(today, -3 * 365))]: { sets: { [exercises[0].id]: 1 } },
      [keyOf(today)]: { sets: { [exercises[0].id]: 1 } },
    });
    await saveJSONNow("physio-marks", [
      { id: "old", date: keyOf(addDays(today, -3 * 365)), text: "Vanha merkkipaalu", auto: false },
      { id: "new", date: keyOf(today), text: "Tuore merkkipaalu", auto: false },
    ]);
  });

  it("shows the latest two years, not the earliest", async () => {
    /* the loop started at the oldest week and stopped after 106, so with three
       years of data the current weeks were the ones dropped */
    const { container } = render(<App />);
    const q = within(container);
    await waitFor(() => expect(q.getAllByText("Historia").length).toBeGreaterThan(0));
    fireEvent.click(q.getAllByText("Historia")[0]);
    await waitFor(() => rangeButton(container, "Kaikki"));
    fireEvent.click(rangeButton(container, "Kaikki"));
    await waitFor(() => expect(q.getByText("Viikkotrendit")).toBeTruthy());
    expect(q.queryAllByText(/Tuore merkkipaalu/).length).toBeGreaterThan(0);
    expect(q.queryAllByText(/Vanha merkkipaalu/).length).toBe(0);
  });
});
