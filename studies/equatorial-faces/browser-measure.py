# /// script
# requires-python = ">=3.11"
# dependencies = ["pymupdf==1.28.2"]
# ///
"""Check actual saved browser downloads with the independent native reader."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

import pymupdf

spec = importlib.util.spec_from_file_location("vectors", Path(__file__).with_name("measure.py"))
vectors = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vectors)

parser = argparse.ArgumentParser()
parser.add_argument("results", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
records = []
for scenario in sorted(args.results.glob("equatorial-faces-*/")):
    latitude = -33.9 if "--33-9-" in scenario.name else 37.7749
    for path in sorted(scenario.glob("*.pdf")):
        radius = 150 if "tiled" in path.name else 80
        case = {"name": scenario.name + "/" + path.name,
                "input": {"latitudeDeg": latitude, "timeReference": {"mode": "apparent", "longitudeDeg": 0},
                          "hourLineOptions": {"startHour": 3, "endHour": 21, "stepHours": .25},
                          "nodusDistanceMm": radius * .32, "gnomonBaseLengthMm": radius * .62},
                "options": {"radiusMm": radius, "innerRadiusMm": max(4, radius * .06), "numerals": "roman"}}
        pdf = pymupdf.open(path)
        assert len(pdf) == (11 if radius == 150 else 3)
        outlines, targets, rects, segments = {}, {}, {}, {}
        rays = 0
        max_error = 0
        rods = []
        numeral_count = 0
        for page in pdf:
            rod = vectors.rod_geometry(page, case)
            if rod is not None:
                rods.append(rod)
            native = vectors.pdf_vectors(page, case)
            if native is None:
                continue
            text = page.get_text()
            side = "opposite" if "O | Opposite" in text or "O-R" in text else "pole-facing"
            native_rays, outline, target, strokes, rectangle, curves, labels = native
            vectors.check_labels(case, side, labels)
            numeral_count += len(labels)
            hours = vectors.expected_hours(case, side)
            assert len(native_rays) == len(hours)
            for hour, ray in zip(hours, native_rays, strict=True):
                error = vectors.ray_error(case, side, hour, ray)
                assert error < 1e-6
                max_error = max(max_error, error)
                rays += 1
            for curve in curves:
                vectors.check_date_curve(case, side, curve, .0001)
            outlines.setdefault(side, outline)
            targets.setdefault(side, target)
            rects.setdefault(side, []).append(rectangle)
            segments.setdefault(side, strokes)
        assert set(outlines) == {"pole-facing", "opposite"}
        vectors.mirrored(outlines["pole-facing"], outlines["opposite"], 1e-4)
        vectors.mirrored(targets["pole-facing"], targets["opposite"], 1e-4)
        for side, strokes in segments.items():
            for a, b in strokes:
                vectors.covered(a, b, rects[side])
        assert len(rods) == 1
        records.append({"scenario": scenario.name, "file": path.name,
                        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "pages": len(pdf),
                        "nativeRaysIncludingTiles": rays, "maxDirectionError": max_error,
                        "exposedRodLengthMm": rods[0], "nativeHourNumeralsIncludingTiles": numeral_count})
assert len(records) == 24, len(records)
args.output.write_text(json.dumps({"downloads": records, "scenarios": 8,
                                   "verifierSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                                   "nativeReaderSha256": hashlib.sha256(Path(__file__).with_name("measure.py").read_bytes()).hexdigest(),
                                   "scope": "Actual Chromium/Firefox downloads; mathematical and serialized physical geometry, not a field trial."}, indent=2) + "\n")
print(json.dumps({"downloads": len(records), "pages": sum(r["pages"] for r in records),
                  "nativeRaysIncludingTiles": sum(r["nativeRaysIncludingTiles"] for r in records)}))
