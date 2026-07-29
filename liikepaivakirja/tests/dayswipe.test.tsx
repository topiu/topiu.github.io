/* Own file for a clean store: these tests read the date heading, and a diary
   with entries from other suites makes that harder to assert on. */
// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { render, waitFor, fireEvent, within } from "@testing-library/react";
import App from "../src/ui/App";
import { SWIPE_EDGE_PX } from "../src/domain";

const MID = 500; /* jsdom's window.innerWidth is 1024, so this is the middle */

const swipe = (el: Element, from: number, to: number, y = 300, yTo = 300) => {
  fireEvent.touchStart(el, { touches: [{ clientX: from, clientY: y }] });
  fireEvent.touchMove(el, { touches: [{ clientX: (from + to) / 2, clientY: (y + yTo) / 2 }] });
  fireEvent.touchMove(el, { touches: [{ clientX: to, clientY: yTo }] });
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: to, clientY: yTo }] });
};

const mount = async () => {
  const { container } = render(<App />);
  const q = within(container);
  await waitFor(() => expect(q.getByText("tänään")).toBeTruthy());
  return q;
};

describe("day swipe", () => {
  it("goes back a day on a rightward swipe and forward again on a leftward one", async () => {
    const q = await mount();
    swipe(q.getByText("Liikkeet"), MID, MID + 140);
    await waitFor(() => expect(q.getByText("eilen")).toBeTruthy());

    swipe(q.getByText("Liikkeet"), MID, MID - 140);
    await waitFor(() => expect(q.getByText("tänään")).toBeTruthy());
  });

  it("will not swipe past today, matching the disabled arrow", async () => {
    const q = await mount();
    swipe(q.getByText("Liikkeet"), MID, MID - 140);
    /* still today, and nothing thrown */
    await waitFor(() => expect(q.getByText("tänään")).toBeTruthy());
  });

  it("leaves vertical drags to the scroller", async () => {
    const q = await mount();
    /* 140 across but 200 down: the axis locks vertical on the first move */
    swipe(q.getByText("Liikkeet"), MID, MID + 140, 200, 400);
    await waitFor(() => expect(q.getByText("tänään")).toBeTruthy());
  });

  it("declines a gesture starting where the browser's back swipe lives", async () => {
    const q = await mount();
    swipe(q.getByText("Liikkeet"), SWIPE_EDGE_PX - 5, SWIPE_EDGE_PX + 160);
    await waitFor(() => expect(q.getByText("tänään")).toBeTruthy());
  });

  it("ignores a movement too small to be deliberate", async () => {
    const q = await mount();
    swipe(q.getByText("Liikkeet"), MID, MID + 30);
    await waitFor(() => expect(q.getByText("tänään")).toBeTruthy());
  });

  it("leaves horizontal drags inside the note field to the caret", async () => {
    const q = await mount();
    const note = q.getByPlaceholderText(/Miltä tuntui/i);
    swipe(note, MID, MID + 160);
    await waitFor(() => expect(q.getByText("tänään")).toBeTruthy());
  });

  it("ignores multi-touch, so pinch-zoom cannot turn the page", async () => {
    const q = await mount();
    const el = q.getByText("Liikkeet");
    fireEvent.touchStart(el, { touches: [{ clientX: MID, clientY: 300 }, { clientX: MID + 60, clientY: 300 }] });
    fireEvent.touchEnd(el, { changedTouches: [{ clientX: MID + 160, clientY: 300 }] });
    await waitFor(() => expect(q.getByText("tänään")).toBeTruthy());
  });
});
