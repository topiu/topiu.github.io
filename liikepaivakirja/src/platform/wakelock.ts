/* platform/wakelock — keep the screen on while treenitila is open.
 *
 * Best effort: the Screen Wake Lock API exists in current Safari and Chromium,
 * but older iOS versions do not honour it in a Home Screen app. A lock is
 * released by the browser whenever the page is hidden, so it is re-requested
 * when the page becomes visible again. Returns the cleanup function. */
export function holdWakeLock(): () => void {
  let lock: any = null;
  let alive = true;
  const nav: any = typeof navigator !== "undefined" ? navigator : null;
  const request = async () => {
    try {
      if (!alive || !nav || !nav.wakeLock || document.visibilityState !== "visible") return;
      lock = await nav.wakeLock.request("screen");
    } catch {
      /* refused (battery saver, unsupported): the screen may sleep, nothing else breaks */
    }
  };
  const onVis = () => {
    if (document.visibilityState === "visible") void request();
  };
  void request();
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVis);
  return () => {
    alive = false;
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVis);
    try {
      if (lock) void lock.release();
    } catch {
      /* already released */
    }
  };
}
