import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  makeComparisonCurves,
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
      x: before.x - 0.2 * before.y,
      y: 0.2 * before.x + 0.92 * before.y,
    });
  }
});
