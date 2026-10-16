import type { ComparisonRow, MethodName, Point } from './pdhg-curves.ts';
import type { ResidualSegment } from './kkt-lift.ts';
import type { RestartState, TimelineSample } from './theory-timeline.ts';
import { smootherstep as ease, clamp } from './easing.ts';
import { makeComparisonCurves } from './pdhg-curves.ts';
import { makeLiftedCurves, sampleLifted as sample } from './kkt-lift.ts';
import { CANVAS_WIDTH, RESIDUAL_PLOT } from './theory-layout.ts';

type Coordinates = [number, number];
type MarkerShape = 'circle' | 'square' | 'diamond';
interface MethodStyle {
  color: string;
  marker: MarkerShape;
  trajectoryStyle: 'dots' | 'dash' | 'solid';
  residualDash: number[];
  preRestartKey: 'preRestart' | 'preHalpern' | null;
  restartLabelPosition: 'above' | 'below' | null;
  restartArrowOpacity: number;
  separation: number;
  extraWidth: number;
  explain: boolean;
}

export const DISPLAY_STEPS = 60;
// All playback durations are in milliseconds.
export const TIMING = {
  step: 240,
  fade: 300,
  endHold: 2400,
  explanationBefore: 900,
  explanationAfter: 1300,
  annotationFadeIn: 220,
  annotationFadeOut: 300,
  averageLabelDelay: 220,
  restartLabelHold: 1000,
  restartLabelFade: 300,
};

// Text sizes are CSS pixels, independent of the responsive canvas scale.
const TYPE_SIZE = { title: 18, axis: 13, annotation: 11.5, tick: 11 };

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
 */
interface FrameState {
  compact: boolean;
  pixelScale: number;
  project: (position: Point) => Coordinates;
  playback: { step: number; fraction: number; done: boolean };
  restart: RestartState | null;
  endHold: number;
  loopOpacity: number;
  annotationOpacity: number;
  explanationOpacity: number;
}

/**
 * Create a renderer that owns the canvas transform and drawing style.
 * Rows must include all displayed steps and the pre-reset restart endpoints.
 * Styles must provide --ink, --muted, --line, --surface, --sans, --serif,
 * --pdhg, --restarted, and --halpern from the figure's computed styles.
 * @param canvas Canvas with a 2D rendering context.
 * @param rows Saved iterates.
 * @param styles Computed styles of the owning figure.
 * @returns Draw one frame.
 */
export function createTheoryRenderer(
  canvas: HTMLCanvasElement,
  rows: ComparisonRow[],
  styles: CSSStyleDeclaration,
): (
  input: TimelineSample & {
    reduceMotion: boolean;
    pixelRatio: number;
  },
) => void {
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
      restartLabelPosition: null,
      restartArrowOpacity: 0.65,
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
      restartArrowOpacity: 0.85,
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
      restartArrowOpacity: 0.65,
      separation: 0,
      extraWidth: 0.25,
      explain: false,
    },
  };
  const methodNames = Object.keys(methods) as MethodName[];
  const restartedMethods = methodNames.filter(
    (name) => methods[name].preRestartKey,
  );
  const restartSteps = rows
    .filter((row) => row.preRestart || row.preHalpern)
    .map((row) => row.k);
  const firstRestart = rows.find((row) => row.preRestart)?.k ?? Infinity;
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
  const methodOpacity = (frame: FrameState, name: MethodName): number =>
    methods[name].explain
      ? 1
      : 1 - EXPLANATION_DIMMING * frame.explanationOpacity;

  function getAnnotationOpacity(restart: RestartState | null) {
    if (!restart) {
      return 0;
    }
    const fadeIn = ease(clamp(restart.elapsed / TIMING.annotationFadeIn));
    const fadeOut = ease(
      clamp((restart.duration - restart.elapsed) / TIMING.annotationFadeOut),
    );
    return fadeIn * fadeOut;
  }

  function getProgress(time: number, restart: RestartState | null) {
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
    offset: Coordinates,
    opacity: number,
  ) {
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
      context.globalAlpha =
        0.9 * frame.loopOpacity * methodOpacity(frame, name);
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
    drawRestartLandings(frame, completedStep);
    drawRestartArrows(frame);
    drawCurrentPositions(frame, completedStep);
    drawAverageLabel(frame);
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

  function drawRestartArrows(frame: FrameState) {
    // Arrows fade before iteration resumes; markers never follow the arrows.
    const { compact, restart } = frame;
    if (restart) {
      const restartStep = restart.step;
      const alpha = ease(
        clamp((restart.duration - restart.elapsed) / TIMING.annotationFadeOut),
      );
      for (const name of methodNames) {
        const preRestartKey = methods[name].preRestartKey;
        const endpoint = preRestartKey && rows[restartStep][preRestartKey];
        if (!endpoint) {
          continue;
        }
        const from = frame.project(endpoint);
        const to = frame.project(rows[restartStep][name]);
        const dx = to[0] - from[0];
        const dy = to[1] - from[1];
        const length = Math.hypot(dx, dy);
        context.save();
        context.globalAlpha =
          alpha *
          methods[name].restartArrowOpacity *
          frame.loopOpacity *
          methodOpacity(frame, name);
        context.strokeStyle = methods[name].color;
        context.lineWidth = compact ? 2 : 1;
        if (length > 9) {
          const directionX = dx / length;
          const directionY = dy / length;
          const tip: Coordinates = [
            to[0] - directionX * 4,
            to[1] - directionY * 4,
          ];
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

  function drawAverageLabel(frame: FrameState) {
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
      TYPE_SIZE.annotation,
    );
    context.restore();
  }

  function drawCurrentPositions(frame: FrameState, completedStep: number) {
    const { compact, playback } = frame;
    let separationOffset: Coordinates = [0, 0];
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
      const offset = separationOffset.map(
        (value) => value * methods[name].separation,
      ) as Coordinates;
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

  function drawResidualPlot(frame: FrameState) {
    const { compact, pixelScale, playback, restart, loopOpacity } = frame;
    const { annotationOpacity } = frame;
    const { left, right, maxLog, logRange } = RESIDUAL_PLOT;
    const plot = compact ? RESIDUAL_PLOT.compact : RESIDUAL_PLOT.desktop;
    const top = plot.top + 12 / pixelScale;
    const bottom = plot.bottom;
    const iterationX = (k: number): number =>
      left + ((right - left) * k) / DISPLAY_STEPS;
    const residualY = (logResidual: number): number =>
      top + ((maxLog - logResidual) / logRange) * (bottom - top);
    /**
     * Padded jump bounds shared by the guide and its label.
     */
    function restartBounds(
      name: MethodName,
      step: number,
    ): { top: number; bottom: number } | null {
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
    const titleY = plot.panelTop + 25 / pixelScale;
    drawLabel(
      frame,
      'KKT residual',
      left,
      titleY,
      'left',
      theme.ink,
      TYPE_SIZE.title,
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
      TYPE_SIZE.tick,
    );

    const residualTicks: Array<[number, string]> = [
      [0, '1'],
      [-2, '10⁻²'],
      [-4, '10⁻⁴'],
      [-6, '10⁻⁶'],
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
      if (logResidual === -2 || logResidual === -4) {
        context.strokeStyle = theme.line;
        context.globalAlpha = 0.8;
        context.setLineDash([1 / pixelScale, 4 / pixelScale]);
        context.beginPath();
        context.moveTo(left, y);
        context.lineTo(right, y);
        context.stroke();
      }
      context.restore();
      drawLabel(
        frame,
        label,
        left - 12,
        y + 4,
        'right',
        theme.muted,
        TYPE_SIZE.tick,
      );
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
        TYPE_SIZE.tick,
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
          TYPE_SIZE.annotation,
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
      theme.ink,
      TYPE_SIZE.axis,
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

  function render({
    time,
    endHold,
    reduceMotion,
    pixelRatio,
    restart = null,
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
    const originX = 500;
    const originY = compact ? 365 : 280;
    const scale = compact ? 270 : 200;
    const annotationOpacity = getAnnotationOpacity(restart);
    const frame: FrameState = {
      compact,
      pixelScale: rect.width / CANVAS_WIDTH,
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
    for (const v of [-1, 1]) {
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
      TYPE_SIZE.annotation,
    );
    drawResidualPlot(frame);
  }
  return render;
}
