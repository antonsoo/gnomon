# Historical hour curves through the afternoon

At `12e072d4ed5772c2614c6ecff76314b208d136ac`, the historical-hour loop visited
only hours 1–16 for both equal-hour systems. A horizontal dial at latitude
37.7749 generated Italian curves 10–16 and silently omitted 17–23. At latitudes
±66 it also omitted usable Babylonian curves 17–21. The same cutoff affected
horizontal, vertical and equatorial designs and their SVG/PDF exports.

Italian hours count from sunset; Babylonian hours count from sunrise. The
[British Sundial Society's December 2010 paper](https://archive.sundialsoc.org.uk/wp-content/uploads/bulletins/B2010%20%28v022%29/Bull022-4.pdf)
derives their relationship to ordinary solar hours and day length. In this
project's fixed-day approximation, Italian hour 18 is noon at an equinox and
hour 23 is one hour before sunset. The source fix visits every interior equal
hour through 23. Hour 24 lies at sunset or the following sunrise and has no
usable shadow. Temporal hours retain their 12-part daylight definition.

## Independent check

`tests/historical-oracle.ts` uses solar-clock arithmetic for the published
definitions and its own horizontal ray intersection. It does not import the
product's astronomy, clock, plane or projection helpers. It shares the documented
37 synthetic declination samples, so this checks implementation of the model,
not the model's ephemeris accuracy or historical reconstruction.

| Horizontal model cases | Before | Fixed source |
|---|---:|---:|
| Latitude/system combinations | 27 | 27 |
| Cases disagreeing with the reference | 13 | 0 |
| Missing curves across those cases | 75 | 0 |

The latitude set is −78, −66, −45, −10, 10, 37.7749, 45, 66 and 78 degrees,
with all three hour systems. Existing sampled coordinates agree with the
reference; the defect was missing curves. These are controlled model cases,
not 27 built or deployed sundials. Nine regression checks compare the full
hour sets and every retained coordinate with the independent reference.

```bash
npm ci
node studies/historical-hours/replay.mjs --out /tmp/historical-hours-after
```

`--source /path/to/an/archive` checks another checkout. `--observe-only` records
an old implementation's disagreements. Each run retains six colored preview
SVGs and six laser-format export SVGs,
editable design files, curve/hour counts, runtime source hashes and reference
errors. [Baseline records](results/before/results.json) retain the original
omissions. The same frozen design inputs can be opened in the browser; its
actual downloads are checked separately in [verification.md](verification.md).

## Export boundary

The renderer clips sample runs to the cut plate. A mathematically usable curve
may therefore have no printable portion at a particular radius; a split run
may produce multiple paths. Path counts are separate from hour counts. This
change adds the previously omitted candidates to the existing projection and
clipping logic; it does not label the historical curves or change their styles.
The approximate same-day sunset model, omitted polar-day/night curves and
37-sample resolution remain. Mathematical, browser and PDF measurements do not
establish physical assembly or outdoor timekeeping accuracy. No package release
or hosted deployment is included.
