import { ANATOMY } from '../config/anatomy';

/** Simulation clock: wall time, sim time and the cardiac phase that drives pulsation. */
export class SimClock {
  time = 0;
  dt = 0;
  heartRate = ANATOMY.heart.baseHR;
  /** Continuous cardiac phase (integer part = beat count). */
  heartPhase = 0;
  private last = performance.now();

  tick(): number {
    const now = performance.now();
    this.dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += this.dt;
    this.heartPhase += (this.dt * this.heartRate) / 60;
    return this.dt;
  }
}
