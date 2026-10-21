import { createFakeBrowser } from './helpers/fake-browser.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as gpuAnimation from '../src/lib/research/gpu-matrix-animation.ts';

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
          if (name === 'transform') {
            assert.match(value, /^translate\([-\d.]+ [-\d.]+\)$/);
          } else if (name === 'stroke-dasharray') {
            assert.equal(value, '1 1');
          } else {
            assert.ok(Number.isFinite(Number(value)), `${name}: ${value}`);
          }
          this.attributes[name] = value;
        },
        hasAttribute(name) {
          return name === 'data-flow-output' && selector.startsWith('output-');
        },
        querySelectorAll(query) {
          if (query === ':scope > g') {
            return [
              element(`${selector}-input`),
              element(selector.includes('"at"') ? 'output-at' : 'output-a'),
            ];
          }
          if (query === 'path') return [element(`${selector}-path`)];
          return [element('pulse')];
        },
      });
    }
    return elements.get(selector);
  };
  const root = {
    querySelector: element,
    querySelectorAll: (selector) => {
      if (selector === '[data-flow-output]') {
        return [element('output-a'), element('output-at')];
      }
      const key = {
        '[data-x]': 'x',
        '[data-a]': 'a',
        '[data-y]': 'y',
        '[data-at]': 'at',
      }[selector];
      assert.ok(key, `Unexpected selector: ${selector}`);
      return products.frames[0][key].map((_, index) =>
        element(`${key}-${index}`),
      );
    },
  };
  const {
    browser,
    events: callbacks,
    frames,
    motion,
    document,
    tick,
  } = createFakeBrowser();
  gpuAnimation.initializeGpuFigure(root, products, browser);
  assert.equal(frames.size, 0);
  callbacks.visible([{ isIntersecting: true }]);
  callbacks.visible([{ isIntersecting: true }]);
  assert.equal(frames.size, 1);
  const down = element('[data-matrix-scan="down"]').attributes;
  const right = element('[data-matrix-scan="right"]').attributes;
  tick(0);
  assert.equal(down.y, '115');
  assert.equal(right.x, '37');
  tick(1475);
  assert.equal(down.opacity, '1');
  assert.equal(right.opacity, '0');
  assert.ok(Math.abs(Number(down.y) - 250) < 1e-9);
  assert.equal(element('output-a').attributes.opacity, '0');
  assert.equal(element('[data-vector="a"] text').attributes.opacity, '0');
  tick(1950);
  assert.equal(down.opacity, '0');
  assert.equal(right.opacity, '0');
  assert.equal(down.y, '385');
  assert.equal(right.x, '515');
  assert.equal(element('output-a').attributes.opacity, '0');
  tick(2300);
  assert.equal(element('output-a').attributes.opacity, '1');
  assert.ok(Number(element('[data-vector="a"] text').attributes.opacity) > 0);
  tick(6075);
  assert.equal(down.opacity, '0');
  assert.equal(right.opacity, '1');
  assert.ok(Math.abs(Number(right.x) - 276) < 1e-9);
  assert.equal(element('output-at').attributes.opacity, '0');
  assert.equal(element('[data-vector="at"] text').attributes.opacity, '0');
  motion.matches = true;
  callbacks.motion();
  assert.equal(down.opacity, '0');
  assert.equal(right.opacity, '0');
  assert.equal(frames.size, 0);
  motion.matches = false;
  callbacks.motion();
  tick(6075);
  for (const timestamp of [9400, 10675]) {
    tick(timestamp);
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
    '[data-matrix-scan="down"]',
    '[data-matrix-scan="right"]',
    'output-a',
    'output-at',
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

test('missing GPU markup reports the component contract error', () => {
  const part = {
    setAttribute() {},
    querySelectorAll: () => [],
  };
  const root = {
    querySelector: (selector) => (selector === '[data-gpu-bus]' ? null : part),
    querySelectorAll: () => [],
  };
  assert.throws(
    () =>
      gpuAnimation.initializeGpuFigure(
        root,
        products,
        createFakeBrowser().browser,
      ),
    /GpuFigure is missing \[data-gpu-bus\]/,
  );
});
