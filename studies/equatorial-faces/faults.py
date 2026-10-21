# /// script
# requires-python = ">=3.11"
# dependencies = ["pymupdf==1.28.2"]
# ///
"""Author three labelled physical-output faults with self-consistent hashes.

The verifier must reject geometry/text itself, rather than just an old digest.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

import pymupdf

parser = argparse.ArgumentParser()
parser.add_argument("capture", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
args.output.mkdir(exist_ok=True, parents=True)
original = json.loads((args.capture / "manifest.json").read_text())
original_case = next(c for c in original["cases"] if c["name"] == "north-circle")
segment = re.compile(rb"([-\d.]+) ([-\d.]+) m\s+([-\d.]+) ([-\d.]+) l\s+S")
records = []
for fault in ("wrong-back-numeral", "wrong-back-ray", "short-rod-gauge"):
    out = args.output / fault
    out.mkdir(exist_ok=True)
    for face in original_case["faces"]:
        shutil.copyfile(args.capture / face["svgFile"], out / face["svgFile"])
    source = args.capture / original_case["pdfFile"]
    doc = pymupdf.open(source)
    page = doc[2 if fault == "short-rod-gauge" else 1]
    contents = page.get_contents()
    assert len(contents) == 1
    stream = doc.xref_stream(contents[0])
    if fault == "wrong-back-numeral":
        assert b"(7) Tj" in stream
        stream = stream.replace(b"(7) Tj", b"(8) Tj", 1)
    else:
        radius = 1.6 if fault == "short-rod-gauge" else 1.2
        feet = [d for d in page.get_drawings() if d["fill"] is not None
                and abs(d["rect"].width * 25.4 / 72 - radius) < 1e-4]
        assert len(feet) == 1
        center = (feet[0]["rect"].tl + feet[0]["rect"].br) / 2
        cx, cy = center.x, page.rect.height - center.y
        changed = False
        for match in segment.finditer(stream):
            ax, ay, bx, by = (float(s) for s in match.groups())
            distance = ((ax - cx) ** 2 + (ay - cy) ** 2) ** .5 * 25.4 / 72
            if fault == "wrong-back-ray" and abs(distance - original_case["options"]["innerRadiusMm"]) < 1e-4:
                bx = 2 * cx - bx
            elif fault == "short-rod-gauge" and distance < 1e-4 and abs(ax - bx) < 1e-4:
                by = ay + .97 * (by - ay)
            else:
                continue
            replacement = f"{ax:.12f} {ay:.12f} m\n{bx:.12f} {by:.12f} l\nS".encode()
            stream = stream[:match.start()] + replacement + stream[match.end():]
            changed = True
            break
        assert changed
    doc.update_stream(contents[0], stream)
    pdf_bytes = doc.tobytes()
    doc.close()
    (out / original_case["pdfFile"]).write_bytes(pdf_bytes)
    manifest = json.loads(json.dumps(original))
    case = json.loads(json.dumps(original_case))
    case["pdfSha256"] = hashlib.sha256(pdf_bytes).hexdigest()
    manifest["cases"] = [case]
    manifest["authoredFault"] = fault
    (out / "manifest.json").write_text(json.dumps(manifest))
    result = subprocess.run([sys.executable, str(Path(__file__).with_name("measure.py")),
                             str(out), str(out / "measurement.json")], text=True, capture_output=True)
    assert result.returncode != 0, fault
    assert "AssertionError" in result.stderr, result.stderr
    reason = result.stderr.splitlines()[-1]
    assert {"wrong-back-numeral": "8', '7", "wrong-back-ray": "opposite", "short-rod-gauge": "exposed rod gauge"}[fault] in reason, reason
    records.append({"authoredFault": fault, "originalPdfSha256": original_case["pdfSha256"],
                    "modifiedPdfSha256": case["pdfSha256"], "selfConsistentManifest": True,
                    "rejected": True, "reason": reason})
(args.output / "faults.json").write_text(json.dumps({"controls": records,
    "scope": "Authored mutations of native saved output, not observed field incidents.",
    "producerSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}, indent=2) + "\n")
print(json.dumps({"authoredFaults": len(records), "rejectedForNativeEvidence": len(records)}))
