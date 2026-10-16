import { createTheoryTimeline } from './theory-timeline.ts';
import {
  createTheoryRenderer,
  DISPLAY_STEPS,
  TIMING,
} from './theory-renderer.ts';
import type { ComparisonRow } from './pdhg-curves.ts';
import { createPlayback } from './playback.ts';

interface TheoryData {
  rows: ComparisonRow[];
}

/** Initialize one canvas after its trajectory data is available. */
export function initializeTheoryFigure(
  root: HTMLElement,
  data: TheoryData,
  browser: Window & typeof globalThis,
) {
  const canvas = root.querySelector('canvas');
  if (!canvas) {
    throw new Error('TheoryFigure requires a canvas.');
  }
  const { rows } = data;
  const render = createTheoryRenderer(
    canvas,
    rows,
    browser.getComputedStyle(root),
  );
  // Only the first averaged reset pauses, to explain restarting from a mean.
  const timeline = createTheoryTimeline(
    DISPLAY_STEPS,
    TIMING,
    rows.find((row) => row.preRestart)?.k,
  );
  const cycleDuration = timeline.duration + TIMING.endHold;
  const playback = createPlayback(
    canvas,
    browser,
    (elapsed, reduced) => {
      render({
        ...timeline.sample(elapsed % cycleDuration),
        reduceMotion: reduced,
        pixelRatio: browser.devicePixelRatio || 1,
      });
    },
    { maxFrameDelta: 80, reducedTime: timeline.duration },
  );
  const resize = new browser.ResizeObserver(playback.redraw);
  resize.observe(canvas);
  return {
    dispose() {
      resize.disconnect();
      playback.dispose();
    },
  };
}

/** Fetch the larger theory dataset, showing failures inside its figure. */
export async function loadTheoryFigure(
  root: HTMLElement,
  browser: Window & typeof globalThis,
) {
  try {
    const source = root.dataset.source;
    if (!source) {
      throw new Error('TheoryFigure requires data-source.');
    }
    const response = await browser.fetch(source);
    if (!response.ok) {
      throw new Error(`Trajectory data request failed: ${response.status}`);
    }
    const data: TheoryData = await response.json();
    return initializeTheoryFigure(root, data, browser);
  } catch (error) {
    const message = root.querySelector<HTMLElement>('.error');
    if (message) {
      message.hidden = false;
      message.textContent =
        'The animation could not load. Please refresh the page.';
    }
    browser.console.error(error);
  }
}
