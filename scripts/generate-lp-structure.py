"""Render the complete rail4284 matrix as a binned nonzero-density map.
Usage: python scripts/generate-lp-structure.py /path/to/rail4284.tar.gz
Requires numpy and Pillow. Downloads are intentionally separate from generation.
"""
import argparse
import hashlib
import json
import tarfile
from pathlib import Path
import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("archive", type=Path, help="Path to rail4284.tar.gz")
archive = parser.parse_args().archive
root = Path(__file__).resolve().parents[1]
width, height = 720, 560
bins = np.zeros((height, width), dtype=np.int64)
with tarfile.open(archive) as source:
    matrix = source.extractfile("rail4284/rail4284.mtx")
    for line in matrix:
        if not line.startswith(b"%"):
            rows, columns, declared = map(int, line.split())
            break
    count = 0
    for line in matrix:
        row, column, value = line.split()
        if float(value) != 0:
            bins[
                (int(row) - 1) * height // rows,
                (int(column) - 1) * width // columns,
            ] += 1
            count += 1
assert (rows, columns, count) == (4284, 1096894, 11284032)
assert count == declared == int(bins.sum())
# All entries contribute; no sampling, permutation, or synthetic structure.
# A logarithmic intensity transfer reveals sparse and dense regions together.
intensity = (np.log1p(bins) / np.log1p(bins.max())) ** 0.85
paper = np.array([255, 255, 255])
ink = np.array([117, 0, 20])
rgb = paper + (ink - paper) * intensity[:, :, None]
out = root / "public/images/research"
out.mkdir(parents=True, exist_ok=True)
# Quantize the display colors only; counts and intensity calculation stay exact.
image = Image.fromarray(rgb.astype("uint8")).quantize(
    colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE,
)
image.save(out / "rail4284-density.png", optimize=True)
metadata = {
    "instance": "Mittelmann/rail4284",
    "rows": rows,
    "columns": columns,
    "nonzeros": count,
    "bins": [width, height],
    "maxBinCount": int(bins.max()),
    "ordering": "original Matrix Market row and column order",
    "intensity": "(log(1+bin_count)/log(1+max_bin_count))^0.85",
    "representation": "SuiteSparse standard-form LP; columns include auxiliary variables",
    "source": "https://sparse.tamu.edu/Mittelmann/rail4284",
    "download": "https://www.cise.ufl.edu/research/sparse/MM/Mittelmann/rail4284.tar.gz",
}
with archive.open("rb") as archive_file:
    metadata["archiveSha256"] = hashlib.file_digest(archive_file, "sha256").hexdigest()
metadata_path = root / "data/research/rail4284-figure.json"
metadata_path.parent.mkdir(parents=True, exist_ok=True)
metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
print(json.dumps({
    "rows": rows,
    "columns": columns,
    "nonzeros": count,
    "allEntriesAccountedFor": True,
}))
