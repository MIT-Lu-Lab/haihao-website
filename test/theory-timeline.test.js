import assert from 'node:assert/strict';
import test from 'node:test';
import { createTheoryTimeline } from '../src/lib/research/theory-timeline.mjs';
import { TIMING, DISPLAY_STEPS } from '../src/lib/research/theory-renderer.mjs';

const timeline = createTheoryTimeline(
  [14, 25, 28, 42, 50, 56, 70, 75, 84, 98],
  DISPLAY_STEPS,
  TIMING,
  25,
);

// Six independent events; only green at 25 has the longer Average hold.

test('only the first averaged reset pauses playback', () => {
  let previousHolds = 0;
  for (const step of [14, 25, 28, 42, 50, 56]) {
    const before = step === 25 ? 900 : 0;
    const duration = step === 25 ? 2200 : 0;
    const start = step * TIMING.step + previousHolds;
    assert.equal(timeline.sample(start - 1).time, step * TIMING.step - 1);
    for (const elapsed of duration
      ? [0, before - 1, before, duration - 1]
      : []) {
      assert.deepEqual(timeline.sample(start + elapsed), {
        time: step * TIMING.step,
        endHold: 0,
        restart: {
          step,
          phase: elapsed < before ? 'before' : 'after',
          elapsed,
          duration,
          explain: step === 25,
        },
      });
    }
    assert.equal(timeline.sample(start + duration).restart, null);
    assert.equal(
      timeline.sample(start + duration + 1).time,
      step * TIMING.step + 1,
    );
    previousHolds += duration;
  }
});

test('explanation holds preserve iterations and the full final hold', () => {
  assert.equal(timeline.duration, DISPLAY_STEPS * TIMING.step + 2200);
  assert.deepEqual(timeline.sample(timeline.duration), {
    time: DISPLAY_STEPS * TIMING.step,
    endHold: 0,
    restart: null,
  });
  assert.equal(timeline.sample(timeline.duration + 2399).endHold, 2399);
});

test('a reset at the final displayed step finishes before the end hold', () => {
  const finalReset = createTheoryTimeline([25], 25, TIMING, 25);
  const boundary = 25 * TIMING.step;
  assert.equal(finalReset.sample(boundary).restart.phase, 'before');
  assert.equal(
    finalReset.sample(boundary + TIMING.firstRestartBefore).restart.phase,
    'after',
  );
  assert.equal(finalReset.sample(finalReset.duration - 1).endHold, 0);
  assert.deepEqual(finalReset.sample(finalReset.duration), {
    time: boundary,
    endHold: 0,
    restart: null,
  });
  assert.equal(finalReset.sample(finalReset.duration + 1).endHold, 1);
});
