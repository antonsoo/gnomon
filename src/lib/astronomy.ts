/**
 * Low-precision solar position algorithm, the same one behind the NOAA
 * Solar Calculator, itself a direct implementation of the formulas in
 * Jean Meeus, "Astronomical Algorithms" (2nd ed., 1998), chapters 25 and
 * 28 (accurate to about 0.01 degree for dates within a few centuries of
 * the present -- ample for a sundial, which reads to the nearest few
 * minutes at best because of the gnomon's own penumbra).
 *
 * Two numbers come out of this that everything else depends on:
 *  - the sun's declination delta(t): how far north or south of the
 *    celestial equator the sun sits on a given date. This drives the
 *    date/declination lines and the nodus shadow.
 *  - the equation of time: the gap between apparent solar time (what a
 *    sundial reads) and mean solar time (what a clock reads, before zone
 *    and DST corrections). It comes from two effects: Earth's orbit is
 *    elliptical (varies speed through the year) and the equator is
 *    tilted against the ecliptic (equal steps in right ascension are not
 *    equal steps in time). It is what makes a "correction table"
 *    necessary at all.
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

const sinDeg = (deg: number): number => Math.sin(deg * DEG);
const cosDeg = (deg: number): number => Math.cos(deg * DEG);
const tanDeg = (deg: number): number => Math.tan(deg * DEG);
const asinDeg = (x: number): number => Math.asin(clamp(x, -1, 1)) * RAD;
const acosDeg = (x: number): number => Math.acos(clamp(x, -1, 1)) * RAD;
const atan2Deg = (y: number, x: number): number => Math.atan2(y, x) * RAD;

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Normalize an angle in degrees to [0, 360). */
export function norm360(deg: number): number {
  const m = deg % 360;
  return m < 0 ? m + 360 : m;
}

/** Julian Day Number (UTC) for a JS Date, per Meeus ch. 7. */
export function julianDay(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

/** Julian centuries since J2000.0 (2000-01-01 12:00 TT), Meeus ch. 25. */
export function julianCentury(date: Date): number {
  return (julianDay(date) - 2451545.0) / 36525;
}

export interface SolarEphemeris {
  /** Sun's apparent declination, degrees, positive north of the celestial equator. */
  declinationDeg: number;
  /** Apparent solar time minus mean solar time, in minutes. */
  equationOfTimeMin: number;
}

/**
 * Sun's declination and the equation of time for a given instant (UTC).
 * This does not depend on observer location -- only on the date.
 */
export function solarEphemeris(date: Date): SolarEphemeris {
  const T = julianCentury(date);

  const L0 = norm360(280.46646 + T * (36000.76983 + T * 0.0003032)); // geometric mean longitude
  const M = norm360(357.52911 + T * (35999.05029 - 0.0001537 * T)); // geometric mean anomaly
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T); // eccentricity of Earth's orbit

  const C =
    sinDeg(M) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    sinDeg(2 * M) * (0.019993 - 0.000101 * T) +
    sinDeg(3 * M) * 0.000289; // equation of center

  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const apparentLong = trueLong - 0.00569 - 0.00478 * sinDeg(omega);

  const meanObliquity =
    23 +
    (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const obliquityCorrected = meanObliquity + 0.00256 * cosDeg(omega);

  const declinationDeg = asinDeg(sinDeg(obliquityCorrected) * sinDeg(apparentLong));

  // The bracketed quantity below falls out of the series expansion as a
  // (small) angle in radians; RAD converts it to degrees and *4 converts
  // degrees of hour angle to minutes of time (360 deg = 24h = 1440 min).
  const y = tanDeg(obliquityCorrected / 2) ** 2;
  const bracket =
    y * sinDeg(2 * L0) -
    2 * e * sinDeg(M) +
    4 * e * y * sinDeg(M) * cosDeg(2 * L0) -
    0.5 * y * y * sinDeg(4 * L0) -
    1.25 * e * e * sinDeg(2 * M);
  const equationOfTimeMin = 4 * bracket * RAD;

  return { declinationDeg, equationOfTimeMin };
}

export interface AltAz {
  altitudeDeg: number;
  azimuthDeg: number; // measured from true north, clockwise (compass convention)
}

/**
 * Sun altitude and azimuth from the standard spherical-astronomy formulas
 * (Meeus ch. 13), given latitude, solar declination and hour angle.
 * Hour angle is 0 at local apparent noon, +15 deg/hour to the west.
 */
export function altAzFromHourAngle(latDeg: number, declinationDeg: number, hourAngleDeg: number): AltAz {
  const sinAlt =
    sinDeg(latDeg) * sinDeg(declinationDeg) + cosDeg(latDeg) * cosDeg(declinationDeg) * cosDeg(hourAngleDeg);
  const altitudeDeg = asinDeg(sinAlt);
  const cosAlt = Math.cos(altitudeDeg * DEG);

  // atan2 form (rather than a bare acos + sign patch) so the branch cut
  // falls out automatically instead of needing a hand-picked case split.
  const sinAz = (-cosDeg(declinationDeg) * sinDeg(hourAngleDeg)) / cosAlt;
  const cosAz = (sinDeg(declinationDeg) - sinDeg(latDeg) * sinAlt) / (cosDeg(latDeg) * cosAlt);
  const azimuthDeg = norm360(atan2Deg(sinAz, cosAz));

  return { altitudeDeg, azimuthDeg };
}

/**
 * Unit vector toward the sun in the local East-North-Up (ENU) frame.
 * This is the single conversion point between "spherical astronomy"
 * (altitude/azimuth) and the 3D vector geometry used to project shadows.
 */
export function sunDirectionENU(latDeg: number, declinationDeg: number, hourAngleDeg: number) {
  const { altitudeDeg, azimuthDeg } = altAzFromHourAngle(latDeg, declinationDeg, hourAngleDeg);
  const cosAlt = cosDeg(altitudeDeg);
  return {
    x: cosAlt * sinDeg(azimuthDeg), // East
    y: cosAlt * cosDeg(azimuthDeg), // North
    z: sinDeg(altitudeDeg), // Up
    altitudeDeg,
    azimuthDeg,
  };
}

/**
 * Hour angle (degrees, +15/hour after noon) of the *civil clock* hour
 * `clockHour` (0-24, decimal), for a location with the given longitude,
 * relative to `zoneMeridianDeg` (15 * the zone's UTC offset in hours),
 * with `dstOffsetHours` added if daylight saving is in effect.
 *
 * This intentionally leaves the equation of time out: a physical dial's
 * hour *lines* are cut once and can only encode the fixed longitude
 * correction, not the day-by-day equation of time, which is why sundials
 * ship with a correction table instead. Pass `eotMin` to include it when
 * you want the *true* sun position for a given clock reading (e.g. the
 * live shadow simulation), rather than the fixed geometry of the lines.
 */
export function hourAngleForClockTime(
  clockHour: number,
  longitudeDeg: number,
  zoneMeridianDeg: number,
  dstOffsetHours = 0,
  eotMin = 0,
): number {
  const apparentSolarHour =
    clockHour - dstOffsetHours + (longitudeDeg - zoneMeridianDeg) / 15 + eotMin / 60;
  return (apparentSolarHour - 12) * 15;
}

/** Inverse of {@link hourAngleForClockTime}: clock hour (0-24) reading a given hour angle. */
export function clockTimeForHourAngle(
  hourAngleDeg: number,
  longitudeDeg: number,
  zoneMeridianDeg: number,
  dstOffsetHours = 0,
  eotMin = 0,
): number {
  const apparentSolarHour = hourAngleDeg / 15 + 12;
  return apparentSolarHour - (longitudeDeg - zoneMeridianDeg) / 15 - eotMin / 60 + dstOffsetHours;
}

export { DEG, RAD, sinDeg, cosDeg, tanDeg, asinDeg, acosDeg, atan2Deg };
