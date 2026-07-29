import { describe, it, expect } from "vitest";
import {
  SWIPE_EDGE_PX,
  SWIPE_MAX_MS,
  SWIPE_MIN_PX,
  swipeAxisOf,
  swipeResultOf,
  swipeStartAllowed,
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
