/** Minimal frame-driven tweens (no dependency). */
interface Tween { t: number; dur: number; fn: (k: number) => void; done?: () => void }
const active: Tween[] = [];

export function tween(dur: number, fn: (k: number) => void, done?: () => void): void {
  active.push({ t: 0, dur, fn, done });
}

export function updateTweens(dt: number): void {
  for (let i = active.length - 1; i >= 0; i--) {
    const tw = active[i];
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    tw.fn(k);
    if (k >= 1) {
      active.splice(i, 1);
      tw.done?.();
    }
  }
}
