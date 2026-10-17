import { describe, expect, it } from "vitest";
import { buildVerticalDial } from "../src/lib/dials/vertical.ts";
import { renderPolarDialSVG } from "../src/lib/render/svg.ts";

// Inverse geometry: a point P engraved as a date curve implies Sun direction
// (N-P)/|N-P|, where N is the physical nodus. Its north-axis component is sin(delta).
// This uses neither the product's forward projector nor its visibility predicate.
function impliedDeclination(u: number, v: number, latitude: number, wall: number) {
  const phi = latitude * Math.PI / 180;
  const azimuth = (180 + wall) * Math.PI / 180;
  const sign = Math.cos(azimuth) < 0 ? -1 : 1;
  const distance = 90 * 0.32;
  const nodus = [0, sign * distance * Math.cos(phi), sign * distance * Math.sin(phi)];
  const point = [-Math.cos(azimuth) * v, Math.sin(azimuth) * v, u];
  const sun = nodus.map((coordinate, i) => coordinate - point[i]!);
  const length = Math.hypot(...sun);
  return {
    declination: Math.asin(Math.max(-1, Math.min(1,
      (sun[1]! * Math.cos(phi) + sun[2]! * Math.sin(phi)) / length))) * 180 / Math.PI,
    up: sun[2]! / length,
  };
}

describe("engraved date curves preserve unavailable shadow intervals", () => {
  for (const { latitude, wall } of [{ latitude: 70, wall: 100 }, { latitude: -70, wall: 80 }]) {
    for (const shape of ["circle", "fan"] as const) {
      it(`${latitude} degrees, wall ${wall}, ${shape}: every drawn edge remains on its date's cone`, () => {
        const dial = buildVerticalDial({ latitudeDeg: latitude, wallDeclinationDeg: wall,
          timeReference: { mode: "apparent", longitudeDeg: 0 },
          hourLineOptions: { startHour: 3, endHour: 21, stepHours: 0.25 },
          nodusDistanceMm: 28.8, gnomonBaseLengthMm: 55.8 });
        const svg = renderPolarDialSVG(dial, { radiusMm: 90, innerRadiusMm: 5.4,
          plateShape: shape, numerals: "arabic", theme: "laser",
          showDeclinationLines: true, showHistoricalHours: false });
        const foot = svg.match(/<circle cx="([^"]+)" cy="([^"]+)" r="0\.6"/)!;
        const centerX = Number(foot[1]);
        const centerY = Number(foot[2]);
        const paths = [...svg.matchAll(/<path\b[^>]*stroke-width="0\.25"[^>]*\/>/g)];
        expect(paths.length).toBeGreaterThan(0);
        for (const [path] of paths) {
          const data = path.match(/\bd="([^"]+)"/)![1]!;
          const numbers = data.match(/[-+]?(?:\d+(?:\.\d*)?|\.\d+)/g)!.map(Number);
          expect(numbers.length).toBe(2 * [...data.matchAll(/[ML]/g)].length);
          const points = [];
          for (let i = 0; i < numbers.length; i += 2) {
            points.push({ u: centerY - numbers[i + 1]!, v: numbers[i]! - centerX });
          }
          const first = impliedDeclination(points[0]!.u, points[0]!.v, latitude, wall);
          const declination = [-23.44, 0, 23.44].reduce((a, b) =>
            Math.abs(a - first.declination) < Math.abs(b - first.declination) ? a : b);
          for (const point of points) {
            expect(Math.abs(impliedDeclination(point.u, point.v, latitude, wall).declination - declination)).toBeLessThan(0.1);
          }
          for (let i = 1; i < points.length; i++) {
            const a = points[i - 1]!, b = points[i]!;
            const sun = impliedDeclination((a.u + b.u) / 2, (a.v + b.v) / 2, latitude, wall);
            // Adjacent 3.75-degree samples have small chord error; SVG rounds to .001 mm.
            // The former unsupported edge implied +/-85.49 degrees instead of +/-23.44.
            expect(Math.abs(sun.declination - declination)).toBeLessThan(0.1);
            expect(sun.up).toBeGreaterThan(0);
          }
        }
      });
    }
  }
});
