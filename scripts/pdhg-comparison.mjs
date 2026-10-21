import fs from 'node:fs';

// Same problem as Lu & Yang Fig. 1. These are independently calculated
// trajectories, not recovered settings or digitized curves from that figure.
const eta = 0.2,
  steps = 220,
  initial = [2, 2],
  beta = Math.exp(-1),
  firstEpoch = 1;
const T = ([x, y]) => {
  const u = Math.max(0, x - eta * y);
  return [u, y + eta * (2 * u - x - 1)];
};
const norm = (z) => Math.hypot(...z);
const difference = (a, b) => a.map((v, i) => v - b[i]);
const canonicalNorm = ([x, y]) =>
  Math.sqrt(Math.max(0, x * x + y * y - 2 * eta * x * y));
const pack = ([x, y]) => ({
  x,
  y,
  residual: Math.hypot(x - Math.max(0, x - y), x - 1),
});
// Euclidean normalized duality gap over the ball intersected with x >= 0.
function normalizedGap([x, y], radius) {
  const n = Math.hypot(y, x - 1);
  if (!n) return 0;
  if (radius < 1e-14) return Math.hypot(x < 1e-14 ? Math.max(-y, 0) : y, x - 1);
  if ((-radius * y) / n >= -x) return n;
  return (
    (y * x +
      Math.abs(x - 1) * Math.sqrt(Math.max(0, radius * radius - x * x))) /
    radius
  );
}
let last = [...initial],
  current = [...initial],
  aAnchor = [...initial],
  previousAnchor = [...initial];
let h = [...initial],
  hAnchor = [...initial],
  sum = [0, 0];
let aLocal = 0,
  aEpoch = 0,
  hLocal = 0,
  hEpoch = 0,
  hBaseline = 0;
const rows = [
  {
    k: 0,
    last: pack(last),
    restarted: pack(current),
    halpern: pack(h),
    restart: false,
    preRestart: null,
    preHalpern: null,
    anchor: pack(hAnchor),
    halpernCalls: 0,
  },
];
for (let k = 1; k <= steps; k++) {
  last = T(last);
  current = T(current);
  aLocal++;
  sum = sum.map((v, i) => v + current[i]);
  const average = sum.map((v) => v / aLocal);
  const restart =
    aEpoch === 0
      ? aLocal >= firstEpoch
      : normalizedGap(average, norm(difference(average, aAnchor))) <=
        beta *
          normalizedGap(aAnchor, norm(difference(aAnchor, previousAnchor)));
  const preRestart = restart ? pack(current) : null;
  if (restart) {
    previousAnchor = [...aAnchor];
    current = [...average];
    aAnchor = [...current];
    sum = [0, 0];
    aLocal = 0;
    aEpoch++;
  }
  // One T call serves both the residual check and update/reset. A Halpern
  // reset uses its own horizontal-axis unit, just like every other T call.
  const th = T(h);
  const residual = canonicalNorm(difference(h, th));
  if (hLocal === 0) hBaseline = residual;
  const halpernRestart =
    hEpoch === 0 ? hLocal > firstEpoch : residual <= beta * hBaseline;
  if (halpernRestart) {
    h = th;
    hAnchor = [...h];
    hLocal = 0;
    hEpoch++;
  } else {
    h = th.map(
      (v, i) => ((hLocal + 1) * (2 * v - h[i]) + hAnchor[i]) / (hLocal + 2),
    );
    hLocal++;
  }
  rows.push({
    k,
    last: pack(last),
    restarted: pack(current),
    epochAverage: pack(average),
    halpern: pack(h),
    restart,
    preRestart,
    preHalpern: halpernRestart ? pack(h) : null,
    anchor: pack(hAnchor),
    halpernInner: hLocal,
    halpernCalls: k,
  });
}
const metadata = {
  problem: 'min_{x>=0} max_y (x-1)y',
  eta,
  steps,
  initial,
  beta,
  firstEpoch,
  average:
    'Current PDHG iterate. Restart to the mean of new iterates in the epoch, excluding its anchor (Applegate et al. Algorithm 1).',
  halpern:
    'Reflected Halpern (Lu & Yang Eq. 26), with Eq. 10 adaptive restarts in the canonical PDHG norm.',
  restartPolicy:
    'Average: Eq. 30 with the constrained Euclidean normalized gap. Reflected Halpern: canonical fixed-point residual. beta=1/e; first epochs t>=1 and k>1 respectively.',
  counting:
    'Each horizontal-axis unit is one PDHG operator evaluation, including Halpern reset steps. This is not a runtime benchmark.',
  residual: 'Natural KKT residual: hypot(x-max(0,x-y),x-1).',
  provenance:
    'Independent calculation on the problem in Lu & Yang Fig. 1. Start (2,2), step 0.2. Not an exact reproduction of their figure or its unspecified settings.',
  sources: [
    'https://arxiv.org/abs/2105.12715',
    'https://arxiv.org/abs/2407.16144',
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
console.log(`Generated ${rows.length} constrained-example states per method.`);
