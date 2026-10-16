import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  makeComparisonCurves,
  sample,
} from '../src/lib/research/pdhg-curves.mjs';
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
    for (let k = 1; k < rows.length; k++) {
      const end =
        rows[k].restart && name !== 'last'
          ? rows[k][name === 'halpern' ? 'preHalpern' : 'preRestart']
          : rows[k][name];
      same(sample(curves[name].get(k), 0), rows[k - 1][name]);
      same(sample(curves[name].get(k), 1), end);
    }
  }
  for (let k = 1; k <= rows.find((row) => row.restart).k; k++) {
    for (let i = 0; i <= 100; i++) {
      same(
        sample(curves.last.get(k), i / 100),
        sample(curves.restarted.get(k), i / 100),
      );
    }
  }
});
