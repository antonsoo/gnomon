import type { PolarDialResult } from "../dials/types.ts";
import { plateSector } from "./plate-shape.ts";

/** Reserve a numeral band INSIDE the physical cut, including the fan's end rays. */
export function polarHourMarks(dial: PolarDialResult, radiusMm: number) {
  const fontSizeMm = Math.min(radiusMm * 0.1, Math.max(3, radiusMm * 0.045));
  const clearanceMm = Math.min(1.5, radiusMm * 0.05);
  // A conservative bounding circle for the 1-12 Arabic / Roman labels.
  // Browser glyph bounds and PDF glyph bounds are checked independently.
  const labelHalfDiagonalMm = fontSizeMm * 1.2;
  const inset = labelHalfDiagonalMm + clearanceMm;
  const labelRadius = radiusMm - inset;
  const hourRadius = radiusMm - 2 * inset;
  const sector = plateSector(dial);
  const labelAngle = Math.asin(inset / labelRadius);
  return {
    fontSizeMm, labelRadius, hourRadius,
    thetaCenter: sector.thetaCenter,
    thetaMax: Math.min(Math.PI, sector.thetaMax + labelAngle),
  };
}
