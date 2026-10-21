export type Point = { x: number; y: number };
export type MeasuredPoint = Point & { residual: number };
export type MethodName = 'last' | 'restarted' | 'halpern';
export interface ComparisonRow {
  k: number;
  last: MeasuredPoint;
  restarted: MeasuredPoint;
  epochAverage?: MeasuredPoint;
  halpern: MeasuredPoint;
  restart: boolean;
  preRestart: Point | null;
  preHalpern: Point | null;
}
/**
 * Select epoch averages for both charts without changing saved algorithm states.
 * At a reset the mean is already the new anchor, so its two display endpoints
 * coincide. Retain that boundary to avoid smoothing tangents across epochs.
 */
export function makeAverageDisplayRows(rows: ComparisonRow[]): ComparisonRow[] {
  return rows.map((row) => {
    if (row.k === 0) return row;
    if (!row.epochAverage) {
      throw new Error(`Missing epoch average at evaluation ${row.k}`);
    }
    return {
      ...row,
      restarted: row.epochAverage,
      preRestart: row.restart ? row.epochAverage : null,
    };
  });
}

export type Segment = {
  start: Point;
  end: Point;
  startTangent: Point;
  endTangent: Point;
};
export type ComparisonCurves = Record<MethodName, Map<number, Segment>>;

// Interpolation is for display only. Each segment ends at an original iterate.
// Restart jumps separate epochs so tangents never smooth across a reset.

function makeCurves(
  rows: ComparisonRow[],
  method: MethodName,
  preRestartKey?: 'preRestart' | 'preHalpern',
): Map<number, Segment> {
  const epochs: Array<Array<{ step: number; point: Point }>> = [];
  let epoch: Array<{ step: number; point: Point }> = [];
  for (const row of rows) {
    const endpoint = preRestartKey && row[preRestartKey];
    if (endpoint) {
      epoch.push({
        step: row.k,
        point: endpoint,
      });
      epochs.push(epoch);
      epoch = [{ step: row.k, point: row[method] }];
    } else {
      epoch.push({ step: row.k, point: row[method] });
    }
  }
  epochs.push(epoch);

  const segments = new Map<number, Segment>();
  for (const points of epochs) {
    const tangentAt = (index: number) => {
      const left = points[Math.max(0, index - 1)];
      const right = points[Math.min(points.length - 1, index + 1)];
      const stepSpan = right.step - left.step;
      // A horizontal tangent at x=0 keeps the display curve on the boundary.
      return {
        x:
          points[index].point.x === 0
            ? 0
            : (right.point.x - left.point.x) / stepSpan,
        y: (right.point.y - left.point.y) / stepSpan,
      };
    };
    for (let index = 1; index < points.length; index++) {
      segments.set(points[index].step, {
        start: points[index - 1].point,
        end: points[index].point,
        startTangent: tangentAt(index - 1),
        endTangent: tangentAt(index),
      });
    }
  }
  return segments;
}

/**
 * Evaluate a cubic Hermite segment without changing the saved iterates.
 * @param segment Endpoint positions and tangents.
 * @param t Fraction along the segment, from zero to one.
 * @returns Interpolated position.
 */
export function sample(segment: Segment, t: number): Point {
  const startWeight = 2 * t * t * t - 3 * t * t + 1;
  const startTangentWeight = t * t * t - 2 * t * t + t;
  const endWeight = -2 * t * t * t + 3 * t * t;
  const endTangentWeight = t * t * t - t * t;
  const { start, end, startTangent, endTangent } = segment;
  return {
    x:
      startWeight * start.x +
      startTangentWeight * startTangent.x +
      endWeight * end.x +
      endTangentWeight * endTangent.x,
    y:
      startWeight * start.y +
      startTangentWeight * startTangent.y +
      endWeight * end.y +
      endTangentWeight * endTangent.y,
  };
}

/**
 * Build display curves without smoothing across restart jumps.
 * @param rows Iterates including step zero and a restart.
 * @returns Segments keyed by their ending iteration index.
 */
export function makeComparisonCurves(rows: ComparisonRow[]): ComparisonCurves {
  const curves = {
    last: makeCurves(rows, 'last'),
    restarted: makeCurves(rows, 'restarted', 'preRestart'),
    halpern: makeCurves(rows, 'halpern', 'preHalpern'),
  };
  // Share the initial one-step epoch where the current and average points
  // coincide. This avoids artificial separation from interpolation alone.
  const firstRestart = rows.find((row) => row.restart);
  if (firstRestart) {
    for (const [step, segment] of curves.last) {
      if (step > firstRestart.k) break;
      curves.restarted.set(step, segment);
    }
  }
  return curves;
}
