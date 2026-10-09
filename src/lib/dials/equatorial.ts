/**
 * Equatorial dial: the dial plane is perpendicular to Earth's axis (i.e.
 * parallel to the celestial equator), so hour lines are trivially equally
 * spaced at 15 deg/hour radiating from the style foot -- the simplest
 * dial to derive, and a useful cross-check for the general projector,
 * since its hour lines do not depend on latitude at all once you are in
 * the plane's own coordinates. It has two faces (used opposite halves of
 * the year, spring/summer vs. autumn/winter); both share the same hour
 * geometry when viewed from the same side. This designer renders only
 * the pole-facing face; a reverse-face construction is not provided.
 */

import type { TimeReference } from "../time-reference.ts";
import { computeGnomon, generateHourLines } from "./common.ts";
import type { HourLineOptions } from "./common.ts";
import { generateDeclinationLines, STANDARD_DECLINATION_LINES, ZODIAC_DECLINATIONS } from "./declination-lines.ts";
import { generateHistoricalHours } from "./historical-hours.ts";
import { buildDialPlane } from "./plane.ts";
import type { PolarDialResult } from "./types.ts";

export interface EquatorialDialOptions {
  latitudeDeg: number;
  timeReference: TimeReference;
  hourLineOptions: HourLineOptions;
  nodusDistanceMm: number;
  /** Rod length, extended only if needed to reach the nodus. */
  gnomonBaseLengthMm: number;
  includeZodiac?: boolean;
  historicalHours?: Array<"temporal" | "babylonian" | "italian">;
}

export function buildEquatorialDial(opts: EquatorialDialOptions): PolarDialResult {
  const plane = buildDialPlane("equatorial", opts.latitudeDeg); // plane is perpendicular to Earth's axis

  const hourLines = generateHourLines(opts.latitudeDeg, plane, opts.timeReference, opts.hourLineOptions);
  const declinationSpecs = opts.includeZodiac
    ? [...STANDARD_DECLINATION_LINES, ...ZODIAC_DECLINATIONS.map((z) => ({ label: z.name, kind: "zodiac", declinationDeg: z.declinationDeg }))]
    : STANDARD_DECLINATION_LINES;
  const declinationLines = generateDeclinationLines(opts.latitudeDeg, plane, opts.nodusDistanceMm, declinationSpecs);
  const historicalHours = opts.historicalHours?.length
    ? generateHistoricalHours(opts.latitudeDeg, plane, opts.nodusDistanceMm, opts.historicalHours)
    : [];
  const gnomon = computeGnomon(opts.latitudeDeg, plane, opts.gnomonBaseLengthMm, opts.nodusDistanceMm);

  return {
    kind: "equatorial",
    hourLines,
    declinationLines,
    historicalHours,
    gnomon,
    orientation: `Tilt the disc ${(90 - Math.abs(opts.latitudeDeg)).toFixed(1)}° from horizontal so its face is perpendicular to Earth's axis, facing ${opts.latitudeDeg >= 0 ? "the north celestial pole" : "the south celestial pole"}. The rod is perpendicular to the disc. This is the pole-facing face only; it is not illuminated in the opposite half of the year.`,
  };
}
