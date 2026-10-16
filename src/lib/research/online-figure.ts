import { createPlayback } from './playback.ts';
import { smoothstep as ease, mix } from './easing.ts';
import type simulation from '../../../data/research/online-allocation.json';

import {
  DISPLAY_START,
  RULER,
  DIAL,
  REELS,
  onlineChart,
} from './online-layout.ts';

type Simulation = typeof simulation;
const PLAYBACK_RATE = 0.8;
// Wall-clock seconds: fast, staggered stops within the slower decision loop.
const REEL_DURATIONS = [0.22, 0.27, 0.32] as const;
const TIMING = {
  stagesDuration: 3,
  dialResetDuration: 0.36,
  roundDuration: 3.39,
  roundFade: 0.18,
  returnStart: 0,
  returnDuration: 0.55,
  returnHold: 0.08,
  returnFade: 0.18,
  endHold: 0.8,
  endFade: 0.64,
} as const;
// Start and duration, as fractions of the three-second reveal sequence.
const STAGES = {
  incoming: [0, 0.19],
  bid: [0.16, 0.14],
  auctionBid: [0.3, 0.08],
  market: [0.38, 0.05],
  outcome: [0.43, 0.14],
  consumption: [0.66, 0.07],
  update: [0.73, 0.12],
} as const;
// Seconds; segment lengths are fractions of each path, chosen for a similar
// physical footprint on the short connectors and the much longer return.
const SIGNALS = [
  {
    name: 'to-input',
    start: 0.21,
    duration: 0.3,
    head: 0.35,
    tail: 0.3,
    hold: 0.04,
    fade: 0.12,
  },
  {
    name: 'to-auction',
    start: 0.9,
    duration: 0.24,
    head: 0.35,
    tail: 0.3,
    hold: 0.04,
    fade: 0.12,
  },
  {
    name: 'to-spend',
    start: 1.71,
    duration: 0.27,
    head: 0.24,
    tail: 0.2,
    hold: 0.04,
    fade: 0.12,
  },
  {
    // The stored mu_t and new impression meet at Bid before it is formed.
    // This is the previous auction's update, not feedback from this auction.
    name: 'to-bid',
    start: TIMING.returnStart,
    duration: TIMING.returnDuration,
    head: 0.08,
    tail: 0.07,
    hold: TIMING.returnHold,
    fade: TIMING.returnFade,
  },
] as const;
// Only the travelling highlight speeds up; its cue and fade stay in place.
const SIGNAL_TRAVEL_SPEED = 1.2;
const REVEAL_OPACITY_RATE = 3;
const SIGNAL_STYLE = {
  opacity: 0.95,
  fadeInDuration: 0.06,
  tailOpacity: 0.27,
  dashGap: 2,
} as const;

/**
 * Play auctions 24 onward, retaining the preceding rounds as chart history.
 * The root contains OnlineFigure's SVG parts; data comes from the allocation
 * generator. The browser argument supports playback tests.
 */
export function initializeOnlineFigure(
  root: HTMLElement,
  data: Simulation,
  browser: Window & typeof globalThis = window,
) {
  // Continue after auction 23, retaining the actual state and totals.
  const fadeStart = TIMING.roundDuration - TIMING.roundFade;
  // Stop after the last gain and fit the visible chart to that prefix.
  const plot = onlineChart(data);
  const { playbackEnd } = plot;
  const rounds = data.rounds.slice(DISPLAY_START, playbackEnd);
  const count = rounds.length;
  const period = TIMING.roundDuration;
  const activeDuration = count * period;
  const cycleDuration = activeDuration + TIMING.endHold + TIMING.endFade;
  const elements = new Map<string, Element>();
  function element(name: string): Element {
    const cached = elements.get(name);
    if (cached) {
      return cached;
    }
    const target = root.querySelector(`[data-part="${name}"]`);
    if (!target) {
      throw new Error(`OnlineFigure is missing data-part="${name}".`);
    }
    elements.set(name, target);
    return target;
  }
  const set = (name: string, attribute: string, value: string | number) =>
    element(name).setAttribute(attribute, String(value));
  const px = (auction: number) =>
    plot.left + (auction / plot.maxAuction) * plot.width;
  const py = (value: number) =>
    plot.bottom - (value / plot.maxUtility) * plot.height;
  function curvePoints(
    index: number,
    key: 'value' | 'fixedValue',
    progress: number,
    arrival: number,
  ) {
    const absolute = DISPLAY_START + index;
    const points: [number, number][] = [[px(0), py(0)]];
    for (let j = 0; j < absolute; j++) {
      points.push(
        [px(j + 1), points[points.length - 1][1]],
        [px(j + 1), py(data.rounds[j].after[key])],
      );
    }
    const round = data.rounds[absolute];
    if (arrival > 0) {
      points.push(
        [px(absolute + arrival), points[points.length - 1][1]],
        [
          px(absolute + arrival),
          py(mix(round.before[key], round.after[key], progress)),
        ],
      );
    }
    return points;
  }
  const pathFor = (points: [number, number][]) =>
    points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join('');
  function drawShadowPrice(
    round: Simulation['rounds'][number],
    roundTime: number,
    still: boolean,
  ) {
    // Decorative reels are not intermediate algorithmic iterates.
    // The text description retains the exact current shadow price.
    const reelTime =
      (roundTime - STAGES.update[0] * TIMING.stagesDuration) / PLAYBACK_RATE;
    const settled = still || reelTime >= REEL_DURATIONS[2];
    element('shadow-price').textContent = (
      settled ? round.after.mu : round.before.mu
    ).toFixed(2);
    const beforeDigits = round.before.mu.toFixed(2).replace('.', '');
    const afterDigits = round.after.mu.toFixed(2).replace('.', '');
    for (const [column, duration] of REEL_DURATIONS.entries()) {
      const from = Number(beforeDigits[column]);
      const to = Number(afterDigits[column]);
      const t = still ? 1 : Math.min(1, Math.max(0, reelTime / duration));
      // A short decorative strip: two passing digits, then the exact target.
      // Every column moves, including unchanged digits, without a full 0–9
      // spin.
      const passing = [(from + 1) % 10, (from + 2) % 10, (from + 3) % 10]
        .filter((digit) => digit !== to)
        .slice(0, 2);
      const strip = [from, ...passing, to];
      const travel = t === 1 ? 3 : 3 * (1 - Math.pow(1 - t, 3));
      const whole = Math.floor(travel);
      const fraction = travel - whole;
      const name = `shadow-digit-${column}`;
      set(name, 'transform', `translate(0 ${-REELS.rowHeight * fraction})`);
      element(`${name}-front`).textContent = String(strip[whole]);
      element(`${name}-back`).textContent = String(
        strip[Math.min(whole + 1, 3)],
      );
    }
  }

  function drawSignals(roundTime: number, fade: number, still: boolean) {
    for (const signal of SIGNALS) {
      const local = roundTime - signal.start;
      const head = ease(local / (signal.duration / SIGNAL_TRAVEL_SPEED));
      // One clipped dash moves forward, leaving the fixed grey connector
      // behind.
      // Gap > path length prevents a second dash wrapping into view.
      const opacity = still
        ? 0
        : SIGNAL_STYLE.opacity *
          ease(local / SIGNAL_STYLE.fadeInDuration) *
          (1 - ease((local - signal.duration - signal.hold) / signal.fade)) *
          fade;
      set(
        signal.name,
        'stroke-dasharray',
        `${signal.head} ${SIGNAL_STYLE.dashGap}`,
      );
      set(signal.name, 'stroke-dashoffset', signal.head - head);
      set(signal.name, 'opacity', opacity);
      if (signal.name === 'to-bid') {
        set('next-bid-highlight', 'opacity', opacity / SIGNAL_STYLE.opacity);
      }
      set(
        `${signal.name}-tail`,
        'stroke-dasharray',
        `${signal.tail} ${SIGNAL_STYLE.dashGap}`,
      );
      set(
        `${signal.name}-tail`,
        'stroke-dashoffset',
        signal.head + signal.tail - head,
      );
      set(`${signal.name}-tail`, 'opacity', opacity * SIGNAL_STYLE.tailOpacity);
    }
  }

  function draw(seconds: number, still = false) {
    const cycleTime = still ? activeDuration : seconds % cycleDuration;
    const index = Math.min(count - 1, Math.floor(cycleTime / period));
    const roundTime = cycleTime - index * period;
    const progress = Math.min(1, roundTime / TIMING.stagesDuration);
    const round = rounds[index];
    const stage = (timing: readonly [number, number]) =>
      ease((progress - timing[0]) / timing[1]);
    const incoming = stage(STAGES.incoming);
    const bid = stage(STAGES.bid);
    const auctionBid = stage(STAGES.auctionBid);
    const market = stage(STAGES.market);
    const outcome = stage(STAGES.outcome);

    const fade =
      1 - ease((cycleTime - activeDuration - TIMING.endHold) / TIMING.endFade);
    // Hold the last auction through the finale instead of fading it twice.
    const roundOpacity =
      index === count - 1
        ? fade
        : 1 - ease((roundTime - fadeStart) / TIMING.roundFade);
    set('chart-motion', 'opacity', fade);
    // Each stage reveals this auction's values; never blend different auctions.
    element('opportunity-value').textContent = round.v.toFixed(2);
    set('opportunity-value', 'opacity', incoming * roundOpacity);
    // Visibly return the previous bid to zero during the next arrival, then
    // reveal the new bid. This reset does not represent an algorithmic iterate.
    const previousRound = index > 0 ? rounds[index - 1] : null;
    const reset = ease(roundTime / TIMING.dialResetDuration);
    const displayedBid =
      (previousRound?.bid ?? 0) * (1 - reset) + round.bid * bid;
    const showingPrevious = previousRound !== null && progress < STAGES.bid[0];
    const readout = showingPrevious ? previousRound : round;
    const dialFraction = displayedBid / DIAL.maximum;
    set(
      'formed-bid',
      'transform',
      `rotate(${DIAL.startAngle + DIAL.sweepAngle * dialFraction})`,
    );
    set('bid-sweep', 'stroke-dashoffset', 1 - dialFraction);
    // Keep the dial visible across auction boundaries; only the full-loop
    // finale fades it. Retain the previous actual amount during the visible
    // reset.
    set('bid-group', 'opacity', fade);
    element('bid-value').textContent = readout.bid.toFixed(2);
    set(
      'bid-value',
      'opacity',
      previousRound ? 1 : Math.min(1, bid * REVEAL_OPACITY_RATE),
    );
    // A single fixed scale: the bid grows first; the price is revealed in
    // place.
    // The excess of bid over price is not utility and receives no special fill.
    const bidWidth = (round.bid / RULER.maximum) * RULER.width;
    const priceX = RULER.left + (round.price / RULER.maximum) * RULER.width;
    const labelX = (x: number) =>
      Math.max(RULER.labelMinimum, Math.min(RULER.labelMaximum, x));
    set('bid', 'width', bidWidth * auctionBid);
    set(
      'bid',
      'opacity',
      Math.min(1, auctionBid * REVEAL_OPACITY_RATE) * roundOpacity,
    );
    element('auction-bid-label').textContent = `Bid ${round.bid.toFixed(2)}`;
    set('auction-bid-label', 'x', labelX(RULER.left + bidWidth));
    set('auction-bid-label', 'opacity', auctionBid * roundOpacity);
    set('price-marker', 'x1', priceX);
    set('price-marker', 'x2', priceX);
    set('price-marker', 'opacity', market * roundOpacity);
    element('price-label').textContent = `Price ${round.price.toFixed(2)}`;
    set('price-label', 'x', labelX(priceX));
    set('price-label', 'opacity', market * roundOpacity);
    // Reveal the current auction outcome only after the comparison resolves.
    // A previous outcome must never accompany the next opportunity's value.
    element('result').textContent = round.win
      ? `Won · +${(round.v - round.payment).toFixed(2)} utility`
      : 'Not won · +0 utility';
    set('outcome', 'opacity', outcome * roundOpacity);
    set('win-check', 'opacity', round.win ? 1 : 0);
    set('loss-cross', 'opacity', round.win ? 0 : 1);
    // Only observed payment drives the dual update.
    const consumption = round.payment;
    element('payment-value').textContent = consumption.toFixed(2);
    set('payment-value', 'opacity', stage(STAGES.consumption) * roundOpacity);
    set('spend-bar', 'width', consumption * RULER.width);
    set('spend-bar', 'opacity', stage(STAGES.consumption) * roundOpacity);
    drawShadowPrice(round, roundTime, still);
    drawSignals(roundTime, fade, still);
    for (const [name, key] of [
      ['dmd', 'value'],
      ['fixed', 'fixedValue'],
    ] as const) {
      const points = curvePoints(index, key, outcome, incoming);
      set(`${name}-curve`, 'd', pathFor(points));
      set(`${name}-point`, 'cx', px(DISPLAY_START + index + incoming));
      set(
        `${name}-point`,
        'cy',
        py(mix(round.before[key], round.after[key], outcome)),
      );
    }
  }

  return createPlayback(
    root,
    browser,
    (elapsed, reduced) => draw(elapsed / 1000, reduced),
    { rate: PLAYBACK_RATE, threshold: 0.15 },
  );
}
