// For unconstrained L(x,y)=xy: F=(dL/dx,-dL/dy)=(y,-x).
// This is the absolute Euclidean stationarity residual, not a solver's
// normalized stopping test and not ||z-T(z)||.
import { sample } from './pdhg-curves.mjs';
/**
 * @typedef {import('./pdhg-curves.mjs').Segment & {
 *   startLog: number, endLog: number, startSlope: number, endSlope: number
 * }} ResidualSegment
 */
/** @typedef {Record<'last' | 'restarted' | 'halpern', Map<number, ResidualSegment>>} ResidualCurves */

/**
 * @param {import('./pdhg-curves.mjs').Point} position State for L(x,y)=xy.
 * @returns {number} Absolute Euclidean KKT residual.
 */
export const kktResidual = (position) => Math.hypot(position.y, -position.x);
/**
 * @param {import('./pdhg-curves.mjs').Point} position Nonzero state.
 * @returns {number} Base-10 logarithm of the residual.
 * @throws {RangeError} If the residual is zero.
 */
export function logResidual(position) {
  const residual = kktResidual(position);
  if (!(residual > 0)) {
    throw new RangeError('Zero residual has no finite log height');
  }
  return Math.log10(residual);
}
/**
 * Add shape-preserving log-residual interpolation within each restart epoch.
 * Display frames are not additional iterates and introduce no residual extrema.
 * @param {import('./pdhg-curves.mjs').ComparisonCurves} curves State curves.
 * @returns {ResidualCurves} State segments augmented with log-residual slopes.
 */
export function makeLiftedCurves(curves) {
  const result = {};
  const samePoint = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-14;
  const monotoneSlope = (a, b) => (a * b <= 0 ? 0 : (2 * a * b) / (a + b));
  for (const [name, segments] of Object.entries(curves)) {
    const residualSegments = new Map();
    for (const [k, segment] of segments) {
      const startLog = logResidual(segment.start);
      const endLog = logResidual(segment.end);
      const logChange = endLog - startLog;
      const previous = segments.get(k - 1);
      const next = segments.get(k + 1);
      const startSlope =
        previous && samePoint(previous.end, segment.start)
          ? monotoneSlope(logChange, startLog - logResidual(previous.start))
          : logChange;
      const endSlope =
        next && samePoint(next.start, segment.end)
          ? monotoneSlope(logChange, logResidual(next.end) - endLog)
          : logChange;
      residualSegments.set(k, {
        ...segment,
        startLog,
        endLog,
        startSlope,
        endSlope,
      });
    }
    result[name] = residualSegments;
  }
  // Shared initial PDHG paths must also share residual interpolation slopes.
  for (const [k, segment] of curves.restarted) {
    if (segment === curves.last.get(k)) {
      result.restarted.set(k, result.last.get(k));
    }
  }
  return result;
}
/**
 * @param {ResidualSegment} segment State and log-residual segment.
 * @param {number} t Fraction along the segment, from zero to one.
 * @returns {import('./pdhg-curves.mjs').Point & {residualLog: number}} Display sample.
 */
export function sampleLifted(segment, t) {
  const position = sample(segment, t);
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    ...position,
    residualLog:
      (2 * t3 - 3 * t2 + 1) * segment.startLog +
      (t3 - 2 * t2 + t) * segment.startSlope +
      (-2 * t3 + 3 * t2) * segment.endLog +
      (t3 - t2) * segment.endSlope,
  };
}
