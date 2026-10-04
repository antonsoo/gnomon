import type { AppState } from "./state.ts";
import { buildAnalemmaticDial } from "./lib/dials/analemmatic.ts";
import { buildHorizontalDial } from "./lib/dials/horizontal.ts";
import { buildVerticalDial } from "./lib/dials/vertical.ts";
import { buildEquatorialDial } from "./lib/dials/equatorial.ts";
import { formatUtcOffset, resolveZone, zonedDateTimeInput } from "./lib/timezone.ts";
import type { TimeReference } from "./lib/time-reference.ts";
import { MOTTOES } from "./lib/motto.ts";
import { renderAnalemmaticSVG, renderPolarDialSVG } from "./lib/render/svg.ts";
import type { Theme } from "./lib/render/theme.ts";

export function formatLatLon(latitudeDeg: number, longitudeDeg: number): string {
  return `${Math.abs(latitudeDeg).toFixed(2)}° ${latitudeDeg >= 0 ? "N" : "S"}, ${Math.abs(longitudeDeg).toFixed(2)}° ${longitudeDeg >= 0 ? "E" : "W"}`;
}

/** One immutable-in-use design: async exports must not read the live form again. */
export function captureDesign(state: AppState, instant: Date) {
  const settings = { ...state, historicalHours: [...state.historicalHours] };
  const zone = resolveZone(settings.timeZone, instant);
  const dstOffsetHours = settings.dstOffsetOverride ?? zone.dstOffsetHours;
  const timeReference: TimeReference = settings.timeMode === "apparent"
    ? { mode: "apparent", longitudeDeg: settings.longitudeDeg }
    : { mode: "standard", longitudeDeg: settings.longitudeDeg, zoneMeridianDeg: zone.zoneMeridianDeg, dstOffsetHours };
  const shared = {
    latitudeDeg: settings.latitudeDeg,
    timeReference,
    hourLineOptions: { startHour: 3, endHour: 21, stepHours: 0.25 as const },
    nodusDistanceMm: settings.radiusMm * 0.32,
    gnomonBaseLengthMm: settings.radiusMm * 0.62,
    includeZodiac: settings.showZodiac,
    historicalHours: settings.historicalHours,
  };
  const dial = settings.dialType === "analemmatic"
    ? buildAnalemmaticDial({ latitudeDeg: settings.latitudeDeg, semiMajorMm: settings.radiusMm, startHour: 4, endHour: 20, stepHours: 1, includeZodiac: settings.showZodiac })
    : settings.dialType === "horizontal" ? buildHorizontalDial(shared)
    : settings.dialType === "equatorial" ? buildEquatorialDial(shared)
    : buildVerticalDial({ ...shared, wallDeclinationDeg: settings.wallDeclinationDeg });
  const title = `${settings.dialType[0]!.toUpperCase()}${settings.dialType.slice(1)} · ${formatLatLon(settings.latitudeDeg, settings.longitudeDeg)}`;
  const timeBasis = settings.dialType === "analemmatic" || settings.timeMode === "apparent"
    ? "Local apparent solar time"
    : `Zone time ${formatUtcOffset(zone.standardOffsetMinutes + dstOffsetHours * 60)}; subtract the equation of time from the dial reading`;
  const mounting = dial.kind === "analemmatic"
    ? "Lay flat, top toward true north. Place a vertical rod on the date scale."
    : `${dial.orientation} Nodus ${(settings.radiusMm * 0.32).toFixed(1)} mm along the style from its foot.`;
  const description = `${title}. ${timeBasis}. ${settings.timeZone}; design date ${zonedDateTimeInput(instant, settings.timeZone).slice(0, 10)}. Radius ${settings.radiusMm} mm. ${mounting}`;
  const common = { numerals: settings.numerals, title, description, motto: settings.mottoIndex === null ? undefined : MOTTOES[settings.mottoIndex] };
  const polarOptions = {
    ...common,
    radiusMm: settings.radiusMm,
    innerRadiusMm: Math.max(4, settings.radiusMm * 0.06),
    plateShape: settings.plateShape,
    showDeclinationLines: settings.showDeclinationLines,
    showHistoricalHours: settings.historicalHours.length > 0,
  };
  const analemmaticOptions = { ...common, widthMm: settings.radiusMm * 2.6, heightMm: settings.radiusMm * 2.6 };
  return { settings, dial, title, description, timeBasis, dstOffsetHours, polarOptions, analemmaticOptions };
}

export type DesignSnapshot = ReturnType<typeof captureDesign>;

export function designSvg(design: DesignSnapshot, theme: Theme): string {
  return design.dial.kind === "analemmatic"
    ? renderAnalemmaticSVG(design.dial, { ...design.analemmaticOptions, theme })
    : renderPolarDialSVG(design.dial, { ...design.polarOptions, theme });
}
