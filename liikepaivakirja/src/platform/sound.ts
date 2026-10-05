/* platform/sound — a short beep when a rest or a hold ends.
 *
 * iOS only lets audio start inside a user gesture, so `unlockSound()` is called
 * from the tap that starts a timer; the beep at the end then plays from the same
 * context. The ringer switch can still silence it — the countdown on screen is
 * the primary signal, this is a courtesy. Vibration is used where it exists
 * (Android); iOS Safari has none. */
let ctx: any = null;

export function unlockSound() {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function beep() {
  try {
    if ((navigator as any).vibrate) (navigator as any).vibrate(200);
  } catch {
    /* ignore */
  }
  try {
    if (!ctx) return;
    const t = ctx.currentTime;
    [0, 0.22].forEach((offset) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t + offset);
      g.gain.exponentialRampToValueAtTime(0.3, t + offset + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.16);
      o.connect(g).connect(ctx.destination);
      o.start(t + offset);
      o.stop(t + offset + 0.18);
    });
  } catch {
    /* no audio: the countdown on screen is enough */
  }
}
