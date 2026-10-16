import { createPlayback, type PlaybackBrowser } from './playback.ts';
import { smoothstep } from './easing.ts';

const TIMING = {
  baselineHold: 2400,
  toModerate: 1800,
  moderateHold: 4600,
  toStrong: 1400,
  strongHold: 6000,
  toBaseline: 1400,
};
const MODERATE_START = TIMING.baselineHold + TIMING.toModerate;
const MODERATE_END = MODERATE_START + TIMING.moderateHold;
const STRONG_START = MODERATE_END + TIMING.toStrong;
const STRONG_END = STRONG_START + TIMING.strongHold;
export const PROPERTY_CYCLE_MS = STRONG_END + TIMING.toBaseline;
const STATE_IDS = ['baseline', 'moderate', 'strong'] as const;
type StateValues = [number, number, number];
type PixelPoint = readonly [number, number];
type PropertyCurves = readonly (readonly PixelPoint[])[];
type PropertyFocus = { index: number; ratios: readonly number[] };
const METRIC_KEYS = ['prd', 'prb', 'priceR2'] as const;
type MetricKey = (typeof METRIC_KEYS)[number];
type PropertyMetrics = readonly Record<MetricKey, number>[];

export interface PropertyData {
  curves: PropertyCurves;
  focus: PropertyFocus;
  metrics: PropertyMetrics;
  penalties: readonly number[];
}

const ARROW = { pointGap: 6, headSize: 4, fadeDistance: 8 };

/** Use identical pointer geometry in the static SVG and animation. */
export function getPropertyArrow(x: number, baselineY: number, y: number) {
  const start = baselineY + ARROW.pointGap;
  const end = Math.max(start, y - ARROW.pointGap);
  const length = end - start;
  const head = Math.min(ARROW.headSize, length / 2);
  return {
    arrow:
      `M${x} ${start}V${end}` +
      `M${x - head} ${end - head}L${x} ${end}` +
      `L${x + head} ${end - head}`,
    arrowOpacity: smoothstep(length / ARROW.fadeDistance),
  };
}

/** One visual transition clock; all three fitted endpoints remain exact. */
export function getPropertyPhase(elapsed: number, reducedMotion = false) {
  const t =
    ((elapsed % PROPERTY_CYCLE_MS) + PROPERTY_CYCLE_MS) % PROPERTY_CYCLE_MS;
  let weights: StateValues;
  let activeIndex = 0;

  if (reducedMotion) {
    weights = [0, 1, 0];
    activeIndex = 1;
  } else if (t < TIMING.baselineHold) {
    weights = [1, 0, 0];
  } else if (t < MODERATE_START) {
    const progress = smoothstep((t - TIMING.baselineHold) / TIMING.toModerate);
    weights = [1 - progress, progress, 0];
    activeIndex = 1;
  } else if (t < MODERATE_END) {
    weights = [0, 1, 0];
    activeIndex = 1;
  } else if (t < STRONG_START) {
    const progress = smoothstep((t - MODERATE_END) / TIMING.toStrong);
    weights = [0, 1 - progress, progress];
    activeIndex = 2;
  } else if (t < STRONG_END) {
    weights = [0, 0, 1];
    activeIndex = 2;
  } else {
    const progress = smoothstep((t - STRONG_END) / TIMING.toBaseline);
    weights = [progress, 0, 1 - progress];
  }
  return {
    weights,
    active: STATE_IDS[activeIndex],
    mode: activeIndex === 0 ? 'baseline' : 'penalized',
  };
}

const path = (points: readonly PixelPoint[]) =>
  `M${points.map(([x, y]) => `${x} ${y}`).join('L')}`;

/** Interpolate between measured fits while retaining price coordinates. */
export function getPropertyPaths(curves: PropertyCurves, weights: StateValues) {
  const points: PixelPoint[] = curves[0].map(([x], index) => [
    x,
    curves.reduce(
      (sum, curve, state) => sum + curve[index][1] * weights[state],
      0,
    ),
  ]);
  return {
    curve: path(points),
    difference: `${path([...curves[0], ...points.slice().reverse()])}Z`,
  };
}

/** Keep the focus percentage and pointer on the moving curve. */
export function getPropertyFocus(
  curves: PropertyCurves,
  focus: PropertyFocus,
  weights: StateValues,
) {
  const x = curves[0][focus.index][0];
  const y = curves.reduce(
    (sum, curve, state) => sum + curve[focus.index][1] * weights[state],
    0,
  );
  const ratio = focus.ratios.reduce(
    (sum, value, state) => sum + value * weights[state],
    0,
  );
  return {
    x,
    y,
    ratio,
    value: `${Math.round(ratio * 100)}%`,
    ...getPropertyArrow(x, curves[0][focus.index][1], y),
  };
}

/** Intermediate values show transitions, not additional fitted results. */
export function getPropertyMetrics(
  metrics: PropertyMetrics,
  weights: StateValues,
) {
  return Object.fromEntries(
    METRIC_KEYS.map((key) => {
      const value = metrics.reduce(
        (sum, metric, state) => sum + metric[key] * weights[state],
        0,
      );
      return [
        key,
        key === 'prb'
          ? `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(3)}`
          : value.toFixed(3),
      ];
    }),
  ) as Record<MetricKey, string>;
}

/** Initialize one figure from the data serialized by PropertyFigure. */
export function initializePropertyFigure(
  root: HTMLElement,
  data: PropertyData,
  browser: PlaybackBrowser,
) {
  const { curves, focus, metrics, penalties } = data;

  function requireElement(selector: string): Element {
    const element = root.querySelector(selector);
    if (!element) {
      throw new Error(`PropertyFigure is missing ${selector}.`);
    }
    return element;
  }
  const liveCurve = requireElement('[data-property-live-curve]');
  const liveDifference = requireElement('[data-property-live-difference]');
  const focusValue = requireElement('[data-property-focus-value]');
  const focusArrow = requireElement('[data-property-focus-arrow]');
  const focusPoint = requireElement('[data-property-focus-point]');
  const penaltyValue = requireElement('[data-property-penalty-value]');
  const metricElements = METRIC_KEYS.map((key) => ({
    key,
    element: requireElement(`[data-property-metric="${key}"]`),
  }));

  return createPlayback(root, browser, (elapsed, reduced) => {
    const phase = getPropertyPhase(elapsed, reduced);
    root.setAttribute('data-property-mode', phase.mode);
    const paths = getPropertyPaths(curves, phase.weights);
    liveCurve.setAttribute('d', paths.curve);
    liveDifference.setAttribute('d', paths.difference);
    liveCurve.setAttribute('opacity', String(1 - phase.weights[0]));
    liveDifference.setAttribute('opacity', String(1 - phase.weights[0]));
    const penalty = String(penalties[STATE_IDS.indexOf(phase.active)]);
    if (penaltyValue.textContent !== penalty) {
      penaltyValue.textContent = penalty;
    }
    const currentFocus = getPropertyFocus(curves, focus, phase.weights);
    if (focusValue.textContent !== currentFocus.value) {
      focusValue.textContent = currentFocus.value;
    }
    focusPoint.setAttribute('cy', String(currentFocus.y));
    focusArrow.setAttribute('d', currentFocus.arrow);
    focusArrow.setAttribute('opacity', String(currentFocus.arrowOpacity));
    const currentMetrics = getPropertyMetrics(metrics, phase.weights);
    for (const { element, key } of metricElements) {
      if (element.textContent !== currentMetrics[key]) {
        element.textContent = currentMetrics[key];
      }
    }
  });
}
