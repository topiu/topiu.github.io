/* ui/swipe — the day-changing swipe, wired to touch events.
 *
 * All the judgement lives in domain/swipe.ts; this is the plumbing plus the two
 * bits of feedback that stop the gesture feeling broken:
 *
 *   `enter` drives a short slide-in on the day that arrives, so the change reads
 *   as a page turn rather than a flicker.
 *
 *   `bump` drives a small rubber-band when a swipe is refused at today's
 *   boundary. Without it, swiping forward on today is indistinguishable from a
 *   swipe the app failed to notice.
 *
 * There is deliberately no finger-following drag. It would feel better and it is
 * a lot more moving parts — transform tracking, snap-back, interrupted gestures —
 * and none of it can be tested here or felt on a real device from where this was
 * written. Threshold-and-commit is the version that cannot jank.
 *
 * Listeners are passive; see the note in domain/swipe.ts about why nothing here
 * needs preventDefault.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { swipeAxisOf, swipeResultOf, swipeStartAllowed } from "../domain";
import type { SwipeAxis } from "../domain";

/* Text fields own horizontal drags: that is a caret selection, not a page turn.
   `data-noswipe` is the escape hatch for anything added later that scrolls
   sideways. */
const BLOCKED = "input, textarea, select, [contenteditable], [data-noswipe]";

function blocked(target: EventTarget | null): boolean {
  const el = target as Element | null;
  if (!el || typeof (el as any).closest !== "function") return false;
  return !!el.closest(BLOCKED);
}

type Live = { x: number; y: number; t: number; axis: SwipeAxis } | null;

export function useDaySwipe({ onPrev, onNext, canNext }: { onPrev: () => void; onNext: () => void; canNext: boolean }) {
  const live = useRef<Live>(null);
  const [enter, setEnter] = useState<"prev" | "next" | null>(null);
  const [bump, setBump] = useState(false);
  const timers = useRef<any[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
    },
    []
  );

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const onTouchStart = useCallback((e: any) => {
    live.current = null;
    if (!e.touches || e.touches.length !== 1) return; /* pinch or multi-touch */
    if (blocked(e.target)) return;
    const t = e.touches[0];
    const width = typeof window === "undefined" ? 0 : window.innerWidth;
    if (!swipeStartAllowed(t.clientX, width)) return;
    live.current = { x: t.clientX, y: t.clientY, t: Date.now(), axis: "undecided" };
  }, []);

  const onTouchMove = useCallback((e: any) => {
    const s = live.current;
    if (!s) return;
    if (!e.touches || e.touches.length !== 1) {
      live.current = null;
      return;
    }
    const t = e.touches[0];
    if (s.axis === "undecided") {
      s.axis = swipeAxisOf(t.clientX - s.x, t.clientY - s.y);
    }
    /* vertical: hand the gesture back to the scroller and stop watching */
    if (s.axis === "vertical") live.current = null;
  }, []);

  const onTouchEnd = useCallback(
    (e: any) => {
      const s = live.current;
      live.current = null;
      if (!s || s.axis !== "horizontal") return;
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;

      const result = swipeResultOf({ dx: t.clientX - s.x, dy: t.clientY - s.y, ms: Date.now() - s.t });
      if (result === "none") return;

      if (result === "next" && !canNext) {
        setBump(true);
        later(() => setBump(false), 240);
        return;
      }
      setEnter(result);
      later(() => setEnter(null), 260);
      if (result === "prev") onPrev();
      else onNext();
    },
    [canNext, onNext, onPrev]
  );

  const onTouchCancel = useCallback(() => {
    live.current = null;
  }, []);

  return {
    /* spread onto the pane that should respond to the gesture */
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel },
    /* pan-y keeps vertical scrolling; pinch-zoom is listed explicitly so the
       gesture does not cost anyone the ability to zoom the text */
    paneStyle: { touchAction: "pan-y pinch-zoom" as const },
    bumpClass: bump ? "day-bump" : "",
    enterClass: enter === "prev" ? "day-in-prev" : enter === "next" ? "day-in-next" : "",
  };
}
