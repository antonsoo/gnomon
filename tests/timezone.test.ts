import { describe, expect, it } from "vitest";
import { formatUtcOffset, isValidTimeZone, resolveLocalDateTime, resolveZone, zonedDateTimeInput } from "../src/lib/timezone.ts";

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

describe("isValidTimeZone", () => {
  it("accepts IANA names and rejects free text", () => {
    expect(isValidTimeZone("Europe/Rome")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Pacific Time")).toBe(false);
    expect(isValidTimeZone("Europe/Atlantis")).toBe(false);
  });
});

// Exact UTC expectations, independent of the machine's default zone.
describe("city-local simulation times", () => {
  it.each([
    ["Europe/Rome", "2026-07-01T12:00", "2026-07-01T10:00:00.000Z"],
    ["America/Los_Angeles", "2026-01-15T12:00", "2026-01-15T20:00:00.000Z"],
    ["Asia/Kathmandu", "2026-07-01T12:00", "2026-07-01T06:15:00.000Z"],
    ["Pacific/Kiritimati", "2026-01-01T00:15", "2025-12-31T10:15:00.000Z"],
    ["America/St_Johns", "2026-01-01T00:15", "2026-01-01T03:45:00.000Z"],
    ["Australia/Lord_Howe", "2026-01-15T12:00", "2026-01-15T01:00:00.000Z"],
    ["Europe/Paris", "1900-01-01T12:00", "1900-01-01T11:50:39.000Z"],
  ])("resolves %s %s", (zone, local, expected) => {
    const result = resolveLocalDateTime(local, zone);
    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") return;
    expect(result.instants.map((d) => d.toISOString())).toEqual([expected]);
    expect(zonedDateTimeInput(new Date(expected), zone)).toBe(local);
  });

  it("exposes both sides of a repeated hour instead of silently choosing", () => {
    const result = resolveLocalDateTime("2026-11-01T01:30", "America/Los_Angeles");
    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") return;
    expect(result.instants.map((d) => d.toISOString())).toEqual(["2026-11-01T08:30:00.000Z", "2026-11-01T09:30:00.000Z"]);
  });

  it("handles a half-hour repeated interval", () => {
    const result = resolveLocalDateTime("2026-04-05T01:45", "Australia/Lord_Howe");
    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") return;
    expect(result.instants.map((d) => d.toISOString())).toEqual(["2026-04-04T14:45:00.000Z", "2026-04-04T15:15:00.000Z"]);
  });

  it.each([
    ["America/Los_Angeles", "2026-03-08T02:30"],
    ["Australia/Lord_Howe", "2026-10-04T02:15"],
    ["Pacific/Apia", "2011-12-30T12:00"],
  ])("rejects the skipped local time in %s", (zone, local) => {
    expect(resolveLocalDateTime(local, zone).kind).toBe("gap");
  });

  it.each(["", "2026-02-30T12:00", "2026-01-01T24:00", "2026-1-1T12:00", "1899-12-31T23:59", "2101-01-01T00:00"])("rejects invalid/out-of-range input %s", (local) => {
    expect(resolveLocalDateTime(local, "UTC").kind).toBe("invalid");
  });

  it("rejects an unknown zone and describes historical offsets without dropping seconds", () => {
    expect(resolveLocalDateTime("2026-01-01T12:00", "not/a-zone").kind).toBe("invalid");
    expect(formatUtcOffset(-3.5 * 60)).toBe("UTC-03:30");
    expect(formatUtcOffset(9 + 21 / 60)).toBe("UTC+00:09:21");
  });
});
