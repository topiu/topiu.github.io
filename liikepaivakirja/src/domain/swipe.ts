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
 * The axis lock is also what makes it safe to cancel scrolling. `touch-action:
 * pan-y` tells the browser horizontal panning is not its business, but a
 * *diagonal* drag still has a vertical component the browser will happily scroll
 * with — so the pane slid sideways while the page scrolled underneath, and the
 * leftover vertical velocity kept coasting after release. Once the axis has
 * locked horizontal, ui/swipe.ts calls preventDefault on every touchmove, which
 * needs a non-passive listener. It is only ever called after the lock, so a
 * vertical gesture is never blocked or delayed.
 *
 * SWIPE_AXIS_RATIO exists for the same reason: horizontal has to *dominate*, not
 * merely exceed, before the lock. A near-diagonal drag is far more likely to be a
 * scroll that drifted than a page turn, and misreading it means cancelling a
 * scroll the user wanted.
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

/* How much horizontal has to beat vertical to claim the gesture. Above 1 on
   purpose: ties and near-ties belong to the scroller. */
export const SWIPE_AXIS_RATIO = 1.2;

/* How far the pane may travel. Well short of the viewport: this is not a
   carousel revealing the neighbouring day, it is the current day yielding, and
   pretending otherwise would promise content that is not rendered. */
export const SWIPE_MAX_DRAG_PX = 120;

/* Travel allowed against a boundary. Small and stiff, so the end of the range
   announces itself during the drag instead of after it. */
export const SWIPE_BLOCKED_DRAG_PX = 26;

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
  return ax > ay * SWIPE_AXIS_RATIO ? "horizontal" : "vertical";
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

/* Distance the pane should move for a given finger travel.
 *
 * One-to-one up to the commit threshold, so the first part of the gesture is
 * honest direct manipulation, then compressed threefold and capped. The change of
 * resistance at the threshold is the point: it is felt, and it marks the moment
 * where releasing would commit, without needing a label to say so.
 */
export function dragOffset(dx: number, canNext: boolean): number {
  if (!Number.isFinite(dx) || dx === 0) return 0; /* returning -0 here would put "-0px" in a transform */
  const a = Math.abs(dx);
  const sign = dx > 0 ? 1 : -1;

  /* forward past today is refused, so it gets a stiff short leash rather than a
     silent no-op */
  if (sign < 0 && !canNext) return -Math.min(SWIPE_BLOCKED_DRAG_PX, a / 4);

  const eased =
    a <= SWIPE_MIN_PX ? a : Math.min(SWIPE_MAX_DRAG_PX, SWIPE_MIN_PX + (a - SWIPE_MIN_PX) / 3);
  return sign * eased;
}

/* Whether releasing right now would change the day. Drives the live preview, so
   it must agree with swipeResultOf on everything except velocity, which is not
   known mid-gesture. */
export function willCommit(dx: number, canNext: boolean): boolean {
  if (!Number.isFinite(dx)) return false;
  if (Math.abs(dx) < SWIPE_MIN_PX) return false;
  return dx > 0 || canNext;
}
