import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { makeComparisonCurves } from '../src/lib/research/pdhg-curves.ts';
import {
  kktResidual,
  logResidual,
  makeLiftedCurves,
  sampleLifted,
} from '../src/lib/research/kkt-lift.ts';
test('residual curves preserve endpoints without extra extrema', () => {
  const { rows } = JSON.parse(
    fs.readFileSync(new URL('../public/pdhg-comparison.json', import.meta.url)),
  );
  const curves = makeLiftedCurves(makeComparisonCurves(rows));
  for (const name of ['last', 'restarted', 'halpern']) {
    for (let k = 1; k < rows.length; k++) {
      const segment = curves[name].get(k);
      for (let i = 0; i <= 100; i++) {
        const point = sampleLifted(segment, i / 100);
        assert.ok(
          point.residualLog >=
            Math.min(segment.startLog, segment.endLog) - 1e-12 &&
            point.residualLog <=
              Math.max(segment.startLog, segment.endLog) + 1e-12,
        );
      }
      assert.ok(
        Math.abs(
          sampleLifted(segment, 0).residualLog - logResidual(segment.start),
        ) < 1e-12,
      );
      assert.ok(
        Math.abs(
          sampleLifted(segment, 1).residualLog - logResidual(segment.end),
        ) < 1e-12,
      );
    }
  }
  for (const row of rows) {
    for (const name of ['last', 'restarted', 'halpern']) {
      assert.ok(Math.abs(kktResidual(row[name]) - row[name].residual) < 1e-14);
    }
  }
  assert.throws(() => logResidual({ x: 1, y: 0 }));
});

test('natural KKT residual respects the nonnegative constraint', () => {
  assert.equal(kktResidual({ x: 1, y: 0 }), 0);
  assert.equal(kktResidual({ x: 0, y: 2 }), 1);
  assert.equal(kktResidual({ x: 0, y: -2 }), Math.sqrt(5));
});
