# Changelog

All notable changes to this project are documented in this file.

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
