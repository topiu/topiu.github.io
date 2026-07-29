/* Own file for a clean store: these tests read the date heading, and a diary
   with entries from other suites makes that harder to assert on. */
// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { render, waitFor, fireEvent, within } from "@testing-library/react";
import App from "../src/ui/App";
import { SWIPE_BLOCKED_DRAG_PX, SWIPE_EDGE_PX, SWIPE_MIN_PX } from "../src/domain";

const MID = 500; /* jsdom's window.innerWidth is 1024, so this is the middle */

const swipe = (el: Element, from: number, to: number, y = 300, yTo = 300) => {
  fireEvent.touchStart(el, { touches: [{ clientX: from, clientY: y }] });
  fireEvent.touchMove(el, { touches: [{ clientX: (from + to) / 2, clientY: (y + yTo) / 2 }] });
  fireEvent.touchMove(el, { touches: [{ clientX: to, clientY: yTo }] });
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: to, clientY: yTo }] });
};

/* The drag is written straight to the DOM, so these read the element rather than
   any React state — which is the whole point of the design. */
const pane = (c: HTMLElement) => c.querySelector("[data-day-pane]") as HTMLElement;
const pill = (c: HTMLElement) => c.querySelector("[data-day-peek]") as HTMLElement;

const press = (el: Element, x: number, y = 300) =>
  fireEvent.touchStart(el, { touches: [{ clientX: x, clientY: y }] });
const drag = (el: Element, x: number, y = 300) =>
  fireEvent.touchMove(el, { touches: [{ clientX: x, clientY: y }] });
const release = (el: Element, x: number, y = 300) =>
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: x, clientY: y }] });

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

describe("drag feedback", () => {
  it("moves the pane with the finger before anything is committed", async () => {
    const { container } = render(<App />);
    const q = within(container);
    await waitFor(() => expect(q.getByText("tänään")).toBeTruthy());
    const target = q.getByText("Liikkeet");

    expect(pane(container).style.transform).toBe("");
    press(target, MID);
    drag(target, MID + 40);
    /* one-to-one below the commit threshold */
    expect(pane(container).style.transform).toBe("translate3d(40px,0,0)");
    /* and still today: nothing has been decided */
    expect(q.getByText("tänään")).toBeTruthy();

    /* released short, so it settles back with a transition rather than jumping */
    release(target, MID + 40);
    expect(pane(container).style.transform).toBe("none");
    expect(pane(container).style.transition).toContain("transform");
    await waitFor(() => expect(q.getByText("tänään")).toBeTruthy());
  });

  it("names the day a release would land on, only once it would commit", async () => {
    const { container } = render(<App />);
    const q = within(container);
    await waitFor(() => expect(q.getByText("tänään")).toBeTruthy());
    const target = q.getByText("Liikkeet");

    press(target, MID);
    drag(target, MID + SWIPE_MIN_PX - 10);
    expect(pill(container).style.opacity).toBe("0"); /* not yet */

    drag(target, MID + SWIPE_MIN_PX + 20);
    expect(pill(container).style.opacity).toBe("1");
    expect(pill(container).textContent).toBe("eilen");

    /* sliding back below the threshold withdraws the promise */
    drag(target, MID + 10);
    expect(pill(container).style.opacity).toBe("0");
    release(target, MID + 10);
  });

  it("puts a stiff short leash on a forward drag past today", async () => {
    const { container } = render(<App />);
    const q = within(container);
    await waitFor(() => expect(q.getByText("tänään")).toBeTruthy());
    const target = q.getByText("Liikkeet");

    press(target, MID);
    drag(target, MID - 200);
    const x = Number((pane(container).style.transform.match(/(-?\d+(?:\.\d+)?)px/) || [])[1]);
    /* it moves, so the boundary is felt during the gesture, but barely */
    expect(x).toBeLessThan(0);
    expect(Math.abs(x)).toBeLessThanOrEqual(SWIPE_BLOCKED_DRAG_PX);
    /* and no promise is made */
    expect(pill(container).style.opacity).toBe("0");
    release(target, MID - 200);
    await waitFor(() => expect(q.getByText("tänään")).toBeTruthy());
  });

  it("gives the pane back when the gesture turns out to be a scroll", async () => {
    const { container } = render(<App />);
    const q = within(container);
    await waitFor(() => expect(q.getByText("tänään")).toBeTruthy());
    const target = q.getByText("Liikkeet");

    press(target, MID, 200);
    drag(target, MID + 40, 210); /* horizontal first */
    expect(pane(container).style.transform).toBe("translate3d(40px,0,0)");
    /* jsdom keeps the same gesture; a later vertical dominance ends it */
    fireEvent.touchCancel(target);
    expect(pane(container).style.transform).toBe("none");
  });
});
