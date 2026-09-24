/**
 * Arterial pressure waveform, phase in [0,1) of one cardiac cycle:
 * fast systolic upstroke, peak, dicrotic notch (aortic valve closure), diastolic run-off.
 * Returns 0..1. The same shape is used in GLSL for vessel pulsation and in TS for audio / ECG sync.
 */
export function arterialPulse(phase: number): number {
  const p = phase - Math.floor(phase);
  const systole = Math.exp(-Math.pow((p - 0.16) / 0.075, 2));
  const notch = 0.32 * Math.exp(-Math.pow((p - 0.42) / 0.07, 2));
  const runoff = 0.18 * Math.exp(-p * 3.0);
  return Math.min(1, systole + notch + runoff);
}

export const PULSE_GLSL = /* glsl */ `
float arterialPulse(float phase) {
  float p = fract(phase);
  float systole = exp(-pow((p - 0.16) / 0.075, 2.0));
  float notch = 0.32 * exp(-pow((p - 0.42) / 0.07, 2.0));
  float runoff = 0.18 * exp(-p * 3.0);
  return min(1.0, systole + notch + runoff);
}
`;
