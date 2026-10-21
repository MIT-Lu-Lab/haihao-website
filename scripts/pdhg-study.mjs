import fs from 'node:fs';
import assert from 'node:assert/strict';
// Paper: arXiv:2105.12715v4, Section 5.2, equation (38), A=1.
// Use L(x,y)=xy consistently. The authors' LP code uses -xy; this
// is a documented sign convention, not a claim of pixel-exact replication.
const STEP_SIZE = 0.2;
const RESTART_PERIOD = 25;
const STEPS = 150;
const INITIAL_POINT = [1, 1];
const step = ([x, y]) => {
  const nextX = x - STEP_SIZE * y;
  return [nextX, y + STEP_SIZE * (2 * nextX - x)];
};
const energy = ([x, y]) => x * x + y * y - 2 * STEP_SIZE * x * y;
const norm = (z) => Math.hypot(...z);
const close = (a, b, tolerance = 1e-12) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const lift = (z) => ({ x: z[0], y: z[1], distance: norm(z) });
let current = INITIAL_POINT.slice();
let restarted = INITIAL_POINT.slice();
let sum = [0, 0];
let epochSum = [0, 0];
let count = 0;
const rows = [
  {
    k: 0,
    last: lift(current),
    average: null,
    restarted: lift(restarted),
    restart: false,
    preRestart: null,
  },
];
for (let k = 1; k <= STEPS; k++) {
  const previous = current;
  current = step(current);
  // Independent matrix representation, and exact contraction in the PDHG metric.
  close(current[0], previous[0] - STEP_SIZE * previous[1]);
  close(
    current[1],
    STEP_SIZE * previous[0] + (1 - 2 * STEP_SIZE * STEP_SIZE) * previous[1],
  );
  close(
    energy(current),
    (1 - STEP_SIZE * STEP_SIZE) ** k * energy(INITIAL_POINT),
  );
  sum = sum.map((value, i) => value + current[i]);
  restarted = step(restarted);
  epochSum = epochSum.map((value, i) => value + restarted[i]);
  count++;
  const restart = count === RESTART_PERIOD;
  const preRestart = restart ? lift(restarted) : null;
  if (restart) {
    restarted = epochSum.map((value) => value / count);
    epochSum = [0, 0];
    count = 0;
  }
  rows.push({
    k,
    last: lift(current),
    average: lift(sum.map((value) => value / k)),
    restarted: lift(restarted),
    restart,
    preRestart,
  });
}
// Averaging checked independently against saved points. A restart is exactly
// the epoch mean, excluding the epoch initial point, per Algorithm 1.
for (let k = 1; k <= STEPS; k++) {
  for (const key of ['x', 'y']) {
    close(
      rows[k].average[key],
      rows.slice(1, k + 1).reduce((a, row) => a + row.last[key], 0) / k,
    );
    if (k % RESTART_PERIOD === 0) {
      const epoch = rows.slice(k - RESTART_PERIOD + 1, k);
      const mean =
        (epoch.reduce((a, row) => a + row.restarted[key], 0) +
          rows[k].preRestart[key]) /
        RESTART_PERIOD;
      close(rows[k].restarted[key], mean);
    }
  }
}
for (let k = 0; k < RESTART_PERIOD; k++) {
  assert.deepEqual(rows[k].last, rows[k].restarted);
}
close(rows[50].last.distance, 0.4781535664845966);
close(rows[50].average.distance, 0.1488103959784787);
close(rows[50].restarted.distance, 0.044724283827607465);
const data = {
  metadata: {
    problem: 'min_x max_y xy; X=R, Y=R',
    stateSpace: 'R^2',
    solutionSet: '{(0,0)}',
    height:
      'Euclidean distance sqrt(x^2+y^2); visualization lift, not an extra optimization variable',
    eta: STEP_SIZE,
    period: RESTART_PERIOD,
    steps: STEPS,
    initial: INITIAL_POINT,
    source: 'https://arxiv.org/html/2105.12715v4#S5.SS2',
    equation: '38',
    restartSource: 'Algorithm 1',
    greenSeries:
      'Restarted PDHG CURRENT iterate, after reset at multiples of 25; pre-reset endpoint saved separately',
    average: 'Mean of z^1,...,z^k; undefined at k=0',
    provenance:
      'Independent numerical reproduction of the paper algorithm in the +xy convention; not original Google animation data; 150 steps extends the 50-step paper illustration',
  },
  rows,
};
fs.mkdirSync(new URL('../data/research/', import.meta.url), {
  recursive: true,
});
fs.writeFileSync(
  new URL('../data/research/pdhg-trajectories.json', import.meta.url),
  JSON.stringify(data, null, 2),
);
const header =
  'k,last_x,last_y,last_distance,average_x,average_y,average_distance,restarted_x,restarted_y,restarted_distance,restart,pre_restart_x,pre_restart_y';
fs.writeFileSync(
  new URL('../data/research/pdhg-trajectories.csv', import.meta.url),
  header +
    '\n' +
    rows
      .map((row) =>
        [
          row.k,
          row.last.x,
          row.last.y,
          row.last.distance,
          row.average?.x ?? '',
          row.average?.y ?? '',
          row.average?.distance ?? '',
          row.restarted.x,
          row.restarted.y,
          row.restarted.distance,
          row.restart,
          row.preRestart?.x ?? '',
          row.preRestart?.y ?? '',
        ].join(','),
      )
      .join('\n'),
);
console.log(
  'Verified 150 updates: matrix recurrence, exact metric contraction, all averages, six epoch resets, initial overlap and numerical checkpoints.',
);
console.log(JSON.stringify(rows[50]));
