export interface TimelineSample {
  time: number;
  endHold: number;
}
export interface TimelineTiming {
  /** Milliseconds per PDHG evaluation. */
  step: number;
}

/** Shared continuous clock for both plots. The caller handles looping. */
export function createTheoryTimeline(
  displaySteps: number,
  timing: TimelineTiming,
): { duration: number; sample: (elapsed: number) => TimelineSample } {
  const duration = displaySteps * timing.step;
  return {
    duration,
    sample: (elapsed) => ({
      time: Math.min(duration, elapsed),
      endHold: Math.max(0, elapsed - duration),
    }),
  };
}
