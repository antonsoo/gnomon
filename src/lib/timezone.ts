/**
 * Derives a time zone's standard-time UTC offset (and therefore its
 * "zone meridian", 15 deg per hour of offset) and DST offset from the
 * IANA database via `Intl`, rather than hard-coding either -- so it stays
 * correct as zones change without a data update in this repo.
 */

function offsetMinutesAt(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const tzPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+0";
  const match = /GMT([+-]\d+)(?::(\d+))?/.exec(tzPart);
  if (!match) return 0;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  return hours * 60 + Math.sign(hours || 1) * minutes;
}

export interface ZoneInfo {
  /** UTC offset in effect on the given date, minutes. */
  currentOffsetMinutes: number;
  /** The zone's standard-time (non-DST) offset, minutes -- the mode across a year of samples. */
  standardOffsetMinutes: number;
  /** Zone meridian for the *standard* offset, degrees east. */
  zoneMeridianDeg: number;
  /** Whether DST appears to be in effect on the given date. */
  isDst: boolean;
  /** currentOffsetMinutes - standardOffsetMinutes, hours (0 or typically 1). */
  dstOffsetHours: number;
}

export function resolveZone(timeZone: string, date: Date): ZoneInfo {
  const samples: number[] = [];
  const year = date.getUTCFullYear();
  for (let m = 0; m < 12; m++) {
    samples.push(offsetMinutesAt(timeZone, new Date(Date.UTC(year, m, 15, 12, 0, 0))));
  }
  const counts = new Map<number, number>();
  for (const s of samples) counts.set(s, (counts.get(s) ?? 0) + 1);
  let standardOffsetMinutes = samples[0] ?? 0;
  let bestCount = -1;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      standardOffsetMinutes = value;
    }
  }

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
