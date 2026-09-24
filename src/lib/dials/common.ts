import { asinDeg } from "../astronomy.ts";
import { dot, hourLineAngle } from "../geometry.ts";
import type { DialPlane } from "../geometry.ts";
import { hourAngleForClock } from "../time-reference.ts";
import type { TimeReference } from "../time-reference.ts";
import type { GnomonTemplate, HourLine } from "./types.ts";

export interface HourLineOptions {
  /** Earliest and latest civil clock hour to draw, decimal (e.g. 4, 20). */
  startHour: number;
  endHour: number;
  /** Smallest hour subdivision to draw: 1 (whole), 0.5, or 0.25. */
  stepHours: 1 | 0.5 | 0.25;
}

export function generateHourLines(latDeg: number, plane: DialPlane, ref: TimeReference, opts: HourLineOptions): HourLine[] {
  const lines: HourLine[] = [];
  const steps = Math.round((opts.endHour - opts.startHour) / opts.stepHours);
  for (let i = 0; i <= steps; i++) {
    const hour = opts.startHour + i * opts.stepHours;
    const hourAngleDeg = hourAngleForClock(hour, ref);
    const angleRad = hourLineAngle(latDeg, hourAngleDeg, plane);
    if (angleRad === null) continue;
    lines.push({ hour, angleRad, isMajor: Math.abs(hour - Math.round(hour)) < 1e-9 });
  }
  return lines;
}

/**
 * Style height (angle of the gnomon's edge above the dial face) and the
 * substyle angle (where the style's own shadow-casting foot line sits,
 * measured from the reference `u` axis) -- both fall out of the same style
 * vector used for the hour lines, projected onto/against the dial plane.
 */
export function computeGnomon(
  latDeg: number,
  plane: DialPlane,
  baseLengthMm: number,
): GnomonTemplate {
  const style = { x: 0, y: Math.cos((latDeg * Math.PI) / 180), z: Math.sin((latDeg * Math.PI) / 180) };
  const signedStyle = latDeg >= 0 ? style : { x: -style.x, y: -style.y, z: -style.z };
  const styleHeightDeg = asinDeg(Math.abs(dot(signedStyle, plane.normal)));

  const uComp = dot(signedStyle, plane.u);
  const vComp = dot(signedStyle, plane.v);
  const substyleAngleDeg = (Math.atan2(vComp, uComp) * 180) / Math.PI;

  return { styleHeightDeg, substyleAngleDeg, baseLengthMm };
}
