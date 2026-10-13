"""Check replay downloads and served bytes; requires pypdfium2 and Pillow.

python studies/design-files/verify-artifacts.py REPLAY_OUTPUT DIST
Writes verification.json and a rendered construction-guide.png in REPLAY_OUTPUT.
"""

import hashlib
import importlib.metadata
import json
from pathlib import Path
import sys

import pypdfium2 as pdfium


def digest(data):
    return hashlib.sha256(data).hexdigest()


def check(condition, message):
    if not condition:
        raise ValueError(message)


if len(sys.argv) != 3:
    raise SystemExit("Supply the replay output and production dist directories.")
root, dist = (Path(arg).resolve() for arg in sys.argv[1:])
browser = json.loads((root / "browser.json").read_text())
check(len(browser["records"]) == 4, "Expected both browsers at both widths.")
for record in browser["records"]:
    check(record["reopenedOffline"] and record["designResaveIdentical"] and record["svgBytesIdentical"], "Reopening changed a download.")
    check(not record["uncaughtErrors"] and not record["offOriginRequests"], "Browser reported errors or external requests.")
    check(record["dimensions"]["page"] <= record["dimensions"]["viewport"] + 1, "Page overflows.")
    check(record["designSha256"] == digest((root / "rome.gnomon.json").read_bytes()), "Design bytes differ between browsers.")

for response in browser["served"]:
    check(response["path"].startswith("/gnomon/"), "Unexpected served path.")
    relative = response["path"][len("/gnomon/"):] or "index.html"
    path = (dist / relative).resolve()
    check(path.is_relative_to(dist), "Served path leaves the build directory.")
    data = path.read_bytes()
    check(len(data) == response["bytes"] and digest(data) == response["sha256"], f"Served build mismatch: {relative}")

for kind in ("plate", "gnomon"):
    before = (root / f"{kind}-before.svg").read_bytes()
    after = (root / f"{kind}-after.svg").read_bytes()
    check(before == after, f"{kind} SVG changed after reopening.")
    check(digest(before) == browser["records"][0][f"{kind}Sha256"], "SVG receipt mismatch.")
for when in ("Before", "After"):
    data = (root / f"construction-{when.lower()}.pdf").read_bytes()
    check(digest(data) == browser["records"][0][f"pdf{when}Sha256"], "PDF receipt mismatch.")

pages = []
with pdfium.PdfDocument(root / "construction-before.pdf") as before, pdfium.PdfDocument(root / "construction-after.pdf") as after:
    check(len(before) == len(after) and len(before) > 0, "PDF page count changed.")
    for index in range(len(before)):
        left, right = before[index], after[index]
        try:
            check(left.get_size() == right.get_size(), "PDF page dimensions changed.")
            left_bitmap, right_bitmap = left.render(scale=2), right.render(scale=2)
            try:
                a, b = left_bitmap.to_pil().convert("RGB"), right_bitmap.to_pil().convert("RGB")
                check(a.size == b.size and a.tobytes() == b.tobytes(), "Rendered PDF page changed.")
                pages.append({"page": index + 1, "points": list(left.get_size()), "pixels": list(a.size), "rgbSha256": digest(a.tobytes()), "renderedPixelsIdentical": True})
                if index == 0:
                    a.save(root / "construction-guide.png")
            finally:
                left_bitmap.close()
                right_bitmap.close()
        finally:
            left.close()
            right.close()

def manifest(directory, paths):
    return [{"path": str(path.relative_to(directory)), "bytes": path.stat().st_size, "sha256": digest(path.read_bytes())} for path in sorted(paths)]

result = {
    "method": "Compare served responses with dist, SVG bytes, and each PDF page at 144 dpi in RGB.",
    "packages": {name: importlib.metadata.version(name) for name in ("pypdfium2", "pillow")},
    "servedAssetsMatched": len(browser["served"]),
    "pdfPages": pages,
    "build": manifest(dist, (path for path in dist.rglob("*") if path.is_file())),
    "downloads": manifest(root, (path for path in root.iterdir() if path.suffix in (".svg", ".pdf") or path.name == "rome.gnomon.json")),
}
(root / "verification.json").write_text(json.dumps(result, indent=2) + "\n")
print(f"Matched {result['servedAssetsMatched']} served assets, both SVG pairs and {len(pages)} PDF pages.")
