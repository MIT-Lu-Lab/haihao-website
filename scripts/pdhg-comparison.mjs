import fs from 'node:fs';
const base = JSON.parse(
  fs.readFileSync(
    new URL('../data/research/pdhg-trajectories.json', import.meta.url),
    'utf8',
  ),
);
const { eta, steps, initial } = base.metadata;
const beta = Math.exp(-1),
  firstEpoch = 1;
const T = ([x, y]) => [x - eta * y, eta * x + (1 - 2 * eta * eta) * y];
// Scaling P_eta by eta leaves all restart ratios unchanged.
const metric = ([x, y]) =>
  Math.sqrt(Math.max(0, x * x + y * y - 2 * eta * x * y));
const pack = (z) => ({ x: z[0], y: z[1], distance: Math.hypot(...z) });
let raw = initial.slice(),
  h = initial.slice(),
  anchor = initial.slice(),
  sum = [0, 0];
let aLocal = 0,
  aEpoch = 0,
  aAnchor = initial.slice();
let hLocal = 0,
  hEpoch = 0,
  hBaseline = 0;
const rows = base.rows.map((row) => {
  const k = row.k;
  if (!k)
    return {
      ...row,
      restarted: pack(raw),
      halpern: pack(h),
      preRestart: null,
      preHalpern: null,
      anchor: pack(anchor),
      halpernCalls: 0,
    };
  raw = T(raw);
  aLocal++;
  sum = sum.map((v, i) => v + raw[i]);
  const average = sum.map((v) => v / aLocal);
  // For unconstrained xy in the Euclidean trust region, normalized duality
  // gap = ||(y,-x)||_2, independent of the radius. No extra T call is needed.
  const restart =
    aEpoch === 0
      ? aLocal >= firstEpoch
      : Math.hypot(...average) <= beta * Math.hypot(...aAnchor);
  const preRestart = restart ? pack(raw) : null;
  if (restart) {
    raw = average.slice();
    aAnchor = raw.slice();
    sum = [0, 0];
    aLocal = 0;
    aEpoch++;
  }
  // Evaluate T exactly once. Reuse it for the residual check AND the update
  // or reset. The reset therefore occupies its own horizontal-axis unit.
  const th = T(h);
  const residual = metric(h.map((v, i) => v - th[i]));
  if (hLocal === 0) hBaseline = residual;
  const halpernRestart =
    hEpoch === 0 ? hLocal > firstEpoch : residual <= beta * hBaseline;
  if (halpernRestart) {
    h = th;
    anchor = h.slice();
    hLocal = 0;
    hEpoch++;
  } else {
    h = th.map(
      (v, i) => ((hLocal + 1) * (2 * v - h[i]) + anchor[i]) / (hLocal + 2),
    );
    hLocal++;
  }
  return {
    ...row,
    restart,
    restarted: pack(raw),
    epochAverage: pack(average),
    halpern: pack(h),
    preRestart,
    preHalpern: halpernRestart ? pack(h) : null,
    halpernInner: hLocal,
    anchor: pack(anchor),
    halpernCalls: k,
  };
});
const metadata = {
  problem: base.metadata.problem,
  eta,
  beta,
  firstEpoch,
  steps,
  initial,
  average:
    'Current PDHG iterate within each epoch. At restart, replace it with the mean of the current epoch new iterates, excluding the epoch anchor, as in Applegate et al. Algorithm 1. epochAverage stores the mean separately.',
  halpern:
    'Reflected Halpern, Lu & Yang Eq. 26 / Algorithm 2. Adaptive Eq. 10 with the PDHG canonical norm and a separately counted T reset.',
  counting:
    'k counts PDHG operator evaluations for every method, including the Halpern reset. Equal operator counts, not a runtime benchmark.',
  restartPolicy:
    'Adaptive. Average: Applegate Eq. 30, Euclidean normalized gap, beta=1/e, first epoch t>=1. Reflected Halpern: Lu & Yang Eq. 10, canonical fixed-point residual, beta=1/e, first epoch k>1. Checked each evaluation, not the production solver heuristics.',
  provenance:
    'Independent deterministic calculation on min_x max_y xy. No parameter selection to obtain a visual advantage.',
  sources: [
    'https://arxiv.org/html/2105.12715v4#S4',
    'https://arxiv.org/html/2407.16144v2#S6',
  ],
};
fs.writeFileSync(
  new URL('../public/pdhg-comparison.json', import.meta.url),
  JSON.stringify({ metadata, rows }, null, 2),
);
fs.writeFileSync(
  new URL('../data/research/pdhg-comparison.csv', import.meta.url),
  'operator_evaluations,PDHG_x,PDHG_y,raPDHG_current_x,raPDHG_current_y,r2HPDHG_x,r2HPDHG_y,restart,halpern_T_calls\n' +
    rows
      .map((r) =>
        [
          r.k,
          r.last.x,
          r.last.y,
          r.restarted.x,
          r.restarted.y,
          r.halpern.x,
          r.halpern.y,
          r.restart,
          r.halpernCalls,
        ].join(','),
      )
      .join('\n'),
);
console.log(
  JSON.stringify(
    [25, 50, 60].map((k) => ({
      k,
      average: rows[k].restarted.distance,
      halpern: rows[k].halpern.distance,
    })),
  ),
);
