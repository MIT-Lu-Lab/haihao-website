export type Point = { x: number; y: number };
export type MethodName = 'last' | 'restarted' | 'halpern';
export interface ComparisonRow {
  k: number;
  last: Point & { distance: number };
  restarted: Point & { distance: number };
  halpern: Point & { distance: number };
  restart: boolean;
  preRestart: Point | null;
  preHalpern: Point | null;
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
      return {
        x: (right.point.x - left.point.x) / stepSpan,
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
  // Both PDHG methods share the first epoch and its pre-restart endpoint.
  // Reuse the same segments so their display paths also coincide exactly.
  const firstRestart = rows.find((row) => row.restart);
  if (!firstRestart) {
    return curves;
  }
  for (const [step, segment] of curves.last) {
    if (step > firstRestart.k) {
      break;
    }
    curves.restarted.set(step, segment);
  }
  return curves;
}
