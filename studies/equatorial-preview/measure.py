# /// script
# requires-python = ">=3.11"
# dependencies = ["pymupdf==1.28.2"]
# ///
"""Measure actual face-selector downloads without importing product geometry."""
import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path

import pymupdf

HERE = Path(__file__).resolve().parent
source = HERE.parent / "equatorial-faces/measure.py"
spec = importlib.util.spec_from_file_location("vectors", source)
vectors = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vectors)
parser = argparse.ArgumentParser()
parser.add_argument("results", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
records = []
for folder in sorted(args.results.glob("equatorial-preview-*/")):
    data = json.loads((folder / "faces.json").read_text())
    assert data["viewport"]["width"] == data["width"]
    radius = data["radiusMm"]
    case = {"name": folder.name, "input": {
        "latitudeDeg": data["latitude"], "timeReference": {"mode": "apparent", "longitudeDeg": 0},
        "hourLineOptions": {"startHour": 3, "endHour": 21, "stepHours": .25},
        "nodusDistanceMm": radius * .32, "gnomonBaseLengthMm": radius * .62},
        "options": {"radiusMm": radius, "innerRadiusMm": max(4, radius * .06), "numerals": "roman"}}
    outlines, directions = {}, {}
    svg_rays = pdf_rays = numerals = 0
    for item in data["records"]:
        if item["shadowVisible"]:
            h = math.radians(item["solar"]["hour angle"])
            delta = math.radians(item["solar"]["declination"])
            distance = case["input"]["nodusDistanceMm"] / abs(math.tan(delta))
            sign = vectors.normal_sign(data["latitude"], item["face"])
            tip = item["shadowTip"]
            error = math.hypot(tip["u"] + distance * math.cos(h), tip["v"] + sign * distance * math.sin(h))
            assert error < .25 and abs(error - item["projectionErrorMm"]) < 1e-9
        else:
            assert item["shadowTip"] is None and item["projectionErrorMm"] is None
        path = folder / item["file"]
        assert hashlib.sha256(path.read_bytes()).hexdigest() == item["sha256"]
        face = item["face"]
        rays, outline, curves, labels = vectors.svg_vectors(path)
        hours = vectors.expected_hours(case, face)
        assert len(rays) == len(hours)
        for hour, ray in zip(hours, rays, strict=True):
            assert vectors.ray_error(case, face, hour, ray) < 2e-5
        vectors.check_labels(case, face, labels)
        for curve in curves:
            vectors.check_date_curve(case, face, curve, .002)
        if face in outlines:
            assert outline == outlines[face] and rays == directions[face]
        outlines[face], directions[face] = outline, rays
        svg_rays += len(rays)
        numerals += len(labels)
    assert len(data["records"]) == 4 and set(outlines) == {"pole-facing", "opposite"}
    vectors.mirrored(outlines["pole-facing"], outlines["opposite"], 1e-4)
    pair = json.loads((folder / "pair.gnomon.json").read_text())
    assert pair["version"] == 1 and pair["dialType"] == "equatorial"
    assert pair["latitudeDeg"] == data["latitude"] and pair["radiusMm"] == radius
    assert pair["timeMode"] == "apparent" and pair["customDateTimeLocal"] == "2026-06-21T12:00"
    pdf_path = folder / "opposite-first.pdf"
    assert hashlib.sha256(pdf_path.read_bytes()).hexdigest() == data["pdfSha256"]
    pdf = pymupdf.open(pdf_path)
    assert len(pdf) == 3
    assert "O | Opposite face" in pdf[0].get_text() and "P | Pole-facing face" in pdf[1].get_text()
    for page, face in zip([pdf[0], pdf[1]], ["opposite", "pole-facing"], strict=True):
        rays, outline, targets, strokes, rectangle, curves, labels = vectors.pdf_vectors(page, case)
        hours = vectors.expected_hours(case, face)
        assert len(rays) == len(hours)
        for hour, ray in zip(hours, rays, strict=True):
            assert vectors.ray_error(case, face, hour, ray) < 1e-6
        vectors.check_labels(case, face, labels)
        for curve in curves:
            vectors.check_date_curve(case, face, curve, .0001)
        for a, b in strokes:
            vectors.covered(a, b, [rectangle])
        pdf_rays += len(rays)
        numerals += len(labels)
    exposed = vectors.rod_geometry(pdf[2], case)
    assert exposed is not None
    png_path = folder / "opposite.png"
    assert hashlib.sha256(png_path.read_bytes()).hexdigest() == data["pngSha256"]
    png = pymupdf.Pixmap(str(png_path))
    assert png.width == data["raster"]["width"] and png.height == data["raster"]["height"]
    assert data["raster"]["maxComponentDifference"] <= 2
    records.append({"scenario": folder.name, "svgDownloads": 4, "svgHourRays": svg_rays,
                    "pdfPages": len(pdf), "pdfHourRays": pdf_rays, "hourNumerals": numerals,
                    "exposedRodMm": exposed, "png": data["raster"],
                    "seasonalShadowChecks": [{"season": item["season"], "face": item["face"],
                                               "visible": item["shadowVisible"], "tip": item["shadowTip"],
                                               "projectionErrorMm": item["projectionErrorMm"]} for item in data["records"]]})
assert len(records) == 8
report = {"cases": records, "nativeReader": f"PyMuPDF {pymupdf.VersionBind}",
          "verifierSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
          "geometryReaderSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
          "scope": "Actual browser downloads, serialized geometry and browser raster equivalence; no physical printing or field trial."}
args.output.write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"scenarios": len(records), "svgDownloads": sum(r["svgDownloads"] for r in records),
                  "svgRays": sum(r["svgHourRays"] for r in records), "pdfPages": sum(r["pdfPages"] for r in records),
                  "pdfRays": sum(r["pdfHourRays"] for r in records), "numerals": sum(r["hourNumerals"] for r in records)}))
