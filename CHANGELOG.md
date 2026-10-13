# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Portable editable designs

- Add Save design and Open design for a local, versioned `.gnomon.json` file.
  Retain location, construction settings, appearance and a fixed simulation
  minute, including which occurrence of a repeated clock time was selected.
- Validate complete settings, clock evidence and usable geometry before applying
  an opened file. Unsupported, malformed, oversized or unreadable files preserve
  current work; canceled or stale reads cannot replace newer settings.
- Synchronize every control after opening, including dormant overlay choices.
  Keep geometry exports separate from editable inputs, with example design files
  and actual browser roundtrips across all four dial types.

### Matching plate and gnomon kit

- Include the style template and mounting instructions in the PDF download;
  tile large styles separately with G-prefixed sheets and scale checks.
- Bound both triangle legs while preserving the exact style angle and nodus.
  A 90 mm dial at latitude 89 degrees previously produced a 3.23 m SVG;
  beyond 89.9 degrees the old renderer substituted an incorrect normal rod.
- Engrave matching filled foot/open base-end marks on both pieces. Include the
  base direction in the fan cut, where it previously fell outside some walls.
- Label very thin triangles as angle gauges for a rigid style. Explain the
  physical bead/notch required for a nodus shadow and uncompensated thickness.
- Reserve room for mounting notes on tall, narrow plates instead of offering
  a single-page export that subsequently fails.
- Retain measured construction PDFs, actual browser downloads and faulty-file
  controls. [Construction evidence](docs/construction.md).

### Full-size paper construction

- Tile large polar-style PDFs across A4 or Letter at unchanged scale, with a
  reduced assembly map, numbered sheets, 10 mm overlaps, matching targets,
  per-sheet calibration and printed frame dimensions. The Export panel shows
  sheet counts before download. Small plates retain their single-sheet export.
- Keep hour numerals inside the physical cut in both SVG and PDF. Previously
  cutting the outer outline removed them. Reserve an internal numeral band,
  widen fan ends for label clearance, and match PDF/SVG numeral sizes.
- Retain actual browser downloads and an independently measured 14-PDF matrix,
  including deliberate wrong-scale, shifted-tile and missing-tile controls.
  [Instructions and verification](docs/printing.md). Physical printing and
  paper assembly remain unverified.

### Fixed

- Northern, south-facing wall dials used a style behind the wall and accepted
  backwards shadow rays. Both geometry and the original oracle shared this
  error. Styles now project out of the receiving face; shadows travel away
  from the sun, and hour rays require daylight in front of the face.
- Fan plates follow the actual hour-ray sector in either hemisphere.
  Equatorial mounting instructions use the disc's tilt (90 minus absolute
  latitude), and wall mounting instructions locate the outward style base.
- Gnomon templates mark the foot and nodus and keep the fold tab attached:
  the base fold is engraved, not cut through.
- Custom simulation times now use the chosen location's zone. Date, time,
  slider, Now and animation agree across device zones. DST gaps and folds
  are explicit; automatic clock adjustment and the correction table follow
  the simulation date. Daily correction curves include leap years fully.
- Invalid fields pause exports while retaining the last valid drawing.
  Blank coordinates cannot silently become zero; obsolete geolocation
  callbacks cannot overwrite a newer choice.
- Downloads capture one design before asynchronous work. SVG and PDF retain
  selected overlays and mottoes; PNG failures and PDF size errors recover
  inline. PNG memory use is bounded and its effective resolution is shown.

### Added

- Keyboard-scrollable preview zoom, a mobile-first preview order, explicit
  capability notes and disabled unavailable actions for analemmatic dials.
- Production Chromium/Firefox workflows for simulation, input recovery,
  downloads, accessibility, layout and privacy boundaries, plus absolute
  physical shadow and construction-artifact regression tests.

## [0.2.2] - 2026-10-02

### Changed

- The page's fonts are served by the page itself. They came from Google Fonts,
  the one request the page made to another origin; the same font files (every
  subset, as Google serves them to a current browser) are now in
  `src/fonts/`, with their SIL Open Font License texts. Nothing looks
  different: screenshots before and after match. The page now loads with
  every other host blocked.

### Security

- The built page carries a Content-Security-Policy. Scripts, styles, fonts and
  workers load from the page's own origin only, and `connect-src 'self'` has
  the browser refuse to send what you give the page to any other host, even
  for a script injected through a bug in how the page renders a file. Inline
  event handlers and `eval` are not allowed. Every control was exercised
  in Chromium and Firefox with a listener for policy violations: none.

### Accessibility

- Checked with axe-core (WCAG 2.1 A and AA, and its best-practice rules) in light and dark,
  at desktop and phone widths: no findings now. The page has a `main`
  landmark, and its two side panels are named.

## [0.2.1] - 2026-10-02

### Fixed

- "Use my location" could say "Locating..." until the page was reloaded.
  Firefox calls neither geolocation callback when its permission prompt is
  closed without a choice, and the API's own timeout only starts once
  permission is given. The page now waits 20 seconds for any answer, then
  gives the button back and says the browser has not answered; an answer
  that comes later is still used. Found by running the page in Firefox
  beside Chromium.
- The message under the button says what happened (permission refused, no
  position found, no location service) instead of one sentence for all of
  them, and is announced to screen readers. The button is disabled while a
  request is out.

## [0.2.0] - 2026-09-30

### Added

- The solar ephemeris is now checked against an independent one: the Sun's
  apparent declination and the equation of time from Skyfield and JPL DE421
  at 3,245 dates from 1900 to 2050 (`scripts/solar_oracle.py`, committed as a
  fixture). Measured: within 0.0034 degrees and 3.8 seconds; the test holds it
  to 0.005 degrees and 5 seconds. The README said no such check existed.

### Fixed

- Time-zone detection took a zone's standard offset to be its most common
  one, but US and EU daylight time lasts seven or eight months: Los Angeles
  resolved to a -105 degree meridian with "daylight saving" off all summer
  and -1 hour in winter, London to 15 degrees east, Sydney to 165. The
  automatic dial came out right because the two errors cancelled, but the
  checkbox read wrong, and ticking it produced a dial an hour off. The
  standard offset is now the smallest of the year's offsets, the checkbox
  shows the detected state, and `resolveZone` has tests.
- Form fields had labels that weren't tied to their inputs, so screen readers
  announced the latitude, longitude, time zone, wall declination, radius and
  motto fields without a name; the date and time-of-day controls had no label
  at all. Latitude and longitude also accept only valid ranges now, and show
  an invalid value instead of silently ignoring it.
- A time zone typed as free text ("Pacific Time") made every redraw throw,
  freezing the dial. An unknown name is now refused with a note, and the dial
  keeps the last valid zone.

## [0.1.0] - 2026-09-24

### Added

- Horizontal, vertical (direct and declining, both hemispheres), equatorial and
  analemmatic dial geometry, all driven by one 3D shadow-casting projector.
- NOAA/Meeus solar position algorithm: declination and equation of time.
- Declination (date) lines for solstices, equinox and zodiac entries.
- Historical hour overlays: temporal (Roman unequal), Babylonian and Italian hours.
- Curated Latin sundial mottoes with checked attributions.
- Scale-exact SVG export (brass, slate, blueprint and laser/cut-engrave themes)
  and PDF export at A4/US Letter with a 100mm calibration bar; PNG export via
  in-browser rasterization.
- Live shadow simulation: current time or a chosen date/time, animatable.
- Built-in city gazetteer including historic astronomy sites, geolocation, and
  time zone detection via `Intl`.
- Independent 3D ray-casting oracle test suite cross-checking hour-line geometry
  against the library and against closed-form horizontal/vertical formulas.
