# Changelog

All notable changes to this project are documented in this file.

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
