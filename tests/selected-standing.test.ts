import { describe, expect, it } from "vitest";
import { captureDesign, designSvg } from "../src/design.ts";
import { openDesignFile, saveDesignFile } from "../src/design-file.ts";
import { defaultState } from "../src/state.ts";
import oracle from "./fixtures/solar-oracle.json";

const setup = (instant: Date) => ({ ...defaultState(instant), dialType: "analemmatic" as const, radiusMm: 400 });

describe("selected-minute movable rod", () => {
  it("the actual SVG marker retains independent DE421 declination across hemisphere and physical size", () => {
    const points = oracle.points.filter(row => String(row[0]).startsWith("2026-")).filter((_, i) => i % 5 === 0);
    for (const [utc, declination] of points) {
      const instant = new Date(String(utc));
      for (const latitudeDeg of [37.7749, -33.8688]) for (const radiusMm of [30, 90, 400]) {
        const design = captureDesign({ ...setup(instant), latitudeDeg, radiusMm }, instant);
        const svg = designSvg(design, "laser");
        const ellipse = svg.match(/<ellipse cx="([^"]+)" cy="([^"]+)"/)!;
        const circle = svg.match(/<circle data-selected-minute="[^"]+" cx="([^"]+)" cy="([^"]+)"/)!;
        expect(Number(circle[1])).toBeCloseTo(Number(ellipse[1]), 3);
        const offset = Number(ellipse[2]) - Number(circle[2]);
        const inverse = Math.atan(offset / (radiusMm * Math.cos(latitudeDeg * Math.PI / 180))) * 180 / Math.PI;
        expect(Math.abs(inverse - Number(declination))).toBeLessThan(0.01);
      }
    }
  });

  it("freezes the displayed civil minute for an identical saved-file SVG roundtrip", () => {
    const instant = new Date("2026-07-01T19:17:59.999Z");
    const state = setup(instant);
    const design = captureDesign(state, instant);
    expect(design.analemmaticOptions.selectedDateMark?.utcInstant).toBe("2026-07-01T19:17:00.000Z");
    const opened = openDesignFile(saveDesignFile(state, instant));
    expect(designSvg(captureDesign(opened.state, opened.instant), "laser")).toBe(designSvg(design, "laser"));
    state.latitudeDeg = -70;
    instant.setUTCFullYear(2027);
    expect(design.analemmaticOptions.selectedDateMark?.utcInstant).toBe("2026-07-01T19:17:00.000Z");
  });

  it("keeps both occurrences of a repeated local minute distinct", () => {
    const earlier = new Date("2026-11-01T08:30:00Z"), later = new Date("2026-11-01T09:30:00Z");
    const state = setup(earlier);
    const a = captureDesign(state, earlier).analemmaticOptions.selectedDateMark!;
    const b = captureDesign(state, later).analemmaticOptions.selectedDateMark!;
    expect(a.localLabel).toBe("2026-11-01 01:30 UTC-07:00");
    expect(b.localLabel).toBe("2026-11-01 01:30 UTC-08:00");
    expect(a.utcInstant).not.toBe(b.utcInstant);
    expect(a.offsetMm).not.toBe(b.offsetMm);
  });

  it("retains a historical civil minute whose UTC instant has a second offset", () => {
    const instant = new Date("1900-01-01T11:50:59Z");
    const state = { ...setup(instant), timeZone: "Europe/Paris" };
    const design = captureDesign(state, instant);
    expect(design.analemmaticOptions.selectedDateMark).toMatchObject({
      utcInstant: "1900-01-01T11:50:39.000Z", localLabel: "1900-01-01 12:00 UTC+00:09:21",
    });
    const opened = openDesignFile(saveDesignFile(state, instant));
    expect(designSvg(design, "laser")).toBe(designSvg(captureDesign(opened.state, opened.instant), "laser"));
  });
});
