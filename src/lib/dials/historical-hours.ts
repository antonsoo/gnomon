/**
 * Historical unequal-hour systems, reconstructed the way they would have
 * been laid out on an old dial: as curves swept across the year, one curve
 * per nominal hour count, each point found independently from the sunrise
 * and sunset hour angle on that date. There is no closed form for these --
 * they only exist as point-by-point constructions, which is exactly what
 * the loops below do.
 *
 * Sunrise/sunset hour angle H0 (Meeus ch. 15): cos(H0) = -tan(phi) tan(delta).
 *
 *  - Temporal ("Roman"/"unequal") hours: daylight divided into 12 equal
 *    parts regardless of season, numbered I-XII from sunrise. Hour k spans
 *    solar time [sunrise + (k-1)*L, sunrise + k*L] where L = daylight/12;
 *    we mark the boundary time, hour angle H = -H0 + k*(2*H0/12).
 *  - Babylonian hours: equal (15 deg/hour) clock hours counted from
 *    sunrise: H = -H0 + n*15.
 *  - Italian hours: equal (15 deg/hour) clock hours counted from the
 *    *preceding* sunset, using the same day's sunset as the reference (the
 *    standard simplification for a fixed dial curve): H = H0 - (24-n)*15.
 */

import { nodusShadow } from "../geometry.ts";
import type { DialPlane } from "../geometry.ts";
import type { HistoricalHourCurve } from "./types.ts";

function sunriseHourAngleDeg(latDeg: number, declinationDeg: number): number | null {
  const phi = (latDeg * Math.PI) / 180;
  const delta = (declinationDeg * Math.PI) / 180;
  const cosH0 = -Math.tan(phi) * Math.tan(delta);
  if (cosH0 < -1 || cosH0 > 1) return null; // polar day or polar night
  return (Math.acos(cosH0) * 180) / Math.PI;
}

/** Declinations sampled across one year, used to sweep each historical-hour curve. */
function sampleDeclinations(count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const frac = i / (count - 1);
    // Sun's declination is well approximated as a sinusoid peaking at the solstices.
    out.push(23.44 * Math.sin(2 * Math.PI * (frac - 0.22)));
  }
  return out;
}

export function generateHistoricalHours(
  latDeg: number,
  plane: DialPlane,
  nodusDistance: number,
  systems: Array<"temporal" | "babylonian" | "italian">,
): HistoricalHourCurve[] {
  const declinations = sampleDeclinations(37);
  const curves: HistoricalHourCurve[] = [];

  for (const system of systems) {
    const hourCount = system === "temporal" ? 12 : 16;
    for (let n = 1; n <= hourCount; n++) {
      const points: { u: number; v: number }[] = [];
      for (const declinationDeg of declinations) {
        const h0 = sunriseHourAngleDeg(latDeg, declinationDeg);
        if (h0 === null) continue;
        let hourAngleDeg: number;
        if (system === "temporal") {
          if (n < 1 || n > 12) continue;
          hourAngleDeg = -h0 + n * ((2 * h0) / 12);
        } else if (system === "babylonian") {
          hourAngleDeg = -h0 + n * 15;
          if (hourAngleDeg > h0) continue; // past sunset
        } else {
          hourAngleDeg = h0 - (24 - n) * 15;
          if (hourAngleDeg < -h0) continue; // before sunrise
        }
        const shadow = nodusShadow(latDeg, declinationDeg, hourAngleDeg, plane, nodusDistance);
        if (shadow) points.push({ u: shadow.u, v: shadow.v });
      }
      if (points.length >= 2) {
        curves.push({
          system,
          label: system === "temporal" ? toRoman(n) : String(n),
          hourIndex: n,
          points,
        });
      }
    }
  }
  return curves;
}

export function toRoman(n: number): string {
  const table: [number, string][] = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let rem = n;
  let out = "";
  for (const [value, sym] of table) {
    while (rem >= value) {
      out += sym;
      rem -= value;
    }
  }
  return out;
}
