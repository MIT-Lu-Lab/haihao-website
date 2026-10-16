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

/**
 * Map presentation time to the iteration clock shared by both plots.
 * All times are milliseconds. Restart holds advance presentation time while
 * iteration time stays fixed; before/after selects the side of the reset.
 * @param restartSteps Unique restart indices in ascending order.
 * @param displaySteps Last displayed iteration.
 * @param timing Hold durations and milliseconds per iteration.
 * @param [explanationStep] First averaged restart to explain.
 * @returns Duration includes restart holds but excludes the final hold.
 *   Sample accepts nonnegative presentation time and returns iteration time,
 *   final-hold time,
 *   and the active restart (or null). The caller handles looping.
 */
export function createTheoryTimeline(
  restartSteps: number[],
  displaySteps: number,
  timing: {
    step: number;
    restartBefore: number;
    restartAfter: number;
    firstRestartBefore: number;
    firstRestartAfter: number;
  },
  explanationStep: number = restartSteps[0],
): { duration: number; sample: (elapsed: number) => TimelineSample } {
  const restarts = restartSteps.filter((k) => k > 0 && k <= displaySteps);
  const hold = timing.restartBefore + timing.restartAfter;
  const firstHold = timing.firstRestartBefore + timing.firstRestartAfter;
  const duration =
    displaySteps * timing.step +
    restarts.reduce(
      (total, step) => total + (step === explanationStep ? firstHold : hold),
      0,
    );

  function sample(elapsed: number): TimelineSample {
    let time = elapsed;
    for (const step of restarts) {
      const before =
        step === explanationStep
          ? timing.firstRestartBefore
          : timing.restartBefore;
      const total = step === explanationStep ? firstHold : hold;
      const boundary = step * timing.step;
      if (time < boundary) {
        break;
      }
      if (time < boundary + total) {
        return {
          time: boundary,
          endHold: 0,
          restart: {
            step,
            phase: time < boundary + before ? 'before' : 'after',
            elapsed: time - boundary,
            duration: total,
            explain: step === explanationStep,
          },
        };
      }
      time -= total;
    }
    return {
      time: Math.min(displaySteps * timing.step, time),
      endHold: Math.max(0, elapsed - duration),
      restart: null,
    };
  }
  return { duration, sample };
}
