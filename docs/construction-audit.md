# Construction and simulation audit

This change connects the physical dial, selected civil time and downloaded
construction files. The audit found defects even though all 210 existing
unit tests passed. The previous ray oracle and production code shared a
wrong assumption about which end of a wall gnomon can project out of its face.

## Reproductions and corrections

| Problem | Before | Corrected behavior |
| --- | --- | --- |
| Rome, 2026-07-01 at 12:00 | Chromium in UTC reported altitude 68.9 degrees; the same form in America/Los_Angeles reported -2.5 degrees | Both resolve Rome noon to 10:00 UTC and report altitude 65.7 degrees |
| Northern south-facing wall | Elevated polar vector lay behind the wall; negative ray distance was accepted | Outward polar vector, positive ray travel, downward noon shadow |
| Hour visibility | Sun in front of a wall was sufficient, even below the horizon | Both front-face illumination and daylight must be possible |
| Fan cuts | Wedge assumed to be centered upward | Smallest angular sector containing the usable rays, including sectors crossing the angle wrap |
| Equatorial mounting | Disc tilt was given as latitude | Disc tilt is 90 minus absolute latitude |
| Gnomon template | No nodus mark; red base cut detached the mounting tab | Marked foot/nodus, one outer cut and an engraved base fold |
| Async PDF/PNG | Settings or filenames could change after the click | One captured design supplies geometry, appearance, notes and filename |
| Invalid input / late location | Empty latitude became zero; late permission responses overwrote edits | Associated errors, paused exports and retired obsolete requests |

## A physical wall check

At latitude 45 degrees north, put a 30 mm style on a south-facing wall.
Coordinates below are east, north and up, in millimetres. The wall is north=0.
The physical free end of the style must be south of the wall, not inside it:

```text
style tip = (0, -30/sqrt(2), -30/sqrt(2))
noon sun  = (0, -1/sqrt(2),  +1/sqrt(2))
shadow    = style tip - 30 * noon sun
          = (0, 0, -30*sqrt(2))
```

The noon shadow is 42.42640687 mm below the root. At equinox 09:00 and
15:00 solar time its east coordinate is respectively -30 and +30 mm,
with the same height. `tests/physical-shadow.test.ts` checks these absolute
coordinates, not only angles modulo a half-turn. It also rejects backwards
ray travel and checks that gnomons project in front of the receiving face.

The existing oracle now chooses the physical end of the polar line and
rejects negative travel. A separate numerical declination sweep checks that
every returned hour ray can be illuminated above the horizon. Construction
tests measure the nodus distance and calibration bar from rendered output.
The corrected wall orientation agrees with the [British Sundial Society's
description of direct and declining vertical dials](https://sundialsoc.org.uk/all-about-sundials/how-sundials-work/how-sundials-work-part-2/).

## Time and state

A local clock minute can map to one instant, two instants, or none. The
[TC39 time-zone documentation](https://tc39.es/proposal-temporal/docs/timezone.html)
explains these cases. Gnomon uses existing `Intl` APIs rather than requiring
Temporal support: it samples nearby UTC offsets and round-trips candidate
instants. Skipped minutes are errors; repeated minutes expose a first/second
occurrence selector. Historical offsets with seconds are retained.

```text
city date + time + selected zone
              |
              v
        exact UTC instant
          /         \
         v           v
  sun and shadow   dated clock adjustment
         \           /
          v         v
       captured construction design
              |
              v
        SVG / PNG / PDF
```

Now, the time field and slider share the same city-local minute. Animation
advances elapsed time, skips spring gaps naturally and stops at the end of
the selected local day. Automatic hour-label adjustment uses that instant;
manual adjustment is retained until changed. Simulation changes do not
change a download already being prepared. Preview zoom changes screen
magnification only.

The browser UI retains the last valid drawing while a setting is invalid,
labels that state and disables export. Choosing a city recovers all location
fields. A pending geolocation request is retired on another location edit or
request, including after a permission timeout warning.

## Verification

The committed suite covers core geometry, time conversion and construction
output. The production browser suite runs Chromium and Firefox, with
network routes restricted to the local origin and listeners for page errors,
unhandled rejections and Content-Security-Policy violations. It includes
UTC, Los Angeles and Tokyo device zones; clock gaps/folds; location races;
invalid input; export snapshots and failures; image/PDF signatures;
keyboard zoom and scroll; and 320, 375 and 1440 pixel layouts. Axe scans
cover Brass and Laser cut preview themes at each width.

A separate Python `zoneinfo` comparison checked 108 conversions across all
nine city-gazetteer zones, quarterly dates in 1900, 2000 and 2026. All agreed
with the Node 24 `Intl` resolver. This checks the algorithm against another
implementation; it does not establish that either time-zone database is
historically complete.

Run the checks with Node 24:

```sh
npm ci
npm run lint
npm run typecheck
npm test
LC_ALL=de_DE.UTF-8 LANG=de_DE.UTF-8 npm test
npm run test:browser
node examples/basic-horizontal-dial.ts > /tmp/gnomon-example.svg
```

The browser command builds the production site into `dist/`. A new machine
needs `npx playwright install chromium firefox` first. CI includes the same
checks. Source and local test results do not establish that a hosted site
has been updated.

## Limits

- No physical dial was fabricated or measured outdoors. The checks establish
  consistency with explicit physical and astronomical models.
- The oracle still shares the mathematical shadow model. Absolute coordinate
  tests reduce the risk of another shared sign error; they are not a proof
  for all orientations.
- Hour-line visibility uses the nominal solstice range +/-23.44 degrees.
  Refraction, terrain, material thickness and mounting errors are excluded.
- Historical-hour curves are sampled. They are not exact continuous
  constructions. Labels and strokes remain subject to the fonts and laser
  software used to open the exported SVG.
- Local-time input is limited to 1900-2100 and uses browser time-zone data.
  Future rules can change. The manual standard offset is inferred from the
  smallest monthly offset in the selected year, not a legal time definition.
- Analemmatic output uses apparent solar time and supports SVG/PNG only;
  there is no animated shadow or fixed gnomon template. Equatorial output
  covers only the pole-facing face. Degenerate planes cannot be exported
  from the UI. Near-degenerate templates may still be impractically tall.
- PNG is limited to 16 megapixels and 8192 pixels per side, with resolution
  reduced as needed. PDF rejects a plate or its notes if they do not fit.
  SVG/PDF physical dimensions still require checking the printer or cutter's
  actual-size settings.
