// Capture actual drawings from a selected source checkout. The Python verifier
// reads their serialized vectors without importing product geometry helpers.
import assert from 'node:assert/strict';
import { log } from 'node:console';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL, URL } from 'node:url';

const [rootArg, outArg, phase] = process.argv.slice(2);
assert.ok(rootArg && outArg && ['before', 'after'].includes(phase), 'SOURCE_ROOT OUTPUT_DIRECTORY before|after');
const root = resolve(rootArg), out = resolve(outArg);
await mkdir(out, { recursive: true });
const from = file => import(pathToFileURL(resolve(root, file)).href);
const { buildEquatorialDial } = await from('src/lib/dials/equatorial.ts');
const { renderPolarDialSVG } = await from('src/lib/render/svg.ts');
const { exportConstructionPDF } = await from('src/lib/export/pdf.ts');

const apparent = { mode: 'apparent', longitudeDeg: 0 };
const west = { mode: 'standard', longitudeDeg: -122.4194, zoneMeridianDeg: -120, dstOffsetHours: 1 };
const east = { mode: 'standard', longitudeDeg: 151.2093, zoneMeridianDeg: 150, dstOffsetHours: 0 };
const cases = [
  { name: 'north-circle', latitudeDeg: 45 },
  { name: 'south-circle', latitudeDeg: -45 },
  { name: 'north-fan-zone', latitudeDeg: 51.5, plateShape: 'fan', timeReference: west },
  { name: 'south-fan-zone', latitudeDeg: -33.9, plateShape: 'fan', timeReference: east, format: 'letter' },
  { name: 'equator', latitudeDeg: 0 },
  { name: 'north-polar-day', latitudeDeg: 78, plateShape: 'fan' },
  { name: 'south-polar-day', latitudeDeg: -78, plateShape: 'fan' },
  { name: 'north-pole', latitudeDeg: 90 },
  { name: 'south-pole', latitudeDeg: -90 },
  { name: 'north-tiled', latitudeDeg: 45, radiusMm: 150 },
  { name: 'south-tiled-fan', latitudeDeg: -45, radiusMm: 150, plateShape: 'fan', format: 'letter', timeReference: east },
  { name: 'large-rod', latitudeDeg: 37.7749, radiusMm: 400, plateShape: 'fan', timeReference: west },
  { name: 'opposite-first', latitudeDeg: -33.9, face: 'opposite', plateShape: 'fan', timeReference: east },
  { name: 'single-hour', latitudeDeg: 45, plateShape: 'fan', hourLineOptions: { startHour: 12, endHour: 12, stepHours: 1 } },
  { name: 'limited-hours', latitudeDeg: 37.7749, plateShape: 'fan', timeReference: west, hourLineOptions: { startHour: 8, endHour: 17, stepHours: 0.5 } },
];
const rows = [];
for (const c of cases) {
  const radiusMm = c.radiusMm ?? 80;
  const input = { latitudeDeg: c.latitudeDeg, timeReference: c.timeReference ?? apparent,
    hourLineOptions: c.hourLineOptions ?? { startHour: 3, endHour: 21, stepHours: 0.25 },
    nodusDistanceMm: radiusMm * 0.25, gnomonBaseLengthMm: radiusMm * 0.62,
    face: c.face ?? 'pole-facing' };
  const options = { radiusMm, innerRadiusMm: 6, plateShape: c.plateShape ?? 'circle', numerals: 'arabic',
    theme: 'laser', showDeclinationLines: true, showHistoricalHours: false, format: c.format ?? 'a4',
    title: `${c.name} | ${Math.abs(c.latitudeDeg)} ${c.latitudeDeg < 0 ? 'S' : 'N'}`,
    description: 'Controlled construction geometry, not a physical field measurement. Same fixed clock convention on both faces.' };
  const dial = buildEquatorialDial(input);
  const faces = [dial, ...(dial.equatorial?.counterpart ? [dial.equatorial.counterpart] : [])];
  assert.equal(faces.length, phase === 'before' ? 1 : 2);
  const pdf = exportConstructionPDF(dial, options);
  const pdfFile = `${c.name}.pdf`;
  await writeFile(resolve(out, pdfFile), pdf);
  const nativeFaces = [];
  for (const face of faces) {
    const side = face.equatorial?.face ?? 'pole-facing';
    const svgFile = `${c.name}-${side}.svg`;
    const svg = renderPolarDialSVG(face, { ...options, title: `${options.title} | ${side}` });
    await writeFile(resolve(out, svgFile), svg);
    nativeFaces.push({ face: side, svgFile, svgSha256: createHash('sha256').update(svg).digest('hex'),
      hourLines: face.hourLines, declinationLines: face.declinationLines,
      styleLengthMm: face.gnomon.styleLengthMm, illuminated: face.equatorial?.illuminated ?? null });
  }
  rows.push({ name: c.name, input, options, pdfFile, pdfSha256: createHash('sha256').update(pdf).digest('hex'), faces: nativeFaces });
}
const sourceFiles = [];
const sources = ['src/main.ts', 'src/design.ts', 'src/state.ts',
  ...(await readdir(resolve(root, 'src/lib'), { recursive: true })).filter(p => p.endsWith('.ts')).sort().map(p => `src/lib/${p}`)];
for (const file of sources) {
  sourceFiles.push({ file, sha256: createHash('sha256').update(await readFile(resolve(root, file))).digest('hex') });
}
const captureScriptSha256 = createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
await writeFile(resolve(out, 'manifest.json'), JSON.stringify({ phase, node: process.version, captureScriptSha256, sourceFiles, cases: rows }, null, 2) + '\n');
log(JSON.stringify({ phase, cases: rows.length, faceDrawings: rows.reduce((n, c) => n + c.faces.length, 0) }));
