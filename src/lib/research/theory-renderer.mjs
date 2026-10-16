import { makeComparisonCurves } from './pdhg-curves.mjs';
import { makeLiftedCurves, sampleLifted as sample } from './kkt-lift.mjs';

export const DISPLAY_STEPS = 90;
// All playback durations are in milliseconds.
export const TIMING = {
  step: 240,
  fade: 300,
  endHold: 2400,
  restartIndicator: 1400,
};
const RESIDUAL_PLOT = {
  left: 175,
  right: 855,
  desktop: { top: 610, bottom: 752 },
  compact: { top: 650, bottom: 810 },
  maxLog: 0.2,
  logRange: 4.5,
};

const DURATION = DISPLAY_STEPS * TIMING.step;

/**
 * Create a renderer that owns the canvas transform and drawing style.
 * Rows must include all displayed steps and the pre-reset restart endpoints.
 * Styles must provide --ink, --muted, --line, --surface, --sans,
 * --pdhg, --restarted, and --halpern from the figure's computed styles.
 *
 * @param {HTMLCanvasElement} canvas Canvas with a 2D rendering context.
 * @param {Array<import('./pdhg-curves.mjs').ComparisonRow>} rows Saved iterates.
 * @param {CSSStyleDeclaration} styles Computed styles of the owning figure.
 * @returns {(frame: {time: number, endHold: number, reduceMotion: boolean,
 *   pixelRatio: number}) => void} Draw a frame; time and endHold are milliseconds.
 */
export function createTheoryRenderer(canvas, rows, styles) {
  const theme = {
    ink: styles.getPropertyValue('--ink').trim(),
    muted: styles.getPropertyValue('--muted').trim(),
    line: styles.getPropertyValue('--line').trim(),
    surface: styles.getPropertyValue('--surface').trim(),
    font: styles.getPropertyValue('--sans').trim(),
  };
  const context = canvas.getContext('2d');
  const methods = {
    last: { color: styles.getPropertyValue('--pdhg').trim(), marker: 'circle' },
    restarted: {
      color: styles.getPropertyValue('--restarted').trim(),
      marker: 'square',
    },
    halpern: {
      color: styles.getPropertyValue('--halpern').trim(),
      marker: 'diamond',
    },
  };
  const methodNames = Object.keys(methods);
  const restartSteps = rows.filter((row) => row.restart).map((row) => row.k);
  const firstRestart = restartSteps[0];
  const curves = makeLiftedCurves(makeComparisonCurves(rows));
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
  const point = (x, y) => ({ x, y });
  let view = {};
  let compact = false;
  let loopOpacity = 1;
  const project = (position) => [
    view.x + view.scale * position.x,
    view.y - view.scale * position.y,
  ];
  const ease = (t) => t * t * t * (t * (6 * t - 15) + 10);
  const clamp = (t) => Math.min(1, Math.max(0, t));
  function getProgress(time) {
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
  function sampleTrajectory(name, step, fraction = 1) {
    const segment = curves[name].get(step);
    return Array.from({ length: 17 }, (_, i) =>
      sample(segment, (i * fraction) / 16),
    );
  }
  function drawAxis(points, color, width, alpha) {
    context.beginPath();
    points.forEach((point, i) => {
      const position = project(point);
      i ? context.lineTo(...position) : context.moveTo(...position);
    });
    context.strokeStyle = color;
    context.lineWidth = width;
    context.globalAlpha = alpha;
    context.setLineDash([]);
    context.stroke();
    context.setLineDash([]);
    context.globalAlpha = 1;
  }
  function drawMarker(point, color, shape, offset) {
    const position = project(point);
    const x = position[0] + offset[0];
    const y = position[1] + offset[1];
    context.save();
    context.globalAlpha = loopOpacity;
    context.translate(x, y);
    context.scale(compact ? 1.7 : 1.25, compact ? 1.7 : 1.25);
    context.translate(-x, -y);
    context.beginPath();
    if (shape === 'square') {
      context.roundRect(x - 3.8, y - 3.8, 7.6, 7.6, 1);
    } else if (shape === 'diamond') {
      context.moveTo(x, y - 5);
      context.lineTo(x + 4.5, y);
      context.lineTo(x, y + 5);
      context.lineTo(x - 4.5, y);
      context.closePath();
    } else {
      context.arc(x, y, 4, 0, Math.PI * 2);
    }
    context.fillStyle = color;
    context.strokeStyle = theme.surface;
    context.lineWidth = 1.8;
    context.fill();
    context.stroke();
    context.restore();
  }
  function drawLabel(
    text,
    x,
    y,
    align = 'left',
    color = theme.muted,
    size = 13,
  ) {
    context.fillStyle = color;
    // Preserve a readable CSS-pixel size when the logical canvas is scaled down.
    const scaledSize = size * (compact ? 1.65 : 1);
    const minimumSize = (size >= 12 ? 11 : 10) / view.pixelScale;
    context.font = `${Math.max(scaledSize, minimumSize)}px ${theme.font}`;
    context.textAlign = align;
    context.fillText(text, x, y);
  }
  function drawTrace(name, lastStep, fraction) {
    let offset = 0;
    const color = methods[name].color;
    const progress = lastStep - 1 + fraction;
    for (let i = 1; i <= lastStep; i++) {
      if (name !== 'last' && rows[i - 1].restart) {
        offset = 0;
      }
      const points = sampleTrajectory(name, i, i === lastStep ? fraction : 1);
      const alpha = 0.25 + 0.65 * Math.exp(-Math.max(0, progress - i) / 24);
      const screenPoints = points.map(project);
      context.beginPath();
      screenPoints.forEach((position, j) =>
        j ? context.lineTo(...position) : context.moveTo(...position),
      );
      context.strokeStyle = color;
      context.lineWidth =
        (compact ? 3.4 : 1.8) + (name === 'halpern' ? 0.25 : 0);
      context.globalAlpha = alpha * loopOpacity;
      const period = compact ? 28 : 16;
      if (name === 'last') {
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
              compact ? 2.2 : 1.35,
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
          name === 'restarted' ? [period * 0.5, period * 0.5] : [],
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
  function drawTrajectories(playback, time, endHold) {
    const completedStep = playback.done ? playback.step : playback.step - 1;
    for (const name of methodNames) {
      drawTrace(name, playback.step, playback.fraction);
    }
    drawRestartLandings(completedStep);
    drawRestartArrows(completedStep, time, endHold, playback.done);
    drawCurrentPositions(playback, completedStep);
  }
  function drawRestartLandings(completedStep) {
    // Exact landing coordinates, identical in both coordinate systems.
    for (const restart of restartSteps.filter(
      (step) => step <= completedStep,
    )) {
      for (const name of ['restarted', 'halpern']) {
        const position = project(rows[restart][name]);
        context.beginPath();
        context.arc(...position, compact ? 4.5 : 2.6, 0, Math.PI * 2);
        context.globalAlpha =
          (0.1 + 0.65 * Math.exp(-(completedStep - restart) / 12)) *
          loopOpacity;
        context.fillStyle = theme.surface;
        context.fill();
        context.strokeStyle = methods[name].color;
        context.lineWidth = compact ? 1.7 : 1.1;
        context.stroke();
        context.globalAlpha = 1;
      }
    }
  }
  function drawRestartArrows(completedStep, time, endHold, done) {
    // Restart arrows are annotations; the iterate marker never follows them.
    const restartStep =
      restartSteps.findLast((step) => step <= completedStep) ?? 0;
    const elapsedSinceRestart =
      time - restartStep * TIMING.step + (done ? endHold : 0);
    if (restartStep > 0 && elapsedSinceRestart < TIMING.restartIndicator) {
      const alpha =
        0.65 *
        (1 - Math.min(1, elapsedSinceRestart / TIMING.restartIndicator)) **
          0.65;
      for (const name of ['restarted', 'halpern']) {
        const from = project(
          rows[restartStep][name === 'halpern' ? 'preHalpern' : 'preRestart'],
        );
        const to = project(rows[restartStep][name]);
        const dx = to[0] - from[0];
        const dy = to[1] - from[1];
        const length = Math.hypot(dx, dy);
        const directionX = dx / length;
        const directionY = dy / length;
        context.save();
        context.globalAlpha = alpha * loopOpacity;
        context.strokeStyle = methods[name].color;
        context.lineWidth = compact ? 2 : 1;
        if (length > 9) {
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
        context.beginPath();
        context.arc(...from, compact ? 3.5 : 2, 0, Math.PI * 2);
        context.stroke();
        context.restore();
      }
    }
  }
  function drawCurrentPositions(playback, completedStep) {
    let separationOffset = [0, 0];
    if (completedStep < firstRestart && !playback.done) {
      const segment = curves.last.get(playback.step);
      const before = project(
        sample(segment, Math.max(0, playback.fraction - 0.01)),
      );
      const after = project(
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
        : sample(curves[name].get(playback.step), playback.fraction);
      const offset =
        name === 'last'
          ? separationOffset
          : name === 'restarted'
            ? separationOffset.map((v) => -v)
            : [0, 0];
      if (offset.some((v) => v !== 0)) {
        const position = project(point);
        context.beginPath();
        context.moveTo(...position);
        context.lineTo(position[0] + offset[0], position[1] + offset[1]);
        context.strokeStyle = methods[name].color;
        context.globalAlpha = 0.4 * loopOpacity;
        context.lineWidth = 0.8;
        context.stroke();
        context.globalAlpha = 1;
      }
      drawMarker(point, methods[name].color, methods[name].marker, offset);
    }
  }
  function drawResidualPlot(playback) {
    const { left, right, maxLog, logRange } = RESIDUAL_PLOT;
    const { top, bottom } = compact
      ? RESIDUAL_PLOT.compact
      : RESIDUAL_PLOT.desktop;
    const iterationX = (k) => left + ((right - left) * k) / DISPLAY_STEPS;
    const residualY = (logResidual) =>
      top + ((maxLog - logResidual) / logRange) * (bottom - top);
    drawLabel(
      'KKT residual (log scale)',
      left,
      top - 30,
      'left',
      theme.ink,
      13,
    );

    for (const [logResidual, label] of [
      [0, '1'],
      [-1, '10⁻¹'],
      [-2, '10⁻²'],
      [-3, '10⁻³'],
      [-4, '10⁻⁴'],
    ]) {
      const y = residualY(logResidual);
      context.beginPath();
      context.moveTo(left, y);
      context.lineTo(right, y);
      context.strokeStyle = theme.line;
      context.lineWidth = 0.6;
      context.stroke();
      drawLabel(label, left - 12, y + 4, 'right', theme.muted, 10);
    }
    const completedStep = playback.done ? playback.step : playback.step - 1;
    for (const k of [
      0,
      ...restartSteps.filter((step) => step < DISPLAY_STEPS),
      DISPLAY_STEPS,
    ]) {
      drawLabel(
        String(k),
        iterationX(k),
        bottom + 25,
        'center',
        theme.muted,
        10,
      );
    }
    context.save();
    context.globalAlpha = loopOpacity;
    for (const k of restartSteps.filter((step) => step <= DISPLAY_STEPS)) {
      if (k <= completedStep) {
        context.beginPath();
        context.moveTo(iterationX(k), top);
        context.lineTo(iterationX(k), bottom);
        context.setLineDash([2, 5]);
        context.strokeStyle = theme.line;
        context.stroke();
        context.setLineDash([]);
      }
    }
    context.restore();
    drawLabel('Iterations', right, bottom + 48, 'right', theme.muted, 10);
    for (const name of methodNames) {
      context.beginPath();
      context.moveTo(
        iterationX(0),
        residualY(Math.log10(rows[0][name].distance)),
      );
      for (let j = 1; j <= playback.step; j++) {
        const segmentFraction =
          j === playback.step && !playback.done ? playback.fraction : 1;
        for (let sampleIndex = 1; sampleIndex <= 16; sampleIndex++) {
          const t = (segmentFraction * sampleIndex) / 16;
          const position = sample(curves[name].get(j), t);
          context.lineTo(
            iterationX(j - 1 + t),
            residualY(position.residualLog),
          );
        }
        // Same-k vertical connector denotes the actual restart discontinuity.
        if (rows[j].restart && j <= completedStep) {
          context.lineTo(
            iterationX(j),
            residualY(Math.log10(rows[j][name].distance)),
          );
        }
      }
      context.strokeStyle = methods[name].color;
      context.lineWidth = compact ? 3 : 1.7;
      context.globalAlpha = 0.8 * loopOpacity;
      context.setLineDash(
        name === 'last' ? [1, 4] : name === 'restarted' ? [7, 4] : [],
      );
      context.stroke();
      context.setLineDash([]);
      context.globalAlpha = 1;
      const position = playback.done
        ? { residualLog: Math.log10(rows[playback.step][name].distance) }
        : sample(curves[name].get(playback.step), playback.fraction);
      const x = iterationX(
        playback.done ? playback.step : playback.step - 1 + playback.fraction,
      );
      const y = residualY(position.residualLog);
      context.beginPath();
      context.arc(x, y, compact ? 5.5 : 3.3, 0, Math.PI * 2);
      context.fillStyle = methods[name].color;
      context.globalAlpha = loopOpacity;
      context.fill();
      context.globalAlpha = 1;
    }
  }
  function render({ time, endHold, reduceMotion, pixelRatio }) {
    const rect = canvas.getBoundingClientRect();
    // CSS sets the responsive aspect ratio before JavaScript loads.
    const canvasHeight = Math.round((1000 * rect.height) / rect.width);
    compact = canvasHeight === 900;
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
    const playback = getProgress(time);
    loopOpacity = getLoopOpacity(time, endHold, reduceMotion);
    view = {
      x: 500,
      y: compact ? 300 : 280,
      scale: compact ? 220 : 200,
      pixelScale: rect.width / 1000,
    };
    drawAxis([point(-1.45, 0), point(1.5, 0)], theme.muted, 0.7, 0.45);
    drawAxis([point(0, -1.25), point(0, 1.25)], theme.muted, 0.7, 0.45);
    const xAxisEnd = project(point(1.5, 0));
    const yAxisEnd = project(point(0, 1.25));
    drawLabel('x', xAxisEnd[0] + 12, xAxisEnd[1] + 4, 'left', theme.muted, 13);
    drawLabel('y', yAxisEnd[0], yAxisEnd[1] - 12, 'center', theme.muted, 13);
    for (const v of [-1, 1]) {
      const tickPosition = project(point(v, 0));
      drawLabel(
        String(v),
        tickPosition[0],
        tickPosition[1] + 20,
        'center',
        theme.muted,
        10,
      );
    }
    drawTrajectories(playback, time, endHold);
    const origin = project(point(0, 0));
    context.beginPath();
    context.arc(...origin, 2, 0, Math.PI * 2);
    context.fillStyle = theme.muted;
    context.fill();
    const start = project(rows[0].last);
    drawLabel('Start', start[0] + 12, start[1] - 10, 'left', theme.muted, 12);
    drawResidualPlot(playback);
  }
  return render;
}
