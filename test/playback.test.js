import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlayback } from '../src/lib/research/playback.ts';
import { createFakeBrowser } from './helpers/fake-browser.js';

function setup(options) {
  const fake = createFakeBrowser();
  const draws = [];
  const target = {};
  const playback = createPlayback(
    target,
    fake.browser,
    (elapsed, reduced) => draws.push({ elapsed, reduced }),
    options,
  );
  assert.equal(fake.observers[0].target, target);
  return { ...fake, playback, draws };
}

test('frame caps precede rate; timestamp zero is valid', () => {
  const { events, frames, tick, draws } = setup({
    rate: 0.8,
    maxFrameDelta: 80,
  });
  assert.deepEqual(draws, [{ elapsed: 0, reduced: false }]);
  assert.equal(frames.size, 0);
  events.visible([{ isIntersecting: true }]);
  events.visible([{ isIntersecting: true }]);
  tick(0);
  tick(1000);
  assert.equal(draws.at(-1).elapsed, 64);
  tick(1020);
  assert.equal(draws.at(-1).elapsed, 80);
});

test('the latest visibility record determines whether playback runs', () => {
  const { events, frames } = setup();
  events.visible([{ isIntersecting: true }, { isIntersecting: false }]);
  assert.equal(frames.size, 0);
  events.visible([{ isIntersecting: false }, { isIntersecting: true }]);
  assert.equal(frames.size, 1);
});

test('hidden and offscreen intervals never advance the playback clock', () => {
  const { events, document, frames, tick, draws } = setup();
  events.visible([{ isIntersecting: true }]);
  tick(0);
  tick(100);
  document.hidden = true;
  events.hidden();
  assert.equal(frames.size, 0);
  document.hidden = false;
  events.hidden();
  tick(10000);
  assert.equal(draws.at(-1).elapsed, 100);
  events.visible([{ isIntersecting: false }]);
  assert.equal(frames.size, 0);
  events.visible([{ isIntersecting: true }]);
  tick(20000);
  assert.equal(draws.at(-1).elapsed, 100);
  tick(20020);
  assert.equal(draws.at(-1).elapsed, 120);
});

for (const reducedTime of [undefined, 500]) {
  test(`reduced motion preserves or selects time: ${reducedTime}`, () => {
    const { events, motion, frames, tick, draws } = setup({ reducedTime });
    events.visible([{ isIntersecting: true }]);
    tick(0);
    tick(100);
    motion.matches = true;
    events.motion();
    const expected = reducedTime ?? 100;
    assert.deepEqual(draws.at(-1), { elapsed: expected, reduced: true });
    assert.equal(frames.size, 0);
    motion.matches = false;
    events.motion();
    tick(10000);
    assert.deepEqual(draws.at(-1), { elapsed: expected, reduced: false });
  });
}

test('dispose releases frames, observers and listeners', () => {
  const {
    playback,
    events,
    frames,
    observers,
    draws,
    motionListeners,
    visibilityListeners,
  } = setup();
  events.visible([{ isIntersecting: true }]);
  const pending = frames.values().next().value;
  playback.dispose();
  const drawCount = draws.length;
  playback.redraw();
  pending(1000);
  events.visible([{ isIntersecting: true }]);
  events.hidden();
  events.motion();
  assert.equal(frames.size, 0);
  assert.equal(draws.length, drawCount);
  assert.equal(observers[0].active, false);
  assert.equal(motionListeners.size, 0);
  assert.equal(visibilityListeners.size, 0);
});

test('controllers have independent clocks and disposal', () => {
  const fake = createFakeBrowser();
  const first = [];
  const second = [];
  const one = createPlayback({}, fake.browser, (t) => first.push(t));
  const two = createPlayback({}, fake.browser, (t) => second.push(t), {
    rate: 2,
  });
  fake.events.visible([{ isIntersecting: true }]);
  for (const timestamp of [0, 100]) {
    for (const [id, callback] of [...fake.frames]) {
      fake.frames.delete(id);
      callback(timestamp);
    }
  }
  assert.equal(first.at(-1), 100);
  assert.equal(second.at(-1), 200);
  one.dispose();
  assert.equal(fake.frames.size, 1);
  fake.tick(150);
  assert.equal(first.at(-1), 100);
  assert.equal(second.at(-1), 300);
  two.dispose();
  assert.equal(fake.frames.size, 0);
});
