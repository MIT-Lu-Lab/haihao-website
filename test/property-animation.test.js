import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  getPropertyPhase,
  getPropertyPaths,
  getPropertyFocus,
  getPropertyArrow,
  getPropertyMetrics,
  initializePropertyFigure,
  PROPERTY_CYCLE_MS,
} from '../src/lib/research/property-animation.ts';
import { createFakeBrowser } from './helpers/fake-browser.js';

const profiles = JSON.parse(
  fs.readFileSync(
    new URL('../data/research/property-profiles.json', import.meta.url),
  ),
).profiles;
const curves = profiles.map((profile) =>
  profile.points.map(({ salePrice, ratio }) => [
    100 * Math.log10(salePrice),
    600 - 200 * ratio,
  ]),
);
const focus = {
  index: 1,
  ratios: profiles.map((profile) => profile.points[1].ratio),
};
const metricKeys = ['prd', 'prb', 'priceR2'];
const metrics = profiles.map(({ prd, prb, priceR2 }) => ({
  prd,
  prb,
  priceR2,
}));
const parsePath = (value) =>
  value.replace(/[MLZ]/g, ' ').trim().split(/\s+/).map(Number);

test('saved profiles share finite price groups and complete metrics', () => {
  assert.deepEqual(
    profiles.map(({ id }) => id),
    ['baseline', 'moderate', 'strong'],
  );
  const prices = profiles[0].points.map(({ salePrice }) => salePrice);
  assert.equal(prices.length, 30);
  assert.ok(prices.includes(100000));
  for (const profile of profiles) {
    assert.deepEqual(
      profile.points.map(({ salePrice }) => salePrice),
      prices,
    );
    assert.ok(
      profile.points.every(
        ({ salePrice, ratio }) =>
          Number.isFinite(salePrice) && salePrice > 0 && Number.isFinite(ratio),
      ),
    );
    assert.ok(metricKeys.every((key) => Number.isFinite(profile[key])));
  }
});

test('measured settings hold and loop continuously', () => {
  for (const time of [0, 1200, 2400, PROPERTY_CYCLE_MS]) {
    assert.deepEqual(getPropertyPhase(time).weights, [1, 0, 0]);
  }
  for (const time of [4200, 6500, 8800]) {
    assert.deepEqual(getPropertyPhase(time).weights, [0, 1, 0]);
  }
  for (const time of [10200, 13000, 16200]) {
    assert.deepEqual(getPropertyPhase(time).weights, [0, 0, 1]);
  }
  for (const boundary of [0, 2400, 4200, 8800, 10200, 16200, 17600]) {
    const before = getPropertyPhase(boundary - 0.01);
    const after = getPropertyPhase(boundary + 0.01);
    before.weights.forEach((value, index) =>
      assert.ok(Math.abs(value - after.weights[index]) < 1e-7),
    );
  }
});

test('all points match measured endpoints and transition in order', () => {
  assert.equal(curves[0].length, 30);
  for (const [time, index] of [
    [0, 0],
    [4200, 1],
    [10200, 2],
    [17600, 0],
  ]) {
    const paths = getPropertyPaths(curves, getPropertyPhase(time).weights);
    assert.deepEqual(parsePath(paths.curve), curves[index].flat());
    assert.deepEqual(
      parsePath(paths.difference).slice(0, 60),
      curves[0].flat(),
    );
    assert.deepEqual(
      parsePath(paths.difference).slice(60),
      curves[index].slice().reverse().flat(),
    );
  }
  for (const [time, start, end] of [
    [3300, 0, 1],
    [9500, 1, 2],
    [16900, 2, 0],
  ]) {
    const points = parsePath(
      getPropertyPaths(curves, getPropertyPhase(time).weights).curve,
    );
    curves[0].forEach(([x], index) => {
      assert.equal(points[2 * index], x);
      assert.equal(
        points[2 * index + 1],
        (curves[start][index][1] + curves[end][index][1]) / 2,
      );
    });
  }
});

test('convex transition weights remain bounded throughout the cycle', () => {
  for (let time = 0; time <= PROPERTY_CYCLE_MS * 2; time += 11) {
    const { weights } = getPropertyPhase(time);
    assert.ok(
      Math.abs(weights.reduce((sum, value) => sum + value, 0) - 1) < 1e-12,
    );
    for (const value of weights) {
      assert.ok(value >= 0 && value <= 1);
    }
  }
});

test('legend changes target at the start of each morph without fading', () => {
  for (const [time, active, mode] of [
    [0, 'baseline', 'baseline'],
    [2399, 'baseline', 'baseline'],
    [2400, 'moderate', 'penalized'],
    [8799, 'moderate', 'penalized'],
    [8800, 'strong', 'penalized'],
    [16199, 'strong', 'penalized'],
    [16200, 'baseline', 'baseline'],
  ]) {
    const phase = getPropertyPhase(time);
    assert.equal(phase.active, active);
    assert.equal(phase.mode, mode);
  }
});

test('reduced motion shows the measured moderate fit', () => {
  for (const time of [0, 3300, 9500, 13000, 17600, 40000]) {
    const phase = getPropertyPhase(time, true);
    assert.deepEqual(phase, {
      weights: [0, 1, 0],
      active: 'moderate',
      mode: 'penalized',
    });
    assert.deepEqual(
      parsePath(getPropertyPaths(curves, phase.weights).curve),
      curves[1].flat(),
    );
  }
});

test('metrics preserve endpoints and follow the transition weights', () => {
  const endpoints = [
    { prd: '1.069', prb: '−0.088', priceR2: '0.893' },
    { prd: '1.049', prb: '−0.045', priceR2: '0.897' },
    { prd: '1.010', prb: '+0.042', priceR2: '0.889' },
  ];
  for (const [time, index] of [
    [0, 0],
    [4200, 1],
    [10200, 2],
    [17600, 0],
  ]) {
    assert.deepEqual(
      getPropertyMetrics(metrics, getPropertyPhase(time).weights),
      endpoints[index],
    );
  }
  for (let time = 0; time <= PROPERTY_CYCLE_MS; time += 37) {
    const { weights } = getPropertyPhase(time);
    const display = getPropertyMetrics(metrics, weights);
    for (const key of metricKeys) {
      const expected = metrics.reduce(
        (sum, metric, index) => sum + metric[key] * weights[index],
        0,
      );
      const formatted =
        key === 'prb'
          ? `${expected < 0 ? '−' : '+'}${Math.abs(expected).toFixed(3)}`
          : expected.toFixed(3);
      assert.equal(display[key], formatted);
    }
    assert.equal(display.prb.length, 6);
    assert.match(display.prb, /^[−+]0\.\d{3}$/);
  }
});

test('focus percentage, point and arrow track the moving curve', () => {
  for (let time = 0; time <= PROPERTY_CYCLE_MS; time += 73) {
    const { weights } = getPropertyPhase(time);
    const current = getPropertyFocus(curves, focus, weights);
    const points = parsePath(getPropertyPaths(curves, weights).curve);
    assert.equal(current.x, points[2 * focus.index]);
    assert.equal(current.y, points[2 * focus.index + 1]);
    assert.ok(Math.abs(current.y - (600 - 200 * current.ratio)) < 1e-10);
    assert.equal(current.value, `${Math.round(current.ratio * 100)}%`);
    assert.ok(current.arrowOpacity >= 0 && current.arrowOpacity <= 1);
  }
  assert.equal(getPropertyFocus(curves, focus, [1, 0, 0]).value, '130%');
  assert.equal(getPropertyFocus(curves, focus, [0, 1, 0]).value, '118%');
  assert.equal(getPropertyFocus(curves, focus, [0, 0, 1]).value, '96%');
  assert.equal(getPropertyFocus(curves, focus, [1, 0, 0]).arrowOpacity, 0);
  let previousY = -Infinity;
  for (let time = 8800; time <= 10200; time += 20) {
    const current = getPropertyFocus(
      curves,
      focus,
      getPropertyPhase(time).weights,
    );
    assert.ok(current.y >= previousY);
    assert.equal(current.arrowOpacity, 1);
    assert.ok(current.arrow.includes(`V${current.y - 6}`));
    previousY = current.y;
  }
});

function makeElement(attributes = {}) {
  return {
    attributes: { ...attributes },
    style: {},
    getAttribute(name) {
      return this.attributes[name] ?? null;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

test('SVG paths, labels and metrics stay synchronized across loops', () => {
  const root = makeElement();
  const data = {
    curves,
    focus,
    metrics,
    penalties: profiles.map(({ nominalRho }) => nominalRho),
  };
  const metricElements = Object.fromEntries(
    metricKeys.map((key) => {
      const element = makeElement();
      let text = '';
      element.writes = 0;
      Object.defineProperty(element, 'textContent', {
        get: () => text,
        set: (value) => {
          text = value;
          element.writes++;
        },
      });
      return [key, element];
    }),
  );
  const liveCurve = makeElement();
  const difference = makeElement();
  const penaltyValue = makeElement();
  const focusValue = makeElement();
  const focusArrow = makeElement();
  const focusPoint = makeElement();
  let focusText = '118%';
  let focusWrites = 0;
  Object.defineProperty(focusValue, 'textContent', {
    get: () => focusText,
    set: (value) => {
      focusText = value;
      focusWrites++;
    },
  });
  let penaltyText = '1';
  let penaltyWrites = 0;
  Object.defineProperty(penaltyValue, 'textContent', {
    get: () => penaltyText,
    set: (value) => {
      penaltyText = value;
      penaltyWrites++;
    },
  });
  root.querySelector = (selector) =>
    ({
      '[data-property-live-curve]': liveCurve,
      '[data-property-live-difference]': difference,
      '[data-property-penalty-value]': penaltyValue,
      '[data-property-focus-value]': focusValue,
      '[data-property-focus-arrow]': focusArrow,
      '[data-property-focus-point]': focusPoint,
      '[data-property-metric="prd"]': metricElements.prd,
      '[data-property-metric="prb"]': metricElements.prb,
      '[data-property-metric="priceR2"]': metricElements.priceR2,
    })[selector];
  root.querySelectorAll = () =>
    assert.fail('No state groups or fading result spans remain.');
  const fake = createFakeBrowser();
  initializePropertyFigure(root, data, fake.browser);
  assert.equal(penaltyValue.textContent, '0');
  assert.equal(penaltyWrites, 1);
  fake.events.visible([{ isIntersecting: true }]);
  fake.tick(0);
  for (const time of [
    2800, 3500, 4200, 4500, 9200, 9800, 10500, 13000, 17000, 17600, 20900,
    22100,
  ]) {
    const previousText = penaltyValue.textContent;
    const previousWrites = penaltyWrites;
    const previousFocusText = focusValue.textContent;
    const previousFocusWrites = focusWrites;
    const previousMetrics = Object.fromEntries(
      metricKeys.map((key) => [
        key,
        {
          text: metricElements[key].textContent,
          writes: metricElements[key].writes,
        },
      ]),
    );
    fake.tick(time);
    const phase = getPropertyPhase(time);
    const expectedPenalty = { baseline: '0', moderate: '1', strong: '100' }[
      phase.active
    ];
    assert.equal(penaltyValue.textContent, expectedPenalty);
    assert.equal(
      penaltyWrites,
      previousWrites + Number(expectedPenalty !== previousText),
    );
    assert.deepEqual(penaltyValue.attributes, {});
    assert.deepEqual(penaltyValue.style, {});
    assert.equal(root.attributes['data-property-mode'], phase.mode);
    const paths = getPropertyPaths(curves, phase.weights);
    assert.equal(liveCurve.attributes.d, paths.curve);
    assert.equal(difference.attributes.d, paths.difference);
    assert.equal(Number(liveCurve.attributes.opacity), 1 - phase.weights[0]);
    assert.equal(Number(difference.attributes.opacity), 1 - phase.weights[0]);
    const currentFocus = getPropertyFocus(curves, focus, phase.weights);
    assert.equal(focusValue.textContent, currentFocus.value);
    assert.equal(
      focusWrites,
      previousFocusWrites + Number(currentFocus.value !== previousFocusText),
    );
    assert.equal(Number(focusPoint.attributes.cy), currentFocus.y);
    assert.equal(focusArrow.attributes.d, currentFocus.arrow);
    assert.deepEqual(focusValue.attributes, {});
    assert.deepEqual(focusValue.style, {});
    assert.equal(focusPoint.attributes.opacity, undefined);
    const currentMetrics = getPropertyMetrics(metrics, phase.weights);
    for (const key of metricKeys) {
      const element = metricElements[key];
      assert.equal(element.textContent, currentMetrics[key]);
      assert.equal(
        element.writes,
        previousMetrics[key].writes +
          Number(previousMetrics[key].text !== currentMetrics[key]),
      );
      assert.deepEqual(element.attributes, {});
      assert.deepEqual(element.style, {});
    }
  }
  data.penalties[1] = 2;
  fake.motion.matches = true;
  fake.events.motion();
  assert.equal(penaltyValue.textContent, '2');
  assert.equal(focusValue.textContent, '118%');
  assert.equal(metricElements.prd.textContent, '1.049');
  assert.equal(metricElements.prb.textContent, '−0.045');
  assert.equal(metricElements.priceR2.textContent, '0.897');
  assert.equal(fake.frames.size, 0);
});

test('static pointer and animated focus share geometry', () => {
  const current = getPropertyFocus(curves, focus, [0, 1, 0]);
  const arrow = getPropertyArrow(
    curves[0][focus.index][0],
    curves[0][focus.index][1],
    curves[1][focus.index][1],
  );
  assert.equal(current.arrow, arrow.arrow);
  assert.equal(current.arrowOpacity, arrow.arrowOpacity);
  assert.equal(getPropertyArrow(10, 20, 20).arrowOpacity, 0);
});
