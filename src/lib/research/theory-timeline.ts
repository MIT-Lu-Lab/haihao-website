export interface RestartState {
  step: number;
  phase: 'before' | 'after';
  elapsed: number;
  duration: number;
  explain: boolean;
}
export interface TimelineSample {
  time: number;
  endHold: number;
  restart: RestartState | null;
}
export interface TimelineTiming {
  /** Milliseconds per iteration. */
  step: number;
  /** Hold before the explained reset, in milliseconds. */
  explanationBefore: number;
  /** Hold after the explained reset, in milliseconds. */
  explanationAfter: number;
}

/**
 * Map presentation time to the iteration clock shared by both plots.
 * All times are milliseconds. Iteration time advances uniformly except at the
 * explained reset, where it holds on both sides while presentation time
 * continues. Other resets play through without pausing.
 * @param displaySteps Last displayed iteration.
 * @param timing Milliseconds per iteration and the explanation hold.
 * @param explanationStep Reset to explain; omitted or out of range means none.
 * @returns The duration includes the explanation hold but not the final hold.
 *   `sample` accepts nonnegative presentation time and returns iteration time,
 *   final-hold time, and the active hold (or null). The caller handles
 *   looping.
 */
export function createTheoryTimeline(
  displaySteps: number,
  timing: TimelineTiming,
  explanationStep?: number,
): { duration: number; sample: (elapsed: number) => TimelineSample } {
  const explained =
    explanationStep !== undefined &&
    explanationStep > 0 &&
    explanationStep <= displaySteps;
  const hold = explained
    ? timing.explanationBefore + timing.explanationAfter
    : 0;
  const boundary = explained ? explanationStep * timing.step : Infinity;
  const end = displaySteps * timing.step;
  const duration = end + hold;

  function sample(elapsed: number): TimelineSample {
    if (elapsed >= boundary && elapsed < boundary + hold) {
      const holdElapsed = elapsed - boundary;
      return {
        time: boundary,
        endHold: 0,
        restart: {
          step: explanationStep as number,
          phase: holdElapsed < timing.explanationBefore ? 'before' : 'after',
          elapsed: holdElapsed,
          duration: hold,
          explain: true,
        },
      };
    }
    const time = elapsed >= boundary + hold ? elapsed - hold : elapsed;
    return {
      time: Math.min(end, time),
      endHold: Math.max(0, elapsed - duration),
      restart: null,
    };
  }
  return { duration, sample };
}
