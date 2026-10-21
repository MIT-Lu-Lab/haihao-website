"""Independent rational-state audit of the constrained comparison data."""

import json
import math
from fractions import Fraction as F
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ETA = F(1, 5)
BETA = math.exp(-1)


def pdhg(state):
    x, y = state
    next_x = max(F(0), x - ETA * y)
    return next_x, y + ETA * (2 * next_x - x - 1)


def subtract(a, b):
    return tuple(x - y for x, y in zip(a, b))


def norm(state):
    return math.sqrt(float(sum(value * value for value in state)))


def canonical_norm(state):
    x, y = state
    return math.sqrt(float(x * x + y * y - 2 * ETA * x * y))


def mean(points):
    return tuple(sum(point[i] for point in points) / len(points) for i in range(2))


def normalized_gap(state, radius):
    x, y = map(float, state)
    if not radius:
        return math.hypot(max(-y, 0) if x == 0 else y, x - 1)
    # Independent construction: maximize on the feasible circular arc by
    # checking the unconstrained maximizer and both boundary intersections.
    gradient_norm = math.hypot(y, x - 1)
    if gradient_norm == 0:
        return 0
    candidates = []
    if -radius * y / gradient_norm >= -x:
        candidates.append(gradient_norm)
    if radius >= x:
        dy = math.sqrt(max(0, radius * radius - x * x))
        candidates.extend([
            (y * x + (x - 1) * dy) / radius,
            (y * x - (x - 1) * dy) / radius,
        ])
    return max(candidates)


def audit(rows):
    errors = []

    def check(saved, expected):
        error = max(
            abs(saved[key] - float(expected[i]))
            for i, key in enumerate(('x', 'y'))
        )
        assert error < 2e-12, (len(errors), error)
        errors.append(error)

    last = current = halpern = (F(2), F(2))
    average_anchor = previous_anchor = halpern_anchor = last
    epoch = []
    average_epochs = halpern_epochs = inner = 0
    baseline = 0

    for k, row in enumerate(rows):
        assert row['k'] == k and row['halpernCalls'] == k
        if k:
            last = pdhg(last)
            current = pdhg(current)
            epoch.append(current)
            average = mean(epoch)
            average_restart = (
                len(epoch) >= 1 if average_epochs == 0 else
                normalized_gap(average, norm(subtract(average, average_anchor)))
                <= BETA * normalized_gap(
                    average_anchor, norm(subtract(average_anchor, previous_anchor))
                )
            )
            assert row['restart'] == average_restart
            check(row['epochAverage'], average)
            if average_restart:
                check(row['preRestart'], current)
                previous_anchor = average_anchor
                current = average_anchor = average
                epoch = []
                average_epochs += 1
            else:
                assert row['preRestart'] is None

            next_halpern = pdhg(halpern)
            residual = canonical_norm(subtract(halpern, next_halpern))
            if inner == 0:
                baseline = residual
            halpern_restart = (
                inner > 1 if halpern_epochs == 0 else residual <= BETA * baseline
            )
            assert bool(row['preHalpern']) == halpern_restart
            if halpern_restart:
                halpern = halpern_anchor = next_halpern
                inner = 0
                halpern_epochs += 1
                check(row['preHalpern'], halpern)
            else:
                halpern = tuple(
                    F(inner + 1, inner + 2) * (2 * next_halpern[i] - halpern[i])
                    + F(1, inner + 2) * halpern_anchor[i]
                    for i in range(2)
                )
                inner += 1

        for key, state in [
            ('last', last), ('restarted', current),
            ('halpern', halpern), ('anchor', halpern_anchor),
        ]:
            check(row[key], state)

    return {
        'point_checks': len(errors),
        'max_absolute_error': max(errors),
        'operator_evaluations_per_method': len(rows) - 1,
    }


if __name__ == '__main__':
    data = json.loads((ROOT / 'public/pdhg-comparison.json').read_text(encoding='utf8'))
    print(json.dumps(audit(data['rows'])))
