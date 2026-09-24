/**
 * Declination (date) lines: the curve traced by a nodus's shadow through a
 * single day, for a fixed solar declination. At the solstices this is (in
 * general) a hyperbola; at the equinox it degenerates to a straight line
 * (the sun's declination is 0, so the sun moves along the celestial
 * equator, whose shadow on any flat dial plane not containing the style is
 * a line). We do not special-case that -- point-by-point projection
 * produces the straight line on its own.
 */

import { nodusShadow } from "../geometry.ts";
import type { DialPlane } from "../geometry.ts";
import type { DeclinationLine } from "./types.ts";

export const ZODIAC_DECLINATIONS: { name: string; declinationDeg: number }[] = [
  { name: "Aries / Libra", declinationDeg: 0 },
  { name: "Taurus / Virgo", declinationDeg: 11.5 },
  { name: "Gemini / Leo", declinationDeg: 20.1 },
  { name: "Cancer", declinationDeg: 23.44 },
  { name: "Sagittarius / Aquarius", declinationDeg: -20.1 },
  { name: "Capricorn", declinationDeg: -23.44 },
];

export interface DeclinationLineSpec {
  label: string;
  kind: string;
  declinationDeg: number;
}

export const STANDARD_DECLINATION_LINES: DeclinationLineSpec[] = [
  { label: "Summer solstice", kind: "solstice-summer", declinationDeg: 23.44 },
  { label: "Equinox", kind: "equinox", declinationDeg: 0 },
  { label: "Winter solstice", kind: "solstice-winter", declinationDeg: -23.44 },
];

export function generateDeclinationLines(
  latDeg: number,
  plane: DialPlane,
  nodusDistance: number,
  specs: DeclinationLineSpec[],
  samples = 97,
): DeclinationLine[] {
  const lines: DeclinationLine[] = [];
  for (const spec of specs) {
    const points: { u: number; v: number }[] = [];
    for (let i = 0; i < samples; i++) {
      const hourAngleDeg = -180 + (360 * i) / (samples - 1);
      const shadow = nodusShadow(latDeg, spec.declinationDeg, hourAngleDeg, plane, nodusDistance);
      if (shadow) points.push({ u: shadow.u, v: shadow.v });
    }
    if (points.length >= 2) {
      lines.push({ label: spec.label, kind: spec.kind, declinationDeg: spec.declinationDeg, points });
    }
  }
  return lines;
}
