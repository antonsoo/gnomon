/** Native curve oracle and editable/exported designs; no production helpers in the oracle. */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { historicalOracle } from '../../tests/historical-oracle.ts';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const source = resolve(option('--source', root));
const output = resolve(option('--out', join(root, 'studies/historical-hours/results/after')));
const load = (file) => import(pathToFileURL(join(source, file)).href);
const { generateHistoricalHours } = await load('src/lib/dials/historical-hours.ts');
const { buildDialPlane } = await load('src/lib/dials/plane.ts');
const { captureDesign, designSvg } = await load('src/design.ts');
const { defaultState } = await load('src/state.ts');
const { saveDesignFile } = await load('src/design-file.ts');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
await mkdir(output, { recursive: true });
const cases = [];
for (const latitude of [-78, -66, -45, -10, 10, 37.7749, 45, 66, 78]) {
  for (const system of ['temporal', 'babylonian', 'italian']) {
    const actual = generateHistoricalHours(latitude, buildDialPlane('horizontal', latitude), 32, [system]);
    const expected = historicalOracle(latitude, 32, system);
    const missing = expected.filter((curve) => !actual.some((entry) => entry.hourIndex === curve.hourIndex)).map((curve) => curve.hourIndex);
    const extra = actual.filter((curve) => !expected.some((entry) => entry.hourIndex === curve.hourIndex)).map((curve) => curve.hourIndex);
    const mismatchedSamples = [];
    let maxCoordinateErrorMm = 0;
    let comparedPoints = 0;
    for (const curve of actual) {
      const reference = expected.find((entry) => entry.hourIndex === curve.hourIndex);
      if (!reference) continue;
      if (curve.points.length !== reference.points.length) {
        mismatchedSamples.push(curve.hourIndex);
        continue;
      }
      for (const [index, point] of curve.points.entries()) {
        const target = reference.points[index];
        const error = Math.hypot(point.u - target.u, point.v - target.v);
        maxCoordinateErrorMm = Math.max(maxCoordinateErrorMm, error);
        comparedPoints++;
        if (error > 2e-8 + Math.hypot(target.u, target.v) * 1e-10) mismatchedSamples.push(curve.hourIndex);
      }
    }
    cases.push({ latitude, system, actualHours: actual.map((curve) => curve.hourIndex),
      expectedHours: expected.map((curve) => curve.hourIndex), missing, extra,
      mismatchedSamples, maxCoordinateErrorMm, comparedPoints,
      agrees: !missing.length && !extra.length && !mismatchedSamples.length });
  }
}

// The same inputs can be opened offline in the actual designer. A fixed UTC
// instant prevents device time, zone or an animation from changing the output.
const exportCases = [
  ['italian-north', 'horizontal', 37.7749, 'italian'],
  ['italian-south', 'horizontal', -37.7749, 'italian'],
  ['long-day-north', 'horizontal', 66, 'babylonian'],
  ['long-day-south', 'horizontal', -66, 'babylonian'],
  ['italian-wall', 'vertical', 37.7749, 'italian'],
  ['italian-equatorial', 'equatorial', 37.7749, 'italian'],
];
const instant = new Date('2026-06-21T12:00:00Z');
const exports = [];
for (const [name, dialType, latitudeDeg, system] of exportCases) {
  const state = { ...defaultState(instant), latitudeDeg, longitudeDeg: 0, timeZone: 'UTC',
    dialType, radiusMm: 80, plateShape: 'circle', theme: 'blueprint', mottoIndex: null,
    timeMode: 'apparent', numerals: 'arabic', showDeclinationLines: false,
    historicalHours: [system], simMode: 'custom', customDateTimeLocal: '2026-06-21T12:00' };
  const design = captureDesign(state, instant);
  const svg = designSvg(design, state.theme);
  const designFile = saveDesignFile(state, instant);
  await writeFile(join(output, `${name}.svg`), svg);
  await writeFile(join(output, `${name}.gnomon.json`), designFile);
  exports.push({ name, dialType, latitudeDeg, system,
    hours: design.dial.historicalHours.map((curve) => curve.hourIndex),
    svgBytes: Buffer.byteLength(svg), svgSha256: digest(svg),
    visibleCurvePaths: (svg.match(/stroke-width="0.2" stroke-dasharray="1,0.8"/g) ?? []).length,
    designSha256: digest(designFile) });
}
const runtimeSourceSha256 = {};
for (const file of ['src/lib/dials/historical-hours.ts', 'src/lib/geometry.ts', 'src/lib/render/svg.ts', 'src/lib/export/pdf.ts']) {
  runtimeSourceSha256[file] = digest(await readFile(join(source, file)));
}
const result = { node: process.version, population: 'Deterministic historical-hour model and synthetic design inputs. Horizontal reference uses independent solar-clock arithmetic and ray-plane intersection on the documented 37 declinations; no physical construction validation.',
  runtimeSourceSha256, oracleSha256: digest(await readFile(join(root, 'tests/historical-oracle.ts'))),
  count: cases.length, disagreements: cases.filter((record) => !record.agrees).length,
  missingCurves: cases.reduce((sum, record) => sum + record.missing.length, 0), cases, exports };
await writeFile(join(output, 'results.json'), JSON.stringify(result, null, 2) + '\n');
process.stdout.write(JSON.stringify({ node: result.node, count: result.count,
  disagreements: result.disagreements, missingCurves: result.missingCurves, exports }, null, 2) + '\n');
if (!args.includes('--observe-only')) assert.equal(result.disagreements, 0);
