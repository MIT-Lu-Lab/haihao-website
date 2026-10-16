import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('saved trajectories agree with independent exact-rational calculations', () => {
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const result = spawnSync(
    python,
    [fileURLToPath(new URL('./audit-trajectories.py', import.meta.url))],
    { encoding: 'utf8' },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
