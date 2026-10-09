# /// script
# requires-python = ">=3.11"
# dependencies = ["pymupdf==1.28.2", "pillow==12.3.0"]
# ///
"""Measure emitted PDFs without importing Gnomon's layout or rendering code.

Checks page sizes, scale bars, physical cut radii, numeral containment, clipping,
complete grids, every reconstructed vector path and shared registration targets.
Rasterizes neighboring sheets at 10 pixels/mm to compare their actual overlaps.
These are digital checks; a printer, paper assembly and outdoor dial remain untested.
"""

import argparse
import hashlib
import json
import math
import re
from pathlib import Path
from tempfile import TemporaryDirectory

import pymupdf as fitz
from PIL import Image, ImageChops

MM = 25.4 / 72
PAPER = {"a4": (210, 297), "letter": (215.9, 279.4)}


def near(actual, expected, tolerance=0.002):
    assert abs(actual - expected) < tolerance, (actual, expected)


def inside_polygon(x, y, points):
    inside = False
    for (ax, ay), (bx, by) in zip(points, points[1:] + points[:1]):
        if (ay > y) != (by > y) and x < ax + (y - ay) * (bx - ax) / (by - ay):
            inside = not inside
    return inside


def corners(rect):
    return [
        (rect.x0, rect.y0),
        (rect.x0, rect.y1),
        (rect.x1, rect.y0),
        (rect.x1, rect.y1),
    ]


def verify(path, format, radius, render_dir=None):
    doc = fitz.open(path)
    paper_w, paper_h = PAPER[format]
    bars = []
    tiles = []
    glyphs = 0
    radius_errors = []
    baseline_vectors = None
    vector_error = 0
    for page in doc:
        near(page.rect.width * MM, paper_w, 0.005)
        near(page.rect.height * MM, paper_h, 0.005)
        paths = page.get_drawings(extended=True)
        calibration = []
        for draw in paths:
            if draw["type"] == "clip":
                continue
            for item in draw["items"]:
                if item[0] != "l":
                    continue
                a, b = item[1:]
                if (
                    abs(a.y - b.y) < 0.001
                    and abs(a.y * MM - (paper_h - 12)) < 0.005
                    and abs(a.x - b.x) * MM > 50
                ):
                    calibration.append(abs(a.x - b.x) * MM)
        assert len(calibration) == 1, (path.name, page.number, calibration)
        near(calibration[0], 100)
        bars += calibration
        text = page.get_text()
        if page.number == 0 and len(doc) > 1:
            assert "not a cutting template" in text
            continue
        tiled = len(doc) > 1
        if tiled:
            row, column, rows, columns = map(
                int,
                re.search(
                    r"R(\d+)C(\d+) / (\d+) rows? x (\d+) columns?", text
                ).groups(),
            )
            ox, oy = map(
                float,
                re.search(
                    r"Drawing origin x ([\d.]+) mm, y ([\d.]+) mm", text
                ).groups(),
            )
            width, height = map(
                float, re.search(r"Frame ([\d.]+) x ([\d.]+) mm", text).groups()
            )
            near(width, paper_w - 20)
            near(height, paper_h - 52)
            near(ox, (column - 1) * (width - 10))
            near(oy, (row - 1) * (height - 10))
            clips = [d for d in paths if d["type"] == "clip"]
            assert len(clips) == 1
            for actual, expected in zip(
                clips[0]["scissor"], [10, 22, 10 + width, 22 + height]
            ):
                near(actual * MM, expected, 0.005)
            geometry = [d for d in paths if d.get("level") == 1]
        else:
            ox = oy = 0
            geometry = [d for d in paths if d["type"] != "clip"]
        # First vector path is the physical cut. The filled 1.2 mm circle is
        # the root; neither is inferred from Gnomon's intended layout.
        outline = geometry[0]
        points = [(item[1].x, item[1].y) for item in outline["items"]]
        roots = [
            d
            for d in geometry
            if d.get("fill") and abs(d["rect"].width * MM - 1.2) < 0.001
        ]
        assert len(roots) == 1
        root = (roots[0]["rect"].tl + roots[0]["rect"].br) / 2
        for x, y in points:
            distance = math.hypot(x - root.x, y - root.y) * MM
            if distance > 0.01:  # A fan also has its root as an outline vertex.
                near(distance, radius)
                radius_errors.append(abs(distance - radius))
        # Texttrace includes whole glyphs even when a tile clips part of them.
        # Check the actual font's bounds against the full physical cut path.
        for span in page.get_texttrace():
            label = "".join(chr(c[0]) for c in span["chars"])
            if not re.fullmatch(r"[IVX]+|\d{1,2}", label):
                continue
            glyphs += len(span["chars"])
            for char in span["chars"]:
                for x, y in corners(fitz.Rect(char[3])):
                    assert inside_polygon(x, y, points), (
                        path.name,
                        page.number,
                        label,
                        (x, y),
                    )
        if not tiled:
            continue
        vectors = []
        for draw in geometry:
            for item in draw["items"]:
                for point in item[1:]:
                    assert isinstance(point, fitz.Point), item
                    vectors.extend([point.x * MM + ox - 10, point.y * MM + oy - 22])
        if baseline_vectors is None:
            baseline_vectors = vectors
        assert len(vectors) == len(baseline_vectors)
        error = max(abs(a - b) for a, b in zip(vectors, baseline_vectors))
        assert error < 0.002, (path.name, page.number, error)
        vector_error = max(vector_error, error)
        targets = []
        for draw in paths:
            if (
                draw.get("level") == 0
                and draw.get("color")
                and abs(draw["rect"].width * MM - 2.4) < 0.001
                and abs(draw["rect"].height * MM - 2.4) < 0.001
            ):
                center = (draw["rect"].tl + draw["rect"].br) / 2
                targets.append((center.x * MM + ox - 10, center.y * MM + oy - 22))
        pix = page.get_pixmap(
            matrix=fitz.Matrix(254 / 72, 254 / 72), colorspace=fitz.csGRAY
        )
        img = Image.frombytes("L", (pix.width, pix.height), pix.samples)
        crop = img.crop((100, 220, 100 + round(width * 10), 220 + round(height * 10)))
        tiles.append(
            {
                "row": row,
                "column": column,
                "rows": rows,
                "columns": columns,
                "x": ox,
                "y": oy,
                "width": width,
                "height": height,
                "targets": targets,
                "image": crop,
            }
        )
    seams = []
    if tiles:
        expected = {
            (r, c)
            for r in range(1, tiles[0]["rows"] + 1)
            for c in range(1, tiles[0]["columns"] + 1)
        }
        assert {(t["row"], t["column"]) for t in tiles} == expected
        assert len(doc) == len(expected) + 1
        for tile in tiles:
            for neighbor in tiles:
                right = (
                    neighbor["row"] == tile["row"]
                    and neighbor["column"] == tile["column"] + 1
                )
                below = (
                    neighbor["column"] == tile["column"]
                    and neighbor["row"] == tile["row"] + 1
                )
                if not (right or below):
                    continue
                matches = [
                    p
                    for p in tile["targets"]
                    if any(math.dist(p, q) < 0.002 for q in neighbor["targets"])
                ]
                assert len(matches) == 2, (
                    path.name,
                    tile["row"],
                    tile["column"],
                    matches,
                )
                a, b = tile["image"], neighbor["image"]
                if right:
                    a = a.crop((a.width - 98, 2, a.width - 2, a.height - 2))
                    b = b.crop((2, 2, 98, b.height - 2))
                else:
                    a = a.crop((2, a.height - 98, a.width - 2, a.height - 2))
                    b = b.crop((2, 2, b.width - 2, 98))
                # Exclude the outer 0.2 mm frame stroke. Allow antialiasing
                # variation but fail a shifted/missing printed overlap.
                diff = ImageChops.difference(a, b).histogram()
                mismatch = sum(diff[25:]) / (a.width * a.height)
                assert mismatch < 0.005, (path.name, "raster seam", mismatch)
                seams.append(mismatch)
        if render_dir:
            render_dir.mkdir(parents=True, exist_ok=True)
            width = round(max(t["x"] + t["width"] for t in tiles) * 10)
            height = round(max(t["y"] + t["height"] for t in tiles) * 10)
            assembled = Image.new("L", (width, height), 255)
            for tile in tiles:
                assembled.paste(
                    tile["image"], (round(tile["x"] * 10), round(tile["y"] * 10))
                )
            assembled.thumbnail((1400, 1400))
            assembled.save(render_dir / f"{path.stem}-assembled.png")
            for number, suffix in [(0, "guide"), (1, "tile")]:
                pix = doc[number].get_pixmap(matrix=fitz.Matrix(1.5, 1.5))
                pix.save(render_dir / f"{path.stem}-{suffix}.png")
    return {
        "file": path.name,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "pages": len(doc),
        "checked_bars": len(bars),
        "max_bar_error_mm": max(abs(b - 100) for b in bars),
        "max_cut_radius_error_mm": max(radius_errors),
        "glyphs_inside_cut": glyphs,
        "max_reconstructed_vector_error_mm": vector_error,
        "seams": len(seams),
        "max_seam_pixel_mismatch_fraction": max(seams, default=0),
    }


def check_controls(path, format, radius):
    """Prove the reader rejects defects even when calibration bars stay correct."""
    rejected = []
    with TemporaryDirectory(prefix="invalid-controls-", dir=path.parent) as directory:
        for name in ["scaled-drawing", "shifted-second-tile", "missing-last-tile"]:
            doc = fitz.open(path)
            assert len(doc) > 2
            if name == "missing-last-tile":
                doc.delete_page(len(doc) - 1)
            else:
                page = doc[1 if name == "scaled-drawing" else 2]
                xref = page.get_contents()[0]
                stream = doc.xref_stream(xref)
                assert b"W\nn\n" in stream
                # Change only the clipped drawing; page size, header, frame,
                # registration targets and calibration bars stay unchanged.
                transform = (
                    b"0.97 0 0 0.97 0 0 cm\n"
                    if name == "scaled-drawing"
                    else b"1 0 0 1 2.834645669 0 cm\n"
                )
                doc.update_stream(
                    xref, stream.replace(b"W\nn\n", b"W\nn\n" + transform, 1)
                )
            destination = Path(directory) / f"{name}.pdf"
            doc.save(destination)
            try:
                verify(destination, format, radius)
            except AssertionError:
                rejected.append(name)
            else:
                raise AssertionError(f"Verifier accepted the defective {name} control")
    return rejected


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument(
        "--render",
        type=Path,
        help="Render the north A4 and wall Letter assembly artifacts",
    )
    parser.add_argument("--report", type=Path)
    parser.add_argument("--check-controls", action="store_true")
    args = parser.parse_args()
    manifest = json.loads((args.directory / "manifest.json").read_text())
    results = []
    for record in manifest["records"]:
        path = args.directory / record["file"]
        assert hashlib.sha256(path.read_bytes()).hexdigest() == record["sha256"]
        render = (
            args.render if path.name in {"north-a4.pdf", "wall-letter.pdf"} else None
        )
        result = verify(path, record["format"], record["settings"]["radiusMm"], render)
        results.append(result)
        print(
            f"{path.name}: {result['pages']} pages, {result['seams']} seams, {result['glyphs_inside_cut']} glyphs inside the cut"
        )
    report = {
        "reader": f"PyMuPDF {fitz.VersionBind}",
        "raster_dpi": 254,
        "physical_print_verified": False,
        "results": results,
    }
    if args.check_controls:
        record = next(r for r in manifest["records"] if "north-a4" in r["file"])
        report["rejected_controls"] = check_controls(
            args.directory / record["file"],
            record["format"],
            record["settings"]["radiusMm"],
        )
        print("Rejected controls:", ", ".join(report["rejected_controls"]))
    if args.report:
        args.report.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
