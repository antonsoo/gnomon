"""Independent native XML reader and ecliptic-vector check. Standard library only."""

from __future__ import annotations

import argparse
import json
import math
import re
import xml.etree.ElementTree as ET
from pathlib import Path

SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"]
NS = {"s": "http://www.w3.org/2000/svg"}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--capture", type=Path, required=True)
parser.add_argument("--out", type=Path, required=True)
args = parser.parse_args()
manifest = json.loads((args.capture / "replay.json").read_text())
rows = []
for case in manifest["cases"]:
    if not case["zodiac"]:
        continue
    svg = ET.fromstring((args.capture / (case["name"] + ".svg")).read_bytes())
    ellipse = svg.find("s:ellipse", NS)
    assert ellipse is not None
    center = float(ellipse.attrib["cy"])
    radius = float(ellipse.attrib["rx"])
    cos_lat = math.cos(math.radians(case["latitudeDeg"]))
    physical = {}
    for group in svg.findall("s:g[@data-calendar-key]", NS):
        title = group.find("s:title", NS)
        path = group.find("s:path", NS)
        assert title is not None and title.text and path is not None
        match = re.fullmatch(r"M [-\d.]+ ([-\d.]+) H [-\d.]+", path.attrib["d"])
        assert match, path.attrib
        for label in title.text.split(" / "):
            physical[label] = center - float(match[1])
    checks = []
    for index, sign in enumerate(SIGNS):
        assert sign in physical, (case["name"], sign)
        # An independent rotation of the zero-latitude ecliptic vector by
        # the established 23.44-degree obliquity. No product geometry imports.
        z = math.sin(math.radians(23.44)) * math.sin(math.radians(index * 30))
        declination = math.degrees(math.asin(z))
        if abs(cos_lat) < 1e-12:
            assert abs(physical[sign]) < 0.0006
            checks.append({"sign": sign, "serializedOffsetMm": physical[sign], "state": "collapsed-at-pole"})
            continue
        recovered = math.degrees(math.atan(physical[sign] / (radius * cos_lat)))
        error = abs(recovered - declination)
        assert error < 0.07, (case["name"], sign, error)
        checks.append({"sign": sign, "eclipticLongitudeDeg": index * 30, "serializedOffsetMm": physical[sign], "oracleDeclinationDeg": declination, "recoveredDeclinationDeg": recovered, "differenceDeg": error})
    # Every old standing position remains at its original serialized y.
    for mark in case["marks"]:
        for label in mark["label"].split(" / "):
            assert abs(physical[label] - mark["offsetMm"]) < 0.0006
    rows.append({"name": case["name"], "checks": checks})
result = {"scope": "Actual native XML ticks versus an independent ecliptic-vector rotation. Existing rounded sign declinations retained; pole collapse explicit. Not dated ephemeris or field accuracy.", "zodiacDrawings": len(rows), "signPlacements": sum(len(row["checks"]) for row in rows), "maximumDeclinationDifferenceDeg": max(check["differenceDeg"] for row in rows for check in row["checks"] if "differenceDeg" in check), "collapsedPolePlacements": sum(check.get("state") == "collapsed-at-pole" for row in rows for check in row["checks"]), "rows": rows}
args.out.write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({key: value for key, value in result.items() if key != "rows"}))
