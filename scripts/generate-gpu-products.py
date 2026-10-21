"""Generate rail4284 matrix products for the website.

Reference reflected Halpern core, zero anchor, no restart/presolve/scaling/PID.
The displayed y is perturbed with seed 4284; its transpose product is recomputed.
Display bins are RMS magnitudes in original order, not solver telemetry.
"""
import argparse
import hashlib
import json
import tarfile
from pathlib import Path

import numpy as np
from scipy.io import mmread

DISPLAY_ITERATIONS = range(88, 96)
ROW_BINS = 72
COLUMN_BINS = 96
PERTURBATION_SEED = 4284

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("archive", type=Path, help="Path to rail4284.tar.gz")
parser.add_argument(
    "output", type=Path, nargs="?",
    default=Path(__file__).resolve().parents[1] / "data/research/rail4284-products.json",
    help="Destination JSON (defaults to the repository research data directory)",
)
args = parser.parse_args()

with tarfile.open(args.archive) as archive:
    def read_matrix(suffix):
        return mmread(archive.extractfile(f"rail4284/rail4284{suffix}.mtx"))

    A = read_matrix("").tocsr().astype(np.float64)
    b, c, lower, upper = [
        np.asarray(read_matrix("_" + name)).ravel()
        for name in ["b", "c", "lo", "hi"]
    ]

transpose = A.T.tocsr()
assert A.shape == (4284, 1096894) and A.nnz == 11284032
# Upper bound on the spectral norm: sqrt(||A||_inf * ||A||_1).
bound = np.sqrt(
    np.asarray(abs(A).sum(axis=1)).max()
    * np.asarray(abs(A).sum(axis=0)).max()
)
step = 0.99 / bound
x = np.zeros(A.shape[1])
y = np.zeros(A.shape[0])


def rms(vector, bins):
    """Aggregate contiguous entries without changing their order."""
    edges = np.linspace(0, len(vector), bins + 1, dtype=int)
    return np.sqrt(np.add.reduceat(vector * vector, edges[:-1]) / np.diff(edges))


def check_product(matrix, vector, product, indices):
    """Independently check selected entries using sparse row dot products."""
    for index in indices:
        row = matrix.getrow(index)
        assert np.isclose(product[index], np.dot(row.data, vector[row.indices]))


# Correlated perturbation survives display aggregation. It is only applied to
# the illustration input and is never fed back into the solver loop.
rng = np.random.default_rng(PERTURBATION_SEED)
knots = np.clip(rng.lognormal(mean=0, sigma=0.95, size=73), 0.12, 3.5)
profile = np.interp(
    np.arange(A.shape[0]), np.linspace(0, A.shape[0] - 1, 73), knots,
)
frames = []
for iteration in range(1, 97):
    transpose_y = transpose @ y
    projected = np.clip(x - step * (c - transpose_y), lower, upper)
    reflected = 2 * projected - x
    matrix_x = A @ reflected
    if iteration % 12 == 0:
        check_product(transpose, y, transpose_y, [0, 12345, A.shape[1] - 1])
        check_product(A, reflected, matrix_x, [0, 123, A.shape[0] - 1])

    dual_update = y + step * (b - matrix_x)
    weight = iteration / (iteration + 1)
    x = weight * reflected
    y = weight * (2 * dual_update - y)
    if iteration in DISPLAY_ITERATIONS:
        assert np.isfinite(transpose_y).all() and np.isfinite(matrix_x).all()
        display_y = y * profile
        display_y *= np.linalg.norm(y) / np.linalg.norm(display_y)
        display_transpose_y = transpose @ display_y
        check_product(
            transpose, display_y, display_transpose_y, [0, 12345, A.shape[1] - 1],
        )
        assert np.isclose(np.linalg.norm(display_y), np.linalg.norm(y))
        frames.append({
            "iteration": iteration,
            "y": rms(display_y, ROW_BINS).tolist(),
            "x": rms(reflected, COLUMN_BINS).tolist(),
            "at": rms(display_transpose_y, COLUMN_BINS).tolist(),
            "a": rms(matrix_x, ROW_BINS).tolist(),
        })

# One fixed transfer per product across all frames; no per-frame normalization.
scales = {
    key: max(max(frame[key]) for frame in frames)
    for key in ["at", "a", "x", "y"]
}
with args.archive.open("rb") as archive_file:
    archive_sha256 = hashlib.file_digest(archive_file, "sha256").hexdigest()

data = {
    "matrix": "rail4284",
    "shape": list(A.shape),
    "nnz": A.nnz,
    "archiveSha256": archive_sha256,
    "sequence": (
        "xbar(k), A xbar(k), perturbed y(k+1), AT perturbed y(k+1); "
        "illustration, not a continuous solver trajectory"
    ),
    "perturbation": {
        "seed": PERTURBATION_SEED,
        "type": "smooth positive multiplicative profile; original l2 norm preserved",
        "knots": 73, "sigma": 0.95, "clip": [0.12, 3.5],
    },
    "method": (
        "Reference reflected Halpern PDHG, zero anchor, no restart, scaling "
        "or PID; not solver telemetry"
    ),
    "stepSize": float(step),
    "aggregation": "RMS of contiguous entries; fixed log1p transfer per product",
    "maxRms": scales,
    "frames": frames,
}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(
    json.dumps(data, separators=(",", ":")) + "\n", encoding="utf-8",
)
print(json.dumps({
    "shape": list(A.shape), "nnz": A.nnz,
    "frames": len(frames), "maxRms": scales,
}))
