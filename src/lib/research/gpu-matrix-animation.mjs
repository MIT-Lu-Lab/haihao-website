// @ts-check

/** @typedef {'x' | 'a' | 'y' | 'at'} VectorKey */
/**
 * @typedef {Object} MatrixProducts
 * @property {Record<VectorKey, number>} maxRms
 * @property {Array<Record<VectorKey, number[]> & {iteration: number}>} frames
 */
/**
 * @typedef {Object} VectorLayout
 * @property {VectorKey} key
 * @property {0 | 1} phase Multiplication phase: Ax or transpose product.
 * @property {number} delay Fade-in delay in seconds.
 * @property {'height' | 'width'} dimension
 * @property {'x' | 'y'} [edge] Coordinate of the input's moving edge.
 * @property {number} [anchor] Fixed matrix-facing edge in SVG units.
 */

const PHRASE_DURATION = 4600;
const CYCLE_DURATION = 2 * PHRASE_DURATION;
// Envelope and hardware timings are in seconds within each phrase.
const ENVELOPE = { fadeDuration: 0.6, fadeOutStart: 3.65, arrowsStart: 0.75 };
const LIGHTS = {
  start: 0.75,
  riseDuration: 1,
  fadeOutStart: 2.5,
  fadeOutDuration: 1.5,
  indicatorOpacity: 0.85,
  chipOpacity: 0.9,
};
const BUS_PULSE = {
  start: 1,
  duration: 1.65,
  fadeInFraction: 0.18,
  fadeOutStart: 0.78,
  fadeOutFraction: 0.22,
  opacity: 0.85,
  initialOffset: 18,
  travelDistance: 136,
};
const BAR = { minimumSize: 3, sizeRange: 21, minimumOpacity: 0.25, logGain: 9 };
/** @type {VectorLayout[]} */
const VECTOR_LAYOUT = [
  { key: 'x', phase: 0, delay: 0, dimension: 'height', edge: 'y', anchor: 135 },
  { key: 'a', phase: 0, delay: 1.35, dimension: 'width' },
  { key: 'y', phase: 1, delay: 0, dimension: 'width', edge: 'x', anchor: 69 },
  { key: 'at', phase: 1, delay: 1.35, dimension: 'height' },
];

/** @param {number} value */
function smooth(value) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

/** @param {Element} element @param {number} value */
function setOpacity(element, value) {
  element.setAttribute('opacity', String(value));
}

/**
 * Animate matrix products and the matching hardware lights on one clock.
 * Call once per GPU composition; its component owns the required SVG markup.
 * @param {HTMLElement} root
 * @param {MatrixProducts} products
 * @param {Window & typeof globalThis} browser
 * @returns {void}
 */
export function initializeGpuAnimation(root, products, browser) {
  const { document } = browser;
  const vectors = VECTOR_LAYOUT.map((layout) => ({
    ...layout,
    bars: root.querySelectorAll(`[data-${layout.key}]`),
    label: /** @type {SVGTextElement} */ (
      root.querySelector(`[data-vector="${layout.key}"] text`)
    ),
  }));
  const flowA = /** @type {SVGGElement} */ (
    root.querySelector('[data-flow="a"]')
  );
  const flowAT = /** @type {SVGGElement} */ (
    root.querySelector('[data-flow="at"]')
  );
  const indicators = /** @type {SVGGElement} */ (
    root.querySelector('[data-gpu-lights]')
  );
  const chips = /** @type {SVGGElement} */ (
    root.querySelector('[data-gpu-chips]')
  );
  const bus = /** @type {SVGGElement} */ (root.querySelector('[data-gpu-bus]'));
  const pulses = bus.querySelectorAll('[data-bus-pulse]');
  const reducedMotion = browser.matchMedia('(prefers-reduced-motion: reduce)');
  let visible = false;
  let previousTime = 0;
  let elapsed = 0;
  let animationFrame = 0;

  function render() {
    const index = Math.floor(elapsed / CYCLE_DURATION) % products.frames.length;
    const frame = products.frames[index];
    const phase = Math.floor((elapsed % CYCLE_DURATION) / PHRASE_DURATION);
    const seconds = (elapsed % PHRASE_DURATION) / 1000;
    // Each phrase ends with a fade, then 0.35 seconds of empty space.
    const envelope = (/** @type {number} */ start) =>
      smooth((seconds - start) / ENVELOPE.fadeDuration) *
      (1 - smooth((seconds - ENVELOPE.fadeOutStart) / ENVELOPE.fadeDuration));

    for (const vector of vectors) {
      const gain = reducedMotion.matches
        ? 1
        : vector.phase === phase
          ? envelope(vector.delay)
          : 0;
      setOpacity(vector.label, gain);
      vector.bars.forEach((bar, index) => {
        const value = frame[vector.key][index];
        const magnitude =
          Math.log1p((BAR.logGain * value) / products.maxRms[vector.key]) /
          Math.log1p(BAR.logGain);
        const size = BAR.minimumSize + BAR.sizeRange * magnitude;
        bar.setAttribute(vector.dimension, String(size));
        // Input vectors keep their matrix-facing edge fixed.
        if (vector.edge !== undefined && vector.anchor !== undefined) {
          bar.setAttribute(vector.edge, String(vector.anchor - size));
        }
        setOpacity(
          bar,
          (BAR.minimumOpacity + (1 - BAR.minimumOpacity) * magnitude) * gain,
        );
      });
    }

    const breath = reducedMotion.matches
      ? 0
      : smooth((seconds - LIGHTS.start) / LIGHTS.riseDuration) *
        (1 - smooth((seconds - LIGHTS.fadeOutStart) / LIGHTS.fadeOutDuration));
    setOpacity(indicators, LIGHTS.indicatorOpacity * breath);
    setOpacity(chips, LIGHTS.chipOpacity * breath);
    const travel = Math.max(
      0,
      Math.min(1, (seconds - BUS_PULSE.start) / BUS_PULSE.duration),
    );
    const busOpacity = reducedMotion.matches
      ? 0
      : smooth(travel / BUS_PULSE.fadeInFraction) *
        (1 -
          smooth(
            (travel - BUS_PULSE.fadeOutStart) / BUS_PULSE.fadeOutFraction,
          ));
    setOpacity(bus, BUS_PULSE.opacity * busOpacity);
    for (const pulse of pulses) {
      pulse.setAttribute(
        'stroke-dashoffset',
        String(BUS_PULSE.initialOffset - BUS_PULSE.travelDistance * travel),
      );
    }
    const arrows = envelope(ENVELOPE.arrowsStart);
    setOpacity(flowA, reducedMotion.matches || phase === 1 ? 0 : arrows);
    setOpacity(flowAT, reducedMotion.matches || phase === 0 ? 0 : arrows);
  }

  function draw(/** @type {number} */ timestamp) {
    if (previousTime) {
      elapsed += timestamp - previousTime;
    }
    previousTime = timestamp;
    render();
    animationFrame = browser.requestAnimationFrame(draw);
  }

  function schedule() {
    browser.cancelAnimationFrame(animationFrame);
    previousTime = 0;
    render();
    if (visible && !document.hidden && !reducedMotion.matches) {
      animationFrame = browser.requestAnimationFrame(draw);
    }
  }

  new browser.IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    schedule();
  }).observe(root);
  reducedMotion.addEventListener('change', schedule);
  document.addEventListener('visibilitychange', schedule);
  render();
}
