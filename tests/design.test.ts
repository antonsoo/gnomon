import { describe, expect, it } from "vitest";
import { captureDesign, designSvg } from "../src/design.ts";
import { defaultState } from "../src/state.ts";
import { pngDimensions, svgToPngBlob } from "../src/lib/export/png.ts";

const summer = new Date("2026-07-01T19:00:00Z");

describe("coherent construction snapshots", () => {
  it("starts with a matching San Francisco zone, coordinates and local time", () => {
    expect(defaultState(summer)).toMatchObject({ timeZone: "America/Los_Angeles", latitudeDeg: 37.7749, customDateTimeLocal: "2026-07-01T12:00" });
  });

  it("automatically adjusts hour labels for the selected date, with manual override", () => {
    const state = defaultState(summer);
    const winter = new Date("2026-01-15T20:00:00Z");
    const a = captureDesign(state, summer);
    const b = captureDesign(state, winter);
    expect(a.timeBasis).toContain("UTC-07:00");
    expect(b.timeBasis).toContain("UTC-08:00");
    expect(a.dial).not.toEqual(b.dial);
    state.dstOffsetOverride = 0;
    expect(captureDesign(state, summer).dial).toEqual(b.dial);
  });

  it("preserves half-hour daylight adjustment", () => {
    const state = { ...defaultState(summer), timeZone: "Australia/Lord_Howe" };
    expect(captureDesign(state, new Date("2026-01-15T00:00:00Z"))).toMatchObject({ dstOffsetHours: 0.5 });
  });

  it("keeps geometry, overlays, metadata and filename settings intact after edits", () => {
    const state = defaultState(summer);
    state.historicalHours = ["temporal"];
    const snapshot = captureDesign(state, summer);
    const original = designSvg(snapshot, "laser");
    state.latitudeDeg = -33;
    state.dialType = "vertical";
    state.radiusMm = 200;
    state.historicalHours.push("italian");
    state.mottoIndex = null;
    expect(designSvg(snapshot, "laser")).toBe(original);
    expect(snapshot.settings).toMatchObject({ dialType: "horizontal", radiusMm: 90, historicalHours: ["temporal"] });
    expect(original).toContain("America/Los_Angeles");
    expect(original).toContain("2026-07-01");
    expect(original).toContain(snapshot.polarOptions.motto!.latin);
    expect(original).toContain("stroke-dasharray");
  });

  it("states the analemmatic clock basis regardless of dormant polar options", () => {
    const snapshot = captureDesign({ ...defaultState(summer), dialType: "analemmatic" }, summer);
    expect(snapshot.timeBasis).toBe("Local apparent solar time");
    expect(designSvg(snapshot, "laser")).toContain("Local apparent solar time");
  });
});

describe("bounded PNG exports", () => {
  it("keeps ordinary designs near 300DPI and downsamples large ones without stretching", () => {
    expect(pngDimensions(200, 100)).toMatchObject({ width: 2362, height: 1181, dpi: 300 });
    const large = pngDimensions(1040, 1040);
    expect(large.width * large.height).toBeLessThanOrEqual(16_000_000);
    expect(large.width).toBe(large.height);
    expect(large.dpi).toBeLessThan(300);
    const narrow = pngDimensions(10, 2000);
    expect(narrow.height).toBeLessThanOrEqual(8192);
    expect(narrow.width / narrow.height).toBeCloseTo(10 / 2000, 3);
  });

  it("rejects invalid dimensions before touching browser APIs", async () => {
    for (const n of [0, -1, NaN, Infinity]) expect(() => pngDimensions(n, 10)).toThrow();
    await expect(svgToPngBlob("", 10000, 10000)).rejects.toThrow("size limit");
  });
});
