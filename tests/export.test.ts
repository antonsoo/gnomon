import { describe, expect, it } from "vitest";
import { buildHorizontalDial } from "../src/lib/dials/horizontal.ts";
import { exportPolarDialPDF } from "../src/lib/export/pdf.ts";

function bytesToLatin1(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] as number);
  return s;
}

/** Points -> millimetres (1 pt = 1/72 in, 1 in = 25.4mm). */
const PT_TO_MM = 25.4 / 72;

function readMediaBoxMm(pdfBytes: Uint8Array): { widthMm: number; heightMm: number } {
  const text = bytesToLatin1(pdfBytes);
  const match = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(text);
  if (!match) throw new Error("no /MediaBox found in PDF");
  const [, x0, y0, x1, y1] = match.map(Number);
  return { widthMm: (x1! - x0!) * PT_TO_MM, heightMm: (y1! - y0!) * PT_TO_MM };
}

const dial = buildHorizontalDial({
  latitudeDeg: 37.7749,
  timeReference: { mode: "apparent", longitudeDeg: -122.4194 },
  hourLineOptions: { startHour: 6, endHour: 18, stepHours: 1 },
  nodusDistanceMm: 30,
  gnomonBaseLengthMm: 60,
});

describe("exportPolarDialPDF", () => {
  it("produces an A4 page of the correct physical size", () => {
    const bytes = exportPolarDialPDF(dial, {
      radiusMm: 80,
      plateShape: "fan",
      innerRadiusMm: 8,
      numerals: "roman",
      title: "Test dial",
      format: "a4",
    });
    const { widthMm, heightMm } = readMediaBoxMm(bytes);
    expect(widthMm).toBeCloseTo(210, 0);
    expect(heightMm).toBeCloseTo(297, 0);
  });

  it("produces a US Letter page of the correct physical size", () => {
    const bytes = exportPolarDialPDF(dial, {
      radiusMm: 80,
      plateShape: "fan",
      innerRadiusMm: 8,
      numerals: "arabic",
      format: "letter",
    });
    const { widthMm, heightMm } = readMediaBoxMm(bytes);
    expect(widthMm).toBeCloseTo(215.9, 0);
    expect(heightMm).toBeCloseTo(279.4, 0);
  });

  it("draws a calibration bar that is exactly 100mm in PDF user space", () => {
    // jsPDF writes an uncompressed content stream by default; recover the
    // moveto/lineto pair for the long horizontal calibration line and
    // measure it in the PDF's own point units, independent of what our
    // code *meant* to draw.
    const bytes = exportPolarDialPDF(dial, {
      radiusMm: 80,
      plateShape: "fan",
      innerRadiusMm: 8,
      numerals: "roman",
      title: "Test dial",
      format: "a4",
    });
    const text = bytesToLatin1(bytes);
    const segments = [...text.matchAll(/([\d.]+) ([\d.]+) m\s*\n([\d.]+) ([\d.]+) l\s*\nS/g)];
    // The calibration bar is the long near-horizontal segment close to the
    // page's bottom edge (12mm up, in PDF points measured from the
    // bottom) -- unlike, say, an hour line that happens to be nearly
    // horizontal too, but sits much further up the page.
    const calibrationBar = segments.find(([, x1, y1, x2, y2]) => {
      const closeToBottom = Number(y1) < 50 && Number(y2) < 50;
      const horizontal = Math.abs(Number(y1) - Number(y2)) < 1e-6;
      const long = Math.abs(Number(x2) - Number(x1)) > 200;
      return closeToBottom && horizontal && long;
    });
    expect(calibrationBar).toBeDefined();
    const [, x1, , x2] = calibrationBar as RegExpMatchArray;
    const lengthPt = Math.abs(Number(x2) - Number(x1));
    const lengthMm = lengthPt * PT_TO_MM;
    expect(lengthMm).toBeCloseTo(100, 3);
  });

  it("rejects a dial too large for the chosen page", () => {
    expect(() => exportPolarDialPDF(dial, { radiusMm: 200, innerRadiusMm: 8, plateShape: "fan", numerals: "arabic", format: "a4" })).toThrow();
  });

  it("the app's own default radius (90mm) fits A4 for both plate shapes, at a latitude with a wide hour-line spread", () => {
    // Regression test: the fan/circle width bound must include the label
    // margin, not just the bare radius -- an earlier version of this check
    // used radiusMm*2 alone and let a 90mm-radius horizontal dial's own
    // default export silently fail because its numerals stuck out past
    // the page.
    const wideDial = buildHorizontalDial({
      latitudeDeg: 51.5,
      timeReference: { mode: "apparent", longitudeDeg: -0.1276 },
      hourLineOptions: { startHour: 3, endHour: 21, stepHours: 0.25 },
      nodusDistanceMm: 30,
      gnomonBaseLengthMm: 60,
    });
    for (const plateShape of ["fan", "circle"] as const) {
      expect(() =>
        exportPolarDialPDF(wideDial, { radiusMm: 90, innerRadiusMm: 6, plateShape, numerals: "roman", format: "a4" }),
      ).not.toThrow();
    }
  });
});
