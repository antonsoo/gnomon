import type { PlateShape } from "./lib/render/plate-shape.ts";
import type { Theme } from "./lib/render/theme.ts";
import { zonedDateTimeInput } from "./lib/timezone.ts";

export type DialType = "horizontal" | "vertical" | "equatorial" | "analemmatic";
export type HistoricalSystem = "temporal" | "babylonian" | "italian";

export interface AppState {
  latitudeDeg: number;
  longitudeDeg: number;
  timeZone: string;
  dialType: DialType;
  wallDeclinationDeg: number;
  plateShape: PlateShape;
  timeMode: "standard" | "apparent";
  dstOffsetOverride: number | null; // null = auto-detect from timeZone
  numerals: "arabic" | "roman";
  showDeclinationLines: boolean;
  showZodiac: boolean;
  historicalHours: HistoricalSystem[];
  radiusMm: number;
  theme: Theme;
  mottoIndex: number | null;
  simMode: "now" | "custom";
  customDateTimeLocal: string; // "YYYY-MM-DDTHH:mm"
  timeDisambiguation: "earlier" | "later";
  playing: boolean;
}

export function defaultState(now = new Date()): AppState {
  const timeZone = "America/Los_Angeles";
  return {
    latitudeDeg: 37.7749,
    longitudeDeg: -122.4194,
    timeZone,
    dialType: "horizontal",
    wallDeclinationDeg: 0,
    plateShape: "fan",
    timeMode: "standard",
    dstOffsetOverride: null,
    numerals: "roman",
    showDeclinationLines: true,
    showZodiac: false,
    historicalHours: [],
    radiusMm: 90,
    theme: "brass",
    mottoIndex: 0,
    simMode: "now",
    customDateTimeLocal: zonedDateTimeInput(now, timeZone),
    timeDisambiguation: "earlier",
    playing: false,
  };
}
