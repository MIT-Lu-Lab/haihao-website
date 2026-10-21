import { writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { DISPLAY_START, RULER } from '../src/lib/research/online-layout.ts';

// Synthetic randomized illustration of section 6.2's net-utility bidding model.
// Values fluctuate with gradual drift. Neither bidder knows future
// values or prices.
// DMD bids v/(1+mu), capped by remaining budget, and updates from actual
// payment.
// The cap is a practical feasibility safeguard; no counterfactual prices feed
// DMD.
// Fixed multiplier 1 means truthful bidding v, also capped by remaining budget.
// This is an illustrative scenario, not a benchmark against tuned fixed pacing.
const SEED = 42;
const LOCAL_NOISE_SEED = 137;
const COMPETITION_SEED = 271;
const AUCTIONS = 48;
const BUDGET = 10;
const STEP_SIZE = 0.6;
const TARGET = BUDGET / AUCTIONS;

// Independent seeded streams preserve the saved experiment exactly.
function createGenerator(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const random = createGenerator(SEED);
const localRandom = createGenerator(LOCAL_NOISE_SEED);
const competitionRandom = createGenerator(COMPETITION_SEED);
const localNoise = () => 2 * localRandom() - 1;
let localValue = 0;
let localPrice = 0;
const INITIAL_MU = 0.8;
let mu = INITIAL_MU;
let remaining = BUDGET;
let fixedRemaining = BUDGET;
let value = 0;
let fixedValue = 0;
const rounds = [];
for (let t = 0; t < AUCTIONS; t++) {
  localValue = 0.5 * localValue + 0.5 * localNoise();
  localPrice = 0.5 * localPrice + 0.5 * localNoise();
  const v =
    0.8 +
    1.2 * random() +
    (0.2 * t) / (AUCTIONS - 1) +
    0.08 * localValue +
    0.3 * Math.tanh((t + 1 - 18) / 9);
  const lowCompetition = competitionRandom() < 0.2;
  const price =
    (0.2 + 0.6 * random() + 0.04 * localPrice) * (lowCompetition ? 0.25 : 1);
  const before = { mu, remaining, fixedRemaining, value, fixedValue };
  const unconstrainedWin = v >= (1 + mu) * price;
  const bid = Math.min(v / (1 + mu), remaining);
  if (t >= DISPLAY_START) {
    assert(bid >= 0 && bid <= RULER.maximum, 'Displayed bid exceeds ruler.');
    assert(
      price >= 0 && price <= RULER.maximum,
      'Displayed price exceeds ruler.',
    );
  }
  const win = bid >= price;
  const payment = win ? price : 0;
  const fixedWin = Math.min(v, fixedRemaining) >= price; // Fixed multiplier 1.
  remaining -= payment;
  fixedRemaining -= fixedWin ? price : 0;
  value += win ? v - price : 0;
  fixedValue += fixedWin ? v - price : 0;
  // Section 6.2 uses observed payment; losing auctions contribute zero.
  mu = Math.max(0, mu + STEP_SIZE * (payment - TARGET));
  assert(remaining >= -1e-12 && fixedRemaining >= -1e-12);
  assert.equal(win, unconstrainedWin && price <= before.remaining);
  rounds.push({
    t: t + 1,
    v,
    price,
    lowCompetition,
    bid,
    win,
    payment,
    fixedWin,
    before,
    after: { mu, remaining, fixedRemaining, value, fixedValue },
  });
}
const result = {
  objective: 'net utility (value minus payment)',
  scenario:
    'Illustrative sample selected for a clear comparison: random ' +
    'values with linear drift 0.2 and a smooth tanh trend of amplitude ' +
    '0.3 centered at auction 18 with width 9, retaining overlapping ' +
    'distributions; random prices with small bounded local ' +
    'fluctuations in both series and independently sampled ' +
    'low-competition auctions throughout the horizon.',
  baseline: 'Truthful bidding (fixed bid multiplier 1), not tuned pacing',
  T: AUCTIONS,
  budget: BUDGET,
  eta: STEP_SIZE,
  initialMu: INITIAL_MU,
  seed: SEED,
  localNoiseSeed: LOCAL_NOISE_SEED,
  competitionSeed: COMPETITION_SEED,
  lowCompetitionProbability: 0.2,
  lowCompetitionPriceFactor: 0.25,
  rounds,
};
const directory = new URL('../data/research/', import.meta.url);
mkdirSync(directory, { recursive: true });
writeFileSync(
  new URL('online-allocation.json', directory),
  JSON.stringify(result),
);
console.log(
  JSON.stringify({
    auctions: AUCTIONS,
    budget: BUDGET,
    value,
    fixedValue,
    remaining,
    fixedRemaining,
  }),
);
