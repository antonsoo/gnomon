# /// script
# requires-python = ">=3.11"
# dependencies = ["pymupdf==1.28.2"]
# ///
"""Measure actual downloaded PDF vectors against actual SVGs without product helpers."""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path
from xml.etree import ElementTree

import pymupdf

MM = 25.4 / 72


def vertices(path: str) -> list[tuple[float, float]]:
    numbers = list(map(float, re.findall(r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)", path)))
    assert len(numbers) % 2 == 0
    return list(zip(numbers[::2], numbers[1::2], strict=True))


def center(points: list[tuple[float, float]]) -> tuple[float, float]:
    return tuple(
        (max(values) + min(values)) / 2 for values in zip(*points, strict=True)
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--browser", required=True, type=Path)
    parser.add_argument("--native-before", required=True, type=Path)
    parser.add_argument("--native-after", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    browser = json.loads((args.browser / "results.json").read_text())
    records = []
    bars = []
    for entry in browser["records"]:
        native = args.native_before if entry["phase"] == "before" else args.native_after
        svg = ElementTree.parse(native / f"{entry['case']}-laser.svg")
        paths = svg.findall("{http://www.w3.org/2000/svg}path")
        outline = next(path for path in paths if path.get("stroke-width") == "0.4")
        svg_center = center(vertices(outline.attrib["d"]))
        curves = [
            vertices(path.attrib["d"])
            for path in paths
            if path.get("stroke-width") == "0.2"
            and path.get("stroke-dasharray") == "1,0.8"
        ]
        doc = pymupdf.open(args.browser / entry["pdf"])
        for page in doc:
            assert abs(page.rect.width * MM - 210) < 0.005
            assert abs(page.rect.height * MM - 297) < 0.005
            calibration = []
            for draw in page.get_drawings():
                for item in draw["items"]:
                    if item[0] != "l":
                        continue
                    a, b = item[1:]
                    if (
                        abs(a.y - b.y) < 0.001
                        and abs(a.y * MM - 285) < 0.005
                        and abs(a.x - b.x) * MM > 50
                    ):
                        calibration.append(abs(a.x - b.x) * MM)
            assert len(calibration) == 1
            assert abs(calibration[0] - 100) < 0.002
            bars.extend(calibration)
        drawings = doc[0].get_drawings()
        cut = next(
            draw
            for draw in drawings
            if abs(draw["rect"].width * MM - 160) < 0.002
            and abs(draw["rect"].height * MM - 160) < 0.002
        )
        pdf_center = (
            (cut["rect"].x0 + cut["rect"].x1) * MM / 2,
            (cut["rect"].y0 + cut["rect"].y1) * MM / 2,
        )
        historic = [
            draw
            for draw in drawings
            if draw["type"] == "s"
            and abs(draw["width"] * MM - 0.2) < 1e-5
            and draw["dashes"] != "[] 0"
        ]
        assert len(historic) == len(curves) == entry["visibleCurvePaths"]
        max_error = 0.0
        points = 0
        for draw, curve in zip(historic, curves, strict=True):
            assert all(item[0] == "l" for item in draw["items"])
            actual = [draw["items"][0][1], *[item[2] for item in draw["items"]]]
            assert len(actual) == len(curve)
            for point, reference in zip(actual, curve, strict=True):
                error = math.hypot(
                    point.x * MM - pdf_center[0] - (reference[0] - svg_center[0]),
                    point.y * MM - pdf_center[1] - (reference[1] - svg_center[1]),
                )
                assert error < 0.002, (entry["pdf"], error)
                max_error = max(max_error, error)
                points += 1
        records.append(
            {
                "pdf": entry["pdf"],
                "pages": len(doc),
                "historicalPaths": len(historic),
                "comparedCurveVertices": points,
                "maxSvgPdfVertexErrorMm": max_error,
            }
        )
        doc.close()
    result = {
        "pymupdf": pymupdf.VersionBind,
        "pdfs": len(records),
        "pages": sum(record["pages"] for record in records),
        "calibrationBars": len(bars),
        "maxCalibrationErrorMm": max(abs(bar - 100) for bar in bars),
        "maxSvgPdfVertexErrorMm": max(
            record["maxSvgPdfVertexErrorMm"] for record in records
        ),
        "records": records,
        "scope": "Digital output geometry and calibration. No physical printing, assembly or outdoor accuracy claim.",
    }
    args.out.write_text(json.dumps(result, indent=2) + "\n")
    print(
        json.dumps(
            {key: value for key, value in result.items() if key != "records"}, indent=2
        )
    )


if __name__ == "__main__":
    main()
