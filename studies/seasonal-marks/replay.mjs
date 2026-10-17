// Ideal horizontal shadow rays, independent of the dial's seasonal labels.
// Fixed +/-23.44 degree solstices; this is a geometric control, not a field measurement.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { log } from 'node:console';
const [sourceArg, outputArg] = process.argv.slice(2);
assert.ok(sourceArg && outputArg, 'SOURCE_ROOT OUTPUT_DIR');
const source = resolve(sourceArg), output = resolve(outputArg);
await mkdir(output, { recursive: true });
const from = relative => import(pathToFileURL(resolve(source, relative)).href);
const { buildAnalemmaticDial } = await from('src/lib/dials/analemmatic.ts');
const { renderAnalemmaticSVG } = await from('src/lib/render/svg.ts');
const { defaultState } = await from('src/state.ts');
const { saveDesignFile } = await from('src/design-file.ts');
const rad = degrees => degrees * Math.PI / 180;
const rows = [];
for (const latitude of [-51.5072, -33.8688, 33.8688, 51.5072]) {
  for (const radius of [90, 350]) {
    const dial = buildAnalemmaticDial({ latitudeDeg: latitude, semiMajorMm: radius,
      startHour: 4, endHour: 20, stepHours: 1 });
    for (const month of [6, 12]) {
      const northSummer = month === 6;
      const expectedLabel = `${northSummer ? 'June' : 'December'} solstice`;
      const legacyLabel = `${northSummer === (latitude > 0) ? 'Summer' : 'Winter'} solstice`;
      // The old user follows their local season; the corrected drawing names its month.
      const mark = dial.dateScale.find(item => item.label === expectedLabel)
        ?? dial.dateScale.find(item => item.label === legacyLabel);
      assert.ok(mark);
      const phi = rad(latitude), delta = rad(northSummer ? 23.44 : -23.44), H = rad(45);
      const sun = { east: -Math.cos(delta) * Math.sin(H),
        north: Math.cos(phi) * Math.sin(delta) - Math.sin(phi) * Math.cos(delta) * Math.cos(H),
        up: Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(H) };
      assert.ok(sun.up > 0);
      const expectedOffset = radius * Math.cos(phi) * Math.tan(delta);
      const target = { east: radius * Math.sin(H), north: radius * Math.sin(phi) * Math.cos(H) };
      const towardHour = { east: target.east, north: target.north - mark.offsetMm };
      const cross = towardHour.east * (-sun.north) - towardHour.north * (-sun.east);
      const dot = towardHour.east * (-sun.east) + towardHour.north * (-sun.north);
      const angle = Math.abs(Math.atan2(cross, dot)) * 180 / Math.PI;
      rows.push({ latitude, radiusMm: radius, month, localSeason: legacyLabel,
        printedLabel: mark.label, markedDeclinationDeg: mark.declinationDeg,
        markedOffsetMm: mark.offsetMm, expectedOffsetMm: expectedOffset,
        offsetErrorMm: Math.abs(mark.offsetMm - expectedOffset),
        referenceApparentSolarHour: 15, sunAboveHorizon: true,
        shadowToCorrectHourMarkErrorDeg: angle });
    }
  }
}
const instant = new Date('2026-12-21T04:00:00Z');
const state = { ...defaultState(instant), latitudeDeg: -33.8688, longitudeDeg: 151.2093,
  timeZone: 'Australia/Sydney', dialType: 'analemmatic', timeMode: 'apparent',
  numerals: 'arabic', theme: 'blueprint', mottoIndex: null, simMode: 'custom' };
await writeFile(resolve(output, 'Sydney.gnomon.json'), saveDesignFile(state, instant));
const sample = buildAnalemmaticDial({ latitudeDeg: state.latitudeDeg, semiMajorMm: 90,
  startHour: 4, endHour: 20, stepHours: 1 });
const drawing = renderAnalemmaticSVG(sample, { widthMm: 234, heightMm: 234,
  numerals: 'arabic', theme: 'blueprint' });
await writeFile(resolve(output, 'Sydney.svg'), drawing);
const nativeInputs = [];
for (const file of ['src/lib/dials/declination-lines.ts', 'src/lib/dials/analemmatic.ts', 'src/lib/render/svg.ts']) {
  nativeInputs.push({ file, sha256: createHash('sha256').update(await readFile(resolve(source, file))).digest('hex') });
}
const receipt = { sourceRevision: execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  scope: 'Controlled solstitial geometry and actual native labels; an independent ENU ray at apparent solar 15:00. Not field measurements or a new solar ephemeris accuracy estimate.',
  calendarReference: 'https://science.nasa.gov/solar-system/skywatching/night-sky-network/tropical-solstice-shadows/',
  method: 'Choose the month-labelled mark, or follow the former label for the local season. Compare the direction from that standing mark to the intended hour point with the horizontal shadow direction opposite the Sun.',
  nativeInputs, cases: rows, failedDirections: rows.filter(row => row.shadowToCorrectHourMarkErrorDeg > 1e-8).length };
await writeFile(resolve(output, 'replay.json'), JSON.stringify(receipt, null, 2) + '\n');
log(JSON.stringify({ cases: rows.length, wrongStandingMarks: receipt.failedDirections }));
