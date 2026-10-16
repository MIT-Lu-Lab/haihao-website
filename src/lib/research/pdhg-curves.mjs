/** @typedef {{x: number, y: number}} Point */
/**
 * @typedef {Object} ComparisonRow
 * @property {number} k Iteration index, starting at zero.
 * @property {Point & {distance: number}} last Plain PDHG iterate.
 * @property {Point & {distance: number}} restarted Restarted averaged iterate.
 * @property {Point & {distance: number}} halpern Reflected Halpern iterate.
 * @property {boolean} restart Whether this step resets the restarted methods.
 * @property {Point | null} preRestart Endpoint before the averaged reset.
 * @property {Point | null} preHalpern Endpoint before the Halpern reset.
 */
/**
 * @typedef {{start: Point, end: Point, startTangent: Point,
 *   endTangent: Point}} Segment
 */
/** @typedef {Record<'last' | 'restarted' | 'halpern', Map<number, Segment>>} ComparisonCurves */

// Interpolation is for display only. Each segment ends at an original iterate.
// Restart jumps separate epochs so tangents never smooth across a reset.
function makeCurves(rows, method, preRestartKey) {
  const epochs = [];
  let epoch = [];
  for (const row of rows) {
    if (preRestartKey && row.restart) {
      epoch.push({ step: row.k, point: row[preRestartKey] });
      epochs.push(epoch);
      epoch = [{ step: row.k, point: row[method] }];
    } else {
      epoch.push({ step: row.k, point: row[method] });
    }
  }
  epochs.push(epoch);

  const segments = new Map();
  for (const points of epochs) {
    const tangentAt = (index) => {
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
 * @param {Segment} segment Endpoint positions and tangents.
 * @param {number} t Fraction along the segment, from zero to one.
 * @returns {Point} Interpolated position.
 */
export function sample(segment, t) {
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
 * @param {ComparisonRow[]} rows Consecutive iterates, including step zero and a restart.
 * @returns {ComparisonCurves} Segments keyed by their ending iteration index.
 */
export function makeComparisonCurves(rows) {
  const curves = {
    last: makeCurves(rows, 'last'),
    restarted: makeCurves(rows, 'restarted', 'preRestart'),
    halpern: makeCurves(rows, 'halpern', 'preHalpern'),
  };
  // Both PDHG methods share the first epoch, including its pre-restart endpoint.
  // Reuse the same segments so their display paths also coincide exactly.
  const firstRestart = rows.find((row) => row.restart).k;
  for (let step = 1; step <= firstRestart; step++) {
    curves.restarted.set(step, curves.last.get(step));
  }
  return curves;
}
