/**
 * Equatorial dial: the dial plane is perpendicular to Earth's axis (i.e.
 * parallel to the celestial equator), so hour lines are trivially equally
 * spaced at 15 deg/hour radiating from the style foot -- the simplest
 * dial to derive, and a useful cross-check for the general projector,
 * since its hour lines do not depend on latitude at all once you are in
 * the plane's own coordinates. It has two faces (used opposite halves of
 * the year, spring/summer vs. autumn/winter); both share the same hour
 * geometry when viewed from the same side. Each printed face is instead
 * viewed from outside, so its horizontal coordinate reverses on the back.
 */

import type { TimeReference } from "../time-reference.ts";
import { computeGnomon, generateHourLines } from "./common.ts";
import type { HourLineOptions } from "./common.ts";
import { generateDeclinationLines, STANDARD_DECLINATION_LINES, ZODIAC_DECLINATIONS } from "./declination-lines.ts";
import { generateHistoricalHours } from "./historical-hours.ts";
import { buildEquatorialPlane } from "./plane.ts";
import { plateSector } from "../render/plate-shape.ts";
import type { EquatorialFace, PolarDialResult } from "./types.ts";

export interface EquatorialDialOptions {
  latitudeDeg: number;
  timeReference: TimeReference;
  hourLineOptions: HourLineOptions;
  nodusDistanceMm: number;
  /** Rod length, extended only if needed to reach the nodus. */
  gnomonBaseLengthMm: number;
  includeZodiac?: boolean;
  historicalHours?: Array<"temporal" | "babylonian" | "italian">;
  /** Default: pole-facing. PDF construction kits also include the other face. */
  face?: EquatorialFace;
}

function buildFace(opts: EquatorialDialOptions, face: EquatorialFace): PolarDialResult {
  const plane = buildEquatorialPlane(opts.latitudeDeg, face);

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
    orientation: `Tilt the disc ${(90 - Math.abs(opts.latitudeDeg)).toFixed(1)}° from horizontal, perpendicular to Earth's axis. The pole-facing side faces ${opts.latitudeDeg >= 0 ? "the north celestial pole" : "the south celestial pole"}. The rod is perpendicular to the disc. This drawing is the ${face === "pole-facing" ? "pole-facing" : "opposite"} face, viewed from outside.`,
  };
}

export function buildEquatorialDial(opts: EquatorialDialOptions): PolarDialResult {
  const face = opts.face ?? "pole-facing";
  // Validate the requested face even though both physical planes are built below.
  buildEquatorialPlane(opts.latitudeDeg, face);
  const pole = buildFace(opts, "pole-facing");
  const opposite = buildFace(opts, "opposite");
  // Map the opposite face's rays into pole-face coordinates before choosing
  // the cut. A separate minimal fan for each side would not fit one backing.
  const cutSector = plateSector({ ...pole, hourLines: [
    ...pole.hourLines,
    ...opposite.hourLines.map(line => ({ ...line, angleRad: -line.angleRad })),
  ] });
  const north = opts.latitudeDeg >= 0;
  const poleMonths = north ? "March equinox to September equinox" : "September equinox to March equinox";
  const oppositeMonths = north ? "September equinox to March equinox" : "March equinox to September equinox";
  pole.equatorial = { face: "pole-facing", illuminated: poleMonths, cutSector };
  opposite.equatorial = { face: "opposite", illuminated: oppositeMonths,
    cutSector: { thetaMax: cutSector.thetaMax, thetaCenter: -cutSector.thetaCenter } };
  const requested = face === "pole-facing" ? pole : opposite;
  const counterpart = face === "pole-facing" ? opposite : pole;
  requested.equatorial!.counterpart = counterpart;
  return requested;
}
