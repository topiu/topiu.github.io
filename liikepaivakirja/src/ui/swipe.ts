/* ui/swipe — the day-changing swipe.
 *
 * The first version committed on release and then played a short slide-in. That
 * was the wrong way round: the feedback arrived *after* the decision, so the
 * gesture could not teach itself. You had to already know it existed, and know
 * what it would do, before it would tell you anything.
 *
 * So the pane now follows the finger, and a pill above it names the day you would
 * land on as soon as releasing would commit. Both facts — that something is
 * happening, and what it will be — are available while there is still time to
 * abort by sliding back.
 *
 * ---- Why this file writes to the DOM directly ----
 *
 * The drag offset is *not* React state. Tänään renders a full day — hero ring,
 * every exercise, every symptom, the PSFS card — and re-rendering that subtree on
 * every touchmove would drop frames on a phone. The offset is written straight to
 * the pane's `style.transform` through a ref instead, which is the standard shape
 * for gesture-driven transforms: React owns *which* day is shown, this file owns
 * where the pane is while a finger is on it. The two never fight, because the
 * transform is always reset before React is told anything.
 *
 * Reduced motion is honoured by committing instantly with no animation. The drag
 * itself is kept: it is direct manipulation rather than decoration, and removing
 * it would take away the only in-gesture feedback there is.
 */

import { useCallback, useEffect, useRef } from "react";
import { WD_LONG, addDays, dragOffset, keyOf, swipeAxisOf, swipeResultOf, swipeStartAllowed, willCommit } from "../domain";
import type { SwipeAxis } from "../domain";

/* Text fields own horizontal drags: that is a caret selection, not a page turn.
   `data-noswipe` is the escape hatch for anything added later that scrolls
   sideways. */
const BLOCKED = "input, textarea, select, [contenteditable], [data-noswipe]";

const SNAP_MS = 190;
const OUT_MS = 95;
const IN_MS = 175;

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
    const on = willCommit(dx, canNext);
    if (!on) {
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

  const onTouchStart = useCallback(
    (e: any) => {
      live.current = null;
      if (!e.touches || e.touches.length !== 1) return; /* pinch or multi-touch */
      if (isBlocked(e.target)) return;
      const t = e.touches[0];
      const width = typeof window === "undefined" ? 0 : window.innerWidth;
      if (!swipeStartAllowed(t.clientX, width)) return;
      live.current = { x: t.clientX, y: t.clientY, t: Date.now(), axis: "undecided", moved: false };
    },
    []
  );

  const onTouchMove = useCallback(
    (e: any) => {
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
        /* hand the gesture back to the scroller, undoing anything already shown */
        if (s.moved) setPane("none", `transform ${SNAP_MS}ms ease-out`, "1");
        hidePeek();
        live.current = null;
        return;
      }
      if (s.axis !== "horizontal") return;

      s.moved = true;
      setPane(`translate3d(${dragOffset(dx, canNext)}px,0,0)`, "none", "1");
      showPeek(dx);
    },
    [canNext, selected, todayKey]
  );

  const finish = useCallback(
    (e: any) => {
      const s = live.current;
      live.current = null;
      hidePeek();
      if (!s || s.axis !== "horizontal") return;

      const t = (e.changedTouches && e.changedTouches[0]) || null;
      const dx = t ? t.clientX - s.x : 0;
      const dy = t ? t.clientY - s.y : 0;
      const result = t ? swipeResultOf({ dx, dy, ms: Date.now() - s.t }) : "none";
      const blockedForward = result === "next" && !canNext;

      if (result === "none" || blockedForward) {
        /* settle back; the stiff leash already said why, if it was the boundary */
        setPane("none", `transform ${SNAP_MS}ms ease-out`, "1");
        return;
      }

      const go = () => (result === "prev" ? onPrev() : onNext());

      if (reducedMotion()) {
        setPane("none", "none", "1");
        go();
        return;
      }

      /* Continue the way the finger went and fade out, swap the day while
         invisible, then arrive from the opposite side. The crossfade is what
         hides the jump: with only one pane rendered there is no neighbour to
         slide across, and fading at the swap point means there is nothing to see
         at the moment the content changes. */
      const sign = result === "prev" ? 1 : -1;
      setPane(`translate3d(${sign * 150}px,0,0)`, `transform ${OUT_MS}ms ease-out, opacity ${OUT_MS}ms ease-out`, "0");
      later(() => {
        go();
        setPane(`translate3d(${-sign * 36}px,0,0)`, "none", "0");
        window.requestAnimationFrame(() =>
          setPane("none", `transform ${IN_MS}ms ease-out, opacity ${IN_MS}ms ease-out`, "1")
        );
      }, OUT_MS);
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
    paneRef,
    peekRef,
    handlers: { onTouchStart, onTouchMove, onTouchEnd: finish, onTouchCancel },
    /* pan-y keeps vertical scrolling; pinch-zoom is listed explicitly so the
       gesture does not cost anyone the ability to zoom the text */
    outerStyle: { touchAction: "pan-y pinch-zoom" as const, position: "relative" as const },
  };
}
