import { createFakeBrowser } from './helpers/fake-browser.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  initializeTheoryFigure,
  loadTheoryFigure,
} from '../src/lib/research/theory-figure.ts';
import { DISPLAY_STEPS, TIMING } from '../src/lib/research/theory-renderer.ts';

test('load failure shows an error without starting playback', async () => {
  const errorMessage = { hidden: true, textContent: '' };
  let reportedError;
  await loadTheoryFigure(
    {
      dataset: { source: '/pdhg-comparison.json' },
      querySelector: () => errorMessage,
    },
    {
      document: {},
      fetch: async () => ({ ok: false, status: 503 }),
      requestAnimationFrame: () =>
        assert.fail('failed initialization scheduled a frame'),
      console: {
        error: (error) => {
          reportedError = error;
        },
      },
    },
  );
  assert.equal(errorMessage.hidden, false);
  assert.match(errorMessage.textContent, /could not load/);
  assert.match(reportedError.message, /503/);
});

for (const width of [345, 712]) {
  test(`visibility and reduced motion at ${width}px`, () => {
    const data = JSON.parse(
      fs.readFileSync(
        new URL('../public/pdhg-comparison.json', import.meta.url),
      ),
    );
    const {
      browser,
      frames,
      events,
      motion,
      document,
      observers,
      resizeObservers,
    } = createFakeBrowser();
    const context = {
      globalAlpha: 1,
      fillStyle: '#000',
      strokeStyle: '#000',
      lineWidth: 1,
      lineDashOffset: 0,
      lineCap: 'butt',
      lineJoin: 'miter',
      font: '10px sans-serif',
      textAlign: 'start',
    };
    const styleKeys = Object.keys(context);
    const savedStyles = [];
    let lineDash = [];
    // Model the styles used by this renderer, not canvas geometry or pixels.
    context.save = () => {
      savedStyles.push({
        styles: Object.fromEntries(styleKeys.map((key) => [key, context[key]])),
        lineDash: [...lineDash],
      });
    };
    context.restore = () => {
      assert.ok(savedStyles.length, 'restore must have a matching save');
      const saved = savedStyles.pop();
      Object.assign(context, saved.styles);
      lineDash = saved.lineDash;
    };
    context.setLineDash = (segments) => {
      assert.ok(segments.every(Number.isFinite));
      lineDash = [...segments];
    };
    context.measureText = (text) => ({
      width: text.length * Number.parseFloat(context.font) * 0.5,
    });
    let lastMarkerOpacity;
    let canvasWidth = width;
    const theme = {
      '--ink': '#26272b',
      '--muted': '#595b61',
      '--line': '#e5e3e0',
      '--surface': '#fff',
      '--soft': '#f8f7f5',
      '--sans': 'Arial, sans-serif',
      '--serif': 'Georgia, serif',
      '--pdhg': '#377aa5',
      '--restarted': '#168675',
      '--halpern': '#750014',
    };
    const drawingMethods = [
      'beginPath',
      'moveTo',
      'lineTo',
      'stroke',
      'fill',
      'arc',
      'roundRect',
      'closePath',
      'translate',
      'scale',
      'setTransform',
      'clearRect',
      'fillText',
      'strokeText',
    ];
    for (const method of drawingMethods) {
      context[method] = (...args) => {
        if (method === 'fill') {
          lastMarkerOpacity = context.globalAlpha;
        }
        for (const value of args) {
          if (typeof value === 'number') {
            assert.ok(Number.isFinite(value), `${method}: ${value}`);
          }
        }
      };
    }
    const canvas = {
      style: {},
      getContext: () => context,
      getBoundingClientRect: () => ({
        width: canvasWidth,
        height: (canvasWidth * (canvasWidth < 600 ? 1140 : 840)) / 1000,
      }),
    };
    const root = {
      dataset: { source: '/example-base/pdhg-comparison.json' },
      querySelector: (selector) => ({ canvas, '.error': {} })[selector],
    };
    const playback = initializeTheoryFigure(root, data, {
      ...browser,
      devicePixelRatio: 1,
      getComputedStyle: () => ({
        getPropertyValue: (name) => {
          assert.ok(name in theme, `Unknown theme variable: ${name}`);
          return theme[name];
        },
      }),
      console: {
        error: (error) => {
          throw error;
        },
      },
    });
    assert.equal(observers[0].target, canvas);
    assert.equal(resizeObservers[0].target, canvas);
    const visibility = (visible) =>
      events.visible([{ isIntersecting: visible }]);
    assert.equal(
      canvas.style.aspectRatio,
      undefined,
      'CSS owns the reserved aspect ratio',
    );
    assert.ok(context.font.endsWith(theme['--sans']));
    assert.equal(
      canvas.height,
      Math.round(width * (width < 600 ? 1.14 : 0.84)),
    );
    assert.equal(
      frames.size,
      0,
      'offscreen initialization must not schedule frames',
    );
    visibility(true);
    assert.equal(frames.size, 1);
    visibility(true);
    assert.equal(
      frames.size,
      1,
      'repeated notifications must not multiply loops',
    );
    const explanationStep = data.rows.find((row) => row.preRestart)?.k;
    const restartHolds =
      explanationStep !== undefined && explanationStep <= DISPLAY_STEPS
        ? TIMING.explanationBefore + TIMING.explanationAfter
        : 0;
    const cycleDuration =
      DISPLAY_STEPS * TIMING.step + restartHolds + TIMING.endHold;
    const frameInterval = 80;
    // The first callback establishes the clock without advancing time.
    const loopStartTick = Math.ceil(cycleDuration / frameInterval) + 1;
    const fadedInTick = loopStartTick + Math.ceil(TIMING.fade / frameInterval);
    for (let tick = 1; tick <= fadedInTick; tick++) {
      const [id, frame] = frames.entries().next().value;
      frames.delete(id);
      frame(tick * frameInterval);
      assert.equal(savedStyles.length, 0, 'each frame balances save/restore');
      assert.equal(context.globalAlpha, 1, 'frame opacity must be restored');
      assert.deepEqual(lineDash, [], 'frame must leave no active dash pattern');
      if (tick === loopStartTick - 1) {
        assert.ok(
          lastMarkerOpacity > 0,
          'the end hold must not finish one frame early',
        );
      }
      if (tick === loopStartTick) {
        assert.ok(
          lastMarkerOpacity < 0.1,
          'the next loop begins after the full end hold',
        );
      }
      if (tick === fadedInTick) {
        assert.equal(
          lastMarkerOpacity,
          1,
          'the next loop must become visible after its fade-in',
        );
      }
      assert.equal(
        frames.size,
        1,
        'a full animation cycle keeps exactly one pending frame',
      );
    }
    motion.matches = true;
    events.motion();
    assert.equal(
      frames.size,
      0,
      'live reduced motion cancels the pending frame',
    );
    motion.matches = false;
    events.motion();
    assert.equal(frames.size, 1);
    document.hidden = true;
    events.hidden();
    assert.equal(frames.size, 0);
    document.hidden = false;
    events.hidden();
    assert.equal(frames.size, 1);
    visibility(false);
    assert.equal(frames.size, 0);
    canvasWidth = width < 600 ? 712 : 345;
    events.resize();
    assert.equal(canvas.width, canvasWidth);
    assert.equal(
      canvas.height,
      Math.round(canvasWidth * (canvasWidth < 600 ? 1.14 : 0.84)),
    );
    assert.equal(
      frames.size,
      0,
      'resizing an offscreen figure must not start playback',
    );
    playback.dispose();
    assert.equal(resizeObservers[0].active, false);
    assert.equal(observers[0].active, false);
  });
}
