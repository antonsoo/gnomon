# Gnomon

**Design a sundial that actually works, for any place on Earth. Print it, laser-cut it, set it in the sun.**

[![CI](https://github.com/antonsoo/gnomon/actions/workflows/ci.yml/badge.svg)](https://github.com/antonsoo/gnomon/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Live demo](https://img.shields.io/badge/demo-antonsoo.github.io%2Fgnomon-c9a24b)](https://antonsoo.github.io/gnomon/)

![Gnomon: a horizontal sundial being designed for San Francisco, brass theme](docs/assets/hero.png)

Most "sundial generator" tools on the web draw a schematic that looks right
and isn't: hour lines placed by eyeballing an ellipse, no equation-of-time
correction, no distinction between local solar time and the clock on your
wall, a "vertical dial" mode that's really just the horizontal formula
rotated 90 degrees (wrong for anything but a few special cases). A sundial
built from one of those is a wall decoration, not an instrument.

Gnomon computes the actual geometry: a 3D shadow-casting model shared by
every dial type, real solar-position astronomy (the same class of algorithm
behind the NOAA Solar Calculator), and a test suite built around an
**independent** ray-casting check rather than trusting the formulas that
drew the picture. It exports scale-exact SVG and PDF so what you cut or
print is the same shape the math produced, in millimetres, not "close
enough for a screenshot."

## Quickstart

```bash
git clone https://github.com/antonsoo/gnomon.git && cd gnomon
npm install
npm run dev
```

Open the printed local URL. Or use the [live demo](https://antonsoo.github.io/gnomon/) --
no install needed.

## Features

- **Dial types**: horizontal (the primary one), vertical (direct-south or
  declining, either hemisphere), equatorial, and analemmatic (the garden
  dial where a person is the gnomon).
- **Hour lines** in standard/zone time (with the longitude correction from
  your zone's reference meridian and an optional DST offset) or local
  apparent solar time -- with half- and quarter-hour marks, Arabic or Roman
  (traditional "IIII", not "IV") numerals.
- **Historical hour systems** as overlays: temporal ("Roman") unequal hours,
  Babylonian hours (from sunrise), Italian hours (from sunset) -- each
  computed as a swept curve across the year, because none of them has a
  closed form.
- **Declination (date) lines** for the solstices, equinox, and optionally
  the zodiac entries, for a nodus on the style.
- **Equation of time** table and daily curve, computed from the same solar
  ephemeris as everything else.
- **Gnomon template**: the triangular style as a separate cut piece with a
  fold/mount tab (or, for the equatorial dial, the plain rod its geometry
  actually calls for -- see [Accuracy and limitations](#accuracy-and-limitations)).
- **Curated Latin mottoes**, each attribution checked rather than assumed
  (most sundial mottoes are anonymous folk Latin, not a Roman poet).
- **Export**: SVG in physical millimetres for laser cutters (red = cut,
  black = engrave); PDF at exact print scale for A4 and US Letter with a
  100mm calibration bar; PNG.
- **Live simulation**: sun altitude/azimuth and the projected shadow for now
  or any chosen date/time, animatable through the day.
- **Location**: latitude/longitude entry, geolocation, a built-in gazetteer
  including historic astronomy sites (Alexandria, Aswan/Syene, Athens, Rome,
  Babylon, Samarkand, Jaipur), and time-zone detection via `Intl`.

## How it works

### One shadow-casting model, three dial types (plus the analemmatic's own)

`src/lib/geometry.ts` works entirely in 3D vectors (local East-North-Up
frame). Given a dial plane (an origin, an outward normal, and an in-plane
basis) and the gnomon's style -- a line parallel to Earth's rotation axis,
pointing at the elevated celestial pole -- it projects the style's shadow
onto the plane for a given hour angle. Horizontal, vertical (direct or
declining) and equatorial dials are all "the shadow of a polar style on a
plane"; they differ only in which plane:

| Dial | Plane normal | Reference (u) axis |
| --- | --- | --- |
| Horizontal | straight up | true north |
| Vertical | horizontal, at the wall's declination from south | straight up the wall |
| Equatorial | Earth's rotation axis itself | (arbitrary in-plane reference) |

That means one derivation to get right, not four, and it is exactly what
the oracle test (below) re-derives independently to check against.

The analemmatic dial is different in kind -- there is no fixed polar style,
just a person (or a vertical rod) standing at a date-dependent spot -- and
is derived separately in `src/lib/dials/analemmatic.ts` as the orthogonal
projection of an equatorial dial's hour points onto the ground.

### Solar position

`src/lib/astronomy.ts` implements the low-precision solar position
algorithm behind the NOAA Solar Calculator (itself Jean Meeus, *Astronomical
Algorithms*, 2nd ed., 1998, ch. 25 & 28): geometric mean longitude and
anomaly, the equation of center, apparent longitude, and the obliquity of
the ecliptic, giving declination and the equation of time to about 0.01
degree for dates within a few centuries of the present.

### The oracle test suite

The library's own hour-line code (`src/lib/geometry.ts`) uses 2D trig-style
vector projection. `tests/oracle.test.ts` is a **separate** implementation:
its own vector kit, its own sun-direction formula (built as a change of
orthonormal basis / rotation rather than the altitude/azimuth spherical
trigonometry `astronomy.ts` uses), and its own ray/plane intersection. The
two sun-direction formulas were cross-checked numerically to six decimal
places across a spread of latitude/declination/hour-angle combinations
before the oracle file was written, confirming they are independent
derivations of the same physics rather than one copied from the other.

The suite then, for many latitudes, longitudes, dates and dial types:

1. Builds a real dial with the library.
2. Ray-casts the sun's shadow in 3D from scratch for the hour angle
   corresponding to each labeled clock hour.
3. Asserts the two land on the same line, within 1e-6 radians.
4. Separately checks horizontal- and direct-vertical-south dials against
   their published closed forms (`tan(theta) = sin(phi) * tan(H)` and
   the co-latitude-with-mirroring relationship for vertical dials,
   respectively -- Waugh, *Sundials: Their Theory and Construction*, ch. 3-4).
5. Checks the analemmatic dial by an unrelated method: computing the true
   sun azimuth for a given date/time and confirming a plain vertical rod at
   that date's gnomon position casts its shadow in the exact direction of
   the corresponding point on the hour ellipse.

170 of the suite's 196 tests are this oracle; see
[Accuracy and limitations](#accuracy-and-limitations) for what it does and
doesn't guarantee.

## Usage example (library)

The library has no npm package published yet (see [Contributing](#contributing));
within this repo, or after cloning it, import it by relative path. A runnable
version of this example is in `examples/basic-horizontal-dial.ts`
(`npx tsx examples/basic-horizontal-dial.ts`).

```ts
import { buildHorizontalDial } from "./src/lib/dials/horizontal.ts";
import { renderPolarDialSVG } from "./src/lib/render/svg.ts";

const dial = buildHorizontalDial({
  latitudeDeg: 37.7749,
  timeReference: { mode: "standard", longitudeDeg: -122.4194, zoneMeridianDeg: -120, dstOffsetHours: 1 },
  hourLineOptions: { startHour: 5, endHour: 19, stepHours: 0.25 },
  nodusDistanceMm: 30,
  gnomonBaseLengthMm: 60,
});

console.log(dial.orientation);
// "Lay flat, noon line (u axis) toward true north. Style height 37.8 deg = |latitude|."

const svg = renderPolarDialSVG(dial, {
  widthMm: 220, heightMm: 220, radiusMm: 90, innerRadiusMm: 6,
  numerals: "roman", theme: "brass",
  showDeclinationLines: true, showHistoricalHours: false,
});
```

The library (`src/lib/`) has no dependency on the DOM or on the UI code in
`src/main.ts`; it is plain, tree-shakeable TypeScript.

## Screenshots

| Vertical dial, live shadow at 3pm | Analemmatic dial | Mobile (390px) |
| --- | --- | --- |
| ![Vertical dial](docs/assets/screenshot-vertical.png) | ![Analemmatic dial](docs/assets/screenshot-analemmatic.png) | ![Mobile layout](docs/assets/screenshot-mobile.png) |

## Accuracy and limitations

- **Solar position** is accurate to about 0.01 degree for dates within a
  few centuries of the present (the NOAA/Meeus low-precision algorithm);
  it does not account for atmospheric refraction, which shifts the sun's
  apparent position near the horizon by up to about 0.5 degree -- irrelevant
  for hour-line geometry (computed at a fixed reference declination, not
  from the horizon), but worth knowing if you compare the live simulation
  to the sun's visual position at sunrise/sunset.
- **Hour-line geometry** is checked by the independent oracle described
  above, across 9 latitudes from -60 to 78 degrees, multiple wall
  declinations, and a real-date/DST end-to-end case -- but the oracle
  shares this project's understanding of spherical astronomy (there is no
  third-party ephemeris library in the dependency tree to check *that*
  against). What it does guarantee: if the geometry code and the oracle
  ever disagree, you'll see a failing test, not a silently wrong dial.
- **Historical hour curves** (temporal, Babylonian, Italian) are computed
  from the standard sunrise-equation definitions, sampled at 37 dates
  across the year; they are smooth enough to read but are not the same
  curve a Roman clockmaker's compass-and-straightedge construction would
  produce down to the last hairline.
- **The equatorial dial's gnomon** is a plain rod perpendicular to the disc,
  not a triangle -- the tool detects this (style height at or near 90
  degrees) and draws a rod template instead of an infinite-height triangle.
- **Analemmatic date-scale formula** (`offset = R * cos(phi) * tan(delta)`)
  was derived independently in this repository (not copied from a single
  external source) and cross-checked against the general 3D shadow model
  before being trusted; see the derivation comment in
  `src/lib/dials/analemmatic.ts`.
- **PDF export** rejects a dial radius that doesn't fit the chosen page
  rather than silently clipping it.
- Latitudes very close to the poles (beyond about 85 degrees) can produce
  degenerate or very long hour lines for some dial orientations; this is a
  real property of the geometry (a horizontal dial's hour lines genuinely
  approach infinite length as declination approaches the pole), not
  something the tool tries to hide, but it isn't specially clipped either.

## Development

```bash
npm install
npm run lint       # eslint
npm run typecheck  # tsc --noEmit, strict
npm test           # vitest (196 tests: astronomy, dial geometry, misc data, export, and the oracle suite)
npm run build      # tsc -b && vite build
```

All four passed on this machine (14 vCPU WSL2 Linux, 48 GB RAM) before this
was published.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) (c) 2026 Anton Soloviev.
