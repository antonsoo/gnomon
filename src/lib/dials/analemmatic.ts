/**
 * Analemmatic dial: the garden dial where a person is the gnomon. It is
 * not built from a fixed polar style at all -- instead it is the
 * orthogonal (straight-down) projection of an equatorial dial's hour
 * points onto the ground, which is why the hour marks fall on an ellipse
 * instead of radiating as straight lines.
 *
 * Derivation (also checked against the general 3D projector in
 * `tests/oracle.test.ts`): an equatorial dial's hour point for hour angle
 * H sits at (R sin H, R cos H) in its own plane, whose basis is (east,
 * v) with v = (0, sin(phi), -cos(phi)) in local ENU. Projecting straight
 * down (dropping the "up" component) gives
 *   x = R sin(H)                  -- east-west, the major axis
 *   y = R sin(phi) cos(H)         -- north-south, compressed by sin(phi)
 * so the minor semi-axis is R sin(phi) and the major is R.
 *
 * The gnomon is a plain vertical rod (any height), whose base moves along
 * the north-south axis through the year. Its position is fixed by
 * requiring the rod's shadow *direction* (not position -- direction, so
 * it works for any rod height) to point at the correct hour mark. Solving
 * that for the standard sun-position formulas gives the classic result
 *   offset = R cos(phi) tan(delta)
 * positive offset = toward the pole-ward end of the minor axis in
 * summer. We verified this numerically (see repository notes / tests)
 * against the general shadow-direction formula before trusting it.
 */

import { sinDeg, tanDeg } from "../astronomy.ts";
import type { AnalemmaticDialResult, AnalemmaticHourPoint } from "./types.ts";
import { STANDARD_DECLINATION_LINES, ZODIAC_DECLINATIONS } from "./declination-lines.ts";

export interface AnalemmaticDialOptions {
  latitudeDeg: number;
  semiMajorMm: number;
  startHour: number;
  endHour: number;
  stepHours: 1 | 0.5 | 0.25;
  includeZodiac?: boolean;
}

export function buildAnalemmaticDial(opts: AnalemmaticDialOptions): AnalemmaticDialResult {
  const R = opts.semiMajorMm;
  const phi = opts.latitudeDeg;
  const semiMinorMm = R * Math.abs(sinDeg(phi));

  const hourPoints: AnalemmaticHourPoint[] = [];
  const steps = Math.round((opts.endHour - opts.startHour) / opts.stepHours);
  for (let i = 0; i <= steps; i++) {
    const hour = opts.startHour + i * opts.stepHours;
    const hourAngleDeg = (hour - 12) * 15;
    const x = R * sinDeg(hourAngleDeg);
    const y = R * sinDeg(phi) * cosDegSafe(hourAngleDeg);
    hourPoints.push({ hour, isMajor: Math.abs(hour - Math.round(hour)) < 1e-9, x, y });
  }

  const dateSpecs = opts.includeZodiac
    ? [...STANDARD_DECLINATION_LINES, ...ZODIAC_DECLINATIONS.map((z) => ({ label: z.name, declinationDeg: z.declinationDeg }))]
    : STANDARD_DECLINATION_LINES;
  const dateScale = dateSpecs.map((spec) => ({
    label: spec.label,
    declinationDeg: spec.declinationDeg,
    offsetMm: R * Math.cos((phi * Math.PI) / 180) * tanDeg(spec.declinationDeg),
  }));

  return { kind: "analemmatic", semiMajorMm: R, semiMinorMm, hourPoints, dateScale };
}

function cosDegSafe(deg: number): number {
  return Math.cos((deg * Math.PI) / 180);
}
