import fs from 'node:fs';
import assert from 'node:assert/strict';
const baseTrajectories = JSON.parse(
  fs.readFileSync(
    new URL('../data/research/pdhg-trajectories.json', import.meta.url),
    'utf8',
  ),
);
const {
  eta: STEP_SIZE,
  period: RESTART_PERIOD,
  steps: STEPS,
  initial: INITIAL_POINT,
} = baseTrajectories.metadata;
const T = ([x, y]) => [
  x - STEP_SIZE * y,
  STEP_SIZE * x + (1 - 2 * STEP_SIZE * STEP_SIZE) * y,
];
const R = (z) => T(z).map((value, i) => 2 * value - z[i]);
const pack = (z) => ({ x: z[0], y: z[1], distance: Math.hypot(...z) });
const close = (a, b) =>
  a.forEach((value, i) => assert.ok(Math.abs(value - b[i]) < 2e-12));
let z = INITIAL_POINT.slice();
let anchor = INITIAL_POINT.slice();
let local = 0;
let power = anchor.slice();
let sum = anchor.slice();
let calls = 0;
const rows = baseTrajectories.rows.map((row) => {
  if (row.k === 0) {
    return {
      ...row,
      halpern: pack(z),
      preHalpern: null,
      anchor: pack(anchor),
      halpernCalls: 0,
    };
  }
  const reflected = R(z);
  calls++;
  z = reflected.map(
    (value, i) => ((local + 1) * value + anchor[i]) / (local + 2),
  );
  local++;
  // Independent closed form for a linear reflected operator: mean of R^j anchor, j=0..local.
  power = R(power);
  sum = sum.map((value, i) => value + power[i]);
  close(
    z,
    sum.map((value) => value / (local + 1)),
  );
  const preHalpern = local === RESTART_PERIOD ? pack(z) : null;
  if (local === RESTART_PERIOD) {
    const before = z;
    z = T(z);
    calls++;
    close(z, [
      before[0] - STEP_SIZE * before[1],
      before[1] + STEP_SIZE * (2 * z[0] - before[0]),
    ]);
    anchor = z.slice();
    local = 0;
    power = anchor.slice();
    sum = anchor.slice();
  }
  return {
    ...row,
    halpern: pack(z),
    preHalpern,
    anchor: pack(anchor),
    halpernCalls: calls,
  };
});
close([rows[1].halpern.x, rows[1].halpern.y], [rows[1].last.x, rows[1].last.y]);
for (const row of rows) {
  assert.equal(row.halpernCalls, row.k + Math.floor(row.k / RESTART_PERIOD));
  if (row.restart) {
    close(
      [row.halpern.x, row.halpern.y],
      T([row.preHalpern.x, row.preHalpern.y]),
    );
  }
}
const metadata = {
  problem: 'min_x max_y xy; x,y in R; solution (0,0)',
  eta: STEP_SIZE,
  period: RESTART_PERIOD,
  initial: INITIAL_POINT,
  steps: STEPS,
  halpern:
    'Paper 2407.16144v2 Eq26 and Algorithm2: z_next=((j+1)(2T(z)-z)+anchor)/(j+2); restart at j=25 to T(z), reset j=0.',
  restartPolicy:
    'Fixed 25 inner updates for BOTH restarted methods. Chosen controlled illustration, not the theorem-derived optimal period; not cuPDLPx adaptive policy.',
  counting:
    'k counts inner updates. Halpern restart uses one additional T evaluation; halpernCalls=k+floor(k/25). Not an equal-compute or runtime benchmark.',
  provenance:
    'Independent deterministic numerical calculation. No cuPDLPx solver run, presolve, adaptive weights or industrial data.',
  sources: [
    'https://arxiv.org/html/2105.12715v4#S5.SS2',
    'https://arxiv.org/html/2407.16144v2#S6',
  ],
};
fs.mkdirSync(new URL('../public/', import.meta.url), { recursive: true });
fs.writeFileSync(
  new URL('../public/pdhg-comparison.json', import.meta.url),
  JSON.stringify({ metadata, rows }, null, 2),
);
fs.writeFileSync(
  new URL('../data/research/pdhg-comparison.csv', import.meta.url),
  'k,PDHG_x,PDHG_y,raPDHG_x,raPDHG_y,r2HPDHG_x,r2HPDHG_y,average_x,average_y,restart,halpern_T_calls\n' +
    rows
      .map((row) =>
        [
          row.k,
          row.last.x,
          row.last.y,
          row.restarted.x,
          row.restarted.y,
          row.halpern.x,
          row.halpern.y,
          row.average?.x ?? '',
          row.average?.y ?? '',
          row.restart,
          row.halpernCalls,
        ].join(','),
      )
      .join('\n'),
);
console.log(
  'Verified 150 reflected Halpern steps against independent closed form, 6 exact T(z) resets, initial overlap and operator counts.',
);
console.log(
  JSON.stringify(
    [25, 50, 75].map((k) => ({
      k,
      pdhg: rows[k].last.distance,
      ra: rows[k].restarted.distance,
      r2: rows[k].halpern.distance,
      calls: rows[k].halpernCalls,
    })),
  ),
);
