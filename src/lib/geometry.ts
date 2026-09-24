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
 * The shadow direction of the *style line itself* (not a specific nodus
 * point) -- this is what defines an hour line. Because the style is an
 * infinite line through the plane origin, its shadow for a given hour angle
 * is independent of solar declination (every declination at the same hour
 * angle lies in the same "hour-angle meridian" plane containing the polar
 * axis, and that whole plane casts the same shadow line). We fix
 * declination at a nonzero reference value for the projection (any value
 * works, by the argument above) -- specifically *not* zero, because for
 * an equatorial dial the plane's normal *is* the polar axis, and
 * sun-direction dot polar-axis = sin(declination), which is exactly zero
 * for every hour angle at declination 0 (the sun sits exactly in an
 * equatorial dial's plane at the equinox, casting no usable shadow at
 * all -- a real, well-known property of equatorial dials, not a bug).
 *
 * There is a second subtlety a fixed reference declination alone doesn't
 * solve: the shadow of a specific style *point* (as opposed to the
 * abstract line) flips to the antipodal point -- same line, opposite
 * ray -- exactly when the sun crosses from illuminating the front of the
 * dial face to the back for that hour angle (a real seasonal effect on
 * declining and equatorial dials, not a rounding issue). We resolve it by
 * requiring the sun to actually be in front of the face (dot(sun, normal)
 * > 0) and trying the reference declination's negation if the first
 * choice fails that check, which reliably lands on the illuminated branch.
 */
const HOUR_LINE_REFERENCE_DECLINATION_DEG = 15;

export function hourLineAngle(latDeg: number, hourAngleDeg: number, plane: DialPlane): number | null {
  const style = styleAxisENU(latDeg);
  for (const declinationDeg of [HOUR_LINE_REFERENCE_DECLINATION_DEG, -HOUR_LINE_REFERENCE_DECLINATION_DEG]) {
    const sun = sunDirectionENU(latDeg, declinationDeg, hourAngleDeg);
    if (dot(sun, plane.normal) <= 0) continue; // this declination puts the sun behind the face; try the other
    const shadow = projectOntoPlane(add(plane.origin, style), sun, plane);
    if (!shadow) continue;
    const { u, v } = toPlaneCoords(shadow, plane);
    if (u === 0 && v === 0) continue;
    return Math.atan2(v, u);
  }
  return null;
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
  const style = styleAxisENU(latDeg);
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
