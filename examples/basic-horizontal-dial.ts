/**
 * Minimal example: build a horizontal dial for San Francisco (standard
 * Pacific time, DST in effect) and print its orientation instructions and
 * a laser-ready SVG to stdout.
 *
 * Run with:
 *   npx tsx examples/basic-horizontal-dial.ts
 */

import { buildHorizontalDial } from "../src/lib/dials/horizontal.ts";
import { renderPolarDialSVG } from "../src/lib/render/svg.ts";

const dial = buildHorizontalDial({
  latitudeDeg: 37.7749,
  timeReference: {
    mode: "standard",
    longitudeDeg: -122.4194,
    zoneMeridianDeg: -120, // PST reference meridian: 15 * -8
    dstOffsetHours: 1,
  },
  hourLineOptions: { startHour: 5, endHour: 19, stepHours: 0.25 },
  nodusDistanceMm: 30,
  gnomonBaseLengthMm: 60,
});

console.error("--- orientation ---");
console.error(dial.orientation);
console.error(`style height: ${dial.gnomon.styleHeightDeg.toFixed(2)} deg`);
console.error(`${dial.hourLines.length} hour lines, ${dial.declinationLines.length} declination lines`);
console.error("--- SVG on stdout ---");

const svg = renderPolarDialSVG(dial, {
  widthMm: 220,
  heightMm: 220,
  radiusMm: 90,
  innerRadiusMm: 6,
  numerals: "roman",
  theme: "laser",
  showDeclinationLines: true,
  showHistoricalHours: false,
  title: "San Francisco, 37.77N 122.42W",
});

process.stdout.write(svg + "\n");
