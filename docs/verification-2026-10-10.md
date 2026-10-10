# Construction source verification, 2026-10-10

A fresh archive of `0013af2f4d76212b6a4a4052b04fa5bfaf71beca` was checked
before pushing the construction kits and designer fixes to `main`.
The [construction guide](construction.md) describes the changes and gives
the commands for regenerating and independently measuring the artifacts.

The fresh run generated **26 PDFs, 192 pages**, including 42 gnomon pages.
PyMuPDF 1.28.2 and Pillow 12.3.0 read the exported artifacts independently
of the TypeScript implementation. All checks passed for calibration bars,
cut outlines, mounted angles, SVG/PDF dimensions, tile registration and
seam reconstruction. The largest gnomon dimension discrepancy was
0.000018 mm; the largest mounted-axis discrepancy was 0.000021 degrees.
These are numerical agreement measurements, not printer tolerances.
Deliberately shrunken, incomplete and wrong-angle kits were all rejected.
See the [complete measurement report](evidence/source-2026-10-10/construction.json).

Chromium and Firefox each downloaded A4 and Letter kits through the
production UI. All four actual downloads passed the same independent reader,
with five plate pages and one gnomon page each. See the
[browser-download measurements](evidence/source-2026-10-10/browser-downloads.json).
The desktop designer, phone Export panel, ordinary cut-and-fold template,
near-normal angle gauge, large tiled gnomon map and sheet, and equatorial
rod gauge were opened and visually inspected.

The clean Node 26.7.0/npm 12.0.1 install passed lint, strict types, 269 tests
in each of the default and German locales, the production build, and all
44 Chromium/Firefox workflows. The [build manifest](evidence/source-2026-10-10/build.json)
identifies all 35 produced files. Earlier Node 24 checks and retained PDF
examples are linked from the construction guide.

No physical print, assembly, fastener, material, kerf, outdoor time-reading
or seasonal trial has been performed in this verification. The angle gauge
is not a self-supporting paper gnomon. This record verifies the source and
local downloads; it does not establish that Pages deployed successfully.
