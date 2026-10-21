/** Node 24+: node examples/equatorial-kit.mjs OUTPUT_DIRECTORY [LATITUDE_DEGREES] */
import { log } from "node:console";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildEquatorialDial } from "../src/lib/dials/equatorial.ts";
import { renderGnomonSVG, renderPolarDialSVG } from "../src/lib/render/svg.ts";
import { exportConstructionPDF } from "../src/lib/export/pdf.ts";

const [destination, latitude = "37.7749"] = process.argv.slice(2);
if (!destination || destination === "--help") {
  log("Usage: node examples/equatorial-kit.mjs OUTPUT_DIRECTORY [LATITUDE_DEGREES]");
  process.exit(destination === "--help" ? 0 : 2);
}
const dial = buildEquatorialDial({
  latitudeDeg: Number(latitude),
  timeReference: { mode: "apparent", longitudeDeg: 0 },
  hourLineOptions: { startHour: 3, endHour: 21, stepHours: 0.25 },
  nodusDistanceMm: 20,
  gnomonBaseLengthMm: 50,
});
const options = {
  radiusMm: 80, innerRadiusMm: 6, plateShape: "circle",
  numerals: "arabic", theme: "laser",
  showDeclinationLines: true, showHistoricalHours: false,
  description: `Local apparent solar time. ${dial.orientation}`,
};
const counterpart = dial.equatorial.counterpart;
const out = resolve(destination);
await mkdir(out, { recursive: true });
await writeFile(resolve(out, "equatorial-a4.pdf"), exportConstructionPDF(dial, { ...options, format: "a4" }));
for (const face of [dial, counterpart]) {
  await writeFile(resolve(out, `${face.equatorial.face}.svg`), renderPolarDialSVG(face, {
    ...options, title: `${face.equatorial.face} | ${face.equatorial.illuminated}`,
    description: `Local apparent solar time. ${face.orientation}`,
  }));
}
await writeFile(resolve(out, "rod-gauge.svg"), renderGnomonSVG(dial, { theme: "laser", marginMm: 8 }));
log("Wrote equatorial-a4.pdf, pole-facing.svg, opposite.svg and rod-gauge.svg.");
log("160 mm plate; 50 mm of rod exposed on each side; add the backing thickness to the 100 mm total.");
log("Print at 100%, check the bars, and align both foot dots and target A before trimming.");
