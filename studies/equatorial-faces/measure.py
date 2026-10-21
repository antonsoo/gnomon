# /// script
# requires-python = ">=3.11"
# dependencies = ["pymupdf==1.28.2"]
# ///
"""Independent Sun/ray and serialized SVG/PDF checks for equatorial kits.

Only this producer's paths are recognized. This is not a general PDF parser,
field measurement, printer calibration, or independent ephemeris validation.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
from xml.etree import ElementTree as ET

import pymupdf

MM = 25.4 / 72
NS = "{http://www.w3.org/2000/svg}"


def hour_angle(hour, ref):
    return math.radians(15 * (hour - 12) if ref["mode"] == "apparent" else
                        15 * (hour - 12 - ref["dstOffsetHours"]) + ref["longitudeDeg"] - ref["zoneMeridianDeg"])


def normal_sign(latitude, face):
    return (1 if latitude >= 0 else -1) * (1 if face == "pole-facing" else -1)


def expected_hours(case, face):
    phi = math.radians(case["input"]["latitudeDeg"])
    sign = normal_sign(case["input"]["latitudeDeg"], face)
    ref = case["input"]["timeReference"]
    opts = case["input"]["hourLineOptions"]
    values = []
    for i in range(round((opts["endHour"] - opts["startHour"]) / opts["stepHours"]) + 1):
        hour = opts["startHour"] + i * opts["stepHours"]
        h = hour_angle(hour, ref)
        # For this face, declination has sign s. Maximize Sun-up / cos(delta)
        # over 0 < |delta| <= 23.44. A grazing supremum is not daylight.
        maximum = math.cos(phi) * math.cos(h) + max(0, math.sin(phi) * sign * math.tan(math.radians(23.44)))
        if maximum > 1e-12:
            values.append(hour)
    return values


def ray_error(case, face, hour, point):
    sign = normal_sign(case["input"]["latitudeDeg"], face)
    h = hour_angle(hour, case["input"]["timeReference"])
    expected = (-math.cos(h), -sign * math.sin(h))
    norm = math.hypot(*point)
    unit = (point[0] / norm, point[1] / norm)
    error = math.hypot(unit[0] - expected[0], unit[1] - expected[1])
    return error


def check_date_curve(case, face, points, tolerance):
    phi = math.radians(case["input"]["latitudeDeg"])
    sign = normal_sign(case["input"]["latitudeDeg"], face)
    d = case["input"]["nodusDistanceMm"]
    errors = []
    for u, v in points:
        # Reconstruct Sun from physical nodus N minus plate point P. Because
        # P is in the equatorial plane, its polar component is exactly zero.
        implied = math.degrees(math.atan2(d, math.hypot(u, v)))
        assert abs(implied - 23.44) < tolerance
        assert d * sign * math.sin(phi) - u * math.cos(phi) > -1e-4
    for a, b in zip(points, points[1:]):
        u, v = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        error = abs(math.degrees(math.atan2(d, math.hypot(u, v))) - 23.44)
        assert error < .02  # chord error at this writer's 3.75-degree sampling
        errors.append(error)
    return max(errors, default=0)


def check_labels(case, face, labels):
    hours = [h for h in expected_hours(case, face) if h == int(h)]
    assert len(labels) == len(hours), (case["name"], face, len(labels), len(hours))
    matched = []
    romans = ["XII", "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI"]
    for text, point in labels:
        hour = min(hours, key=lambda h: ray_error(case, face, h, point))
        # Glyph-bounds centres differ slightly from the nominal text anchors.
        # This 0.02-unit direction bound is far below a one-hour label spacing.
        assert ray_error(case, face, hour, point) < .02, (case["name"], face, text, point)
        expected = str(int(hour) % 12 or 12) if case["options"].get("numerals") == "arabic" else romans[int(hour) % 12]
        assert text == expected, (case["name"], face, hour, text, expected)
        matched.append(hour)
    assert sorted(matched) == hours


def covered(a, b, rectangles):
    intervals = []
    for rect in rectangles:
        low, high = 0., 1.
        for axis in (0, 1):
            step = b[axis] - a[axis]
            if abs(step) < 1e-10:
                if not rect[axis] - 1e-4 <= a[axis] <= rect[axis + 2] + 1e-4:
                    high = -1
                    break
            else:
                bounds = sorted(((rect[axis] - a[axis]) / step, (rect[axis + 2] - a[axis]) / step))
                low, high = max(low, bounds[0]), min(high, bounds[1])
        if low <= high + 1e-6:
            intervals.append((low, high))
    reached = 0.
    for low, high in sorted(intervals):
        assert low <= reached + 1e-6, (a, b, intervals)
        reached = max(reached, high)
    assert reached >= 1 - 1e-6, (a, b, intervals)


def svg_vectors(path):
    root = ET.parse(path).getroot()
    view = [float(x) for x in root.attrib["viewBox"].split()]
    assert abs(float(root.attrib["width"].removesuffix("mm")) - view[2]) < 1e-8
    assert abs(float(root.attrib["height"].removesuffix("mm")) - view[3]) < 1e-8
    foot = next(n for n in root.findall(NS + "circle") if n.get("r") == "0.6")
    cx, cy = float(foot.attrib["cx"]), float(foot.attrib["cy"])
    rays = []
    for line in root.findall(NS + "line"):
        if line.get("stroke-width") not in ("0.35", "0.18"):
            continue
        rays.append((cy - float(line.attrib["y2"]), float(line.attrib["x2"]) - cx))
    cut = root.find(NS + "path")
    numbers = [float(v) for v in re.findall(r"[-+]?(?:\d*\.\d+|\d+)", cut.attrib["d"])]
    outline = [(cy - y, x - cx) for x, y in zip(numbers[::2], numbers[1::2], strict=True)]
    curves = []
    for node in root.findall(NS + "path"):
        if node.get("stroke-width") == "0.25":
            values = [float(v) for v in re.findall(r"[-+]?(?:\d*\.\d+|\d+)", node.attrib["d"])]
            curves.append([(cy - y, x - cx) for x, y in zip(values[::2], values[1::2], strict=True)])
    labels = [(node.text, (cy - float(node.attrib["y"]), float(node.attrib["x"]) - cx))
              for node in root.findall(NS + "text") if node.get("text-anchor") == "middle"
              and node.get("dominant-baseline") == "middle"]
    return rays, outline, curves, labels


def pdf_vectors(page, case):
    drawings = page.get_drawings()
    feet = [d for d in drawings if d["fill"] is not None and
            abs(d["rect"].width * MM - 1.2) < 1e-4 and abs(d["rect"].height * MM - 1.2) < 1e-4]
    if not feet:
        return None
    assert len(feet) == 1
    cx = (feet[0]["rect"].x0 + feet[0]["rect"].x1) / 2
    cy = (feet[0]["rect"].y0 + feet[0]["rect"].y1) / 2
    rays, outlines, targets, segments, curves = [], [], [], [], []
    for drawing in drawings:
        width = drawing["width"]
        if width is None:
            continue
        lines = [item for item in drawing["items"] if item[0] == "l"]
        if abs(width * MM - .3) < 1e-5 and len(lines) >= 90:
            outlines.append([((cy - p.y) * MM, (p.x - cx) * MM) for item in lines for p in item[1:]])
        if abs(width * MM - .25) < 1e-5 and len(lines) > 1:
            curves.append([((cy - p.y) * MM, (p.x - cx) * MM) for p in [lines[0][1], *(item[2] for item in lines)]])
        for _, a, b in lines:
            start_radius = math.hypot(a.x - cx, a.y - cy) * MM
            if min(abs(width * MM - .35), abs(width * MM - .15)) < 1e-5 and abs(start_radius - case["options"]["innerRadiusMm"]) < 1e-4:
                rays.append(((cy - b.y) * MM, (b.x - cx) * MM))
                segments.append((((cy - a.y) * MM, (a.x - cx) * MM), ((cy - b.y) * MM, (b.x - cx) * MM)))
            if abs(width * MM - .3) < 1e-5 or abs(width * MM - .25) < 1e-5:
                segments.append((((cy - a.y) * MM, (a.x - cx) * MM), ((cy - b.y) * MM, (b.x - cx) * MM)))
            if abs(width * MM - .2) < 1e-5 and abs((b - a).norm() * MM - 2) < 1e-4 and abs(a.y - b.y) < 1e-4:
                targets.append(((cy - (a.y + b.y) / 2) * MM, ((a.x + b.x) / 2 - cx) * MM))
            if abs(width * MM - .2) < 1e-5 and abs((b - a).norm() * MM - 2) < 1e-4:
                segments.append((((cy - a.y) * MM, (a.x - cx) * MM), ((cy - b.y) * MM, (b.x - cx) * MM)))
    assert len(outlines) == 1
    clips = [d["scissor"] for d in page.get_drawings(extended=True) if d["type"] == "clip"]
    assert len(clips) <= 1
    clip = clips[0] if clips else page.rect
    # These are actual PDF clipping frames, translated into shared physical
    # coordinates by each tile's serialized foot, not by the product planner.
    rectangle = ((cy - clip.y1) * MM, (clip.x0 - cx) * MM, (cy - clip.y0) * MM, (clip.x1 - cx) * MM)
    labels = []
    for span in page.get_texttrace():
        text = "".join(chr(c[0]) for c in span["chars"])
        if not re.fullmatch(r"[0-9IVX]+", text):
            continue
        x0, y0, x1, y1 = span["bbox"]
        point = ((cy - (y0 + y1) / 2) * MM, ((x0 + x1) / 2 - cx) * MM)
        if .65 * case["options"]["radiusMm"] < math.hypot(*point) < case["options"]["radiusMm"]:
            labels.append((text, point))
    return rays, outlines[0], targets, segments, rectangle, curves, labels


def mirrored(a, b, tolerance):
    # Direction and start vertex may differ after reflecting a closed cut path.
    for u, v in a:
        assert min(math.hypot(u - x, -v - y) for x, y in b) < tolerance


def rod_geometry(page, case):
    drawings = page.get_drawings()
    feet = [d for d in drawings if d["fill"] is not None and
            abs(d["rect"].width * MM - 1.6) < 1e-4 and abs(d["rect"].height * MM - 1.6) < 1e-4]
    if not feet:
        return None
    assert len(feet) == 1
    foot = (feet[0]["rect"].tl + feet[0]["rect"].br) / 2
    lines = [item for d in drawings if d["width"] is not None and abs(d["width"] * MM - .35) < 1e-5
             for item in d["items"] if item[0] == "l" and (item[1] - foot).norm() * MM < 1e-4]
    assert len(lines) == 1
    length = (lines[0][2] - foot).norm() * MM
    assert abs(length - case["input"]["gnomonBaseLengthMm"]) < 1e-4, ("exposed rod gauge", length, case["input"]["gnomonBaseLengthMm"])
    crosses = [item for d in drawings if d["width"] is not None and abs(d["width"] * MM - .25) < 1e-5
               for item in d["items"] if item[0] == "l" and abs((item[2] - item[1]).norm() * MM - 3) < 1e-4
               and abs(item[1].y - item[2].y) < 1e-4]
    assert len(crosses) == 1
    nodus = (crosses[0][1] + crosses[0][2]) / 2
    assert abs((nodus - foot).norm() * MM - case["input"]["nodusDistanceMm"]) < 1e-4
    return length


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("capture", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    raw_manifest = (args.capture / "manifest.json").read_bytes()
    manifest = json.loads(raw_manifest)
    after = manifest["phase"] == "after"
    results = []
    for case in manifest["cases"]:
        file = args.capture / case["pdfFile"]
        assert hashlib.sha256(file.read_bytes()).hexdigest() == case["pdfSha256"]
        pdf = pymupdf.open(file)
        text = "\n".join(page.get_text() for page in pdf)
        page_faces = []
        pdf_count = svg_count = 0
        svg_outlines, pdf_outlines, targets, clip_rects, face_segments = {}, {}, {}, {}, {}
        max_error = bad_svg = bad_pdf = date_vertices = 0
        max_chord_error = 0
        rod_sheets = []
        labels_checked = 0
        for face in case["faces"]:
            path = args.capture / face["svgFile"]
            assert hashlib.sha256(path.read_bytes()).hexdigest() == face["svgSha256"]
            rays, outline, curves, labels = svg_vectors(path)
            if after or abs(case["input"]["latitudeDeg"]) < 90:
                check_labels(case, face["face"], labels)
                labels_checked += len(labels)
            for curve in curves:
                if after or abs(case["input"]["latitudeDeg"]) < 90:
                    max_chord_error = max(max_chord_error, check_date_curve(case, face["face"], curve, .002))
                date_vertices += len(curve)
            svg_outlines[face["face"]] = outline
            hours = [line["hour"] for line in face["hourLines"]]
            assert hours == expected_hours(case, face["face"]), (case["name"], face["face"])
            assert len(rays) == len(hours)
            for hour, ray in zip(hours, rays, strict=True):
                error = ray_error(case, face["face"], hour, ray)
                if after:
                    assert error < 3e-5, (case["name"], face["face"], hour, error)
                bad_svg += error >= 3e-5
                max_error = max(max_error, error)
                svg_count += 1
        for page in pdf:
            rod = rod_geometry(page, case)
            if rod is not None:
                rod_sheets.append(rod)
            size = (210, 297) if case["options"]["format"] == "a4" else (215.9, 279.4)
            # jsPDF's standard A4 MediaBox rounds its dimensions to 0.01 pt.
            assert abs(page.rect.width * MM - size[0]) < .003
            assert abs(page.rect.height * MM - size[1]) < .003
            # Every page must contain its own native 100-mm scale reference.
            bars = [item for d in page.get_drawings() for item in d["items"] if item[0] == "l"
                    and abs(item[1].y - item[2].y) < 1e-5 and abs(abs(item[2].x - item[1].x) * MM - 100) < 1e-5
                    and abs(item[1].y * MM - (page.rect.height * MM - 12)) < 1e-4]
            assert len(bars) == 1
            vectors = pdf_vectors(page, case)
            if vectors is None:
                continue
            rays, outline, target, segments, rectangle, curves, labels = vectors
            page_text = page.get_text()
            side = "opposite" if "O | Opposite" in page_text or "O-R" in page_text else "pole-facing"
            face = next(f for f in case["faces"] if f["face"] == side)
            if after or abs(case["input"]["latitudeDeg"]) < 90:
                check_labels(case, side, labels)
                labels_checked += len(labels)
            for curve in curves:
                # Baseline polar azimuth faults also distort chord spacing.
                if after or abs(case["input"]["latitudeDeg"]) < 90:
                    max_chord_error = max(max_chord_error, check_date_curve(case, side, curve, .0001))
                date_vertices += len(curve)
            assert len(rays) == len(face["hourLines"]), (case["name"], side, len(rays))
            for line, ray in zip(face["hourLines"], rays, strict=True):
                error = ray_error(case, side, line["hour"], ray)
                if after:
                    assert error < 1e-6, (case["name"], side, line["hour"], error)
                bad_pdf += error >= 1e-6
                max_error = max(max_error, error)
                pdf_count += 1
            pdf_outlines.setdefault(side, outline)
            targets.setdefault(side, target)
            clip_rects.setdefault(side, []).append(rectangle)
            face_segments.setdefault(side, segments)
            page_faces.append(side)
        if after:
            assert set(page_faces) == {"pole-facing", "opposite"}
            mirrored(svg_outlines["pole-facing"], svg_outlines["opposite"], .002)
            mirrored(pdf_outlines["pole-facing"], pdf_outlines["opposite"], 1e-4)
            assert len(targets["pole-facing"]) == len(targets["opposite"]) == 1
            mirrored(targets["pole-facing"], targets["opposite"], 1e-4)
            assert "exposed on EACH side" in text and "not automatic duplex" in text
        else:
            assert set(page_faces) == {"pole-facing"}
        for side, segments in face_segments.items():
            for a, b in segments:
                covered(a, b, clip_rects[side])
        assert rod_sheets
        results.append({"name": case["name"], "pages": len(pdf), "nativeSvgRays": svg_count,
                        "nativePdfRaysIncludingTiles": pdf_count, "maxDirectionError": max_error,
                        "badSvgRays": bad_svg, "badPdfRaysIncludingTiles": bad_pdf,
                        "dateVerticesIncludingTiles": date_vertices, "maxDateChordErrorDeg": max_chord_error,
                        "completePrintedStrokeSegments": sum(len(s) for s in face_segments.values()),
                        "exposedRodLengthMm": rod_sheets[0], "fullSizeRodSheets": len(rod_sheets),
                        "nativeHourNumeralsCheckedIncludingTiles": labels_checked,
                        "facesPresent": sorted(set(page_faces))})
    result = {"phase": manifest["phase"], "manifestSha256": hashlib.sha256(raw_manifest).hexdigest(),
              "verifierSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              "pymupdf": pymupdf.VersionBind, "cases": results,
              "nativeSvgRays": sum(r["nativeSvgRays"] for r in results),
              "nativePdfRaysIncludingTiles": sum(r["nativePdfRaysIncludingTiles"] for r in results),
              "scope": "Independent analytical Sun visibility and signed ray directions in serialized drawings; mirrored cut paths, alignment targets and native scale bars. No physical printer or field measurements."}
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({k: result[k] for k in ("phase", "nativeSvgRays", "nativePdfRaysIncludingTiles")}))


if __name__ == "__main__":
    main()
