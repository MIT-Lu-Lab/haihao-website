import type {
  ComparisonCurves,
  MethodName,
  Point,
  Segment,
} from './pdhg-curves.ts';
// For unconstrained L(x,y)=xy: F=(dL/dx,-dL/dy)=(y,-x).
// This is the absolute Euclidean stationarity residual, not a solver's
// normalized stopping test and not ||z-T(z)||.
import { sample } from './pdhg-curves.ts';
export type ResidualSegment = Segment & {
  startLog: number;
  endLog: number;
  startSlope: number;
  endSlope: number;
};
export type ResidualCurves = Record<MethodName, Map<number, ResidualSegment>>;

/**
 * @param position State for L(x,y)=xy.
 * @returns Absolute Euclidean KKT residual.
 */
export const kktResidual = (position: Point): number =>
  Math.hypot(position.y, -position.x);
/**
 * @param position Nonzero state.
 * @returns Base-10 logarithm of the residual.
 * @throws {RangeError} If the residual is zero.
 */
export function logResidual(position: Point): number {
  const residual = kktResidual(position);
  if (!(residual > 0)) {
    throw new RangeError('Zero residual has no finite log height');
  }
  return Math.log10(residual);
}
/**
 * Add shape-preserving log-residual interpolation within each restart epoch.
 * Display frames are not additional iterates and introduce no residual extrema.
 * @param curves State curves.
 * @returns State segments augmented with log-residual slopes.
 */
export function makeLiftedCurves(curves: ComparisonCurves): ResidualCurves {
  const result: ResidualCurves = {
    last: new Map(),
    restarted: new Map(),
    halpern: new Map(),
  };
  const samePoint = (a: Point, b: Point): boolean =>
    Math.hypot(a.x - b.x, a.y - b.y) < 1e-14;
  const monotoneSlope = (a: number, b: number): number =>
    a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  const names = Object.keys(curves) as MethodName[];
  for (const name of names) {
    const segments = curves[name];
    const residualSegments = result[name];
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
  }
  // Shared initial PDHG paths must also share residual interpolation slopes.
  for (const [k, segment] of result.last) {
    if (curves.restarted.get(k) === curves.last.get(k)) {
      result.restarted.set(k, segment);
    }
  }
  return result;
}
/**
 * @param segment State and log-residual segment.
 * @param t Fraction along the segment, from zero to one.
 * @returns Display position and log residual.
 */
export function sampleLifted(
  segment: ResidualSegment,
  t: number,
): Point & { residualLog: number } {
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
