import type { ComparisonRow, MethodName, Point } from './pdhg-curves.ts';
import type { ResidualSegment } from './kkt-lift.ts';
import type { TimelineSample } from './theory-timeline.ts';
import { smootherstep as ease, clamp } from './easing.ts';
import { makeAverageDisplayRows, makeComparisonCurves } from './pdhg-curves.ts';
import {
  kktResidual,
  makeLiftedCurves,
  sampleLifted as sample,
} from './kkt-lift.ts';
import { CANVAS_WIDTH, RESIDUAL_PLOT } from './theory-layout.ts';

type Coordinates = [number, number];
type MarkerShape = 'circle' | 'square' | 'diamond';
interface MethodStyle {
  color: string;
  marker: MarkerShape;
  trajectoryStyle: 'dots' | 'dash' | 'solid';
  residualDash: number[];
  preRestartKey: 'preRestart' | 'preHalpern' | null;
  extraWidth: number;
}

// Both panels share one evaluation index and presentation clock.
export const DISPLAY_STEPS = 220;
const KKT_STEPS = DISPLAY_STEPS;
// All playback durations are in milliseconds.
export const TIMING = {
  step: 100,
  fade: 300,
  endHold: 300,
};

// Text sizes are CSS pixels, independent of the responsive canvas scale.
const TYPE_SIZE = { axis: 13, annotation: 12, tick: 12 };
const KKT_TYPE_SIZE = {
  title: 17,
  axis: 12.5,
  tick: 12,
  hint: 11,
};

const DURATION = DISPLAY_STEPS * TIMING.step;
const RESTART_MARKER = {
  opacity: 0.4,
  height: 5,
  width: 1.2,
};

/**
 * Read-only state derived once per frame and passed to every drawing step.
 */
interface FrameState {
  compact: boolean;
  pixelScale: number;
  project: (position: Point) => Coordinates;
  playback: { step: number; fraction: number; done: boolean };
  loopOpacity: number;
}

/**
 * Create a renderer that owns the canvas transform and drawing style.
 * Rows must include all displayed steps and the pre-reset restart endpoints.
 * Styles must provide --ink, --muted, --line, --surface, --sans, --serif,
 * --pdhg, --restarted, and --halpern from the figure's computed styles.
 * @param canvas Canvas with a 2D rendering context.
 * @param sourceRows Saved iterates.
 * @param styles Computed styles of the owning figure.
 * @returns Draw one frame.
 */
export function createTheoryRenderer(
  canvas: HTMLCanvasElement,
  sourceRows: ComparisonRow[],
  styles: CSSStyleDeclaration,
): (
  input: TimelineSample & {
    reduceMotion: boolean;
    pixelRatio: number;
  },
) => void {
  const rows = makeAverageDisplayRows(sourceRows);
  const theme = {
    ink: styles.getPropertyValue('--ink').trim(),
    muted: styles.getPropertyValue('--muted').trim(),
    line: styles.getPropertyValue('--line').trim(),
    surface: styles.getPropertyValue('--surface').trim(),
    font: styles.getPropertyValue('--sans').trim(),
    headingFont: styles.getPropertyValue('--serif').trim(),
  };
  const canvasContext = canvas.getContext('2d');
  if (!canvasContext) {
    throw new Error('A 2D canvas context is required');
  }
  const context = canvasContext;
  const methods: Record<MethodName, MethodStyle> = {
    last: {
      color: styles.getPropertyValue('--pdhg').trim(),
      marker: 'circle',
      trajectoryStyle: 'dots',
      residualDash: [1, 4],
      preRestartKey: null,
      extraWidth: 0,
    },
    restarted: {
      color: styles.getPropertyValue('--restarted').trim(),
      marker: 'square',
      trajectoryStyle: 'dash',
      residualDash: [7, 4],
      preRestartKey: 'preRestart',
      extraWidth: 0,
    },
    halpern: {
      color: styles.getPropertyValue('--halpern').trim(),
      marker: 'diamond',
      trajectoryStyle: 'solid',
      residualDash: [],
      preRestartKey: 'preHalpern',
      extraWidth: 0.25,
    },
  };
  const methodNames = Object.keys(methods) as MethodName[];
  const restartedMethods = methodNames.filter(
    (name) => methods[name].preRestartKey,
  );
  const restartSteps = rows
    .filter((row) => row.preRestart || row.preHalpern)
    .map((row) => row.k);
  const curves = makeLiftedCurves(makeComparisonCurves(rows));

  function getLoopOpacity(
    time: number,
    endHold: number,
    reduceMotion: boolean,
  ) {
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
  const point = (x: number, y: number): Point => ({ x, y });
  function getProgress(time: number) {
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

  function segmentAt(name: MethodName, step: number): ResidualSegment {
    const segment = curves[name].get(step);
    if (!segment) {
      throw new Error(`Missing ${name} trajectory segment at step ${step}`);
    }
    return segment;
  }

  function sampleTrajectory(
    name: MethodName,
    step: number,
    fraction: number = 1,
  ) {
    const segment = segmentAt(name, step);
    return Array.from({ length: 17 }, (_, i) =>
      sample(segment, (i * fraction) / 16),
    );
  }

  function drawAxis(
    frame: FrameState,
    points: Point[],
    color: string,
    width: number,
    alpha: number,
  ) {
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

  function markerPath(
    x: number,
    y: number,
    shape: MarkerShape,
    radius: number = 4,
  ) {
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

  function drawMarker(
    frame: FrameState,
    point: Point,
    color: string,
    shape: MarkerShape,
  ) {
    const position = frame.project(point);
    const [x, y] = position;
    context.save();
    const markerScale = frame.compact ? 1.53 : 1.125;
    context.globalAlpha = frame.loopOpacity;
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

  function drawLabel(
    frame: FrameState,
    text: string,
    x: number,
    y: number,
    align: CanvasTextAlign = 'left',
    color: string = theme.muted,
    size: number = TYPE_SIZE.axis,
    font: string = theme.font,
  ) {
    context.fillStyle = color;
    context.font = `${size / frame.pixelScale}px ${font}`;
    context.textAlign = align;
    context.fillText(text, x, y);
  }

  function drawTrace(frame: FrameState, name: MethodName) {
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
      context.globalAlpha = 0.9 * frame.loopOpacity;
      const period = compact ? 28 : 16;
      if (methods[name].trajectoryStyle === 'dots') {
        // Place dots by arc length, centered in the dashed trajectory's gaps.
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

  function drawTrajectories(frame: FrameState) {
    const { playback } = frame;
    const completedStep = playback.done ? playback.step : playback.step - 1;
    for (const name of methodNames) {
      drawTrace(frame, name);
    }
    drawRestartConnections(frame, completedStep);
    drawRestartLandings(frame, completedStep);
    drawCurrentPositions(frame);
  }

  function drawRestartConnections(frame: FrameState, completedStep: number) {
    // Hold the reset connection briefly, then fade as iteration resumes.
    // Draw straight connections only after the shared restart event occurs.
    const iteration = frame.playback.done
      ? frame.playback.step
      : frame.playback.step - 1 + frame.playback.fraction;
    context.save();
    context.setLineDash([]);
    for (const step of restartSteps.filter((k) => k <= completedStep)) {
      const opacity = 1 - ease(clamp((iteration - step - 1) / 4));
      if (opacity <= 0) continue;
      for (const name of restartedMethods) {
        const key = methods[name].preRestartKey;
        const before = key && rows[step][key];
        if (!before) continue;
        const from = frame.project(before);
        const to = frame.project(rows[step][name]);
        if (
          Math.hypot(to[0] - from[0], to[1] - from[1]) <
          0.5 / frame.pixelScale
        )
          continue;
        context.strokeStyle = methods[name].color;
        context.lineWidth =
          (frame.compact ? 3.8 : 2.05) + methods[name].extraWidth;
        const period = frame.compact ? 28 : 16;
        context.setLineDash(
          methods[name].trajectoryStyle === 'dash'
            ? [period * 0.5, period * 0.5]
            : [],
        );
        context.globalAlpha = 0.9 * opacity * frame.loopOpacity;
        context.beginPath();
        context.moveTo(...from);
        context.lineTo(...to);
        context.stroke();
      }
    }
    context.restore();
  }

  function drawRestartLandings(frame: FrameState, completedStep: number) {
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

  function drawCurrentPositions(frame: FrameState) {
    const { playback } = frame;
    for (const name of methodNames) {
      const point = playback.done
        ? rows[playback.step][name]
        : sample(segmentAt(name, playback.step), playback.fraction);
      drawMarker(frame, point, methods[name].color, methods[name].marker);
    }
  }

  function drawResidualPlot(frame: FrameState) {
    const { compact, pixelScale, playback, loopOpacity } = frame;
    const { left, right, maxLog, logRange } = RESIDUAL_PLOT;
    const plot = compact ? RESIDUAL_PLOT.compact : RESIDUAL_PLOT.desktop;
    const top = plot.top + 12 / pixelScale;
    const bottom = plot.bottom;
    const iterationX = (k: number): number =>
      left + ((right - left) * k) / KKT_STEPS;
    const residualY = (logResidual: number): number =>
      top + ((maxLog - logResidual) / logRange) * (bottom - top);
    /** Center the short marker in the clipped residual interval at a reset. */
    function restartMarkerY(name: MethodName, step: number): number | null {
      const key = methods[name].preRestartKey;
      const before = key && rows[step][key];
      if (!before) {
        return null;
      }
      const fromY = residualY(Math.log10(kktResidual(before)));
      const toY = residualY(Math.log10(rows[step][name].residual));
      const padding = 6 / pixelScale;
      const intervalTop = Math.max(top, Math.min(fromY, toY) - padding);
      const intervalBottom = Math.min(bottom, Math.max(fromY, toY) + padding);
      return (intervalTop + intervalBottom) / 2;
    }
    const titleY = plot.panelTop + 25 / pixelScale;
    drawLabel(
      frame,
      'KKT residual',
      left,
      titleY,
      'left',
      theme.ink,
      KKT_TYPE_SIZE.title,
      theme.headingFont,
    );
    const titleWidth = context.measureText('KKT residual').width;
    drawLabel(
      frame,
      'log scale',
      left + titleWidth + 12 / pixelScale,
      titleY,
      'left',
      theme.muted,
      KKT_TYPE_SIZE.hint,
    );

    const residualTicks: Array<[number, string]> = [
      [0, '1'],
      [-2, ''],
      [-4, '10⁻⁴'],
      [-6, ''],
      [-8, '10⁻⁸'],
    ];
    for (const [logResidual, label] of residualTicks) {
      const y = residualY(logResidual);
      context.save();
      context.strokeStyle = theme.muted;
      context.globalAlpha = 0.35;
      context.lineWidth = 0.6 / pixelScale;
      context.beginPath();
      context.moveTo(left - 5 / pixelScale, y);
      context.lineTo(left, y);
      context.stroke();
      if (logResidual === -4) {
        context.strokeStyle = theme.line;
        context.globalAlpha = 0.8;
        context.setLineDash([1 / pixelScale, 4 / pixelScale]);
        context.beginPath();
        context.moveTo(left, y);
        context.lineTo(right, y);
        context.stroke();
      }
      context.restore();
      if (!label) continue;
      drawLabel(
        frame,
        label,
        left - 8 / pixelScale,
        y + 4 / pixelScale,
        'right',
        theme.muted,
        KKT_TYPE_SIZE.tick,
      );
    }
    const completedStep = playback.done ? playback.step : playback.step - 1;
    for (let k = 0; k <= KKT_STEPS; k += 50) {
      drawLabel(
        frame,
        String(k),
        iterationX(k),
        bottom + 12 / pixelScale,
        'center',
        theme.muted,
        KKT_TYPE_SIZE.tick,
      );
    }
    context.save();
    for (const k of restartSteps.filter((step) => step <= KKT_STEPS)) {
      if (k > completedStep) {
        continue;
      }
      for (const name of restartedMethods) {
        const centerY = restartMarkerY(name, k);
        if (centerY === null) {
          continue;
        }
        context.globalAlpha = loopOpacity * RESTART_MARKER.opacity;
        context.strokeStyle = methods[name].color;
        context.lineWidth = RESTART_MARKER.width / pixelScale;
        context.setLineDash([]);
        const halfHeight = RESTART_MARKER.height / (2 * pixelScale);
        context.beginPath();
        context.moveTo(iterationX(k), centerY - halfHeight);
        context.lineTo(iterationX(k), centerY + halfHeight);
        context.stroke();
      }
    }
    context.restore();
    drawLabel(
      frame,
      'PDHG evaluations',
      (left + right) / 2,
      bottom + (compact ? 26 : 31) / pixelScale,
      'center',
      theme.ink,
      KKT_TYPE_SIZE.axis,
    );
    for (const name of methodNames) {
      context.beginPath();
      context.moveTo(
        iterationX(0),
        residualY(Math.log10(rows[0][name].residual)),
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
            residualY(Math.log10(rows[j][name].residual)),
          );
        }
      }
      context.strokeStyle = methods[name].color;
      context.lineWidth = compact ? 3.3 : 1.9;
      context.globalAlpha = 0.8 * loopOpacity;
      context.setLineDash(methods[name].residualDash);
      context.stroke();
      context.setLineDash([]);
      context.globalAlpha = 1;
      const position = playback.done
        ? { residualLog: Math.log10(rows[playback.step][name].residual) }
        : sample(segmentAt(name, playback.step), playback.fraction);
      const x = iterationX(
        playback.done ? playback.step : playback.step - 1 + playback.fraction,
      );
      const y = residualY(position.residualLog);
      markerPath(x, y, methods[name].marker, compact ? 4.95 : 2.97);
      context.fillStyle = methods[name].color;
      context.globalAlpha = loopOpacity;
      context.fill();
      context.globalAlpha = 1;
    }
  }

  function render({
    time,
    endHold,
    reduceMotion,
    pixelRatio,
  }: TimelineSample & {
    reduceMotion: boolean;
    pixelRatio: number;
  }) {
    const rect = canvas.getBoundingClientRect();
    // CSS sets the responsive aspect ratio before JavaScript loads.
    const canvasHeight = Math.round((CANVAS_WIDTH * rect.height) / rect.width);
    const compact = canvasHeight >= 900;
    const pixelDensity = Math.min(pixelRatio, 2);
    const pixelWidth = Math.round(rect.width * pixelDensity);
    const pixelHeight = Math.round(
      ((rect.width * canvasHeight) / CANVAS_WIDTH) * pixelDensity,
    );
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    context.setTransform(
      pixelWidth / CANVAS_WIDTH,
      0,
      0,
      pixelHeight / canvasHeight,
      0,
      0,
    );
    context.clearRect(0, 0, CANVAS_WIDTH, canvasHeight);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    const originX = 95;
    const originY = compact ? 501 : 370;
    const scaleX = compact ? 324 : 335;
    const scaleY = compact ? 205 : 162;
    const frame: FrameState = {
      compact,
      pixelScale: rect.width / CANVAS_WIDTH,
      project: (position) => [
        originX + scaleX * position.x,
        originY - scaleY * position.y,
      ],
      playback: getProgress(time),
      loopOpacity: getLoopOpacity(time, endHold, reduceMotion),
    };
    const axisColor = theme.muted;
    const yAxisMax = compact ? 2.05 : 1.35;
    drawAxis(frame, [point(-0.12, 0), point(2.15, 0)], axisColor, 0.7, 0.45);
    drawAxis(
      frame,
      [point(0, -0.95), point(0, yAxisMax)],
      axisColor,
      0.7,
      0.45,
    );
    const xAxisEnd = frame.project(point(2.15, 0));
    const yAxisEnd = frame.project(point(0, yAxisMax));
    context.save();
    context.globalAlpha = 0.45;
    drawLabel(
      frame,
      'x',
      xAxisEnd[0] + 12,
      xAxisEnd[1] + 4,
      'left',
      theme.muted,
      TYPE_SIZE.axis,
    );
    drawLabel(
      frame,
      'y',
      yAxisEnd[0] + 8 / frame.pixelScale,
      yAxisEnd[1] + 4 / frame.pixelScale,
      'left',
      theme.muted,
      TYPE_SIZE.axis,
    );
    for (const v of [0, 1, 2]) {
      const tickPosition = frame.project(point(v, 0));
      drawLabel(
        frame,
        String(v),
        tickPosition[0],
        tickPosition[1] + 10 / frame.pixelScale,
        'center',
        theme.muted,
        TYPE_SIZE.tick,
      );
    }
    context.restore();
    drawTrajectories(frame);
    const solution = frame.project(point(1, 0));
    context.beginPath();
    context.arc(...solution, 2, 0, Math.PI * 2);
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
      TYPE_SIZE.annotation,
    );
    drawResidualPlot(frame);
  }
  return render;
}
