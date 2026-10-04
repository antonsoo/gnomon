/**
 * The one piece of vector geometry every dial face is built from: given a
 * dial plane (an origin, its outward normal, and an in-plane basis) and a
 * gnomon style pointing along Earth's rotation axis, find where a ray from
 * the sun casts a shadow.
 *
 * Working in a full local East-North-Up (ENU) frame instead of hand-picking
 * a trig formula per dial type is deliberate: horizontal, direct-vertical,
 * declining-vertical and equatorial dials are all "the shadow of a polar
 * style on a plane" -- they differ only in which plane. Reusing one
 * projector means one derivation to get right instead of four, and it is
 * exactly what `tests/oracle.test.ts` re-derives independently (as a literal
 * ray/plane intersection) to check against.
 */

import { sunDirectionENU } from "./astronomy.ts";
import { add, cross, dot, normalize, scale, sub, type Vec3, vec3 } from "./vec3.ts";

/** A flat dial face: an origin point, its outward unit normal, and an in-plane (u, v) basis. */
export interface DialPlane {
  origin: Vec3;
  normal: Vec3;
  /** In-plane "reference" direction -- e.g. the noon line for most dials. */
  u: Vec3;
  /** In-plane direction completing the right-handed (normal, u, v) frame. */
  v: Vec3;
}

/**
 * Build an orthonormal plane basis from a normal and a desired "u"
 * direction (need not be exactly in-plane). `v = u cross n` (not `n
 * cross u`) so that, for a horizontal dial (u = north, n = up), v comes
 * out east -- matching the textbook sign convention where an afternoon
 * hour angle (H > 0) gives a positive hour-line angle,
 * tan(theta) = sin(phi) * tan(H), with no extra sign flip to track.
 */
export function makePlane(origin: Vec3, normal: Vec3, uHint: Vec3): DialPlane {
  const n = normalize(normal);
  // Project uHint into the plane and orthonormalize.
  const uRaw = sub(uHint, scale(n, dot(uHint, n)));
  const u = normalize(uRaw);
  const v = cross(u, n);
  return { origin, normal: n, u, v };
}

/** Unit vector along Earth's axis, pointing toward the *elevated* celestial pole, in local ENU. */
export function styleAxisENU(latDeg: number): Vec3 {
  const phi = (latDeg * Math.PI) / 180;
  const towardNCP = vec3(0, Math.cos(phi), Math.sin(phi));
  return latDeg >= 0 ? towardNCP : scale(towardNCP, -1);
}

/** A physical style must project out of the receiving face, not behind it. */
export function styleAxisForPlane(latDeg: number, plane: DialPlane): Vec3 {
  const elevated = styleAxisENU(latDeg);
  return dot(elevated, plane.normal) < 0 ? scale(elevated, -1) : elevated;
}

/**
 * Project a point along the sun's ray onto a plane. Returns null if the ray
 * is parallel to the plane (sun exactly along the style, i.e. declination
 * ±90) or the intersection falls behind the light source.
 */
export function projectOntoPlane(point: Vec3, sunDirection: Vec3, plane: DialPlane): Vec3 | null {
  const denom = dot(sunDirection, plane.normal);
  if (Math.abs(denom) < 1e-12) return null;
  const rel = sub(point, plane.origin);
  const t = dot(rel, plane.normal) / denom;
  if (t < 0) return null; // a shadow travels away from the sun
  return sub(point, scale(sunDirection, t));
}

/** Express a 3D point that lies in `plane` as 2D (u, v) plane coordinates. */
export function toPlaneCoords(point: Vec3, plane: DialPlane): { u: number; v: number } {
  const rel = sub(point, plane.origin);
  return { u: dot(rel, plane.u), v: dot(rel, plane.v) };
}

export interface ShadowSample {
  hourAngleDeg: number;
  /** Angle in the dial plane, measured from `u` toward `v`, radians. */
  angleRad: number;
  point: { u: number; v: number };
}

/**
 * Find a physical hour ray. The shadow's line is independent of declination,
 * but the sun must be above the horizon AND in front of the face on some
 * date. In the annual declination range cos(delta) is positive, so each
 * visibility constraint is linear in t = tan(delta): a + b*t > 0.
 * Intersect those intervals and use an interior point as the reference sun.
 * Checking just the solstices misses some declining-wall hours; checking
 * only the face also admits night-time hour lines.
 */
export function hourLineAngle(latDeg: number, hourAngleDeg: number, plane: DialPlane): number | null {
  const style = styleAxisForPlane(latDeg, plane);
  if (dot(style, plane.normal) < 1e-12) return null;
  const equinoxSun = sunDirectionENU(latDeg, 0, hourAngleDeg);
  const phi = latDeg * Math.PI / 180;
  const pole = vec3(0, Math.cos(phi), Math.sin(phi));
  const limit = Math.tan(23.44 * Math.PI / 180);
  let lower = -limit;
  let upper = limit;
  for (const normal of [vec3(0, 0, 1), plane.normal]) {
    const a = dot(equinoxSun, normal);
    const b = dot(pole, normal);
    if (Math.abs(b) < 1e-12) {
      if (a <= 1e-12) return null;
    } else if (b > 0) lower = Math.max(lower, -a / b);
    else upper = Math.min(upper, -a / b);
  }
  if (upper - lower < 1e-12) return null;
  const declinationDeg = Math.atan((lower + upper) / 2) * 180 / Math.PI;
  const sun = sunDirectionENU(latDeg, declinationDeg, hourAngleDeg);
  const shadow = projectOntoPlane(add(plane.origin, style), sun, plane);
  if (!shadow) return null;
  const { u, v } = toPlaneCoords(shadow, plane);
  return u === 0 && v === 0 ? null : Math.atan2(v, u);
}

/**
 * The shadow of a nodus (a point at distance `nodusDistance` along the
 * style from the plane origin) for a given hour angle and declination --
 * this is what traces out a declination (date) line.
 */
export function nodusShadow(
  latDeg: number,
  declinationDeg: number,
  hourAngleDeg: number,
  plane: DialPlane,
  nodusDistance: number,
): { u: number; v: number; altitudeDeg: number } | null {
  const style = styleAxisForPlane(latDeg, plane);
  if (dot(style, plane.normal) < 1e-12) return null;
  const nodus = add(plane.origin, scale(style, nodusDistance));
  const sun = sunDirectionENU(latDeg, declinationDeg, hourAngleDeg);
  if (sun.altitudeDeg <= 0) return null; // below the horizon entirely
  if (dot(sun, plane.normal) <= 0) return null; // above the horizon, but behind this dial face
  const shadow = projectOntoPlane(nodus, sun, plane);
  if (!shadow) return null;
  return { ...toPlaneCoords(shadow, plane), altitudeDeg: sun.altitudeDeg };
}

export { add, cross, dot, normalize, scale, sub, vec3 };
export type { Vec3 };
