import { describe, it, expect } from "vitest";
import {
  SWIPE_BLOCKED_DRAG_PX,
  SWIPE_EDGE_PX,
  SWIPE_MAX_DRAG_PX,
  SWIPE_MAX_MS,
  SWIPE_MIN_PX,
  swipeAxisOf,
  swipeResultOf,
  swipeStartAllowed,
  dragOffset,
  willCommit,
} from "../src/domain";

const W = 390; /* a phone, wide enough for two edge strips and a middle */

describe("swipeStartAllowed", () => {
  it("declines the strips the browser's own back gesture claims", () => {
    expect(swipeStartAllowed(0, W)).toBe(false);
    expect(swipeStartAllowed(SWIPE_EDGE_PX - 1, W)).toBe(false);
    expect(swipeStartAllowed(W, W)).toBe(false);
    expect(swipeStartAllowed(W - SWIPE_EDGE_PX + 1, W)).toBe(false);
  });

  it("allows the middle, inclusive of the boundary", () => {
    expect(swipeStartAllowed(SWIPE_EDGE_PX, W)).toBe(true);
    expect(swipeStartAllowed(W / 2, W)).toBe(true);
    expect(swipeStartAllowed(W - SWIPE_EDGE_PX, W)).toBe(true);
  });

  it("declines everything on a viewport too narrow to have a safe middle", () => {
    /* rather than shrinking the exclusion and fighting the browser */
    expect(swipeStartAllowed(80, SWIPE_EDGE_PX * 4 - 1)).toBe(false);
    expect(swipeStartAllowed(80, SWIPE_EDGE_PX * 4)).toBe(true);
  });

  it("declines nonsense instead of guessing", () => {
    expect(swipeStartAllowed(NaN, W)).toBe(false);
    expect(swipeStartAllowed(100, 0)).toBe(false);
    expect(swipeStartAllowed(100, NaN)).toBe(false);
  });
});

describe("swipeAxisOf", () => {
  it("waits before deciding, so jitter does not lock the axis", () => {
    expect(swipeAxisOf(0, 0)).toBe("undecided");
    expect(swipeAxisOf(6, 4)).toBe("undecided");
  });

  it("locks to whichever axis moved further", () => {
    expect(swipeAxisOf(20, 3)).toBe("horizontal");
    expect(swipeAxisOf(-20, 3)).toBe("horizontal");
    expect(swipeAxisOf(3, 20)).toBe("vertical");
    expect(swipeAxisOf(3, -20)).toBe("vertical");
  });

  it("gives an exact diagonal to the scroller", () => {
    /* scrolling is the more common intent, so ties are not page turns */
    expect(swipeAxisOf(20, 20)).toBe("vertical");
  });
});

describe("swipeResultOf", () => {
  const fast = { dy: 0, ms: 200 };

  it("reads a rightward swipe as going back a day", () => {
    expect(swipeResultOf({ dx: 90, ...fast })).toBe("prev");
    expect(swipeResultOf({ dx: -90, ...fast })).toBe("next");
  });

  it("ignores movement too small to be deliberate", () => {
    expect(swipeResultOf({ dx: SWIPE_MIN_PX - 1, ...fast })).toBe("none");
    expect(swipeResultOf({ dx: SWIPE_MIN_PX, ...fast })).toBe("prev");
  });

  it("ignores a drag that was mostly vertical", () => {
    /* 80 across, 60 down: over the distance threshold but not dominant enough */
    expect(swipeResultOf({ dx: 80, dy: 60, ms: 200 })).toBe("none");
    expect(swipeResultOf({ dx: 80, dy: 20, ms: 200 })).toBe("prev");
  });

  it("ignores a slow drag, which is usually a scroll that drifted", () => {
    expect(swipeResultOf({ dx: 120, dy: 0, ms: SWIPE_MAX_MS + 1 })).toBe("none");
    expect(swipeResultOf({ dx: 120, dy: 0, ms: SWIPE_MAX_MS })).toBe("prev");
  });

  it("returns none for nonsense", () => {
    expect(swipeResultOf({ dx: NaN, dy: 0, ms: 200 })).toBe("none");
    expect(swipeResultOf({ dx: 90, dy: NaN, ms: 200 })).toBe("none");
  });
});

describe("dragOffset", () => {
  it("tracks the finger exactly up to the commit threshold", () => {
    expect(dragOffset(0, true)).toBe(0);
    expect(dragOffset(30, true)).toBe(30);
    expect(dragOffset(-30, true)).toBe(-30);
    expect(dragOffset(SWIPE_MIN_PX, true)).toBe(SWIPE_MIN_PX);
  });

  it("stiffens past the threshold, so the commit point is felt", () => {
    /* 56 + (156-56)/3 ≈ 89: still moving, but no longer one-to-one */
    const far = dragOffset(156, true);
    expect(far).toBeGreaterThan(SWIPE_MIN_PX);
    expect(far).toBeLessThan(156);
  });

  it("never travels further than the cap", () => {
    expect(dragOffset(5000, true)).toBe(SWIPE_MAX_DRAG_PX);
    expect(dragOffset(-5000, true)).toBe(-SWIPE_MAX_DRAG_PX);
  });

  it("puts a short stiff leash on a forward drag past today", () => {
    /* back is always allowed, forward is not */
    expect(dragOffset(200, false)).toBeGreaterThan(SWIPE_BLOCKED_DRAG_PX);
    const blocked = dragOffset(-200, false);
    expect(blocked).toBeLessThan(0);
    expect(Math.abs(blocked)).toBeLessThanOrEqual(SWIPE_BLOCKED_DRAG_PX);
    /* it still moves at all, so the boundary announces itself during the drag */
    expect(Math.abs(dragOffset(-40, false))).toBeGreaterThan(0);
  });

  it("returns zero for nonsense rather than moving the pane somewhere odd", () => {
    expect(dragOffset(NaN, true)).toBe(0);
  });
});

describe("willCommit", () => {
  it("agrees with the distance threshold that swipeResultOf uses", () => {
    expect(willCommit(SWIPE_MIN_PX - 1, true)).toBe(false);
    expect(willCommit(SWIPE_MIN_PX, true)).toBe(true);
    expect(willCommit(-SWIPE_MIN_PX, true)).toBe(true);
  });

  it("promises nothing forward when there is nowhere to go", () => {
    expect(willCommit(-200, false)).toBe(false);
    expect(willCommit(200, false)).toBe(true); /* backwards is always available */
  });

  it("is false for nonsense", () => {
    expect(willCommit(NaN, true)).toBe(false);
  });
});
