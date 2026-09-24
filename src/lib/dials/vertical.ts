/**
 * Vertical dial: a wall plane, described by its declination from due
 * south (0 = direct south, +d = the wall's outward face has rotated
 * toward the west, so it "declines" west of south; -d toward the east).
 * This one convention, plus the general 3D projector, covers direct and
 * declining walls in both hemispheres without a separate formula for
 * each case -- a southern-hemisphere dial simply comes out with a
 * negative style height relationship handled by the same vector math.
 *
 * The reference (u) axis is straight up the wall (the plumb/vertical
 * line), which is the conventional noon-ish line for direct dials; for a
 * declining dial the noon line itself tilts away from vertical by the
 * substyle-adjacent amount, which the renderer reads off `gnomon.substyleAngleDeg`.
 *
 * Closed-form check used in the oracle test, direct south case only
 * (Waugh ch. 4): tan(theta) = cos(phi) * tan(H), i.e. a direct vertical
 * south dial is a horizontal dial for the co-latitude (90 - phi).
 */

import { makePlane, vec3 } from "../geometry.ts";
import type { TimeReference } from "../time-reference.ts";
import { computeGnomon, generateHourLines } from "./common.ts";
import type { HourLineOptions } from "./common.ts";
import { generateDeclinationLines, STANDARD_DECLINATION_LINES, ZODIAC_DECLINATIONS } from "./declination-lines.ts";
import { generateHistoricalHours } from "./historical-hours.ts";
import type { PolarDialResult } from "./types.ts";

export interface VerticalDialOptions {
  latitudeDeg: number;
  /** Wall declination from due south, degrees; 0 = direct south, +90 = direct west. */
  wallDeclinationDeg: number;
  timeReference: TimeReference;
  hourLineOptions: HourLineOptions;
  nodusDistanceMm: number;
  gnomonBaseLengthMm: number;
  includeZodiac?: boolean;
  historicalHours?: Array<"temporal" | "babylonian" | "italian">;
}

export function buildVerticalDial(opts: VerticalDialOptions): PolarDialResult {
  const faceAzimuthRad = ((180 + opts.wallDeclinationDeg) * Math.PI) / 180; // from north, clockwise
  const normal = vec3(Math.sin(faceAzimuthRad), Math.cos(faceAzimuthRad), 0);
  const plane = makePlane(vec3(0, 0, 0), normal, vec3(0, 0, 1)); // u = straight up the wall

  const hourLines = generateHourLines(opts.latitudeDeg, plane, opts.timeReference, opts.hourLineOptions);
  const declinationSpecs = opts.includeZodiac
    ? [...STANDARD_DECLINATION_LINES, ...ZODIAC_DECLINATIONS.map((z) => ({ label: z.name, kind: "zodiac", declinationDeg: z.declinationDeg }))]
    : STANDARD_DECLINATION_LINES;
  const declinationLines = generateDeclinationLines(opts.latitudeDeg, plane, opts.nodusDistanceMm, declinationSpecs);
  const historicalHours = opts.historicalHours?.length
    ? generateHistoricalHours(opts.latitudeDeg, plane, opts.nodusDistanceMm, opts.historicalHours)
    : [];
  const gnomon = computeGnomon(opts.latitudeDeg, plane, opts.gnomonBaseLengthMm);

  const kindLabel = opts.wallDeclinationDeg === 0 ? "direct south" : `declining ${opts.wallDeclinationDeg.toFixed(0)} deg from south`;
  return {
    kind: "vertical",
    hourLines,
    declinationLines,
    historicalHours,
    gnomon,
    orientation: `Mount vertically, wall ${kindLabel}. Style height ${gnomon.styleHeightDeg.toFixed(1)} deg, substyle ${gnomon.substyleAngleDeg.toFixed(1)} deg from the plumb line.`,
  };
}
