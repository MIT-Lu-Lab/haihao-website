import type simulation from '../../../data/research/online-allocation.json';

/** Shared display geometry and the first animated auction (zero-based). */
export const DISPLAY_START = 23;
export const RULER = {
  left: 414,
  width: 188,
  maximum: 1,
  labelMinimum: 450,
  labelMaximum: 566,
} as const;
export const DIAL = { startAngle: 180, sweepAngle: 180, maximum: 1 } as const;
export const REELS = { rowHeight: 36, baseline: 381 } as const;

/** Fit the chart to the same prefix that the animation displays. */
export function onlineChart(data: typeof simulation) {
  const lastGain = data.rounds.findLastIndex(
    (round) =>
      round.after.value > round.before.value ||
      round.after.fixedValue > round.before.fixedValue,
  );
  const playbackEnd = Math.max(DISPLAY_START + 1, lastGain + 1);
  const peak = Math.max(
    ...data.rounds
      .slice(0, playbackEnd)
      .map((round) => Math.max(round.after.value, round.after.fixedValue)),
  );
  const maxAuction = Math.ceil(playbackEnd / 5) * 5;
  const maxUtility = Math.max(5, Math.ceil(peak / 5) * 5);
  const ticks = (maximum: number) =>
    Array.from({ length: Math.floor(maximum / 10) + 1 }, (_, i) => i * 10);
  return {
    left: 54,
    bottom: 355,
    width: 254,
    height: 136,
    playbackEnd,
    maxAuction,
    maxUtility,
    auctionTicks: ticks(maxAuction),
    utilityTicks: ticks(maxUtility),
  };
}
