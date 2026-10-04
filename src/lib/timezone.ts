/**
 * Derives a time zone's standard-time UTC offset (and therefore its
 * "zone meridian", 15 deg per hour of offset) and DST offset from the
 * IANA database via `Intl`, rather than hard-coding either -- so it stays
 * correct as zones change without a data update in this repo.
 */

/** True if `Intl` knows this IANA zone name ("Europe/Rome"); a typo would otherwise throw a RangeError on every render. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

export function offsetMinutesAt(timeZone: string, date: Date): number {
  let formatter = offsetFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    });
    if (offsetFormatters.size >= 16) offsetFormatters.clear();
    offsetFormatters.set(timeZone, formatter);
  }
  const tzPart = formatter.formatToParts(date).find((p) => p.type === "timeZoneName")?.value;
  if (tzPart === "GMT") return 0;
  const match = /^GMT([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(tzPart ?? "");
  if (!match) throw new Error(`Cannot read the UTC offset for ${timeZone}.`);
  return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]) + Number(match[4] ?? 0) / 60);
}

/** HTML date/time values in the selected location, independent of device locale and zone. */
export function zonedDateTimeInput(instant: Date, timeZone: string): string {
  const local = new Date(instant.getTime() + offsetMinutesAt(timeZone, instant) * 60_000);
  return local.toISOString().slice(0, 16);
}

export function formatUtcOffset(minutes: number): string {
  const seconds = Math.round(Math.abs(minutes) * 60);
  const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor(seconds / 60) % 60).padStart(2, "0");
  const ss = seconds % 60;
  return `UTC${minutes < 0 ? "-" : "+"}${hh}:${mm}${ss ? `:${String(ss).padStart(2, "0")}` : ""}`;
}

export type LocalTimeResult =
  | { kind: "valid"; instants: Date[] }
  | { kind: "invalid" | "gap"; message: string };

/**
 * Find exact instants for a wall-clock minute. Sampling nearby offsets and
 * round-tripping each candidate avoids silently normalizing gaps or choosing
 * one side of a repeated hour. The UI supports 1900-2100; this is not a general
 * historical time-zone transition database. It uses the browser's Intl data.
 */
export function resolveLocalDateTime(local: string, timeZone: string): LocalTimeResult {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) {
    return { kind: "invalid", message: "Choose a complete date and time." };
  }
  const wall = new Date(`${local}:00Z`);
  if (!Number.isFinite(wall.getTime()) || wall.toISOString().slice(0, 16) !== local
    || wall.getUTCFullYear() < 1900 || wall.getUTCFullYear() > 2100) {
    return { kind: "invalid", message: "Choose a valid date between 1900 and 2100." };
  }
  if (!isValidTimeZone(timeZone)) return { kind: "invalid", message: "Choose a valid IANA time zone." };
  const offsets = new Set<number>();
  // Both sides of a nearby clock change, including a skipped civil day.
  for (let hours = -48; hours <= 48; hours += 6) {
    offsets.add(offsetMinutesAt(timeZone, new Date(wall.getTime() + hours * 3_600_000)));
  }
  const instants = [...offsets].map((offset) => new Date(wall.getTime() - offset * 60_000))
    .filter((instant) => offsetMinutesAt(timeZone, instant) * 60_000 + instant.getTime() === wall.getTime())
    .sort((a, b) => a.getTime() - b.getTime());
  return instants.length ? { kind: "valid", instants } : {
    kind: "gap",
    message: `${local.replace("T", " ")} does not occur in ${timeZone} because the clocks move forward. Choose another time.`,
  };
}

export interface ZoneInfo {
  /** UTC offset in effect on the given date, minutes. */
  currentOffsetMinutes: number;
  /** The zone's standard-time (non-DST) offset, minutes -- the smallest offset across a year of samples. */
  standardOffsetMinutes: number;
  /** Zone meridian for the *standard* offset, degrees east. */
  zoneMeridianDeg: number;
  /** Whether DST appears to be in effect on the given date. */
  isDst: boolean;
  /** currentOffsetMinutes - standardOffsetMinutes, hours (0 or typically 1). */
  dstOffsetHours: number;
}

const standardOffsets = new Map<string, number>();

export function resolveZone(timeZone: string, date: Date): ZoneInfo {
  const year = date.getUTCFullYear();
  const key = `${timeZone}/${year}`;
  let standardOffsetMinutes = standardOffsets.get(key);
  if (standardOffsetMinutes === undefined) {
    const samples: number[] = [];
    for (let m = 0; m < 12; m++) {
      samples.push(offsetMinutesAt(timeZone, new Date(Date.UTC(year, m, 15, 12, 0, 0))));
    }
    standardOffsetMinutes = Math.min(...samples);
    if (standardOffsets.size >= 32) standardOffsets.clear();
    standardOffsets.set(key, standardOffsetMinutes);
  }
  // Daylight saving moves clocks forward, so standard time is the smaller
  // offset. (Not the most common one: US and EU daylight time now covers
  // seven or eight months of the year, which made DST look "standard".)
  const currentOffsetMinutes = offsetMinutesAt(timeZone, date);
  const dstOffsetHours = (currentOffsetMinutes - standardOffsetMinutes) / 60;

  return {
    currentOffsetMinutes,
    standardOffsetMinutes,
    zoneMeridianDeg: (standardOffsetMinutes / 60) * 15,
    isDst: Math.abs(dstOffsetHours) > 1e-6,
    dstOffsetHours,
  };
}
