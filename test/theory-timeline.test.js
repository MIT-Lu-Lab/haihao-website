import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createTheoryTimeline } from '../src/lib/research/theory-timeline.ts';
import { DISPLAY_STEPS, TIMING } from '../src/lib/research/theory-renderer.ts';

test('shared progress reaches the high-accuracy comparison before looping', () => {
  const clock = createTheoryTimeline(DISPLAY_STEPS, TIMING);
  assert.equal(clock.duration, 22000);
  assert.equal(clock.sample(11000).time / TIMING.step, 110);
  assert.equal(clock.sample(20100).time / TIMING.step, 201);
  assert.deepEqual(clock.sample(22000), { time: 22000, endHold: 0 });
  assert.deepEqual(clock.sample(22150), { time: 22000, endHold: 150 });
});

test('both algorithms restart without a presentation pause', () => {
  const clock = createTheoryTimeline(DISPLAY_STEPS, TIMING);
  const { rows } = JSON.parse(
    fs.readFileSync(new URL('../public/pdhg-comparison.json', import.meta.url)),
  );
  const resets = rows.filter((row) => row.preRestart || row.preHalpern);
  assert.ok(resets.length > 0);
  for (const row of resets) {
    const boundary = row.k * TIMING.step;
    for (const elapsed of [boundary - 1, boundary, boundary + 1]) {
      if (elapsed > clock.duration) continue;
      assert.deepEqual(clock.sample(elapsed), { time: elapsed, endHold: 0 });
    }
  }
});
