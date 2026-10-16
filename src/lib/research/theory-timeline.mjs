// @ts-check
/**
 * @typedef {Object} RestartState
 * @property {number} step Iteration where the reset occurs.
 * @property {'before' | 'after'} phase Side of the reset being displayed.
 * @property {number} elapsed Milliseconds since the restart hold began.
 * @property {number} duration Total restart hold in milliseconds.
 * @property {boolean} explain Whether to explain the averaged restart.
 */
/**
 * @typedef {Object} TimelineSample
 * @property {number} time Iteration time in ms, excluding restart holds.
 * @property {number} endHold Milliseconds spent in the final hold.
 * @property {RestartState | null} restart Active restart, if any.
 */

/**
 * Map presentation time to the iteration clock shared by both plots.
 * All times are milliseconds. Restart holds advance presentation time while
 * iteration time stays fixed; before/after selects the side of the reset.
 *
 * @param {number[]} restartSteps Unique restart indices in ascending order.
 * @param {number} displaySteps Last displayed iteration.
 * @param {{step: number, restartBefore: number, restartAfter: number,
 *   firstRestartBefore: number, firstRestartAfter: number}} timing
 *   Hold durations and milliseconds per iteration.
 * @param {number} [explanationStep] First averaged restart to explain.
 * @returns {{duration: number, sample: (elapsed: number) => TimelineSample}}
 *   Duration includes restart holds but excludes the final hold. Sample accepts
 *   nonnegative presentation time and returns iteration time, final-hold time,
 *   and the active restart (or null). The caller handles looping.
 */
export function createTheoryTimeline(
  restartSteps,
  displaySteps,
  timing,
  explanationStep = restartSteps[0],
) {
  const restarts = restartSteps.filter((k) => k > 0 && k <= displaySteps);
  const hold = timing.restartBefore + timing.restartAfter;
  const firstHold = timing.firstRestartBefore + timing.firstRestartAfter;
  const duration =
    displaySteps * timing.step +
    restarts.reduce(
      (total, step) => total + (step === explanationStep ? firstHold : hold),
      0,
    );
  /** @param {number} elapsed @returns {TimelineSample} */
  function sample(elapsed) {
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
