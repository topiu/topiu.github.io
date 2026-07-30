/* Own file for a clean store: these tests read the date heading, and a diary
   with entries from other suites makes that harder to assert on. */
// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor, fireEvent, within } from "@testing-library/react";
import App from "../src/ui/App";
import { SWIPE_BLOCKED_DRAG_PX, SWIPE_EDGE_PX, SWIPE_MIN_PX } from "../src/domain";

const MID = 500; /* jsdom's window.innerWidth is 1024, so this is the middle */

/* A swipe is rejected if it took longer than SWIPE_MAX_MS. These gestures are
   synchronous, so in practice they take a millisecond — but "in practice" is how
   a suite acquires a flake that only ever fails on a loaded CI runner, and a
   failed test here fails the deploy. Freezing the clock removes the whole class:
   elapsed is always zero, which is what the test actually means. */
beforeEach(() => {
  const frozen = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => frozen);
});
afterEach(() => {
  vi.restoreAllMocks();
});

/* The drag is written straight to the DOM, so these read the element rather than
   any React state — which is the whole point of the design. */
const pane = (c: HTMLElement) => c.querySelector("[data-day-pane]") as HTMLElement;
const pill = (c: HTMLElement) => c.querySelector("[data-day-peek]") as HTMLElement;

/* The preview pill holds the same words as the date header ("eilen", "tänään"),
   so anything asserting on the shown day scopes itself to the pane. */
const day = (c: HTMLElement) => within(pane(c));

const press = (el: Element, x: number, y = 300) =>
  fireEvent.touchStart(el, { touches: [{ clientX: x, clientY: y }] });
const drag = (el: Element, x: number, y = 300) =>
  fireEvent.touchMove(el, { touches: [{ clientX: x, clientY: y }] });
const release = (el: Element, x: number, y = 300) =>
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: x, clientY: y }] });

const swipe = (el: Element, from: number, to: number, y = 300, yTo = 300) => {
  press(el, from, y);
  drag(el, (from + to) / 2, (y + yTo) / 2);
  drag(el, to, yTo);
  release(el, to, yTo);
};

const mount = async () => {
  const { container } = render(<App />);
  await waitFor(() => expect(day(container).getByText("tänään")).toBeTruthy());
  return container;
};

const grip = (c: HTMLElement) => day(c).getByText("Liikkeet");

describe("day swipe", () => {
  it("goes back a day on a rightward swipe and forward again on a leftward one", async () => {
    const c = await mount();
    swipe(grip(c), MID, MID + 140);
    await waitFor(() => expect(day(c).getByText("eilen")).toBeTruthy());

    swipe(grip(c), MID, MID - 140);
    await waitFor(() => expect(day(c).getByText("tänään")).toBeTruthy());
  });

  it("will not swipe past today, matching the disabled arrow", async () => {
    const c = await mount();
    swipe(grip(c), MID, MID - 140);
    await waitFor(() => expect(day(c).getByText("tänään")).toBeTruthy());
  });

  it("declines a gesture starting where the browser's back swipe lives", async () => {
    const c = await mount();
    swipe(grip(c), SWIPE_EDGE_PX - 5, SWIPE_EDGE_PX + 160);
    await waitFor(() => expect(day(c).getByText("tänään")).toBeTruthy());
  });

  it("ignores a movement too small to be deliberate", async () => {
    const c = await mount();
    swipe(grip(c), MID, MID + 30);
    await waitFor(() => expect(day(c).getByText("tänään")).toBeTruthy());
  });

  it("leaves horizontal drags inside the note field to the caret", async () => {
    const c = await mount();
    const note = day(c).getByPlaceholderText(/Miltä tuntui/i);
    swipe(note, MID, MID + 160);
    await waitFor(() => expect(day(c).getByText("tänään")).toBeTruthy());
  });

  it("ignores multi-touch, so pinch-zoom cannot turn the page", async () => {
    const c = await mount();
    const el = grip(c);
    fireEvent.touchStart(el, {
      touches: [
        { clientX: MID, clientY: 300 },
        { clientX: MID + 60, clientY: 300 },
      ],
    });
    fireEvent.touchEnd(el, { changedTouches: [{ clientX: MID + 160, clientY: 300 }] });
    await waitFor(() => expect(day(c).getByText("tänään")).toBeTruthy());
  });
});

describe("drag feedback", () => {
  it("moves the pane with the finger before anything is committed", async () => {
    const c = await mount();
    const target = grip(c);

    expect(pane(c).style.transform).toBe("");
    press(target, MID);
    drag(target, MID + 40);
    /* one-to-one below the commit threshold */
    expect(pane(c).style.transform).toBe("translate3d(40px,0,0)");
    expect(day(c).getByText("tänään")).toBeTruthy(); /* nothing decided yet */

    /* released short, so it settles back with a transition rather than jumping */
    release(target, MID + 40);
    expect(pane(c).style.transform).toBe("none");
    expect(pane(c).style.transition).toContain("transform");
    await waitFor(() => expect(day(c).getByText("tänään")).toBeTruthy());
  });

  it("names the day a release would land on, only once it would commit", async () => {
    const c = await mount();
    const target = grip(c);

    press(target, MID);
    drag(target, MID + SWIPE_MIN_PX - 10);
    expect(pill(c).style.opacity).toBe("0"); /* not yet */

    drag(target, MID + SWIPE_MIN_PX + 20);
    expect(pill(c).style.opacity).toBe("1");
    expect(pill(c).textContent).toBe("eilen");

    /* sliding back below the threshold withdraws the promise */
    drag(target, MID + 10);
    expect(pill(c).style.opacity).toBe("0");
    release(target, MID + 10);
  });

  it("puts a stiff short leash on a forward drag past today", async () => {
    const c = await mount();
    const target = grip(c);

    press(target, MID);
    drag(target, MID - 200);
    const x = Number((pane(c).style.transform.match(/(-?\d+(?:\.\d+)?)px/) || [])[1]);
    /* it moves, so the boundary is felt during the gesture, but barely */
    expect(x).toBeLessThan(0);
    expect(Math.abs(x)).toBeLessThanOrEqual(SWIPE_BLOCKED_DRAG_PX);
    expect(pill(c).style.opacity).toBe("0"); /* no promise is made */
    release(target, MID - 200);
    await waitFor(() => expect(day(c).getByText("tänään")).toBeTruthy());
  });

  it("gives the pane back if the gesture is cancelled", async () => {
    const c = await mount();
    const target = grip(c);

    press(target, MID, 200);
    drag(target, MID + 40, 210);
    expect(pane(c).style.transform).toBe("translate3d(40px,0,0)");
    fireEvent.touchCancel(target);
    expect(pane(c).style.transform).toBe("none");
  });
});

describe("freezing the page while swiping sideways", () => {
  /* fireEvent returns false when a listener called preventDefault, which is the
     only thing that actually stops the browser scrolling mid-gesture. A passive
     listener cannot, and that was the bug this block exists to pin down: the pane
     slid sideways while the page scrolled underneath, and the vertical velocity it
     had accumulated kept coasting after release. */
  it("cancels the browser's scroll once the axis has locked horizontal", async () => {
    const c = await mount();
    const target = grip(c);
    press(target, MID);
    expect(fireEvent.touchMove(target, { touches: [{ clientX: MID + 40, clientY: 302 }] })).toBe(false);
    expect(fireEvent.touchMove(target, { touches: [{ clientX: MID + 90, clientY: 306 }] })).toBe(false);
    release(target, MID + 90);
  });

  it("never cancels a vertical gesture, so scrolling is untouched", async () => {
    const c = await mount();
    const target = grip(c);
    press(target, MID, 200);
    expect(fireEvent.touchMove(target, { touches: [{ clientX: MID + 5, clientY: 320 }] })).toBe(true);
    expect(pane(c).style.transform).toBe("");
    release(target, MID + 5, 320);
    await waitFor(() => expect(day(c).getByText("tänään")).toBeTruthy());
  });

  it("gives a near-diagonal drag to the scroller rather than claiming it", async () => {
    const c = await mount();
    const target = grip(c);
    /* 60 across, 55 down: past the distance threshold, but horizontal does not
       dominate, so it must not be treated as a page turn */
    press(target, MID, 200);
    expect(fireEvent.touchMove(target, { touches: [{ clientX: MID + 60, clientY: 255 }] })).toBe(true);
    expect(pane(c).style.transform).toBe("");
    release(target, MID + 60, 255);
    await waitFor(() => expect(day(c).getByText("tänään")).toBeTruthy());
  });
});
