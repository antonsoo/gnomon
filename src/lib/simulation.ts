/**
 * Live shadow simulation: for a chosen instant, work out where the
 * gnomon's shadow actually falls, so the preview can be animated. This
 * reuses the same `nodusShadow` projector as the declination lines -- the
 * shadow tip is just the shadow of the point at the far end of the
 * physical style.
 *
 * Note this needs only UTC time + longitude to find the true sun
 * position: a civil time zone and DST are bookkeeping for what a *clock*
 * shows, not physics, so they only matter when converting the resulting
 * hour angle back into a clock reading for the UI (`clockTimeForHourAngle`
 * in `astronomy.ts`), not for finding the shadow itself.
 */

import { altAzFromHourAngle, solarEphemeris } from "./astronomy.ts";
import { nodusShadow } from "./geometry.ts";
import type { DialPlane } from "./geometry.ts";

export interface ShadowState {
  visible: boolean;
  altitudeDeg: number;
  azimuthDeg: number;
  hourAngleDeg: number;
  declinationDeg: number;
  equationOfTimeMin: number;
  /** Shadow tip in dial-plane (u, v) coordinates, mm; null if the sun casts no usable shadow. */
  tip: { u: number; v: number } | null;
}

export function simulatePolarShadow(
  instant: Date,
  latDeg: number,
  longitudeDeg: number,
  plane: DialPlane,
  styleLengthMm: number,
): ShadowState {
  const { declinationDeg, equationOfTimeMin } = solarEphemeris(instant);
  const utcHour = instant.getUTCHours() + instant.getUTCMinutes() / 60 + instant.getUTCSeconds() / 3600;
  const apparentSolarHour = utcHour + longitudeDeg / 15 + equationOfTimeMin / 60;
  const hourAngleDeg = (apparentSolarHour - 12) * 15;

  const { altitudeDeg, azimuthDeg } = altAzFromHourAngle(latDeg, declinationDeg, hourAngleDeg);
  if (altitudeDeg <= 0) {
    return { visible: false, altitudeDeg, azimuthDeg, hourAngleDeg, declinationDeg, equationOfTimeMin, tip: null };
  }
  const shadow = nodusShadow(latDeg, declinationDeg, hourAngleDeg, plane, styleLengthMm);
  return {
    visible: shadow !== null, // sun may be up but behind this particular dial face
    altitudeDeg,
    azimuthDeg,
    hourAngleDeg,
    declinationDeg,
    equationOfTimeMin,
    tip: shadow ? { u: shadow.u, v: shadow.v } : null,
  };
}
