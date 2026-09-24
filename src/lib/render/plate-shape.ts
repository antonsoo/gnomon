/**
 * Where a horizontal or vertical dial's hour lines actually reach (the
 * angular half-range the sun's declination can ever push them to, see
 * `HOUR_LINE_REFERENCE_DECLINATION_DEG` in `geometry.ts`) is rarely +/-90
 * degrees -- at most latitudes the longest day pushes early-morning and
 * late-evening lines well past the noon-to-side quarter circle. A dial
 * plate shaped as a full circle around a centred root therefore wastes
 * most of the "far" side (no hour line ever reaches it) while crowding
 * every real line into a narrow wedge -- exactly what a classic antique
 * horizontal dial's shield/fan-shaped plate avoids by cutting the plate
 * to the wedge that is actually used, with the root at its point.
 *
 * This module computes that wedge (and the plain circle alternative) as
 * plain geometry, shared by the SVG and PDF renderers.
 */

import type { PolarDialResult } from "../dials/types.ts";

export type PlateShape = "fan" | "circle";

/** The largest |hour-line angle| the dial actually uses, radians. Falls back to a quarter turn if there are no lines (e.g. all-null at an extreme latitude). */
export function thetaMaxRad(dial: PolarDialResult): number {
  let max = 0;
  for (const line of dial.hourLines) max = Math.max(max, Math.abs(line.angleRad));
  return max || Math.PI / 2;
}

export interface PlateBounds {
  /** u reached at the top of the plate (always labelRadius: noon is always in range). */
  topU: number;
  /** u reached at the bottom -- 0 for a wedge under 180 deg (root is the lowest point), negative once the wedge opens past a quarter-circle either side. */
  bottomU: number;
  /** Half the plate's east-west extent. */
  halfWidth: number;
}

export function plateBounds(shape: PlateShape, labelRadius: number, thetaMax: number): PlateBounds {
  if (shape === "circle") {
    return { topU: labelRadius, bottomU: -labelRadius, halfWidth: labelRadius };
  }
  const topU = labelRadius;
  const bottomU = Math.min(0, labelRadius * Math.cos(thetaMax));
  const halfWidth = thetaMax >= Math.PI / 2 ? labelRadius : labelRadius * Math.sin(thetaMax);
  return { topU, bottomU, halfWidth };
}

/** Sample points around the plate outline in (u, v) space, root-relative, closed (first === last). For "fan" this is the arc plus the two straight sides back to the root; for "circle" it's just the circle. */
export function plateOutline(shape: PlateShape, radius: number, thetaMax: number, arcSteps = 96): { u: number; v: number }[] {
  if (shape === "circle") {
    const pts: { u: number; v: number }[] = [];
    for (let i = 0; i <= arcSteps; i++) {
      const a = (2 * Math.PI * i) / arcSteps;
      pts.push({ u: radius * Math.cos(a), v: radius * Math.sin(a) });
    }
    return pts;
  }
  const pts: { u: number; v: number }[] = [{ u: 0, v: 0 }];
  for (let i = 0; i <= arcSteps; i++) {
    const a = -thetaMax + (2 * thetaMax * i) / arcSteps;
    pts.push({ u: radius * Math.cos(a), v: radius * Math.sin(a) });
  }
  pts.push({ u: 0, v: 0 });
  return pts;
}
