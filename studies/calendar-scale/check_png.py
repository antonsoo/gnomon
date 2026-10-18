# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow==12.2.0"]
# ///
"""Read actual blueprint PNG pixels at independently predicted calendar positions."""

from __future__ import annotations

import argparse
import json
import math
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--downloads", type=Path, required=True)
parser.add_argument("--input", type=Path, required=True)
parser.add_argument("--phase", choices=["before", "after"], required=True)
parser.add_argument("--out", type=Path, required=True)
args = parser.parse_args()
inputs = json.loads(args.input.read_text())
ns = {"s": "http://www.w3.org/2000/svg"}
rows = []
for engine in ["chromium", "firefox"]:
    for viewport in [1440, 375]:
        stem = f"{engine}-{viewport}"
        svg = ET.parse(args.downloads / (stem + ".svg")).getroot()
        view = list(map(float, svg.attrib["viewBox"].split()))
        ellipse = svg.find("s:ellipse", ns)
        assert ellipse is not None
        image = Image.open(args.downloads / (stem + ".png")).convert("RGB")
        scale_x, scale_y = image.width / view[2], image.height / view[3]
        cx, cy = float(ellipse.attrib["cx"]), float(ellipse.attrib["cy"])
        radius = float(ellipse.attrib["rx"])
        positions = []
        for declination in [23.44, 20.1, 11.5, 0, -11.5, -20.1, -23.44]:
            offset = radius * math.cos(math.radians(inputs["latitudeDeg"])) * math.tan(math.radians(declination))
            expected_y = (cy - offset) * scale_y
            pixels = []
            # Read the left side of the yellow physical tick, excluding grey
            # leaders, the selected ring and the centre's differently coloured dot.
            for x in range(math.floor((cx - 1.05) * scale_x), math.ceil((cx - 0.25) * scale_x)):
                for y in range(math.floor(expected_y - 3), math.ceil(expected_y + 3)):
                    red, green, blue = image.getpixel((x, y))
                    if red > 100 and red > green * 1.08 and blue < 135:
                        pixels.append((x + 0.5, y + 0.5))
            absent = args.phase == "before" and declination == -11.5
            if absent:
                assert not pixels, (stem, declination, pixels)
                positions.append({"declinationDeg": declination, "state": "missing"})
            else:
                assert pixels, (stem, declination)
                observed_y = sum(point[1] for point in pixels) / len(pixels)
                error = abs(observed_y - expected_y)
                assert error < 1.3, (stem, declination, error)
                positions.append({"declinationDeg": declination, "expectedPixelY": expected_y, "observedPixelY": observed_y, "differencePixels": error, "paintedPixels": len(pixels)})
        rows.append({"engine": engine, "viewport": viewport, "width": image.width, "height": image.height, "positions": positions})
result = {"phase": args.phase, "scope": "Actual blueprint raster downloads, yellow calendar paint at independently predicted physical positions. No OCR, fabrication precision or arbitrary-image claim.", "images": len(rows), "positionsPresent": sum(position.get("state") != "missing" for row in rows for position in row["positions"]), "missingPositions": sum(position.get("state") == "missing" for row in rows for position in row["positions"]), "maximumDifferencePixels": max(position["differencePixels"] for row in rows for position in row["positions"] if "differencePixels" in position), "rows": rows}
args.out.write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({key: value for key, value in result.items() if key != "rows"}))
