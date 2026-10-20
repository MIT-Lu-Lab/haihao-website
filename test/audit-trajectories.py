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

import math
beta2 = math.exp(-2)
def square(z): return sum(v*v for v in z)
def metric_square(z): return z[0]**2+z[1]**2-F(2,5)*z[0]*z[1]
blue = raw = anchor = a_anchor = (F(1), F(1))
epoch, all_blue = [], []
reflection_powers = [anchor]
a_epoch = h_epoch = 0
for k, row in enumerate(rows):
    assert row['k'] == k and row['halpernCalls'] == k
    if k:
        blue = mul(M, blue); all_blue.append(blue)
        raw = mul(M, raw); epoch.append(raw)
        average = mean(epoch)
        ar = len(epoch)>=1 if a_epoch==0 else float(square(average)/square(a_anchor))<=beta2
        assert row['restart'] == ar
        check(row['epochAverage'],average)
        if ar:
            check(row['preRestart'],raw)
            raw = a_anchor = average; epoch=[]; a_epoch+=1
        else: assert row['preRestart'] is None
        # Independent reflected-power mean, not the generator recurrence.
        current=mean(reflection_powers)
        hr = len(reflection_powers)-1>1 if h_epoch==0 else float(metric_square(current)/metric_square(anchor))<=beta2
        assert bool(row['preHalpern']) == hr
        if hr:
            halpern=mul(M,current); check(row['preHalpern'],halpern)
            anchor=halpern;reflection_powers=[anchor];h_epoch+=1
        else:
            reflection_powers.append(mul(R,reflection_powers[-1]))
            halpern=mean(reflection_powers)
        check(row['average'],mean(all_blue))
    else: halpern=anchor
    for key,value in [('last',blue),('restarted',raw),('halpern',halpern),('anchor',anchor)]:check(row[key],value)
print(json.dumps({'point_checks':checks,'max_absolute_error':max_error,'operator_evaluations_per_method':len(rows)-1}))
