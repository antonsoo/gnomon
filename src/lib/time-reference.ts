import { hourAngleForClockTime } from "./astronomy.ts";

/**
 * How the dial's hour lines convert a civil clock reading to a solar hour
 * angle. "standard" bakes in the fixed longitude correction from the time
 * zone's reference meridian (and optionally DST); "apparent" skips all of
 * that and has the dial read local apparent solar time directly -- the
 * oldest and simplest kind of sundial, and the one that needs no equation-
 * of-time correction at all because it does not claim to read clock time.
 */
export type TimeReference =
  | { mode: "standard"; longitudeDeg: number; zoneMeridianDeg: number; dstOffsetHours: number }
  | { mode: "apparent"; longitudeDeg: number };

export function hourAngleForClock(clockHour: number, ref: TimeReference): number {
  if (ref.mode === "apparent") {
    return hourAngleForClockTime(clockHour, ref.longitudeDeg, ref.longitudeDeg, 0);
  }
  return hourAngleForClockTime(clockHour, ref.longitudeDeg, ref.zoneMeridianDeg, ref.dstOffsetHours);
}
