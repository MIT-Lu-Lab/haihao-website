import assert from 'node:assert/strict';
import test from 'node:test';
import { createTheoryTimeline } from '../src/lib/research/theory-timeline.mjs';
import { TIMING, DISPLAY_STEPS } from '../src/lib/research/theory-renderer.mjs';

const timeline = createTheoryTimeline(
  [25, 50, 75, 100, 125, 150],
  DISPLAY_STEPS,
  TIMING,
);

// Golden values from TIMING: 900 + 1300 ms for the first restart,
// then 750 + 800 ms twice, totaling 5300 ms. Keep expectations independent
// of the timeline calculation so changes to the intended timing are explicit.

test('timeline freezes on both sides of each reset', () => {
  let previousHolds = 0;
  for (const [index, step] of [25, 50, 75].entries()) {
    const before = index === 0 ? 900 : 750;
    const duration = index === 0 ? 2200 : 1550;
    const start = step * TIMING.step + previousHolds;
    assert.equal(timeline.sample(start - 1).time, step * TIMING.step - 1);
    for (const elapsed of [0, before - 1, before, duration - 1]) {
      assert.deepEqual(timeline.sample(start + elapsed), {
        time: step * TIMING.step,
        endHold: 0,
        restart: {
          step,
          phase: elapsed < before ? 'before' : 'after',
          elapsed,
          duration,
          explain: index === 0,
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
  assert.equal(timeline.duration, DISPLAY_STEPS * TIMING.step + 5300);
  assert.deepEqual(timeline.sample(timeline.duration), {
    time: DISPLAY_STEPS * TIMING.step,
    endHold: 0,
    restart: null,
  });
  assert.equal(timeline.sample(timeline.duration + 2399).endHold, 2399);
});
