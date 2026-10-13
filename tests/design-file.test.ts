import { describe, expect, it } from "vitest";
import { captureDesign, designSvg } from "../src/design.ts";
import { MAX_DESIGN_FILE_BYTES, openDesignFile, saveDesignFile } from "../src/design-file.ts";
import { renderGnomonSVG } from "../src/lib/render/svg.ts";
import { planConstructionPrint } from "../src/lib/export/print-layout.ts";
import { defaultState, type DialType } from "../src/state.ts";

const summer = new Date("2026-07-01T19:17:42.123Z");
const make = () => ({ ...defaultState(summer), radiusMm: 180, wallDeclinationDeg: 25, historicalHours: ["temporal", "italian"] as ("temporal" | "italian")[], showZodiac: true, mottoIndex: 3 });

function changed(patch: Record<string, unknown>): string {
  return JSON.stringify({ ...JSON.parse(saveDesignFile(make(), summer)), ...patch });
}

describe("editable design files", () => {
  for (const dialType of ["horizontal", "vertical", "equatorial", "analemmatic"] as DialType[]) {
    it(`reopens the same ${dialType} drawing and construction geometry`, () => {
      const state = { ...make(), dialType };
      const before = captureDesign(state, summer);
      const file = saveDesignFile(state, summer);
      const opened = openDesignFile(file);
      const after = captureDesign(opened.state, opened.instant);
      expect(designSvg(after, "laser")).toBe(designSvg(before, "laser"));
      expect(after.dial).toEqual(before.dial);
      expect(opened.state).toMatchObject({ radiusMm: 180, wallDeclinationDeg: 25, historicalHours: ["temporal", "italian"], mottoIndex: 3, simMode: "custom", playing: false, customDateTimeLocal: "2026-07-01T12:17" });
      expect(opened.instant.toISOString()).toBe("2026-07-01T19:17:00.000Z");
      if (after.dial.kind !== "analemmatic" && before.dial.kind !== "analemmatic") {
        expect(renderGnomonSVG(after.dial, { theme: "laser", marginMm: 8 })).toBe(renderGnomonSVG(before.dial, { theme: "laser", marginMm: 8 }));
        expect(planConstructionPrint(after.dial, { ...after.polarOptions, format: "a4" })).toEqual(planConstructionPrint(before.dial, { ...before.polarOptions, format: "a4" }));
      }
    });
  }

  it("saves the chosen repeated minute and retains its winter clock geometry", () => {
    const instant = new Date("2026-11-01T09:30:19Z");
    const state = defaultState(instant);
    const opened = openDesignFile(saveDesignFile(state, instant));
    expect(opened.state).toMatchObject({ timeDisambiguation: "later", customDateTimeLocal: "2026-11-01T01:30" });
    expect(opened.instant.toISOString()).toBe("2026-11-01T09:30:00.000Z");
    expect(captureDesign(opened.state, opened.instant).timeBasis).toContain("UTC-08:00");
    expect(captureDesign(opened.state, summer).dial).not.toEqual(captureDesign(opened.state, opened.instant).dial);
  });

  it("does not move a half-hour-zone clock or replace its manual adjustment", () => {
    const instant = new Date("2026-01-15T02:03:45Z");
    const state = { ...make(), timeZone: "Australia/Lord_Howe", dstOffsetOverride: 0.5, mottoIndex: null };
    const opened = openDesignFile(saveDesignFile(state, instant));
    expect(opened.state).toMatchObject({ customDateTimeLocal: "2026-01-15T13:03", dstOffsetOverride: 0.5, mottoIndex: null });
    expect(designSvg(captureDesign(opened.state, opened.instant), "laser")).toBe(designSvg(captureDesign(state, instant), "laser"));
  });

  it("leaves the live animation and original overlay array untouched", () => {
    const state = { ...make(), playing: true };
    const before = structuredClone(state);
    const opened = openDesignFile(saveDesignFile(state, summer));
    opened.state.historicalHours.push("babylonian");
    expect(state).toEqual(before);
    expect(JSON.parse(saveDesignFile(state, summer)).motto).toBe("Tempus fugit");
  });

  it("refuses conflicting recorded clock evidence rather than reinterpreting a saved design", () => {
    expect(() => openDesignFile(changed({ utcOffsetMinutes: 0 }))).toThrow("disagree");
    expect(() => openDesignFile(changed({ utcInstant: "2026-07-01T20:17:00.000Z" }))).toThrow("disagree");
    expect(() => openDesignFile(changed({ customDateTimeLocal: "2026-03-08T02:30" }))).toThrow("does not occur");
  });

  it.each([
    { latitudeDeg: 91 }, { longitudeDeg: -181 }, { radiusMm: "180" }, { radiusMm: 401 },
    { wallDeclinationDeg: null }, { theme: "unrecognized" }, { showZodiac: 1 },
    { historicalHours: ["temporal", "temporal"] }, { historicalHours: ["new-system"] },
    { motto: "a different motto" }, { timeZone: "unknown/zone" }, { version: 2 },
    { unknownSetting: true }, { customDateTimeLocal: "2200-01-01T00:00" },
    { dstOffsetOverride: -7 }, { dialType: "horizontal", latitudeDeg: 0 },
  ])("rejects unsupported settings before returning an editable state: %j", patch => {
    expect(() => openDesignFile(changed(patch))).toThrow();
  });

  it("refuses repeated members, including escaped spellings, and missing settings", () => {
    const text = saveDesignFile(make(), summer);
    expect(() => openDesignFile(text.replace('"radiusMm": 180', '"radiusMm": 90, "radiusMm": 180'))).toThrow("Repeated setting");
    expect(() => openDesignFile(text.replace('"radiusMm": 180', '"radiusMm": 90, "radiusM\\u006d": 180'))).toThrow("Repeated setting");
    const data = JSON.parse(text);
    delete data.showZodiac;
    expect(() => openDesignFile(JSON.stringify(data))).toThrow("Missing setting showZodiac");
    expect(() => openDesignFile(" ".repeat(MAX_DESIGN_FILE_BYTES + 1))).toThrow("16 KiB");
    expect(() => openDesignFile("<svg/>")).toThrow("JSON");
  });
});
