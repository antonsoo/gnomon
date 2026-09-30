import { describe, expect, it } from "vitest";
import { resolveZone } from "../src/lib/timezone.ts";

describe("resolveZone", () => {
  it("takes the smaller offset as standard time, even where daylight time lasts most of the year", () => {
    // US daylight time runs from March to November: 8 of 12 mid-month samples are PDT.
    const summer = resolveZone("America/Los_Angeles", new Date("2026-07-01T20:00:00Z"));
    expect(summer.standardOffsetMinutes).toBe(-480);
    expect(summer.zoneMeridianDeg).toBe(-120);
    expect(summer.dstOffsetHours).toBe(1);
    expect(summer.isDst).toBe(true);
    const winter = resolveZone("America/Los_Angeles", new Date("2026-01-15T20:00:00Z"));
    expect(winter.zoneMeridianDeg).toBe(-120);
    expect(winter.dstOffsetHours).toBe(0);
    expect(winter.isDst).toBe(false);
  });

  it("handles European and southern-hemisphere daylight time", () => {
    expect(resolveZone("Europe/London", new Date("2026-07-01T12:00:00Z"))).toMatchObject({ zoneMeridianDeg: 0, dstOffsetHours: 1 });
    expect(resolveZone("Europe/Berlin", new Date("2026-12-01T12:00:00Z"))).toMatchObject({ zoneMeridianDeg: 15, dstOffsetHours: 0 });
    // Sydney observes daylight time in January, not July.
    expect(resolveZone("Australia/Sydney", new Date("2026-01-15T02:00:00Z"))).toMatchObject({ zoneMeridianDeg: 150, dstOffsetHours: 1 });
    expect(resolveZone("Australia/Sydney", new Date("2026-07-15T02:00:00Z"))).toMatchObject({ zoneMeridianDeg: 150, dstOffsetHours: 0 });
  });

  it("handles zones without daylight time and with fractional-hour offsets", () => {
    expect(resolveZone("Asia/Tokyo", new Date("2026-07-01T03:00:00Z"))).toMatchObject({ zoneMeridianDeg: 135, isDst: false });
    expect(resolveZone("Asia/Kathmandu", new Date("2026-07-01T03:00:00Z")).zoneMeridianDeg).toBe(86.25);
    expect(resolveZone("America/St_Johns", new Date("2026-07-01T15:00:00Z"))).toMatchObject({ zoneMeridianDeg: -52.5, dstOffsetHours: 1 });
  });
});
