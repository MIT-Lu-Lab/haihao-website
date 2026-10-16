// @ts-check
import { makeComparisonCurves } from './pdhg-curves.mjs';
import { makeLiftedCurves, sampleLifted as sample } from './kkt-lift.mjs';

/** @typedef {import('./pdhg-curves.mjs').Point} Point */
/** @typedef {import('./pdhg-curves.mjs').MethodName} MethodName */
/** @typedef {import('./kkt-lift.mjs').ResidualSegment} ResidualSegment */
/** @typedef {import('./theory-timeline.mjs').RestartState} RestartState */
/** @typedef {[number, number]} Coordinates */
/** @typedef {'circle' | 'square' | 'diamond'} MarkerShape */
/**
 * @typedef {Object} MethodStyle
 * @property {string} color
 * @property {MarkerShape} marker
 * @property {'dots' | 'dash' | 'solid'} trajectoryStyle
 * @property {number[]} residualDash
 * @property {'preRestart' | 'preHalpern' | null} preRestartKey
 * @property {'above' | 'below' | null} restartLabelPosition
 * @property {number} separation Direction for overlapping first-epoch markers.
 * @property {number} extraWidth
 * @property {boolean} explain Whether the first restart highlights this method.
 */

export const DISPLAY_STEPS = 60;
// All playback durations are in milliseconds.
export const TIMING = {
  step: 240,
  fade: 300,
  endHold: 2400,
  restartBefore: 0,
  restartAfter: 0,
  firstRestartBefore: 900,
  firstRestartAfter: 1300,
  annotationFadeIn: 220,
  annotationFadeOut: 300,
  averageLabelDelay: 220,
  restartLabelHold: 1000,
  restartLabelFade: 300,
};
const RESIDUAL_PLOT = {
  left: 95,
  right: 940,
  desktop: { top: 610, bottom: 752 },
  compact: { top: 760, bottom: 920 },
  maxLog: 0.2,
  logRange: 6.5,
};

const DURATION = DISPLAY_STEPS * TIMING.step;
const EXPLANATION_DIMMING = 0.62;
const AVERAGE_LABEL = {
  offsetX: -28,
  offsetY: 40,
  referenceScale: 0.45,
};
const RESTART_GUIDE = {
  restingOpacity: 0.4,
  emphasisOpacity: 0.35,
  activeOpacity: 0.75,
};

/**
 * Read-only state derived once per frame and passed to every drawing step.
 *
 * @typedef {Object} FrameState
 * @property {boolean} compact Whether the narrow layout is active.
 * @property {number} pixelScale CSS pixels per logical canvas unit.
 * @property {(position: import('./pdhg-curves.mjs').Point) => Coordinates}
 *   project Map a state-space point to logical canvas coordinates.
 * @property {{step: number, fraction: number, done: boolean}} playback
 *   Current iteration and the drawn fraction of its segment.
 * @property {import('./theory-timeline.mjs').RestartState | null} restart
 *   Active restart hold, if any.
 * @property {number} endHold Milliseconds in the final hold.
 * @property {number} loopOpacity Fade at the start and end of each loop.
 * @property {number} annotationOpacity Fade of the active restart annotations.
 * @property {number} explanationOpacity Annotation fade during the explained
 *   first restart; zero otherwise.
 */

/**
 * Create a renderer that owns the canvas transform and drawing style.
 * Rows must include all displayed steps and the pre-reset restart endpoints.
 * Styles must provide --ink, --muted, --line, --surface, --sans,
 * --pdhg, --restarted, and --halpern from the figure's computed styles.
 *
 * @param {HTMLCanvasElement} canvas Canvas with a 2D rendering context.
 * @param {import('./pdhg-curves.mjs').ComparisonRow[]} rows Saved iterates.
 * @param {CSSStyleDeclaration} styles Computed styles of the owning figure.
 * @returns {(input: import('./theory-timeline.mjs').TimelineSample &
 *   {reduceMotion: boolean, pixelRatio: number}) => void} Draw one frame.
 */
export function createTheoryRenderer(canvas, rows, styles) {
  const theme = {
    ink: styles.getPropertyValue('--ink').trim(),
    muted: styles.getPropertyValue('--muted').trim(),
    line: styles.getPropertyValue('--line').trim(),
    surface: styles.getPropertyValue('--surface').trim(),
    font: styles.getPropertyValue('--sans').trim(),
  };
  const canvasContext = canvas.getContext('2d');
  if (!canvasContext) {
    throw new Error('A 2D canvas context is required');
  }
  const context = canvasContext;
  /** @type {Record<MethodName, MethodStyle>} */
  const methods = {
    last: {
      color: styles.getPropertyValue('--pdhg').trim(),
      marker: 'circle',
      trajectoryStyle: 'dots',
      residualDash: [1, 4],
      preRestartKey: null,
      restartLabelPosition: null,
      separation: 1,
      extraWidth: 0,
      explain: false,
    },
    restarted: {
      color: styles.getPropertyValue('--restarted').trim(),
      marker: 'square',
      trajectoryStyle: 'dash',
      residualDash: [7, 4],
      preRestartKey: 'preRestart',
      restartLabelPosition: 'above',
      separation: -1,
      extraWidth: 0,
      explain: true,
    },
    halpern: {
      color: styles.getPropertyValue('--halpern').trim(),
      marker: 'diamond',
      trajectoryStyle: 'solid',
      residualDash: [],
      preRestartKey: 'preHalpern',
      restartLabelPosition: 'below',
      separation: 0,
      extraWidth: 0.25,
      explain: false,
    },
  };
  const methodNames = /** @type {MethodName[]} */ (Object.keys(methods));
  const restartedMethods = methodNames.filter(
    (name) => methods[name].preRestartKey,
  );
  const restartSteps = rows
    .filter((row) => row.preRestart || row.preHalpern)
    .map((row) => row.k);
  const firstRestart = rows.find((row) => row.preRestart)?.k ?? Infinity;
  const curves = makeLiftedCurves(makeComparisonCurves(rows));
  /**
   * @param {number} time
   * @param {number} endHold
   * @param {boolean} reduceMotion
   */
  function getLoopOpacity(time, endHold, reduceMotion) {
    if (reduceMotion) {
      return 1;
    }
    if (time < TIMING.fade) {
      return ease(time / TIMING.fade);
    }
    if (time < DURATION) {
      return 1;
    }
    const fadeStart = TIMING.endHold - TIMING.fade;
    return 1 - ease(clamp((endHold - fadeStart) / TIMING.fade));
  }
  /** @type {(x: number, y: number) => Point} */
  const point = (x, y) => ({ x, y });
  /** @type {(frame: FrameState, name: MethodName) => number} */
  const methodOpacity = (frame, name) =>
    methods[name].explain
      ? 1
      : 1 - EXPLANATION_DIMMING * frame.explanationOpacity;
  /** @type {(t: number) => number} */
  const ease = (t) => t * t * t * (t * (6 * t - 15) + 10);
  /** @type {(t: number) => number} */
  const clamp = (t) => Math.min(1, Math.max(0, t));
  /**
   * @param {RestartState | null} restart
   */
  function getAnnotationOpacity(restart) {
    if (!restart) {
      return 0;
    }
    const fadeIn = ease(clamp(restart.elapsed / TIMING.annotationFadeIn));
    const fadeOut = ease(
      clamp((restart.duration - restart.elapsed) / TIMING.annotationFadeOut),
    );
    return fadeIn * fadeOut;
  }
  /**
   * @param {number} time
   * @param {RestartState | null} restart
   */
  function getProgress(time, restart) {
    if (restart?.phase === 'before') {
      return { step: restart.step, fraction: 1, done: false };
    }
    if (time >= DURATION) {
      return { step: DISPLAY_STEPS, fraction: 1, done: true };
    }
    const progress = time / TIMING.step;
    return {
      step: Math.floor(progress) + 1,
      fraction: progress % 1,
      done: false,
    };
  }
  /**
   * @param {MethodName} name
   * @param {number} step
   * @returns {ResidualSegment}
   */
  function segmentAt(name, step) {
    const segment = curves[name].get(step);
    if (!segment) {
      throw new Error(`Missing ${name} trajectory segment at step ${step}`);
    }
    return segment;
  }
  /**
   * @param {MethodName} name
   * @param {number} step
   * @param {number} [fraction]
   */
  function sampleTrajectory(name, step, fraction = 1) {
    const segment = segmentAt(name, step);
    return Array.from({ length: 17 }, (_, i) =>
      sample(segment, (i * fraction) / 16),
    );
  }
  /**
   * @param {FrameState} frame
   * @param {Point[]} points
   * @param {string} color
   * @param {number} width
   * @param {number} alpha
   */
  function drawAxis(frame, points, color, width, alpha) {
    context.beginPath();
    points.forEach((point, index) => {
      const position = frame.project(point);
      if (index === 0) {
        context.moveTo(...position);
      } else {
        context.lineTo(...position);
      }
    });
    context.strokeStyle = color;
    context.lineWidth = width;
    context.globalAlpha = alpha;
    context.setLineDash([]);
    context.stroke();
    context.globalAlpha = 1;
  }
  /**
   * @param {number} x
   * @param {number} y
   * @param {MarkerShape} shape
   * @param {number} [radius]
   */
  function markerPath(x, y, shape, radius = 4) {
    const scale = radius / 4;
    context.beginPath();
    if (shape === 'square') {
      context.roundRect(
        x - 3.8 * scale,
        y - 3.8 * scale,
        7.6 * scale,
        7.6 * scale,
        scale,
      );
    } else if (shape === 'diamond') {
      context.moveTo(x, y - 5 * scale);
      context.lineTo(x + 4.5 * scale, y);
      context.lineTo(x, y + 5 * scale);
      context.lineTo(x - 4.5 * scale, y);
      context.closePath();
    } else {
      context.arc(x, y, radius, 0, Math.PI * 2);
    }
  }
  /**
   * @param {FrameState} frame
   * @param {Point} point
   * @param {string} color
   * @param {MarkerShape} shape
   * @param {Coordinates} offset
   * @param {number} opacity
   */
  function drawMarker(frame, point, color, shape, offset, opacity) {
    const position = frame.project(point);
    const x = position[0] + offset[0];
    const y = position[1] + offset[1];
    context.save();
    const markerScale = frame.compact ? 1.53 : 1.125;
    context.globalAlpha = frame.loopOpacity * opacity;
    context.translate(x, y);
    context.scale(markerScale, markerScale);
    context.translate(-x, -y);
    markerPath(x, y, shape);
    context.fillStyle = color;
    context.strokeStyle = theme.surface;
    context.lineWidth = 1.2;
    context.fill();
    context.stroke();
    context.restore();
  }
  /**
   * @param {FrameState} frame
   * @param {string} text
   * @param {number} x
   * @param {number} y
   * @param {CanvasTextAlign} [align]
   * @param {string} [color]
   * @param {number} [size]
   */
  function drawLabel(
    frame,
    text,
    x,
    y,
    align = 'left',
    color = theme.muted,
    size = 13,
  ) {
    context.fillStyle = color;
    // Keep text readable in CSS pixels when the canvas scales down.
    const scaledSize = size * (frame.compact ? 1.65 : 1);
    const minimumSize = (size >= 12 ? 11 : 10) / frame.pixelScale;
    context.font = `${Math.max(scaledSize, minimumSize)}px ${theme.font}`;
    context.textAlign = align;
    context.fillText(text, x, y);
  }
  /**
   * @param {FrameState} frame
   * @param {MethodName} name
   */
  function drawTrace(frame, name) {
    const { compact } = frame;
    const { step: lastStep, fraction } = frame.playback;
    let offset = 0;
    const color = methods[name].color;
    const { preRestartKey } = methods[name];
    for (let i = 1; i <= lastStep; i++) {
      if (preRestartKey && rows[i - 1][preRestartKey]) {
        offset = 0;
      }
      const points = sampleTrajectory(name, i, i === lastStep ? fraction : 1);
      const screenPoints = points.map(frame.project);
      context.beginPath();
      screenPoints.forEach((position, index) => {
        if (index === 0) {
          context.moveTo(...position);
        } else {
          context.lineTo(...position);
        }
      });
      context.strokeStyle = color;
      context.lineWidth = (compact ? 3.8 : 2.05) + methods[name].extraWidth;
      context.globalAlpha =
        0.9 * frame.loopOpacity * methodOpacity(frame, name);
      const period = compact ? 28 : 16;
      if (methods[name].trajectoryStyle === 'dots') {
        // Place dots by arc length, in the middle of the green gaps.
        const phase = period * 0.75;
        const dotPeriod = period / 2;
        let distance = offset;
        for (let j = 1; j < screenPoints.length; j++) {
          const from = screenPoints[j - 1];
          const to = screenPoints[j];
          const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
          let target =
            phase + dotPeriod * Math.ceil((distance - phase) / dotPeriod);
          for (; target < distance + length; target += dotPeriod) {
            const t = (target - distance) / length;
            context.beginPath();
            context.arc(
              from[0] + t * (to[0] - from[0]),
              from[1] + t * (to[1] - from[1]),
              compact ? 2.45 : 1.5,
              0,
              Math.PI * 2,
            );
            context.fillStyle = color;
            context.fill();
          }
          distance += length;
        }
      } else {
        context.setLineDash(
          methods[name].trajectoryStyle === 'dash'
            ? [period * 0.5, period * 0.5]
            : [],
        );
        context.lineDashOffset = offset;
        context.stroke();
      }
      for (let j = 1; j < screenPoints.length; j++) {
        offset += Math.hypot(
          screenPoints[j][0] - screenPoints[j - 1][0],
          screenPoints[j][1] - screenPoints[j - 1][1],
        );
      }
    }
    context.setLineDash([]);
    context.lineDashOffset = 0;
    context.globalAlpha = 1;
  }
  /**
   * @param {FrameState} frame
   */
  function drawTrajectories(frame) {
    const { playback } = frame;
    const completedStep = playback.done ? playback.step : playback.step - 1;
    for (const name of methodNames) {
      drawTrace(frame, name);
    }
    drawRestartLandings(frame, completedStep);
    drawRestartArrows(frame);
    drawCurrentPositions(frame, completedStep);
    drawAverageLabel(frame);
  }
  /**
   * @param {FrameState} frame
   * @param {number} completedStep
   */
  function drawRestartLandings(frame, completedStep) {
    const { compact } = frame;
    // Exact landing coordinates, identical in both coordinate systems.
    for (const restart of restartSteps.filter(
      (step) => step <= completedStep,
    )) {
      for (const name of restartedMethods) {
        const key = methods[name].preRestartKey;
        if (!key || !rows[restart][key]) {
          continue;
        }
        const position = frame.project(rows[restart][name]);
        markerPath(
          position[0],
          position[1],
          methods[name].marker,
          compact ? 4.05 : 2.34,
        );
        context.globalAlpha =
          (0.1 + 0.65 * Math.exp(-(completedStep - restart) / 12)) *
          frame.loopOpacity;
        context.fillStyle = theme.surface;
        context.fill();
        context.strokeStyle = methods[name].color;
        context.lineWidth = compact ? 1.7 : 1.1;
        context.stroke();
        context.globalAlpha = 1;
      }
    }
  }
  /**
   * @param {FrameState} frame
   */
  function drawRestartArrows(frame) {
    // Arrows fade before iteration resumes; markers never follow the arrows.
    const { compact, restart } = frame;
    if (restart) {
      const restartStep = restart.step;
      const alpha =
        0.65 *
        ease(
          clamp(
            (restart.duration - restart.elapsed) / TIMING.annotationFadeOut,
          ),
        );
      for (const name of methodNames) {
        const preRestartKey = methods[name].preRestartKey;
        if (preRestartKey === null || !rows[restartStep][preRestartKey]) {
          continue;
        }
        // Restart rows contain the pre-reset endpoint, verified by the audit.
        const endpoint = /** @type {Point} */ (
          rows[restartStep][preRestartKey]
        );
        const from = frame.project(endpoint);
        const to = frame.project(rows[restartStep][name]);
        const dx = to[0] - from[0];
        const dy = to[1] - from[1];
        const length = Math.hypot(dx, dy);
        context.save();
        context.globalAlpha =
          alpha * frame.loopOpacity * methodOpacity(frame, name);
        context.strokeStyle = methods[name].color;
        context.lineWidth = compact ? 2 : 1;
        if (length > 9) {
          const directionX = dx / length;
          const directionY = dy / length;
          /** @type {Coordinates} */
          const tip = [to[0] - directionX * 4, to[1] - directionY * 4];
          context.setLineDash([2, 4]);
          context.beginPath();
          context.moveTo(...from);
          context.lineTo(...tip);
          context.stroke();
          context.setLineDash([]);
          const size = Math.min(compact ? 7 : 4, length * 0.22);
          context.beginPath();
          context.moveTo(
            tip[0] - directionX * size - directionY * size * 0.55,
            tip[1] - directionY * size + directionX * size * 0.55,
          );
          context.lineTo(...tip);
          context.lineTo(
            tip[0] - directionX * size + directionY * size * 0.55,
            tip[1] - directionY * size - directionX * size * 0.55,
          );
          context.stroke();
        }
        markerPath(
          from[0],
          from[1],
          methods[name].marker,
          compact ? 3.15 : 1.8,
        );
        context.stroke();
        context.restore();
      }
    }
  }
  /**
   * @param {FrameState} frame
   */
  function drawAverageLabel(frame) {
    const { compact, pixelScale, restart } = frame;
    if (!restart?.explain) {
      return;
    }
    const [x, y] = frame.project(rows[restart.step].restarted);
    // Explain the first restart in the open space beside its trajectories.
    // CSS-pixel offsets keep the labels readable at the website's figure size.
    const { offsetX: dx, offsetY: dy, referenceScale } = AVERAGE_LABEL;
    const spacing = Math.min(1, pixelScale / referenceScale);
    const endX = x + (dx * spacing) / pixelScale;
    const endY = y + (dy * spacing) / pixelScale;
    const length = Math.hypot(endX - x, endY - y);
    const gap = 3 / pixelScale;
    context.save();
    context.globalAlpha = frame.annotationOpacity * frame.loopOpacity;
    context.strokeStyle = methods.restarted.color;
    context.lineWidth = 0.9 / pixelScale;
    context.setLineDash([]);
    context.beginPath();
    context.moveTo(
      x + ((endX - x) * gap) / length,
      y + ((endY - y) * gap) / length,
    );
    context.lineTo(endX, endY);
    context.stroke();
    if (restart.phase === 'before') {
      markerPath(x, y, methods.restarted.marker, compact ? 4.05 : 2.34);
      context.fillStyle = theme.surface;
      context.fill();
      context.stroke();
    }
    // Let the leader establish the destination before naming the cycle mean.
    context.globalAlpha *= ease(
      clamp(
        (restart.elapsed - TIMING.averageLabelDelay) / TIMING.annotationFadeIn,
      ),
    );
    drawLabel(
      frame,
      'Average',
      endX - 5 / pixelScale,
      endY + 3 / pixelScale,
      'right',
      methods.restarted.color,
      11,
    );
    context.restore();
  }
  /**
   * @param {FrameState} frame
   * @param {number} completedStep
   */
  function drawCurrentPositions(frame, completedStep) {
    const { compact, playback } = frame;
    /** @type {Coordinates} */
    let separationOffset = [0, 0];
    if (completedStep < firstRestart && !playback.done) {
      const segment = segmentAt('last', playback.step);
      const before = frame.project(
        sample(segment, Math.max(0, playback.fraction - 0.01)),
      );
      const after = frame.project(
        sample(segment, Math.min(1, playback.fraction + 0.01)),
      );
      const dx = after[0] - before[0];
      const dy = after[1] - before[1];
      const length = Math.hypot(dx, dy) || 1;
      const shift = compact ? 8 : 5;
      separationOffset = [(-dy / length) * shift, (dx / length) * shift];
    }
    for (const name of methodNames) {
      const point = playback.done
        ? rows[playback.step][name]
        : sample(segmentAt(name, playback.step), playback.fraction);
      const offset = /** @type {Coordinates} */ (
        separationOffset.map((value) => value * methods[name].separation)
      );
      if (offset.some((v) => v !== 0)) {
        const position = frame.project(point);
        context.beginPath();
        context.moveTo(...position);
        context.lineTo(position[0] + offset[0], position[1] + offset[1]);
        context.strokeStyle = methods[name].color;
        context.globalAlpha =
          0.4 * frame.loopOpacity * methodOpacity(frame, name);
        context.lineWidth = 0.8;
        context.stroke();
        context.globalAlpha = 1;
      }
      drawMarker(
        frame,
        point,
        methods[name].color,
        methods[name].marker,
        offset,
        methodOpacity(frame, name),
      );
    }
  }
  /**
   * @param {FrameState} frame
   */
  function drawResidualPlot(frame) {
    const { compact, pixelScale, playback, restart, loopOpacity } = frame;
    const { annotationOpacity } = frame;
    const { left, right, maxLog, logRange } = RESIDUAL_PLOT;
    const { top, bottom } = compact
      ? RESIDUAL_PLOT.compact
      : RESIDUAL_PLOT.desktop;
    /** @type {(k: number) => number} */
    const iterationX = (k) => left + ((right - left) * k) / DISPLAY_STEPS;
    /** @type {(logResidual: number) => number} */
    const residualY = (logResidual) =>
      top + ((maxLog - logResidual) / logRange) * (bottom - top);
    /**
     * Padded jump bounds shared by the guide and its label.
     * @param {MethodName} name
     * @param {number} step
     * @returns {{top: number, bottom: number} | null}
     */
    function restartBounds(name, step) {
      const key = methods[name].preRestartKey;
      const before = key && rows[step][key];
      if (!before) {
        return null;
      }
      const fromY = residualY(Math.log10(Math.hypot(before.x, before.y)));
      const toY = residualY(Math.log10(rows[step][name].distance));
      const padding = 6 / pixelScale;
      return {
        top: Math.max(top, Math.min(fromY, toY) - padding),
        bottom: Math.min(bottom, Math.max(fromY, toY) + padding),
      };
    }
    drawLabel(
      frame,
      'KKT residual (log scale)',
      left,
      top - 30,
      'left',
      theme.ink,
      13,
    );

    /** @type {Array<[number, string]>} */
    const residualTicks = [
      [0, '1'],
      [-2, '10⁻²'],
      [-4, '10⁻⁴'],
      [-6, '10⁻⁶'],
    ];
    for (const [logResidual, label] of residualTicks) {
      const y = residualY(logResidual);
      context.beginPath();
      context.moveTo(left, y);
      context.lineTo(right, y);
      context.strokeStyle = theme.line;
      context.lineWidth = 0.6;
      context.stroke();
      drawLabel(frame, label, left - 12, y + 4, 'right', theme.muted, 10);
    }
    const completedStep = playback.done ? playback.step : playback.step - 1;
    for (let k = 0; k <= DISPLAY_STEPS; k += 10) {
      drawLabel(
        frame,
        String(k),
        iterationX(k),
        bottom + 25,
        'center',
        theme.muted,
        10,
      );
    }
    context.save();
    for (const k of restartSteps.filter((step) => step <= DISPLAY_STEPS)) {
      const active = restart?.step === k;
      if (k > completedStep && !active) {
        continue;
      }
      for (const name of restartedMethods) {
        const bounds = restartBounds(name, k);
        if (!bounds) {
          continue;
        }
        context.globalAlpha =
          loopOpacity *
          (k <= completedStep
            ? RESTART_GUIDE.restingOpacity +
              (active ? RESTART_GUIDE.emphasisOpacity * annotationOpacity : 0)
            : RESTART_GUIDE.activeOpacity * annotationOpacity);
        context.strokeStyle = methods[name].color;
        context.lineWidth = 0.85 / pixelScale;
        context.setLineDash([2 / pixelScale, 3 / pixelScale]);
        context.beginPath();
        context.moveTo(iterationX(k), bounds.top);
        context.lineTo(iterationX(k), bounds.bottom);
        context.stroke();
      }
    }
    context.restore();
    // Keep the lower event label readable after playback resumes.
    // This does not extend the shared iteration hold or the upper jump arrow.
    const currentIteration = playback.done
      ? playback.step
      : playback.step - 1 + playback.fraction;
    const labelStep =
      restart?.step ?? restartSteps.findLast((k) => k <= currentIteration);
    const labelAge =
      labelStep === undefined
        ? Infinity
        : (currentIteration - labelStep) * TIMING.step + frame.endHold;
    const labelOpacity = restart
      ? ease(clamp(restart.elapsed / TIMING.annotationFadeIn))
      : 1 -
        ease(
          clamp((labelAge - TIMING.restartLabelHold) / TIMING.restartLabelFade),
        );
    if (labelStep !== undefined && labelOpacity > 0) {
      context.save();
      context.globalAlpha =
        labelOpacity * loopOpacity * RESTART_GUIDE.activeOpacity;
      for (const name of restartedMethods) {
        const bounds = restartBounds(name, labelStep);
        if (!bounds) {
          continue;
        }
        const labelY =
          methods[name].restartLabelPosition === 'above'
            ? bounds.top - 4 / pixelScale
            : bounds.bottom + 13 / pixelScale;
        drawLabel(
          frame,
          'Restart',
          iterationX(labelStep),
          labelY,
          'center',
          methods[name].color,
          10,
        );
      }
      context.restore();
    }
    drawLabel(
      frame,
      'Iterations',
      (left + right) / 2,
      bottom + (compact ? 72 : 64),
      'center',
      theme.muted,
      10,
    );
    for (const name of methodNames) {
      context.beginPath();
      context.moveTo(
        iterationX(0),
        residualY(Math.log10(rows[0][name].distance)),
      );
      const { preRestartKey } = methods[name];
      for (let j = 1; j <= playback.step; j++) {
        const segmentFraction =
          j === playback.step && !playback.done ? playback.fraction : 1;
        const segment = segmentAt(name, j);
        for (let sampleIndex = 1; sampleIndex <= 16; sampleIndex++) {
          const t = (segmentFraction * sampleIndex) / 16;
          const position = sample(segment, t);
          context.lineTo(
            iterationX(j - 1 + t),
            residualY(position.residualLog),
          );
        }
        // Same-k vertical connector denotes the actual restart discontinuity.
        if (preRestartKey && rows[j][preRestartKey] && j <= completedStep) {
          context.lineTo(
            iterationX(j),
            residualY(Math.log10(rows[j][name].distance)),
          );
        }
      }
      context.strokeStyle = methods[name].color;
      context.lineWidth = compact ? 3.3 : 1.9;
      context.globalAlpha = 0.8 * loopOpacity * methodOpacity(frame, name);
      context.setLineDash(methods[name].residualDash);
      context.stroke();
      context.setLineDash([]);
      context.globalAlpha = 1;
      const position = playback.done
        ? { residualLog: Math.log10(rows[playback.step][name].distance) }
        : sample(segmentAt(name, playback.step), playback.fraction);
      const x = iterationX(
        playback.done ? playback.step : playback.step - 1 + playback.fraction,
      );
      const y = residualY(position.residualLog);
      markerPath(x, y, methods[name].marker, compact ? 4.95 : 2.97);
      context.fillStyle = methods[name].color;
      context.globalAlpha = loopOpacity * methodOpacity(frame, name);
      context.fill();
      context.globalAlpha = 1;
    }
  }
  /**
   * @param {import('./theory-timeline.mjs').TimelineSample &
   *   {reduceMotion: boolean, pixelRatio: number}} input
   */
  function render({ time, endHold, reduceMotion, pixelRatio, restart = null }) {
    const rect = canvas.getBoundingClientRect();
    // CSS sets the responsive aspect ratio before JavaScript loads.
    const canvasHeight = Math.round((1000 * rect.height) / rect.width);
    const compact = canvasHeight >= 900;
    const pixelDensity = Math.min(pixelRatio, 2);
    const pixelWidth = Math.round(rect.width * pixelDensity);
    const pixelHeight = Math.round(
      ((rect.width * canvasHeight) / 1000) * pixelDensity,
    );
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    context.setTransform(
      pixelWidth / 1000,
      0,
      0,
      pixelHeight / canvasHeight,
      0,
      0,
    );
    context.clearRect(0, 0, 1000, canvasHeight);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    const originX = 500;
    const originY = compact ? 365 : 280;
    const scale = compact ? 270 : 200;
    const annotationOpacity = getAnnotationOpacity(restart);
    /** @type {FrameState} */
    const frame = {
      compact,
      pixelScale: rect.width / 1000,
      project: (position) => [
        originX + scale * position.x,
        originY - scale * position.y,
      ],
      playback: getProgress(time, restart),
      restart,
      endHold,
      loopOpacity: getLoopOpacity(time, endHold, reduceMotion),
      annotationOpacity,
      explanationOpacity: restart?.explain ? annotationOpacity : 0,
    };
    const axisColor = theme.muted;
    drawAxis(frame, [point(-1.45, 0), point(1.5, 0)], axisColor, 0.7, 0.45);
    drawAxis(frame, [point(0, -1.25), point(0, 1.25)], axisColor, 0.7, 0.45);
    const xAxisEnd = frame.project(point(1.5, 0));
    const yAxisEnd = frame.project(point(0, 1.25));
    drawLabel(
      frame,
      'x',
      xAxisEnd[0] + 12,
      xAxisEnd[1] + 4,
      'left',
      theme.muted,
      13,
    );
    drawLabel(
      frame,
      'y',
      yAxisEnd[0],
      yAxisEnd[1] - 12,
      'center',
      theme.muted,
      13,
    );
    for (const v of [-1, 1]) {
      const tickPosition = frame.project(point(v, 0));
      drawLabel(
        frame,
        String(v),
        tickPosition[0],
        tickPosition[1] + 20,
        'center',
        theme.muted,
        10,
      );
    }
    drawTrajectories(frame);
    const origin = frame.project(point(0, 0));
    context.beginPath();
    context.arc(...origin, 2, 0, Math.PI * 2);
    context.fillStyle = theme.muted;
    context.fill();
    const start = frame.project(rows[0].last);
    drawLabel(
      frame,
      'Start',
      start[0] + 12,
      start[1] - 10,
      'left',
      theme.muted,
      12,
    );
    drawResidualPlot(frame);
  }
  return render;
}
