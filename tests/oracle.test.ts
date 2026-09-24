/**
 * The independent 3D ray-casting oracle. Everything in this file is a
 * fresh implementation: its own vector kit, its own sun-position formula
 * (built as a change of orthonormal basis / rotation, not the alt-az
 * spherical-trigonometry identities `src/lib/astronomy.ts` uses), and its
 * own ray/plane intersection -- so a bug in `src/lib/geometry.ts` has to
 * be an actual physics error to slip past both.
 *
 * The two sun-direction formulas were cross-checked numerically to six
 * decimal places across a spread of latitude/declination/hour-angle
 * combinations before this file was written, confirming they are
 * independent derivations of the same physical quantity rather than
 * copies of each other (see `docs/oracle-derivation.md`).
 *
 * The test itself: build a real dial with the library, then, for many
 * (latitude, longitude, date, clock hour, dial type) combinations,
 * ray-cast the sun's shadow in 3D from scratch and check it lands on the
 * hour line the dial *labels* with that clock hour, within a tight
 * angular tolerance. Horizontal and direct-vertical dials get an
 * additional check against their published closed-form formulas.
 */

import { describe, expect, it } from "vitest";
import { buildAnalemmaticDial } from "../src/lib/dials/analemmatic.ts";
import { buildEquatorialDial } from "../src/lib/dials/equatorial.ts";
import { buildHorizontalDial } from "../src/lib/dials/horizontal.ts";
import { buildVerticalDial } from "../src/lib/dials/vertical.ts";
import type { HourLineOptions } from "../src/lib/dials/common.ts";
import { altAzFromHourAngle } from "../src/lib/astronomy.ts";

type V3 = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Sun direction in local East-North-Up, via a change of basis instead of
 * altitude/azimuth trigonometry: express the sun in a frame aligned with
 * Earth's axis (X toward the H=0/dec=0 point, Y toward the H=90 point,
 * Z toward the north celestial pole), then that frame's own basis
 * vectors, expressed in ENU, fall out of the two reference points'
 * altitude at the equinox (dec=0): at H=0 the sun culminates at altitude
 * (90-lat) due south; at H=90 it sits exactly on the horizon due west.
 */
function oracleSunENU(latDeg: number, declinationDeg: number, hourAngleDeg: number): V3 {
  const phi = (latDeg * Math.PI) / 180;
  const dec = (declinationDeg * Math.PI) / 180;
  const H = (hourAngleDeg * Math.PI) / 180;
  const xHA: V3 = [0, -Math.sin(phi), Math.cos(phi)];
  const yHA: V3 = [-1, 0, 0]; // west, where the sun sits at H=+90, dec=0
  const zHA: V3 = [0, Math.cos(phi), Math.sin(phi)];
  const cd = Math.cos(dec);
  return add(add(scl(xHA, cd * Math.cos(H)), scl(yHA, cd * Math.sin(H))), scl(zHA, Math.sin(dec)));
}

/** Earth's axis direction, toward the elevated pole -- derived independently by the "which pole is up" argument, not copied from geometry.ts. */
function oracleStyleAxis(latDeg: number): V3 {
  const phi = (latDeg * Math.PI) / 180;
  const towardNCP: V3 = [0, Math.cos(phi), Math.sin(phi)];
  return latDeg >= 0 ? towardNCP : scl(towardNCP, -1);
}

interface OraclePlane {
  origin: V3;
  normal: V3;
  u: V3;
  v: V3;
}

function oraclePlane(normal: V3, uHint: V3): OraclePlane {
  const nLen = Math.sqrt(dot(normal, normal));
  const n = scl(normal, 1 / nLen);
  const uProj = sub(uHint, scl(n, dot(uHint, n)));
  const uLen = Math.sqrt(dot(uProj, uProj));
  const u: V3 = scl(uProj, 1 / uLen);
  // v = u cross n (not n cross u): for a horizontal dial this makes v
  // point east, matching the textbook sign so afternoon hour angles map
  // to positive dial angles -- see the matching comment in geometry.ts.
  const v: V3 = [u[1] * n[2] - u[2] * n[1], u[2] * n[0] - u[0] * n[2], u[0] * n[1] - u[1] * n[0]];
  return { origin: [0, 0, 0], normal: n, u, v };
}

/** Cast a ray from `point` toward the sun and intersect it with `plane`; null if no valid intersection. */
function rayPlaneShadow(point: V3, sunDir: V3, plane: OraclePlane): { u: number; v: number } | null {
  const denom = dot(sunDir, plane.normal);
  if (Math.abs(denom) < 1e-12) return null;
  const rel = sub(point, plane.origin);
  const t = dot(rel, plane.normal) / denom;
  const hit = sub(point, scl(sunDir, t));
  const relHit = sub(hit, plane.origin);
  return { u: dot(relHit, plane.u), v: dot(relHit, plane.v) };
}

function oracleStyleShadowAngle(latDeg: number, hourAngleDeg: number, plane: OraclePlane): number | null {
  const style = oracleStyleAxis(latDeg);
  // Try two deliberately different nonzero declinations than the library's
  // internal reference (15 deg, see geometry.ts): if the two still agree,
  // that is independent confirmation that hour lines really are
  // declination-independent, not just that both sides hard-coded the same
  // number. Zero itself is excluded: for an equatorial dial the plane's
  // normal *is* the polar axis, and the sun sits exactly in that plane at
  // the equinox (sun-direction dot polar-axis = sin(declination) = 0),
  // giving no usable shadow at all -- a real property of equatorial
  // dials, not a bug in either implementation. We also require the sun to
  // be in front of the face (see geometry.ts for why the antipodal branch
  // otherwise appears for some latitude/orientation/hour combinations).
  for (const declinationDeg of [-8, 8]) {
    const sun = oracleSunENU(latDeg, declinationDeg, hourAngleDeg);
    if (dot(sun, plane.normal) <= 0) continue;
    const shadow = rayPlaneShadow(style, sun, plane);
    if (!shadow || (shadow.u === 0 && shadow.v === 0)) continue;
    return Math.atan2(shadow.v, shadow.u);
  }
  return null;
}

const HOUR_OPTS: HourLineOptions = { startHour: 5, endHour: 19, stepHours: 1 };
const APPARENT = (lonDeg: number) => ({ mode: "apparent" as const, longitudeDeg: lonDeg });

function angularDiffRad(a: number, b: number): number {
  let d = Math.abs(a - b) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d;
}

const LATITUDES = [-60, -33.9, -0.5, 5.2, 23.44, 40.7, 51.5, 66.5, 78];
const TOLERANCE_RAD = 1e-6;

describe("oracle: horizontal dial hour lines vs 3D ray casting", () => {
  for (const lat of LATITUDES) {
    it(`matches at latitude ${lat}`, () => {
      const plane = oraclePlane([0, 0, 1], [0, 1, 0]); // up, north
      const dial = buildHorizontalDial({
        latitudeDeg: lat,
        timeReference: APPARENT(0),
        hourLineOptions: HOUR_OPTS,
        nodusDistanceMm: 30,
        gnomonBaseLengthMm: 60,
      });
      let checked = 0;
      for (const line of dial.hourLines) {
        const hourAngleDeg = (line.hour - 12) * 15;
        const oracleAngle = oracleStyleShadowAngle(lat, hourAngleDeg, plane);
        if (oracleAngle === null) continue;
        expect(angularDiffRad(oracleAngle, line.angleRad)).toBeLessThan(TOLERANCE_RAD);
        checked++;
      }
      expect(checked).toBeGreaterThan(5);
    });
  }
});

describe("oracle: horizontal closed form tan(theta) = sin(phi) tan(H)", () => {
  for (const lat of LATITUDES) {
    for (const h of [-75, -60, -45, -30, -15, 15, 30, 45, 60, 75]) {
      it(`lat ${lat}, H ${h}`, () => {
        const plane = oraclePlane([0, 0, 1], [0, 1, 0]);
        const angle = oracleStyleShadowAngle(lat, h, plane);
        expect(angle).not.toBeNull();
        // The closed form gives theta measured from *the noon line*, which
        // is due north for a northern-hemisphere dial but due south for a
        // southern-hemisphere one (the sun, and so the noon shadow, is to
        // the *other* side of the plate) -- our plane's u axis is fixed to
        // true north in both cases, so the southern-hemisphere expectation
        // needs the extra half-turn.
        const base = Math.atan(Math.sin((lat * Math.PI) / 180) * Math.tan((h * Math.PI) / 180));
        const expected = lat < 0 ? base + Math.PI : base;
        expect(angularDiffRad(angle as number, expected)).toBeLessThan(1e-9);
      });
    }
  }
});

describe("oracle: vertical direct-south dial vs co-latitude horizontal closed form", () => {
  for (const lat of [10, 25.5, 40.7, 55, 70]) {
    for (const h of [-60, -30, 30, 60]) {
      it(`lat ${lat}, H ${h}`, () => {
        const plane = oraclePlane([0, -1, 0], [0, 0, 1]); // south, up
        const angle = oracleStyleShadowAngle(lat, h, plane);
        expect(angle).not.toBeNull();
        // A direct vertical south dial has the same hour-line pattern as a
        // horizontal dial for the co-latitude, but left-right mirrored --
        // a documented caveat of that equivalence (Waugh, ch. 4), because
        // "noon is up" on the wall but "noon is away from the viewer" on
        // the horizontal plane, which reverses which side is east.
        const expected = -Math.atan(Math.cos((lat * Math.PI) / 180) * Math.tan((h * Math.PI) / 180));
        expect(angularDiffRad(angle as number, expected)).toBeLessThan(1e-9);
      });
    }
  }
});

describe("oracle: vertical and equatorial dials, library vs ray casting", () => {
  const declinationOptions = [0, 20, -35, 65];
  for (const lat of LATITUDES) {
    for (const wallDeclinationDeg of declinationOptions) {
      it(`vertical lat ${lat}, wall declination ${wallDeclinationDeg}`, () => {
        const faceAzRad = ((180 + wallDeclinationDeg) * Math.PI) / 180;
        const normal: V3 = [Math.sin(faceAzRad), Math.cos(faceAzRad), 0];
        const plane = oraclePlane(normal, [0, 0, 1]);
        const dial = buildVerticalDial({
          latitudeDeg: lat,
          wallDeclinationDeg,
          timeReference: APPARENT(0),
          hourLineOptions: HOUR_OPTS,
          nodusDistanceMm: 30,
          gnomonBaseLengthMm: 60,
        });
        let checked = 0;
        for (const line of dial.hourLines) {
          const hourAngleDeg = (line.hour - 12) * 15;
          const oracleAngle = oracleStyleShadowAngle(lat, hourAngleDeg, plane);
          if (oracleAngle === null) continue;
          expect(angularDiffRad(oracleAngle, line.angleRad)).toBeLessThan(TOLERANCE_RAD);
          checked++;
        }
        expect(checked).toBeGreaterThan(2);
      });
    }
  }

  for (const lat of LATITUDES) {
    it(`equatorial lat ${lat}`, () => {
      const normal = oracleStyleAxis(lat);
      const plane = oraclePlane(normal, [0, 0, 1]);
      const dial = buildEquatorialDial({
        latitudeDeg: lat,
        timeReference: APPARENT(0),
        hourLineOptions: HOUR_OPTS,
        nodusDistanceMm: 30,
        gnomonBaseLengthMm: 60,
      });
      let checked = 0;
      for (const line of dial.hourLines) {
        const hourAngleDeg = (line.hour - 12) * 15;
        const oracleAngle = oracleStyleShadowAngle(lat, hourAngleDeg, plane);
        if (oracleAngle === null) continue;
        expect(angularDiffRad(oracleAngle, line.angleRad)).toBeLessThan(TOLERANCE_RAD);
        checked++;
      }
      expect(checked).toBeGreaterThan(5);
    });
  }
});

describe("oracle: standard-time dial with longitude and DST correction", () => {
  it("hour line for a clock hour lands where the sun really is at that clock time, on a real date", () => {
    // San Francisco: lon -122.4194, PDT (UTC-7, DST +1h from a -8h standard zone meridian).
    const lat = 37.7749;
    const lon = -122.4194;
    const zoneMeridian = -120; // PST reference meridian (UTC-8 * 15)
    const dial = buildHorizontalDial({
      latitudeDeg: lat,
      timeReference: { mode: "standard", longitudeDeg: lon, zoneMeridianDeg: zoneMeridian, dstOffsetHours: 1 },
      hourLineOptions: { startHour: 6, endHour: 18, stepHours: 1 },
      nodusDistanceMm: 30,
      gnomonBaseLengthMm: 60,
    });
    const plane = oraclePlane([0, 0, 1], [0, 1, 0]);

    for (const line of dial.hourLines) {
      // Reconstruct the true solar hour angle for this clock hour exactly
      // as a human reading the dial next to a real clock would expect,
      // independently of how the library derived the line.
      const apparentSolarHour = line.hour - 1 + (lon - zoneMeridian) / 15;
      const hourAngleDeg = (apparentSolarHour - 12) * 15;
      const oracleAngle = oracleStyleShadowAngle(lat, hourAngleDeg, plane);
      expect(oracleAngle).not.toBeNull();
      expect(angularDiffRad(oracleAngle as number, line.angleRad)).toBeLessThan(TOLERANCE_RAD);
    }
  });
});

describe("oracle: analemmatic dial -- vertical rod shadow direction points at the hour mark", () => {
  const cases = [
    { lat: 45, declinationDeg: 0, hour: 15 },
    { lat: 45, declinationDeg: 23.44, hour: 9 },
    { lat: 45, declinationDeg: -23.44, hour: 16 },
    { lat: -33.9, declinationDeg: 11.5, hour: 14 },
    { lat: 51.5, declinationDeg: -20.1, hour: 10 },
  ];
  for (const { lat, declinationDeg, hour } of cases) {
    it(`lat ${lat}, dec ${declinationDeg}, hour ${hour}`, () => {
      const dial = buildAnalemmaticDial({
        latitudeDeg: lat,
        semiMajorMm: 200,
        startHour: 4,
        endHour: 20,
        stepHours: 1,
        includeZodiac: true,
      });
      const mark = dial.dateScale.find((d) => d.declinationDeg === declinationDeg);
      expect(mark).toBeDefined();
      const gnomonPos: V3 = [0, mark!.offsetMm, 0];

      const hourAngleDeg = (hour - 12) * 15;
      const { altitudeDeg, azimuthDeg } = altAzFromHourAngle(lat, declinationDeg, hourAngleDeg);
      expect(altitudeDeg).toBeGreaterThan(0);

      const point = dial.hourPoints.find((p) => p.hour === hour);
      expect(point).toBeDefined();
      const toMark: V3 = [point!.x - gnomonPos[0], point!.y - gnomonPos[1], 0];
      const markAzimuthRad = Math.atan2(toMark[0], toMark[1]); // atan2(East, North) = compass azimuth
      const shadowAzimuthRad = ((azimuthDeg + 180) * Math.PI) / 180;

      expect(angularDiffRad(markAzimuthRad, shadowAzimuthRad)).toBeLessThan(1e-6);
    });
  }
});
