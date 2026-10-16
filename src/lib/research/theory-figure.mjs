// @ts-check
import { createTheoryTimeline } from './theory-timeline.mjs';
import {
  createTheoryRenderer,
  DISPLAY_STEPS,
  TIMING,
} from './theory-renderer.mjs';
/**
 * Load trajectory data and connect playback to visibility and reduced motion.
 * Call once per figure, with data-source, canvas, and .error present.
 * Loading failures are displayed inside the figure.
 *
 * @param {HTMLElement} root Figure container.
 * @param {Window & typeof globalThis} browser Owning browser window.
 * @returns {Promise<void>} Resolves after setup or a displayed load error.
 */
export async function initializeTheoryFigure(root, browser) {
  const { document } = browser;
  try {
    // The Astro component owns this markup and always supplies these elements.
    const source = /** @type {string} */ (root.dataset.source);
    const response = await browser.fetch(source);
    if (!response.ok) {
      throw new Error(`Trajectory data request failed: ${response.status}`);
    }
    /** @type {{rows: import('./pdhg-curves.mjs').ComparisonRow[]}} */
    const { rows } = await response.json();
    const canvas = /** @type {HTMLCanvasElement} */ (
      root.querySelector('canvas')
    );
    const render = createTheoryRenderer(
      canvas,
      rows,
      browser.getComputedStyle(root),
    );
    const timeline = createTheoryTimeline(
      rows
        .filter((row) => row.preRestart || row.preHalpern)
        .map((row) => row.k),
      DISPLAY_STEPS,
      TIMING,
      rows.find((row) => row.preRestart)?.k,
    );
    const duration = timeline.duration;
    const cycleDuration = duration + TIMING.endHold;
    const reducedMotion = browser.matchMedia(
      '(prefers-reduced-motion: reduce)',
    );
    let visible = false;
    let animationFrame = 0;
    let time = reducedMotion.matches ? duration : 0;
    let previousTime = 0;
    function draw() {
      render({
        ...timeline.sample(time),
        reduceMotion: reducedMotion.matches,
        pixelRatio: browser.devicePixelRatio || 1,
      });
    }
    new browser.ResizeObserver(draw).observe(canvas);
    function schedulePlayback() {
      browser.cancelAnimationFrame(animationFrame);
      previousTime = 0;
      if (visible && !reducedMotion.matches && !document.hidden) {
        animationFrame = browser.requestAnimationFrame(frame);
      }
    }
    function updatePlayback() {
      if (reducedMotion.matches) {
        time = duration;
      }
      draw();
      schedulePlayback();
    }
    function frame(/** @type {number} */ timestamp) {
      const delta = previousTime ? Math.min(80, timestamp - previousTime) : 0;
      previousTime = timestamp;
      time += delta;
      if (time >= cycleDuration) {
        time %= cycleDuration;
      }
      draw();
      animationFrame = browser.requestAnimationFrame(frame);
    }

    reducedMotion.addEventListener('change', updatePlayback);
    new browser.IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      schedulePlayback();
    }).observe(canvas);
    document.addEventListener('visibilitychange', schedulePlayback);
    updatePlayback();
  } catch (e) {
    const errorMessage = /** @type {HTMLElement} */ (
      root.querySelector('.error')
    );
    errorMessage.hidden = false;
    errorMessage.textContent =
      'The animation could not load. Please refresh the page.';
    browser.console.error(e);
  }
}
