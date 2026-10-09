# /// script
# requires-python = ">=3.11"
# dependencies = ["pymupdf==1.28.2", "pillow==12.3.0"]
# ///
"""Read emitted SVG/PDF pieces and reconstruct the style in local East/North/Up.

No application geometry is imported. The independent plate verifier additionally
checks physical cuts, glyphs, sheet grids, calibration and raster seam agreement.
"""

import argparse
import hashlib
import importlib.util
import json
import math
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from tempfile import TemporaryDirectory

import pymupdf as fitz

spec = importlib.util.spec_from_file_location(
    "plates", Path(__file__).with_name("verify-prints.py")
)
plates = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plates)
MM = 25.4 / 72
near = plates.near


def numbers(value):
    return [float(n) for n in re.findall(r"[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?", value)]


def one(values):
    assert len(values) == 1, values
    return values[0]


def basis(settings):
    """Construct a physical reference frame directly, without Gnomon's projector."""
    phi = math.radians(settings["latitudeDeg"])
    pole = (0, math.cos(phi), math.sin(phi))
    kind = settings["dialType"]
    if kind == "horizontal":
        u, v, normal = (0, 1, 0), (1, 0, 0), (0, 0, 1)
    elif kind == "vertical":
        az = math.radians(180 + settings["wallDeclinationDeg"])
        u = (0, 0, 1)
        v = (-math.cos(az), math.sin(az), 0)
        normal = (math.sin(az), math.cos(az), 0)
    else:
        sign = 1 if phi >= 0 else -1
        normal = tuple(sign * x for x in pole)
        # A perpendicular rod has no in-plane component, so this basis need
        # not select a particular rotation of an equatorial disc at a pole.
        u = (0, -math.sin(phi), math.cos(phi))
        v = (1, 0, 0)
    sign = 1 if sum(a * b for a, b in zip(pole, normal)) >= 0 else -1
    axis = tuple(sign * x for x in pole)
    components = tuple(sum(a * b for a, b in zip(axis, d)) for d in (u, v, normal))
    return u, v, normal, axis, components


def expected(settings):
    *_, (u, v, rise) = basis(settings)
    along = math.hypot(u, v)
    size = settings["radiusMm"] * 0.62
    length = size / max(along, rise)
    return {
        "base": 0 if along < 1e-12 else along * length,
        "rise": rise * length,
        "length": length,
        "nodus": settings["radiusMm"] * 0.32,
        "mount": (u * length, v * length),
    }


def check_shape(foot, apex, nodus, base_end, dimensions):
    base = abs(apex[0] - foot[0])
    rise = abs(apex[1] - foot[1])
    length = math.dist(foot, apex)
    errors = []
    for actual, wanted in [
        (base, dimensions["base"]),
        (rise, dimensions["rise"]),
        (length, dimensions["length"]),
        (math.dist(foot, nodus), dimensions["nodus"]),
    ]:
        near(actual, wanted)
        errors.append(abs(actual - wanted))
    # The nodus must lie on the casting edge, not merely at the right radius.
    fraction = dimensions["nodus"] / dimensions["length"]
    for i in [0, 1]:
        near(nodus[i], foot[i] + (apex[i] - foot[i]) * fraction)
    if base_end:
        near(base_end[1], foot[1])
        near(math.dist(base_end, foot), dimensions["base"])
    return max(errors)


def svg_geometry(style_path, plate_path, dimensions):
    style = ET.parse(style_path).getroot()
    plate = ET.parse(plate_path).getroot()
    for svg in [style, plate]:
        view = numbers(svg.attrib["viewBox"])
        for name, size in [("width", view[2]), ("height", view[3])]:
            assert svg.attrib[name].endswith("mm")
            near(float(svg.attrib[name][:-2]), size)

    def elements(svg, name):
        return svg.findall("{http://www.w3.org/2000/svg}" + name)

    def circle(svg, radius):
        c = one([c for c in elements(svg, "circle") if float(c.attrib["r"]) == radius])
        return float(c.attrib["cx"]), float(c.attrib["cy"])

    foot = circle(style, 0.8)
    marker = one([p for p in elements(style, "path") if "h 3 M" in p.attrib["d"]])
    cross = numbers(marker.attrib["d"])
    nodus = (cross[0] + 1.5, cross[1])
    base_end = None
    if dimensions["base"] == 0:
        line = one(elements(style, "line"))
        apex = (float(line.attrib["x2"]), float(line.attrib["y2"]))
    else:
        cut = one(
            [p for p in elements(style, "path") if p.attrib.get("stroke") == "#ff0000"]
        )
        apex = numbers(cut.attrib["d"])[:2]
        base_end = circle(style, 1.1)
    error = check_shape(foot, apex, nodus, base_end, dimensions)
    if dimensions["base"] > 0:
        root = circle(plate, 0.6)
        end = circle(plate, 1.1)
        mount = (root[1] - end[1], end[0] - root[0])
        for a, b in zip(mount, dimensions["mount"]):
            near(a, b)
        cut_numbers = numbers(elements(plate, "path")[0].attrib["d"])
        polygon = list(zip(cut_numbers[::2], cut_numbers[1::2]))
        assert plates.inside_polygon(*end, polygon), (
            plate_path.name,
            "base outside cut",
        )
    return error


def center(draw):
    r = draw["rect"]
    return (r.x0 + r.x1) * MM / 2, (r.y0 + r.y1) * MM / 2


def check_pdf_mount(page, dims, tiled):
    if dims["base"] == 0:
        return (0, 0)
    paths = page.get_drawings(extended=True)
    geometry = (
        [d for d in paths if d.get("level") == 1]
        if tiled
        else [d for d in paths if d["type"] != "clip"]
    )
    root = center(
        one(
            [
                d
                for d in geometry
                if d.get("fill") and abs(d["rect"].width * MM - 1.2) < 0.001
            ]
        )
    )
    end = center(
        one(
            [
                d
                for d in geometry
                if abs(d["rect"].width * MM - 2.2) < 0.001
                and abs(d["rect"].height * MM - 2.2) < 0.001
            ]
        )
    )
    for actual, wanted in zip((root[1] - end[1], end[0] - root[0]), dims["mount"]):
        near(actual, wanted)
    polygon = [(i[1].x * MM, i[1].y * MM) for i in geometry[0]["items"]]
    assert plates.inside_polygon(*end, polygon), "PDF base end outside plate cut"
    return root[1] - end[1], end[0] - root[0]


def pdf_geometry(path, record, render=None):
    doc = fitz.open(path)
    first = one(
        [
            p.number
            for p in doc
            if p.get_text().startswith("Gnomon -")
            or p.get_text().startswith("Gnomon rod -")
        ]
    )
    assert first > 0
    with TemporaryDirectory() as tmp:
        plate_doc = fitz.open()
        plate_doc.insert_pdf(doc, to_page=first - 1)
        plate_path = Path(tmp) / "plate.pdf"
        plate_doc.save(plate_path)
        plate_result = plates.verify(
            plate_path, record["format"], record["settings"]["radiusMm"]
        )
    dims = expected(record["settings"])
    mount = check_pdf_mount(doc[1 if first > 1 else 0], dims, first > 1)
    tiled = "GNOMON MAP" in doc[first].get_text()
    assert tiled or len(doc) == first + 1
    geometry_error = 0
    axis_error = 0
    baseline = None
    tiles = []
    paper_w, paper_h = plates.PAPER[record["format"]]
    for page in list(doc)[first:]:
        near(page.rect.width * MM, paper_w, 0.005)
        near(page.rect.height * MM, paper_h, 0.005)
        paths = page.get_drawings(extended=True)
        bars = []
        for d in paths:
            for item in d.get("items", []):
                if item[0] == "l":
                    a, b = item[1:]
                    if (
                        abs(a.y - b.y) < 0.001
                        and abs(a.y * MM - paper_h + 12) < 0.005
                        and abs(a.x - b.x) * MM > 50
                    ):
                        bars.append(abs(a.x - b.x) * MM)
        near(one(bars), 100)
        # Keep all instruction glyphs inside the paper, independently of the
        # PDF writer's cursor calculations and text wrapping assumptions.
        for span in page.get_texttrace():
            for char in span["chars"]:
                assert page.rect.contains(fitz.Rect(char[3])), (
                    path.name,
                    page.number,
                    chr(char[0]),
                )
        if tiled and page.number == first:
            continue
        geometry = (
            [d for d in paths if d.get("level") == 1]
            if tiled
            else [d for d in paths if d["type"] != "clip"]
        )
        foot = center(
            one(
                [
                    d
                    for d in geometry
                    if d.get("fill") and abs(d["rect"].width * MM - 1.6) < 0.001
                ]
            )
        )
        item = geometry[0]["items"][0]
        apex_pt = item[2] if dims["base"] == 0 else item[1]
        apex = (apex_pt.x * MM, apex_pt.y * MM)
        crosses = [
            d
            for d in geometry
            if abs(d["rect"].width * MM - 3) < 0.001
            and d["rect"].height < 0.001
            and abs(d["width"] * MM - 0.25) < 0.001
        ]
        nodus = center(one(crosses))
        base_end = (
            None
            if dims["base"] == 0
            else center(
                one(
                    [
                        d
                        for d in geometry
                        if abs(d["rect"].width * MM - 2.2) < 0.001
                        and abs(d["rect"].height * MM - 2.2) < 0.001
                    ]
                )
            )
        )
        geometry_error = max(
            geometry_error, check_shape(foot, apex, nodus, base_end, dims)
        )
        # Virtually stand the measured piece upright on the measured plate
        # mounting line. Its edge must be parallel to Earth's polar axis.
        u, v, normal, axis, _ = basis(record["settings"])
        rise = abs(apex[1] - foot[1])
        edge = tuple(
            mount[0] * u[i] + mount[1] * v[i] + rise * normal[i] for i in range(3)
        )
        unit = tuple(x / math.hypot(*edge) for x in edge)
        error = math.degrees(2 * math.asin(min(1, math.dist(unit, axis) / 2)))
        assert error < 0.0001, (path.name, "assembled axis", error)
        axis_error = max(axis_error, error)
        if not tiled:
            continue
        text = page.get_text()
        row, column, rows, columns = map(
            int,
            re.search(
                r"G-R(\d+)C(\d+) / GNOMON / (\d+) rows x (\d+) columns", text
            ).groups(),
        )
        ox, oy = map(
            float,
            re.search(r"Drawing origin x ([\d.]+) mm, y ([\d.]+) mm", text).groups(),
        )
        near(ox, (column - 1) * (paper_w - 30))
        near(oy, (row - 1) * (paper_h - 62))
        clip = one([d for d in paths if d["type"] == "clip"])
        for actual, wanted in zip(
            clip["scissor"], [10, 22, paper_w - 10, paper_h - 30]
        ):
            near(actual * MM, wanted, 0.005)
        vectors = []
        for d in geometry:
            for item in d["items"]:
                for p in item[1:]:
                    vectors.extend([p.x * MM + ox - 10, p.y * MM + oy - 22])
        if baseline is None:
            baseline = vectors
        assert len(vectors) == len(baseline)
        for a, b in zip(vectors, baseline):
            near(a, b)
        targets = [
            (center(d)[0] + ox - 10, center(d)[1] + oy - 22)
            for d in paths
            if d.get("level") == 0
            and "rect" in d
            and abs(d["rect"].width * MM - 2.4) < 0.001
            and abs(d["rect"].height * MM - 2.4) < 0.001
        ]
        tiles.append((row, column, rows, columns, targets))
    seams = 0
    if tiled:
        assert tiles
        rows, columns = tiles[0][2:4]
        # The complete un-clipped piece must be covered by the union of the
        # sheet frames. Consistent repeated paths alone would not prove this.
        for x, y in zip(baseline[::2], baseline[1::2]):
            assert 0 <= x <= paper_w - 20 + (columns - 1) * (paper_w - 30)
            assert 0 <= y <= paper_h - 52 + (rows - 1) * (paper_h - 62)
        assert len(tiles) == rows * columns
        assert {(t[0], t[1]) for t in tiles} == {
            (r, c) for r in range(1, rows + 1) for c in range(1, columns + 1)
        }
        for a in tiles:
            for b in tiles:
                if (b[0] == a[0] and b[1] == a[1] + 1) or (
                    b[1] == a[1] and b[0] == a[0] + 1
                ):
                    assert (
                        len(
                            [
                                p
                                for p in a[4]
                                if any(math.dist(p, q) < 0.002 for q in b[4])
                            ]
                        )
                        == 2
                    )
                    seams += 1
    if render:
        render.mkdir(parents=True, exist_ok=True)
        doc[first].get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(
            render / f"{path.stem}-style.png"
        )
        if tiled:
            doc[first + 1].get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(
                render / f"{path.stem}-style-tile.png"
            )
    return {
        "file": path.name,
        "pages": len(doc),
        "plate_pages": first,
        "style_pages": len(doc) - first,
        "max_style_dimension_error_mm": geometry_error,
        "max_mounted_axis_error_degrees": axis_error,
        "style_seams": seams,
        "plate": plate_result,
    }


def controls(directory, records):
    record = next(r for r in records if r["file"] == "maximum-a4.pdf")
    rejected = []
    with TemporaryDirectory() as tmp:
        for name in ["shrunken-style", "missing-style-tile", "wrong-style-angle"]:
            source = (
                record
                if name != "wrong-style-angle"
                else next(r for r in records if r["file"] == "arctic-a4.pdf")
            )
            doc = fitz.open(directory / source["file"])
            if name == "shrunken-style":
                p = next(p for p in doc if p.get_text().startswith("G-R"))
                xref = p.get_contents()[0]
                stream = doc.xref_stream(xref)
                doc.update_stream(
                    xref, stream.replace(b"W\nn\n", b"W\nn\n0.97 0 0 0.97 0 0 cm\n", 1)
                )
            elif name == "missing-style-tile":
                doc.delete_page(len(doc) - 1)
            else:
                donor = fitz.open(directory / "near-normal-a4.pdf")
                doc.delete_page(len(doc) - 1)
                doc.insert_pdf(donor, from_page=len(donor) - 1)
            path = Path(tmp) / (name + ".pdf")
            doc.save(path)
            try:
                pdf_geometry(path, source)
            except AssertionError:
                rejected.append(name)
            else:
                raise AssertionError(f"Accepted invalid control {name}")
    return rejected


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--render", type=Path)
    parser.add_argument("--check-controls", action="store_true")
    args = parser.parse_args()
    records = json.loads((args.directory / "manifest.json").read_text())["records"]
    results = []
    for record in records:
        for artifact in [record, record["style"], record["plate"]]:
            path = args.directory / artifact["file"]
            assert hashlib.sha256(path.read_bytes()).hexdigest() == artifact["sha256"]
        result = pdf_geometry(
            args.directory / record["file"],
            record,
            args.render
            if record["file"]
            in [
                "garden-a4.pdf",
                "maximum-a4.pdf",
                "near-normal-a4.pdf",
                "equatorial-letter.pdf",
            ]
            else None,
        )
        result["max_svg_dimension_error_mm"] = svg_geometry(
            args.directory / record["style"]["file"],
            args.directory / record["plate"]["file"],
            expected(record["settings"]),
        )
        results.append(result)
        print(
            f"{record['file']}: {result['plate_pages']} plate pages + {result['style_pages']} style pages; geometry verified"
        )
    report = {
        "reader": f"PyMuPDF {fitz.VersionBind}",
        "physical_build_verified": False,
        "results": results,
    }
    if args.check_controls:
        report["rejected_controls"] = controls(args.directory, records)
        print("Rejected:", ", ".join(report["rejected_controls"]))
    if args.report:
        args.report.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
