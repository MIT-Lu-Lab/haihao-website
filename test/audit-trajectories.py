"""Independent exact-rational audit of saved data; does not import generators."""
import json
from fractions import Fraction as F
from pathlib import Path

root = Path(__file__).resolve().parents[1]
rows = json.loads((root / 'public/pdhg-comparison.json').read_text())['rows']
M = ((F(1), -F(1,5)), (F(1,5), F(23,25)))
R = ((F(1), -F(2,5)), (F(2,5), F(21,25)))
def mul(A, z):
    return tuple(sum(a*b for a,b in zip(row,z)) for row in A)
def mean(points):
    return tuple(sum(p[i] for p in points)/len(points) for i in range(2))
max_error = 0
checks = 0
def check(point, expected):
    global max_error, checks
    error = max(abs(point[key]-float(expected[i])) for i,key in enumerate(('x','y')))
    max_error = max(max_error, error)
    checks += 1
    assert error < 2e-12, (checks, error)

blue = green = anchor = (F(1), F(1))
green_epoch, all_blue = [], []
reflection_powers = [anchor]
for k, row in enumerate(rows):
    assert row['k'] == k
    assert row['restart'] == (k > 0 and k % 25 == 0)
    assert row['halpernCalls'] == k + k//25
    if k:
        blue = mul(M, blue)
        all_blue.append(blue)
        green = mul(M, green)
        green_epoch.append(green)
        # Closed form, not the generator's weighted recurrence:
        # z_j = (I + R + ... + R^j) anchor / (j+1).
        reflection_powers.append(mul(R, reflection_powers[-1]))
        halpern = mean(reflection_powers)
        check(row['average'], mean(all_blue))
        if k % 25 == 0:
            check(row['preRestart'], green)
            check(row['preHalpern'], halpern)
            green = mean(green_epoch)
            green_epoch = []
            halpern = mul(M, halpern)
            anchor = halpern
            reflection_powers = [anchor]
        else:
            assert row['preRestart'] is None and row['preHalpern'] is None
    else:
        halpern = anchor
    for key, value in [('last',blue), ('restarted',green), ('halpern',halpern), ('anchor',anchor)]:
        check(row[key], value)
print(json.dumps({'point_checks':checks, 'max_absolute_error':max_error,
                  'iterations_per_method':len(rows)-1, 'restarts_per_method':sum(row['restart'] for row in rows)}))
