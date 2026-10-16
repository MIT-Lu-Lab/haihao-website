import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as gpuAnimation from '../src/lib/research/gpu-matrix-animation.mjs';

const products = JSON.parse(
  fs.readFileSync(
    new URL('../data/research/rail4284-products.json', import.meta.url),
  ),
);

test('GPU playback respects visibility and reduced motion', () => {
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) {
      elements.set(selector, {
        attributes: {},
        setAttribute(name, value) {
          assert.ok(Number.isFinite(Number(value)), `${name}: ${value}`);
          this.attributes[name] = value;
        },
        querySelectorAll: () => [element('pulse')],
      });
    }
    return elements.get(selector);
  };
  const root = {
    querySelector: element,
    querySelectorAll: (selector) => {
      const key = selector.slice(6, -1);
      return products.frames[0][key].map((_, index) =>
        element(`${key}-${index}`),
      );
    },
  };
  const callbacks = {};
  const frames = new Map();
  let nextId = 0;
  const motion = {
    matches: false,
    addEventListener: (_, callback) => {
      callbacks.motion = callback;
    },
  };
  const document = {
    hidden: false,
    addEventListener: (_, callback) => {
      callbacks.hidden = callback;
    },
  };
  gpuAnimation.initializeGpuAnimation(root, products, {
    document,
    matchMedia: () => motion,
    IntersectionObserver: class {
      constructor(callback) {
        callbacks.visible = callback;
      }
      observe(target) {
        assert.equal(target, root);
      }
    },
    requestAnimationFrame(callback) {
      frames.set(++nextId, callback);
      return nextId;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  });
  assert.equal(frames.size, 0);
  callbacks.visible([{ isIntersecting: true }]);
  callbacks.visible([{ isIntersecting: true }]);
  assert.equal(frames.size, 1);
  for (const timestamp of [100, 1000, 5000, 9400, 19000]) {
    const [id, callback] = frames.entries().next().value;
    frames.delete(id);
    callback(timestamp);
    assert.equal(frames.size, 1);
  }
  callbacks.visible([{ isIntersecting: false }]);
  assert.equal(frames.size, 0);
  callbacks.visible([{ isIntersecting: true }]);
  document.hidden = true;
  callbacks.hidden();
  assert.equal(frames.size, 0);
  document.hidden = false;
  callbacks.hidden();
  assert.equal(frames.size, 1);
  motion.matches = true;
  callbacks.motion();
  assert.equal(frames.size, 0);
  for (const key of ['x', 'a', 'y', 'at']) {
    assert.equal(
      element(`[data-vector="${key}"] text`).attributes.opacity,
      '1',
    );
  }
  for (const selector of [
    '[data-gpu-lights]',
    '[data-gpu-chips]',
    '[data-gpu-bus]',
  ]) {
    assert.equal(element(selector).attributes.opacity, '0');
  }
  motion.matches = false;
  callbacks.motion();
  assert.equal(frames.size, 1);
});

test('saved GPU products have consistent bins and shared scales', () => {
  for (const [key, count] of Object.entries({ x: 96, a: 72, y: 72, at: 96 })) {
    for (const frame of products.frames) {
      assert.equal(frame[key].length, count);
      assert.ok(
        frame[key].every((value) => Number.isFinite(value) && value >= 0),
      );
    }
    assert.equal(
      products.maxRms[key],
      Math.max(...products.frames.flatMap((frame) => frame[key])),
    );
  }
});
