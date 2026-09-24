/**
 * Horizontal dial: the plane is the ground itself. Reference (u) axis is
 * true north, so the noon line points away from the viewer and the style
 * leans up toward the elevated pole -- the classic garden sundial.
 *
 * Closed form (Waugh, "Sundials: Their Theory and Construction", ch. 3):
 * the angle theta of the hour line for hour angle H, measured from the
 * noon line, satisfies tan(theta) = sin(phi) * tan(H). `tests/oracle.test.ts`
 * checks the general 3D projector used here against exactly this formula.
 */

import type { TimeReference } from "../time-reference.ts";
import { computeGnomon, generateHourLines } from "./common.ts";
import type { HourLineOptions } from "./common.ts";
import { generateDeclinationLines, STANDARD_DECLINATION_LINES, ZODIAC_DECLINATIONS } from "./declination-lines.ts";
import { generateHistoricalHours } from "./historical-hours.ts";
import { buildDialPlane } from "./plane.ts";
import type { PolarDialResult } from "./types.ts";

export interface HorizontalDialOptions {
  latitudeDeg: number;
  timeReference: TimeReference;
  hourLineOptions: HourLineOptions;
  nodusDistanceMm: number;
  gnomonBaseLengthMm: number;
  includeZodiac?: boolean;
  historicalHours?: Array<"temporal" | "babylonian" | "italian">;
}

export function buildHorizontalDial(opts: HorizontalDialOptions): PolarDialResult {
  const plane = buildDialPlane("horizontal", opts.latitudeDeg);

  const hourLines = generateHourLines(opts.latitudeDeg, plane, opts.timeReference, opts.hourLineOptions);
  const declinationSpecs = opts.includeZodiac
    ? [...STANDARD_DECLINATION_LINES, ...ZODIAC_DECLINATIONS.map((z) => ({ label: z.name, kind: "zodiac", declinationDeg: z.declinationDeg }))]
    : STANDARD_DECLINATION_LINES;
  const declinationLines = generateDeclinationLines(opts.latitudeDeg, plane, opts.nodusDistanceMm, declinationSpecs);
  const historicalHours = opts.historicalHours?.length
    ? generateHistoricalHours(opts.latitudeDeg, plane, opts.nodusDistanceMm, opts.historicalHours)
    : [];
  const gnomon = computeGnomon(opts.latitudeDeg, plane, opts.gnomonBaseLengthMm);

  return {
    kind: "horizontal",
    hourLines,
    declinationLines,
    historicalHours,
    gnomon,
    orientation: `Lay flat, noon line toward true north. Style height ${gnomon.styleHeightDeg.toFixed(1)}° = |latitude|.`,
  };
}
