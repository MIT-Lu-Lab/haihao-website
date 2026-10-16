import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { initializeTheoryFigure } from '../src/lib/research/theory-figure.mjs';
import { DISPLAY_STEPS, TIMING } from '../src/lib/research/theory-renderer.mjs';

test('load failure shows an error without starting playback', async () => {
  const errorMessage = { hidden: true, textContent: '' };
  let reportedError;
  await initializeTheoryFigure(
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
  test(`playback respects visibility and reduced motion at ${width}px`, async () => {
    const data = JSON.parse(
      fs.readFileSync(
        new URL('../public/pdhg-comparison.json', import.meta.url),
      ),
    );
    const frames = new Map();
    let nextId = 0;
    const events = {};
    const motion = {
      matches: false,
      addEventListener: (_, fn) => (events.motion = fn),
    };
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
    let lastMarkerOpacity;
    let canvasWidth = width;
    const theme = {
      '--ink': '#26272b',
      '--muted': '#595b61',
      '--line': '#e5e3e0',
      '--surface': '#fff',
      '--sans': 'Arial, sans-serif',
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
        height: (canvasWidth * (canvasWidth < 600 ? 900 : 820)) / 1000,
      }),
    };
    const root = {
      dataset: { source: '/example-base/pdhg-comparison.json' },
      querySelector: (selector) => ({ canvas, '.error': {} })[selector],
    };
    const document = {
      hidden: false,
      addEventListener: (name, fn) => (events[name] = fn),
    };
    await initializeTheoryFigure(root, {
      document,
      devicePixelRatio: 1,
      getComputedStyle: () => ({
        getPropertyValue: (name) => {
          assert.ok(name in theme, `Unknown theme variable: ${name}`);
          return theme[name];
        },
      }),
      matchMedia: () => motion,
      IntersectionObserver: class {
        constructor(callback) {
          events.visibility = callback;
        }
        observe(target) {
          assert.equal(target, canvas);
        }
      },
      ResizeObserver: class {
        constructor(callback) {
          events.resize = callback;
        }
        observe(target) {
          assert.equal(target, canvas);
        }
      },
      requestAnimationFrame: (fn) => {
        frames.set(++nextId, fn);
        return nextId;
      },
      cancelAnimationFrame: (id) => frames.delete(id),
      fetch: async (url) => {
        assert.equal(url, root.dataset.source);
        return { ok: true, json: async () => data };
      },
      console: {
        error: (error) => {
          throw error;
        },
      },
    });
    const visibility = (visible) =>
      events.visibility([{ isIntersecting: visible }]);
    assert.equal(
      canvas.style.aspectRatio,
      undefined,
      'CSS owns the reserved aspect ratio',
    );
    assert.ok(context.font.endsWith(theme['--sans']));
    assert.equal(canvas.height, Math.round(width * (width < 600 ? 0.9 : 0.82)));
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
    const restartCount = data.rows.filter(
      (row) => row.restart && row.k > 0 && row.k < DISPLAY_STEPS,
    ).length;
    const restartHolds =
      restartCount === 0
        ? 0
        : TIMING.firstRestartBefore +
          TIMING.firstRestartAfter +
          (restartCount - 1) * (TIMING.restartBefore + TIMING.restartAfter);
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
    events.visibilitychange();
    assert.equal(frames.size, 0);
    document.hidden = false;
    events.visibilitychange();
    assert.equal(frames.size, 1);
    visibility(false);
    assert.equal(frames.size, 0);
    canvasWidth = width < 600 ? 712 : 345;
    events.resize();
    assert.equal(canvas.width, canvasWidth);
    assert.equal(
      canvas.height,
      Math.round(canvasWidth * (canvasWidth < 600 ? 0.9 : 0.82)),
    );
    assert.equal(
      frames.size,
      0,
      'resizing an offscreen figure must not start playback',
    );
  });
}
