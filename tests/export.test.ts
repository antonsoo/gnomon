import { describe, expect, it } from "vitest";
import { buildHorizontalDial } from "../src/lib/dials/horizontal.ts";
import { renderGnomonSVG } from "../src/lib/render/svg.ts";
import { exportPolarDialPDF } from "../src/lib/export/pdf.ts";
import { planPolarPrint, registrationMarks } from "../src/lib/export/print-layout.ts";

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

  it("exports a large dial as full-size tiles with a separate guide", () => {
    const text = bytesToLatin1(exportPolarDialPDF(dial, { radiusMm: 150, innerRadiusMm: 8, plateShape: "circle", numerals: "arabic", format: "a4" }));
    expect(text).toContain("/Count 5");
    expect(text).toContain("ASSEMBLY MAP - reduced size, not a cutting template");
    for (const id of ["R1C1", "R1C2", "R2C1", "R2C2"]) expect(text).toContain(id);
    expect(text.match(/100 mm calibration - verify before cutting/g)).toHaveLength(5);
    // Every drawing tile is clipped in a saved graphics state, so off-tile
    // curves and numerals cannot overwrite the instructions/calibration.
    expect(text.match(/W\nn\n/g)).toHaveLength(4);
  });

  it("the app's own default radius (90mm) fits A4 for both plate shapes, at a latitude with a wide hour-line spread", () => {
    // The expanded fan includes its end numerals, and the default design
    // still fits a compact page after reserving that physical space.
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

describe("physical sheet assembly", () => {
  const dimensions = { radiusMm: 150, innerRadiusMm: 8, plateShape: "circle" as const, format: "a4" as const };
  it("uses a 2 by 2 A4 grid with 10 mm overlaps for a 300 mm plate", () => {
    const plan = planPolarPrint(dial, dimensions);
    expect(plan.tiles.map(({ id, x, y }) => [id, x, y])).toEqual([
      ["R1C1", 0, 0], ["R1C2", 180, 0], ["R2C1", 0, 235], ["R2C2", 180, 235],
    ]);
    expect(plan.root).toEqual({ x: 185, y: 240 });
    expect(plan.assembledWidth).toBe(370);
    expect(plan.assembledHeight).toBe(480);
  });

  for (const format of ["a4", "letter"] as const) {
    it(`retains identical registration coordinates on both sides of every ${format} seam`, () => {
      const plan = planPolarPrint(dial, { ...dimensions, radiusMm: 400, format });
      for (const tile of plan.tiles) {
        for (const neighbor of plan.tiles.filter((t) => t.row === tile.row && t.column === tile.column + 1
          || t.column === tile.column && t.row === tile.row + 1)) {
          const a = registrationMarks(plan, tile);
          const b = registrationMarks(plan, neighbor);
          expect(a.filter((p) => b.some((q) => p.x === q.x && p.y === q.y))).toHaveLength(2);
        }
        for (const point of registrationMarks(plan, tile)) {
          expect(point.x - tile.x).toBeGreaterThanOrEqual(2);
          expect(point.y - tile.y).toBeGreaterThanOrEqual(2);
          expect(point.x - tile.x).toBeLessThanOrEqual(plan.viewport.width - 2);
          expect(point.y - tile.y).toBeLessThanOrEqual(plan.viewport.height - 2);
        }
      }
    });
  }

  it("bounds work before constructing an enormous PDF", () => {
    for (const radiusMm of [100_000, 1e308, Infinity, NaN, -1]) {
      expect(() => exportPolarDialPDF(dial, { ...dimensions, radiusMm, numerals: "roman" })).toThrow();
    }
  });

  it("keeps a compact dial on one sheet", () => {
    const text = bytesToLatin1(exportPolarDialPDF(dial, { ...dimensions, radiusMm: 80, numerals: "roman" }));
    expect(text).toContain("/Count 1");
    expect(text).not.toContain("ASSEMBLY MAP");
  });
});

describe("construction details in PDF files", () => {
  it("includes selected curve geometry, a motto and recoverable design notes", () => {
    const options = { radiusMm: 80, innerRadiusMm: 6, plateShape: "fan" as const, numerals: "roman" as const, format: "a4" as const };
    const plain = bytesToLatin1(exportPolarDialPDF(dial, options));
    const withDetails = bytesToLatin1(exportPolarDialPDF(dial, {
      ...options,
      showDeclinationLines: true,
      title: "My dial",
      description: "Design date 2026-07-01. UTC-07:00. Radius 80 mm.",
      motto: { latin: "Tempus fugit", translation: "Time flies", attribution: "Traditional" },
    }));
    expect(withDetails).toContain('Tempus fugit');
    expect(withDetails).toContain('Design date 2026-07-01');
    expect([...withDetails.matchAll(/ l\n/g)].length).toBeGreaterThan([...plain.matchAll(/ l\n/g)].length);
  });

  it("rejects nonfinite dimensions before producing a misleading PDF", () => {
    expect(() => exportPolarDialPDF(dial, { radiusMm: NaN, innerRadiusMm: 6, plateShape: "fan", numerals: "roman", format: "a4" })).toThrow("Invalid dial dimensions");
  });
});

describe("gnomon fabrication geometry", () => {
  it("keeps the mounting tab attached and marks the physical nodus on the style edge", () => {
    const svg = renderGnomonSVG(dial, { theme: "laser", marginMm: 8 });
    const paths = [...svg.matchAll(/<path d="([^"]+)"[^>]*stroke="([^"]+)"[^>]*\/>/g)];
    const cuts = paths.filter((p) => p[2] === '#ff0000');
    expect(cuts).toHaveLength(1);
    const fold = paths.find((p) => p[0].includes('stroke-dasharray'))!;
    expect(fold[2]).toBe('#000000');
    // The fold is an interior engraving, never a red base cut separating the tab.
    const foldCoordinates = [...fold[1]!.matchAll(/[-\d.]+/g)].map((m) => Number(m[0]));
    const cutCoordinates = [...cuts[0]![1]!.matchAll(/[-\d.]+/g)].map((m) => Number(m[0]));
    expect(cutCoordinates[1]).toBeLessThan(foldCoordinates[1]!);
    expect(cutCoordinates[5]).toBeGreaterThan(foldCoordinates[1]!);
    const foot = /<circle cx="([\d.]+)" cy="([\d.]+)" r="0.8"/.exec(svg)!;
    const marker = paths.find((p) => p[1]!.includes('h 3 M'))!;
    const [startX, centerY] = marker[1]!.match(/[-\d.]+/g)!.map(Number);
    const measured = Math.hypot(startX! + 1.5 - Number(foot[1]), centerY! - Number(foot[2]));
    expect(measured).toBeCloseTo(30, 8);
    expect(svg).toContain('nodus, 30.0mm from foot');
  });
});
