/* ui/swipe — the day-changing swipe.
 *
 * Two earlier versions, each fixing the previous one's real complaint:
 *
 *   v1 committed on release and then played a slide-in. The feedback arrived
 *   after the decision, so the gesture could not teach itself.
 *
 *   v2 followed the finger, but every listener was passive — which was documented
 *   as a virtue and was in fact the bug. A passive listener cannot cancel
 *   scrolling, so a drag with any vertical component slid the pane sideways
 *   *while the page scrolled underneath*, and the vertical velocity it had
 *   accumulated kept coasting after release.
 *
 * So `touchmove` is now non-passive and calls `preventDefault()` once the axis has
 * locked horizontal. That is the only thing that actually stops the browser
 * scrolling mid-gesture: `touch-action: pan-y` declines *horizontal* panning but
 * says nothing about the vertical component of a diagonal drag, and changing
 * `touch-action` mid-gesture has no effect because the browser latches it at
 * touchstart.
 *
 * It has to be attached by hand, because React registers `touchmove` passively at
 * the root and `preventDefault()` inside `onTouchMove` is silently a no-op.
 * `touchstart`, `touchend` and `touchcancel` never need cancelling, so they stay
 * as ordinary React props.
 *
 * preventDefault is only ever called *after* the lock, so a vertical gesture is
 * never blocked and never waits on this handler.
 *
 * ---- Why this file writes to the DOM directly ----
 *
 * The drag offset is not React state. Tänään renders a full day — hero ring, every
 * exercise, every symptom, the PSFS card — and re-rendering that on every
 * touchmove would drop frames. The offset goes straight to the pane's
 * `style.transform` through a ref, and the preview label through another. React
 * owns *which* day is shown; this file owns where the pane sits while a finger is
 * on it. They cannot fight, because the transform is always reset in the same
 * frame React is told anything.
 */

import { useCallback, useRef } from "react";
import { WD_LONG, addDays, dragOffset, keyOf, swipeAxisOf, swipeResultOf, swipeStartAllowed, willCommit } from "../domain";
import type { SwipeAxis } from "../domain";

/* Text fields own horizontal drags: that is a caret selection, not a page turn.
   `data-noswipe` is the escape hatch for anything added later that scrolls
   sideways. */
const BLOCKED = "input, textarea, select, [contenteditable], [data-noswipe]";

const SNAP_MS = 190;
const ARRIVE_MS = 180;
const ARRIVE_PX = 28;

function isBlocked(target: EventTarget | null): boolean {
  const el = target as Element | null;
  if (!el || typeof (el as any).closest !== "function") return false;
  return !!el.closest(BLOCKED);
}

function reducedMotion(): boolean {
  try {
    return !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/* "eilen" and "tänään" are what the header itself says, so the preview uses the
   same words rather than a bare date the reader has to place. */
function peekLabel(target: Date, todayKey: string): string {
  const k = keyOf(target);
  if (k === todayKey) return "tänään";
  if (k === keyOf(addDays(new Date(`${todayKey}T00:00:00`), -1))) return "eilen";
  return `${WD_LONG[target.getDay()]} ${target.getDate()}.${target.getMonth() + 1}.`;
}

type Live = { x: number; y: number; t: number; axis: SwipeAxis; moved: boolean } | null;

export function useDaySwipe({
  selected,
  todayKey,
  onPrev,
  onNext,
  canNext,
}: {
  selected: Date;
  todayKey: string;
  onPrev: () => void;
  onNext: () => void;
  canNext: boolean;
}) {
  const paneRef = useRef<HTMLDivElement | null>(null);
  const peekRef = useRef<HTMLDivElement | null>(null);
  const live = useRef<Live>(null);

  const setPane = (transform: string, transition: string, opacity: string) => {
    const el = paneRef.current;
    if (!el) return;
    el.style.transition = transition;
    el.style.transform = transform;
    el.style.opacity = opacity;
  };

  const showPeek = (dx: number) => {
    const el = peekRef.current;
    if (!el) return;
    if (!willCommit(dx, canNext)) {
      el.style.opacity = "0";
      return;
    }
    el.textContent = peekLabel(addDays(selected, dx > 0 ? -1 : 1), todayKey);
    el.style.opacity = "1";
  };

  const hidePeek = () => {
    const el = peekRef.current;
    if (el) el.style.opacity = "0";
  };

  const onTouchStart = useCallback((e: any) => {
    live.current = null;
    if (!e.touches || e.touches.length !== 1) return; /* pinch or multi-touch */
    if (isBlocked(e.target)) return;
    const t = e.touches[0];
    const width = typeof window === "undefined" ? 0 : window.innerWidth;
    if (!swipeStartAllowed(t.clientX, width)) return;
    live.current = { x: t.clientX, y: t.clientY, t: Date.now(), axis: "undecided", moved: false };
  }, []);

  /* Attached by hand with { passive: false } — see the header comment. */
  const handleMove = useCallback(
    (e: TouchEvent) => {
      const s = live.current;
      if (!s) return;
      if (!e.touches || e.touches.length !== 1) {
        live.current = null;
        return;
      }
      const t = e.touches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;

      if (s.axis === "undecided") s.axis = swipeAxisOf(dx, dy);

      if (s.axis === "vertical") {
        /* the scroller's gesture; give the pane back if it had already moved */
        if (s.moved) setPane("none", `transform ${SNAP_MS}ms ease-out`, "1");
        hidePeek();
        live.current = null;
        return;
      }
      if (s.axis !== "horizontal") return;

      /* The whole point of the non-passive listener: from here on the browser
         must not scroll, or the page drifts under the pane and keeps coasting
         after release. */
      if (e.cancelable) e.preventDefault();

      s.moved = true;
      setPane(`translate3d(${dragOffset(dx, canNext)}px,0,0)`, "none", "1");
      showPeek(dx);
    },
    [canNext, selected, todayKey]
  );

  /* A callback ref, not a useEffect over a plain ref.
   *
   * The first version used an effect, and it silently never attached: Tänään is
   * not rendered until IndexedDB has answered, so by the time the pane existed
   * the effect had already run against a null ref and had no reason to re-run.
   * Swipe was dead — in the tests and on a device. A callback ref is called with
   * the node whenever it appears and with null when it goes, so mount timing and
   * tab switching stop being something this has to know about.
   *
   * The listener itself is stable and reads the current handler through a ref, so
   * changing day does not detach and re-attach it mid-gesture. */
  const moveRef = useRef(handleMove);
  moveRef.current = handleMove;
  const listener = useCallback((e: TouchEvent) => moveRef.current(e), []);
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const outerRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (nodeRef.current) nodeRef.current.removeEventListener("touchmove", listener);
      nodeRef.current = el;
      if (el) el.addEventListener("touchmove", listener, { passive: false });
    },
    [listener]
  );

  const onTouchEnd = useCallback(
    (e: any) => {
      const s = live.current;
      live.current = null;
      hidePeek();
      if (!s || s.axis !== "horizontal") return;

      const t = (e.changedTouches && e.changedTouches[0]) || null;
      const dx = t ? t.clientX - s.x : 0;
      const dy = t ? t.clientY - s.y : 0;
      const result = t ? swipeResultOf({ dx, dy, ms: Date.now() - s.t }) : "none";

      if (result === "none" || (result === "next" && !canNext)) {
        /* settle back; the stiff leash already said why, if it was the boundary */
        setPane("none", `transform ${SNAP_MS}ms ease-out`, "1");
        return;
      }

      /* Swap the day immediately and let the new one arrive, rather than fading
         out first on a timer. No pending timer means a second swipe during the
         animation cannot lose the first one's day change — which matters, since
         comparing two days back to back is the reason this gesture exists.
         The new day enters from the side it conceptually came from; the small
         jump from wherever the finger was is covered by starting faded. */
      result === "prev" ? onPrev() : onNext();
      if (reducedMotion()) {
        setPane("none", "none", "1");
        return;
      }
      const from = result === "prev" ? -ARRIVE_PX : ARRIVE_PX;
      setPane(`translate3d(${from}px,0,0)`, "none", "0.4");
      window.requestAnimationFrame(() =>
        setPane("none", `transform ${ARRIVE_MS}ms ease-out, opacity ${ARRIVE_MS}ms ease-out`, "1")
      );
    },
    [canNext, onNext, onPrev]
  );

  const onTouchCancel = useCallback(() => {
    const s = live.current;
    live.current = null;
    hidePeek();
    if (s && s.moved) setPane("none", `transform ${SNAP_MS}ms ease-out`, "1");
  }, []);

  return {
    outerRef,
    paneRef,
    peekRef,
    /* touchmove is deliberately absent: it is attached non-passively above */
    handlers: { onTouchStart, onTouchEnd, onTouchCancel },
    /* pan-y keeps vertical scrolling available for gestures we decline; pinch-zoom
       is listed explicitly so the gesture does not cost anyone text zoom */
    outerStyle: { touchAction: "pan-y pinch-zoom" as const, position: "relative" as const },
  };
}
