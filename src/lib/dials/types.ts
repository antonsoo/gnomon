/** Shared output shapes that every dial-type module produces, ready for the renderer. */

export type DialKind = "horizontal" | "vertical" | "equatorial" | "analemmatic";

export interface HourLine {
  /** Civil clock hour, decimal (e.g. 14.5 = 2:30 PM). */
  hour: number;
  /** Angle in the dial plane, radians, measured from the reference (u) axis toward v. */
  angleRad: number;
  /** True for whole hours (gets a numeral label); false for half/quarter marks. */
  isMajor: boolean;
}

export interface PlanePoint {
  u: number;
  v: number;
}

export interface DeclinationLine {
  label: string;
  /** "solstice-summer" | "solstice-winter" | "equinox" | a zodiac sign name */
  kind: string;
  declinationDeg: number;
  points: PlanePoint[];
}

export interface HistoricalHourCurve {
  system: "temporal" | "babylonian" | "italian";
  label: string;
  /** One traced curve per nominal hour count (e.g. temporal hours I-XII). */
  hourIndex: number;
  points: PlanePoint[];
}

export interface GnomonTemplate {
  /** Angle of the style above the dial plane, degrees. */
  styleHeightDeg: number;
  /** Angle of the substyle from the reference (u) axis, degrees (0 for direct dials). */
  substyleAngleDeg: number;
  /** Base length of the gnomon's triangular template along the substyle line, mm. */
  baseLengthMm: number;
}

export interface PolarDialResult {
  kind: "horizontal" | "vertical" | "equatorial";
  hourLines: HourLine[];
  declinationLines: DeclinationLine[];
  historicalHours: HistoricalHourCurve[];
  gnomon: GnomonTemplate;
  /** Human-readable description of plane orientation, for the UI/README. */
  orientation: string;
}

export interface AnalemmaticHourPoint {
  hour: number;
  isMajor: boolean;
  x: number;
  y: number;
}

export interface AnalemmaticDateMark {
  label: string;
  declinationDeg: number;
  /** Offset along the north-south minor axis, mm, where the gnomon stands on this date. */
  offsetMm: number;
}

export interface AnalemmaticDialResult {
  kind: "analemmatic";
  semiMajorMm: number;
  semiMinorMm: number;
  hourPoints: AnalemmaticHourPoint[];
  dateScale: AnalemmaticDateMark[];
}
