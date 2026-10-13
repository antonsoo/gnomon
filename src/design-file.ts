/** Portable, editable inputs. A saved file freezes the displayed local minute. */
import { captureDesign, requireUsableDesign } from "./design.ts";
import { MOTTOES } from "./lib/motto.ts";
import { isValidTimeZone, offsetMinutesAt, resolveLocalDateTime, zonedDateTimeInput } from "./lib/timezone.ts";
import type { AppState, HistoricalSystem } from "./state.ts";

export const MAX_DESIGN_FILE_BYTES = 16_384;
const KEYS = ["format", "version", "latitudeDeg", "longitudeDeg", "timeZone", "dialType", "wallDeclinationDeg", "plateShape", "timeMode", "dstOffsetOverride", "numerals", "showDeclinationLines", "showZodiac", "historicalHours", "radiusMm", "theme", "motto", "customDateTimeLocal", "timeDisambiguation", "utcInstant", "utcOffsetMinutes"];

export interface OpenedDesign {
  state: AppState;
  instant: Date;
}

function objectFromText(text: string): Record<string, unknown> {
  if (new TextEncoder().encode(text).byteLength > MAX_DESIGN_FILE_BYTES) throw new Error("Design files must be 16 KiB or smaller.");
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error("This is not a valid JSON design file."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A design file must contain one settings object.");
  // The file is a flat object with primitive values and one string array.
  // Tokenize all strings (including values) before checking member names so
  // escaped quotes in a value cannot be mistaken for a new key.
  const names = new Set<string>();
  for (const match of text.matchAll(/"(?:\\.|[^"\\])*"/g)) {
    if (!text.slice(match.index! + match[0].length).trimStart().startsWith(":")) continue;
    const key = JSON.parse(match[0]) as string;
    if (names.has(key)) throw new Error(`Repeated setting ${JSON.stringify(key)}; keep one value.`);
    names.add(key);
  }
  const record = value as Record<string, unknown>;
  if (record.format !== "gnomon-design") throw new Error("This is not a Gnomon design file. Open the .gnomon.json file, not an SVG or PDF.");
  if (record.version !== 1) throw new Error("This design file uses an unsupported version.");
  for (const key of Object.keys(record)) if (!KEYS.includes(key)) throw new Error(`Unknown setting ${JSON.stringify(key)}; no settings were loaded.`);
  for (const key of KEYS) if (!Object.hasOwn(record, key)) throw new Error(`Missing setting ${key}; no settings were loaded.`);
  return record;
}

function number(record: Record<string, unknown>, key: string, min: number, max: number): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`${key} must be a number from ${min} to ${max}.`);
  return value;
}
function choice<T extends string>(value: unknown, key: string, options: readonly T[]): T {
  if (typeof value !== "string" || !options.includes(value as T)) throw new Error(`${key} has an unsupported value.`);
  return value as T;
}
function flag(record: Record<string, unknown>, key: string): boolean {
  if (typeof record[key] !== "boolean") throw new Error(`${key} must be true or false.`);
  return record[key] as boolean;
}

/** Validate the entire file and its geometry before replacing any current work. */
export function openDesignFile(text: string): OpenedDesign {
  const data = objectFromText(text);
  const timeZone = data.timeZone;
  if (typeof timeZone !== "string" || timeZone.length > 128 || !isValidTimeZone(timeZone)) throw new Error("The saved time zone is not available in this browser.");
  const local = data.customDateTimeLocal;
  if (typeof local !== "string") throw new Error("The saved date and time are missing.");
  const clock = resolveLocalDateTime(local, timeZone);
  if (clock.kind !== "valid") throw new Error(clock.message);
  const timeDisambiguation = choice(data.timeDisambiguation, "timeDisambiguation", ["earlier", "later"] as const);
  const instant = clock.instants[timeDisambiguation === "later" ? clock.instants.length - 1 : 0]!;
  if (data.utcInstant !== instant.toISOString() || data.utcOffsetMinutes !== offsetMinutesAt(timeZone, instant)) {
    throw new Error("The saved local time, UTC time and zone offset disagree. Time-zone rules may have changed; no settings were loaded.");
  }
  const systems: readonly HistoricalSystem[] = ["temporal", "babylonian", "italian"];
  if (!Array.isArray(data.historicalHours) || data.historicalHours.length > systems.length) throw new Error("historicalHours must list the selected hour systems.");
  const historicalHours = data.historicalHours.map(value => choice(value, "historicalHours", systems));
  if (new Set(historicalHours).size !== historicalHours.length) throw new Error("historicalHours contains a repeated hour system.");
  let mottoIndex: number | null = null;
  if (data.motto !== null) {
    mottoIndex = MOTTOES.findIndex(motto => motto.latin === data.motto);
    if (mottoIndex < 0) throw new Error("The saved motto is not available in this version.");
  }
  const dst = data.dstOffsetOverride;
  if (dst !== null && (typeof dst !== "number" || ![0, 0.5, 1, 2].includes(dst))) throw new Error("The saved dial clock adjustment is unsupported.");
  const state: AppState = {
    latitudeDeg: number(data, "latitudeDeg", -90, 90),
    longitudeDeg: number(data, "longitudeDeg", -180, 180),
    timeZone,
    dialType: choice(data.dialType, "dialType", ["horizontal", "vertical", "equatorial", "analemmatic"] as const),
    wallDeclinationDeg: number(data, "wallDeclinationDeg", -180, 180),
    plateShape: choice(data.plateShape, "plateShape", ["fan", "circle"] as const),
    timeMode: choice(data.timeMode, "timeMode", ["standard", "apparent"] as const),
    dstOffsetOverride: dst,
    numerals: choice(data.numerals, "numerals", ["roman", "arabic"] as const),
    showDeclinationLines: flag(data, "showDeclinationLines"),
    showZodiac: flag(data, "showZodiac"),
    historicalHours,
    radiusMm: number(data, "radiusMm", 30, 400),
    theme: choice(data.theme, "theme", ["brass", "slate", "blueprint", "laser"] as const),
    mottoIndex,
    simMode: "custom",
    customDateTimeLocal: local,
    timeDisambiguation,
    playing: false,
  };
  requireUsableDesign(captureDesign(state, instant));
  return { state, instant };
}

/** Freeze now/animation at the selected minute, including a repeated-time occurrence. */
export function saveDesignFile(state: AppState, instant: Date): string {
  const local = zonedDateTimeInput(instant, state.timeZone);
  const clock = resolveLocalDateTime(local, state.timeZone);
  if (clock.kind !== "valid") throw new Error(clock.message);
  const selected = clock.instants.findIndex(candidate => instant.getTime() >= candidate.getTime() && instant.getTime() - candidate.getTime() < 60_000);
  if (selected < 0) throw new Error("The simulation time cannot be saved in this time zone.");
  const frozen = clock.instants[selected]!;
  const text = JSON.stringify({
    format: "gnomon-design", version: 1,
    latitudeDeg: state.latitudeDeg, longitudeDeg: state.longitudeDeg, timeZone: state.timeZone,
    dialType: state.dialType, wallDeclinationDeg: state.wallDeclinationDeg, plateShape: state.plateShape,
    timeMode: state.timeMode, dstOffsetOverride: state.dstOffsetOverride, numerals: state.numerals,
    showDeclinationLines: state.showDeclinationLines, showZodiac: state.showZodiac,
    historicalHours: [...state.historicalHours], radiusMm: state.radiusMm, theme: state.theme,
    motto: state.mottoIndex === null ? null : MOTTOES[state.mottoIndex]?.latin,
    customDateTimeLocal: local, timeDisambiguation: selected === 0 ? "earlier" : "later",
    utcInstant: frozen.toISOString(), utcOffsetMinutes: offsetMinutesAt(state.timeZone, frozen),
  }, null, 2) + "\n";
  openDesignFile(text);
  return text;
}
