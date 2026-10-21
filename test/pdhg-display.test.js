import {
  kktResidual,
  makeLiftedCurves,
  sampleLifted,
} from '../src/lib/research/kkt-lift.ts';
import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  makeComparisonCurves,
  makeAverageDisplayRows,
  sample,
} from '../src/lib/research/pdhg-curves.ts';
test('display interpolation preserves endpoints and restart boundaries', () => {
  const { rows } = JSON.parse(
    fs.readFileSync(new URL('../public/pdhg-comparison.json', import.meta.url)),
  );
  const curves = makeComparisonCurves(rows);
  const same = (a, b) => {
    for (const key of ['x', 'y']) {
      assert.ok(Math.abs(a[key] - b[key]) < 2e-12);
    }
  };
  for (const name of ['last', 'restarted', 'halpern']) {
    const preRestartKey = { restarted: 'preRestart', halpern: 'preHalpern' }[
      name
    ];
    for (let k = 1; k < rows.length; k++) {
      const endpoint = preRestartKey && rows[k][preRestartKey];
      const end = endpoint || rows[k][name];
      same(sample(curves[name].get(k), 0), rows[k - 1][name]);
      same(sample(curves[name].get(k), 1), end);
    }
  }
  for (const row of rows.filter((r) => r.restart)) {
    same(row.restarted, row.epochAverage);
  }
  for (const row of rows.filter((r) => r.preHalpern)) {
    assert.equal(row.halpernCalls, row.k);
    const before = rows[row.k - 1].halpern;
    same(row.halpern, {
      x: Math.max(0, before.x - 0.2 * before.y),
      y:
        before.y +
        0.2 * (2 * Math.max(0, before.x - 0.2 * before.y) - before.x - 1),
    });
  }
});

test('Average displays the epoch mean and its KKT, without changing saved states', () => {
  const { rows } = JSON.parse(
    fs.readFileSync(new URL('../public/pdhg-comparison.json', import.meta.url)),
  );
  const snapshot = JSON.stringify(rows);
  const display = makeAverageDisplayRows(rows);
  const curves = makeLiftedCurves(makeComparisonCurves(display));
  let sumX = 0,
    sumY = 0,
    count = 0,
    sumResidual = 0;
  let distinguishedMeanResidual = false;
  for (let k = 1; k < rows.length; k++) {
    const row = rows[k];
    const current = row.preRestart ?? row.restarted;
    sumX += current.x;
    sumY += current.y;
    count++;
    sumResidual += kktResidual(current);
    const mean = { x: sumX / count, y: sumY / count };
    const shown = display[k].restarted;
    assert.ok(Math.hypot(shown.x - mean.x, shown.y - mean.y) < 1e-12);
    assert.ok(Math.abs(shown.residual - kktResidual(mean)) < 1e-12);
    assert.ok(
      Math.abs(
        sampleLifted(curves.restarted.get(k), 1).residualLog -
          Math.log10(kktResidual(mean)),
      ) < 1e-12,
    );
    distinguishedMeanResidual ||=
      Math.abs(shown.residual - sumResidual / count) > 1e-3;
    assert.strictEqual(display[k].last, row.last);
    assert.strictEqual(display[k].halpern, row.halpern);
    if (row.restart) {
      assert.deepEqual(display[k].preRestart, shown);
      if (k + 1 < rows.length) {
        const before = sampleLifted(curves.restarted.get(k), 1);
        const after = sampleLifted(curves.restarted.get(k + 1), 0);
        assert.ok(Math.hypot(before.x - after.x, before.y - after.y) < 1e-12);
        assert.ok(Math.abs(before.residualLog - after.residualLog) < 1e-12);
      }
      sumX = sumY = count = sumResidual = 0;
    }
  }
  assert.ok(
    distinguishedMeanResidual,
    'KKT of the mean must not be replaced by mean KKT',
  );
  assert.equal(JSON.stringify(rows), snapshot);
});

test('missing epoch averages fail instead of silently displaying current iterates', () => {
  const { rows } = JSON.parse(
    fs.readFileSync(new URL('../public/pdhg-comparison.json', import.meta.url)),
  );
  assert.throws(
    () => makeAverageDisplayRows([{ ...rows[2], epochAverage: undefined }]),
    /Missing epoch average/,
  );
});
