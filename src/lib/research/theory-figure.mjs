import {
  createTheoryRenderer,
  DISPLAY_STEPS,
  TIMING,
} from './theory-renderer.mjs';
/**
 * Load trajectory data and connect playback to visibility and reduced motion.
 * Call once per figure. The root provides data-source, canvas, button, and .error.
 * Loading failures are displayed inside the figure.
 *
 * @param {HTMLElement} root Figure container.
 * @param {Window} browser Owning window; tests supply the browser APIs used here.
 * @returns {Promise<void>} Resolves after setup or after displaying a load error.
 */
export async function initializeTheoryFigure(root, browser) {
  const { document } = browser;
  try {
    const response = await browser.fetch(root.dataset.source);
    if (!response.ok) {
      throw new Error(`Trajectory data request failed: ${response.status}`);
    }
    const { rows } = await response.json();
    const canvas = root.querySelector('canvas');
    const render = createTheoryRenderer(
      canvas,
      rows,
      browser.getComputedStyle(root),
    );
    const duration = DISPLAY_STEPS * TIMING.step;
    const reducedMotion = browser.matchMedia(
      '(prefers-reduced-motion: reduce)',
    );
    const pauseButton = root.querySelector('button');
    let visible = false;
    let paused = false;
    let animationFrame;
    let time = reducedMotion.matches ? duration : 0;
    let previousTime = 0;
    let endHold = 0;
    function draw() {
      render({
        time,
        endHold,
        reduceMotion: reducedMotion.matches,
        pixelRatio: browser.devicePixelRatio || 1,
      });
    }
    new browser.ResizeObserver(draw).observe(canvas);
    function schedulePlayback() {
      browser.cancelAnimationFrame(animationFrame);
      previousTime = 0;
      if (visible && !paused && !reducedMotion.matches && !document.hidden) {
        animationFrame = browser.requestAnimationFrame(frame);
      }
    }
    function updatePlayback() {
      if (reducedMotion.matches) {
        time = duration;
        endHold = 0;
      }
      pauseButton.disabled = reducedMotion.matches;
      pauseButton.textContent = paused ? 'Play animation' : 'Pause animation';
      draw();
      schedulePlayback();
    }
    function frame(timestamp) {
      const delta = previousTime ? Math.min(80, timestamp - previousTime) : 0;
      previousTime = timestamp;
      const nextTime = time + delta;
      time = Math.min(duration, nextTime);
      if (time >= duration) {
        // Only the part of this frame after the last iterate belongs to the hold.
        endHold += nextTime - duration;
        if (endHold >= TIMING.endHold) {
          time = 0;
          endHold = 0;
        }
      }
      draw();
      animationFrame = browser.requestAnimationFrame(frame);
    }

    pauseButton.addEventListener('click', () => {
      paused = !paused;
      updatePlayback();
    });
    reducedMotion.addEventListener('change', updatePlayback);
    new browser.IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      schedulePlayback();
    }).observe(canvas);
    document.addEventListener('visibilitychange', schedulePlayback);
    updatePlayback();
  } catch (e) {
    const errorMessage = root.querySelector('.error');
    errorMessage.hidden = false;
    errorMessage.textContent =
      'The animation could not load. Please refresh the page.';
    browser.console.error(e);
  }
}
