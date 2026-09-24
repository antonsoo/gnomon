import type { PlateShape } from "./lib/render/plate-shape.ts";
import type { Theme } from "./lib/render/theme.ts";

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
  playing: boolean;
}

export function defaultState(): AppState {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return {
    latitudeDeg: 37.7749,
    longitudeDeg: -122.4194,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
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
    customDateTimeLocal: local,
    playing: false,
  };
}
