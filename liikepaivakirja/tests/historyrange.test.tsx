/* The long-range Historia view had no test at all, which is exactly why a
   temporal dead zone reference in `TrendChart` shipped and blanked the app for
   every range except "14 pv". Two levels of guard here:

     1. the chart on its own, cheap and precise about the invariant;
     2. the real path — mount the app, tap "30 pv" — because the bug lived in the
        branch that only that tap reaches.

   Own file with its own fake-indexeddb, per the rule in CLAUDE.md: storage
   persists across tests within a file, and this suite seeds a diary of its own. */
// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import App from "../src/ui/App";
import { TrendChart, WeeklyTrends } from "../src/ui/History";
import { ErrorBoundary } from "../src/ui/ErrorBoundary";
import { addDays, keyOf, seedExercises, seedSymptoms, startOfToday } from "../src/domain";
import { saveJSONNow } from "../src/storage/store";

/* "Kaikki" and "14 pv" also appear in the body-load filters and captions, so a
   text query is ambiguous. The range selector is the one row holding all four
   labels as siblings; find it structurally instead of adding a test hook. */
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

const week = (over = {}) => ({
  ws: startOfToday(),
  label: "1.1.",
  train: 0,
  load: 0,
  flareDays: 0,
  steps: 0,
  marks: [],
  ...over,
});

describe("TrendChart", () => {
  /* Invariant: every scale and point list is defined before it is read. A
     `const` arrow used above its own declaration throws ReferenceError from the
     temporal dead zone, and a throw in render unmounts the entire app. */
  it("renders without touching a scale before it is defined", () => {
    const weekly = [
      week({ label: "6.7.", train: 4, load: 3, steps: 6200 }),
      week({ label: "13.7.", train: 5, load: 0, steps: 9100 }),
      week({ label: "20.7.", train: 2, load: 6, steps: 4300 }),
    ];
    const { container } = render(<TrendChart weekly={weekly} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    /* symptom-load line plus the dashed steps line */
    expect(container.querySelectorAll("polyline").length).toBe(2);
    /* one marker per week */
    expect(container.querySelectorAll("circle").length).toBe(3);
  });

  /* Coordinates must be numbers even before any steps are imported — an
     attribute must not be invalid merely because a guard elsewhere hides the
     element that carries it. */
  it("emits finite coordinates when no steps have been imported", () => {
    const weekly = [week({ train: 3, load: 2 }), week({ label: "13.7.", train: 1, load: 0 })];
    const { container } = render(<TrendChart weekly={weekly} />);
    const pts = Array.from(container.querySelectorAll("polyline, circle"))
      .flatMap((el) => [el.getAttribute("points"), el.getAttribute("cx"), el.getAttribute("cy")])
      .filter(Boolean)
      .join(" ");
    expect(pts.length).toBeGreaterThan(0);
    expect(pts).not.toMatch(/NaN|Infinity/);
    /* no steps means no dashed line at all */
    expect(container.querySelectorAll("polyline").length).toBe(1);
  });

  it("says so instead of drawing an empty axis when a range holds nothing", () => {
    const { container } = render(<WeeklyTrends weekly={[]} rangeLabel="viimeiset 90 pv" />);
    expect(within(container).getByText(/Ei merkintöjä/)).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("Historia range switching", () => {
  beforeEach(async () => {
    /* A diary with something in it three weeks back, so the long ranges have
       data to aggregate and `hasData` actually reaches TrendChart. Seeding the
       config too, so the flared id refers to a symptom that exists. */
    const symptoms = seedSymptoms();
    const exercises = seedExercises();
    const sid = symptoms[0].id;
    const eid = exercises[0].id;
    await saveJSONNow("physio-config", { exercises, symptoms });
    const today = startOfToday();
    await saveJSONNow("physio-logs", {
      [keyOf(addDays(today, -20))]: { sets: { [eid]: 9 }, flared: [sid], severity: { [sid]: 3 }, steps: 8100 },
      [keyOf(addDays(today, -9))]: { sets: { [eid]: 9 }, flared: [], severity: {}, steps: 7400 },
      [keyOf(addDays(today, -2))]: { sets: { [eid]: 9 }, flared: [sid], severity: { [sid]: 2 }, steps: 5200 },
    });
    await saveJSONNow("physio-marks", []);
  });

  /* This is the test the regression needed: 14 pv renders a different branch
     entirely, so nothing that only exercises the default range can see it. */
  it("draws the weekly trend chart for 30 pv without losing the view", async () => {
    const { container } = render(<App />);
    const q = within(container);
    await waitFor(() => expect(q.getAllByText("Historia").length).toBeGreaterThan(0));
    fireEvent.click(q.getAllByText("Historia")[0]);
    await waitFor(() => rangeButton(container, "30 pv"));

    fireEvent.click(rangeButton(container, "30 pv"));

    await waitFor(() => expect(q.getByText("Viikkotrendit")).toBeTruthy());
    expect(container.querySelector("svg[aria-label^='Viikkotrendit']")).toBeTruthy();
    /* the shell is intact and the boundary never fired */
    expect(q.getByText("Kuukausikalenteri")).toBeTruthy();
    expect(container.querySelector("[data-error-boundary]")).toBeNull();
  });

  it("survives 90 pv and Kaikki as well", async () => {
    const { container } = render(<App />);
    const q = within(container);
    await waitFor(() => expect(q.getAllByText("Historia").length).toBeGreaterThan(0));
    fireEvent.click(q.getAllByText("Historia")[0]);
    await waitFor(() => rangeButton(container, "90 pv"));

    for (const label of ["90 pv", "Kaikki", "14 pv"]) {
      fireEvent.click(rangeButton(container, label));
      await waitFor(() => expect(container.querySelector("[data-error-boundary]")).toBeNull());
    }
    /* back on the default range the diary branch is showing again */
    await waitFor(() => expect(q.getByText("Päiväkirja")).toBeTruthy());
  });
});

describe("ErrorBoundary", () => {
  const Boom = () => {
    throw new Error("testivirhe TrendChart");
  };

  it("keeps the failure local and offers a way back", () => {
    /* React logs the caught error itself; silence it so a passing run is quiet. */
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    let live = true;
    const Child = () => (live ? <Boom /> : <div>Näkymä toimii</div>);
    const { container } = render(
      <div>
        <div>Kuori säilyy</div>
        <ErrorBoundary label="Historia">
          <Child />
        </ErrorBoundary>
      </div>
    );
    const q = within(container);

    /* the sibling outside the boundary is untouched — that is the whole point */
    expect(q.getByText("Kuori säilyy")).toBeTruthy();
    expect(q.getByText("Historia ei piirtynyt")).toBeTruthy();
    /* honest about where the data stands, and the message carries the error */
    expect(q.getByText(/Merkinnät ovat tallessa/)).toBeTruthy();
    expect(q.getByText(/testivirhe TrendChart/)).toBeTruthy();

    live = false;
    fireEvent.click(q.getByText(/Yritä uudelleen/));
    expect(q.getByText("Näkymä toimii")).toBeTruthy();
    expect(container.querySelector("[data-error-boundary]")).toBeNull();
    spy.mockRestore();
  });
});
