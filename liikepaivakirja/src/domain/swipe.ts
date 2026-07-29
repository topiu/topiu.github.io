/* domain/swipe — the geometry of a day-changing swipe, as pure decisions.
 *
 * The awkward constraint is that iOS Safari's back/forward gesture cannot be
 * cancelled. `touchstart` in the edge strip is not reliably cancelable and
 * `preventDefault` on it does not stop the navigation, so there is no way to
 * "win" that gesture — the only way to coexist is to decline any swipe that
 * begins in the strip and let the browser have it. That is why the edge test is
 * on the *start* point and not on the movement.
 *
 * The other half is the directional lock. Vertical scrolling has to keep working
 * on a screen this tall, so the axis is decided once, early, from the first few
 * pixels of travel and then honoured for the rest of the gesture. Re-deciding on
 * every move is how swipe handlers end up stealing scrolls near the end of a
 * flick, or paging when someone meant to scroll diagonally.
 *
 * Listeners can therefore stay passive: nothing here ever needs preventDefault,
 * because a horizontal drag has nothing to scroll and a vertical one is handed
 * straight back to the scroller.
 */

/* Wider than the ~20px Safari actually claims, and equal to Apple's minimum
   touch target, so the exclusion is comfortable rather than exact. */
export const SWIPE_EDGE_PX = 44;

/* Far enough that it cannot be a tap that wobbled. */
export const SWIPE_MIN_PX = 56;

/* Horizontal has to clearly dominate before the day changes. Losing your place
   in the diary is more annoying than a swipe that did nothing. */
export const SWIPE_RATIO = 1.6;

/* Past this it is a drag, not a swipe — probably a slow scroll that drifted. */
export const SWIPE_MAX_MS = 900;

/* Travel before the axis is decided. Small enough to lock in before the browser
   commits to scrolling, large enough not to trip on jitter. */
export const SWIPE_AXIS_PX = 10;

export type SwipeAxis = "undecided" | "horizontal" | "vertical";
export type SwipeResult = "prev" | "next" | "none";

export function swipeStartAllowed(startX: number, width: number, edge: number = SWIPE_EDGE_PX): boolean {
  if (!Number.isFinite(startX) || !Number.isFinite(width) || width <= 0) return false;
  /* On a viewport too narrow to hold two exclusion strips and a usable middle,
     decline everything rather than shrink the strips: a swipe that fights the
     browser's own gesture is worse than no swipe. */
  if (width < edge * 4) return false;
  return startX >= edge && startX <= width - edge;
}

export function swipeAxisOf(dx: number, dy: number, min: number = SWIPE_AXIS_PX): SwipeAxis {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < min && ay < min) return "undecided";
  return ax > ay ? "horizontal" : "vertical";
}

/* Positive dx is a rightward finger movement, which goes back a day — the same
   direction as the browser's own back gesture and as every photo viewer. */
export function swipeResultOf({ dx, dy, ms }: { dx: number; dy: number; ms: number }): SwipeResult {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return "none";
  if (Number.isFinite(ms) && ms > SWIPE_MAX_MS) return "none";
  const ax = Math.abs(dx);
  if (ax < SWIPE_MIN_PX) return "none";
  if (ax < Math.abs(dy) * SWIPE_RATIO) return "none";
  return dx > 0 ? "prev" : "next";
}
